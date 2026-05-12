export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { requireApproved } from '@/lib/status';
import { chatComplete, getGenericNanogptKey } from '@/lib/nanogpt';
import { logUsage } from '@/lib/credits';
import {
    countWords,
    LIBRARIAN_REDIRECT,
    MAX_INPUT_WORDS,
    MAX_LIVE_EXCHANGES_PER_SESSION,
    normalizeGuideTier,
} from '@/lib/guideConstants';
import {
    buildGuideSystemPrompt,
    isGuideTool,
    TIER_CAPS,
} from '@/lib/guidePrompt';
import { reserveGuideExchange } from '@/lib/guideQuota';
import modelConfig from '@/config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    if (!authResult.user.jti) {
        return NextResponse.json(
            { error: 'Session expired', code: 'SESSION_EXPIRED' },
            { status: 401 }
        );
    }

    let body: { question?: unknown; tool?: unknown; tier?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const { question, tool, tier: rawTier } = body;
        if (typeof question !== 'string' || !question.trim() || !tool) {
            return NextResponse.json({ error: 'question and tool are required' }, { status: 400 });
        }

        if (!isGuideTool(tool)) {
            return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
        }

        const wordCount = countWords(question);
        if (wordCount > MAX_INPUT_WORDS) {
            return NextResponse.json(
                {
                    error: 'Question too long',
                    message: `Please keep questions under ${MAX_INPUT_WORDS} words. For longer questions, ask the librarian for help.`,
                },
                { status: 400 }
            );
        }

        const tier = normalizeGuideTier(rawTier);

        // Reserve before the model call. Provider failures still consume the
        // per-auth-session opportunity, matching the UX promise and avoiding a
        // second race surface in the catch path.
        const reservation = await reserveGuideExchange(authResult.user);
        if (!reservation.claimed) {
            return NextResponse.json({
                response: LIBRARIAN_REDIRECT,
                exchangesUsed: reservation.exchangesUsed,
                exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
                limitReached: true,
            });
        }

        const cap = TIER_CAPS[tier];
        const systemPrompt = buildGuideSystemPrompt(tool, tier);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question.trim() },
        ];

        const model = modelConfig.chat.model;
        const response = await chatComplete(messages, model, getGenericNanogptKey(), { maxTokens: cap.maxTokens });

        if (authResult.user.role !== 'GUEST') {
            // creditsUsed=0: the guide is free; this row is for visibility only.
            await logUsage(authResult.user.userId, 'guide', model, question.trim(), 0);
        }

        return NextResponse.json({
            response,
            exchangesUsed: reservation.exchangesUsed,
            exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
            limitReached: reservation.exchangesUsed >= MAX_LIVE_EXCHANGES_PER_SESSION,
        });
    } catch (error) {
        console.error('Guide chat error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Guide chat failed' },
            { status: 500 }
        );
    }
}
