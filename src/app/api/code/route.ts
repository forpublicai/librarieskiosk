export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { chatStream, getNanogptKey } from '@/lib/nanogpt';
import { calculateCredits, deductCredits, logUsage, InsufficientCreditsError } from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import modelConfig from '../../../../config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    try {
        const { messages } = await request.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required' },
                { status: 400 }
            );
        }

        const config = modelConfig.coding;
        const model = config.model;
        const systemPrompt = config.systemPrompt;

        const creditCost = calculateCredits('code');
        try {
            await deductCredits(authResult.user.userId, creditCost);
        } catch (error) {
            if (error instanceof InsufficientCreditsError) {
                return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
            }
            throw error;
        }

        // Prepend the coding system prompt
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ];

        const lastMessage = messages[messages.length - 1]?.content || '';
        await logUsage(authResult.user.userId, 'code', model, lastMessage, creditCost);

        const stream = await chatStream(fullMessages, model, getNanogptKey(authResult.user.library));

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Code error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Code generation failed' },
            { status: 500 }
        );
    }
}
