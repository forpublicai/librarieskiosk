export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireActiveSession, isAuthResult, type TokenPayload } from '@/lib/auth';
import { requireApproved } from '@/lib/status';
import { chatComplete, getGenericNanogptKey } from '@/lib/nanogpt';
import { logUsage } from '@/lib/credits';
import modelConfig from '../../../../config/models.json';

const TOOL_DESCRIPTIONS: Record<string, string> = {
    chat: 'Chat tool — a conversational AI assistant that helps with writing, research, planning, and thinking through problems',
    code: 'Code Assistant tool — an AI tool for writing, debugging, and explaining code',
    image: 'Image Generator tool — an AI tool that creates images from text descriptions',
    video: 'Video Generator tool — an AI tool that creates short video clips from text descriptions',
    music: 'Music Generator tool — an AI tool that composes original music from style and mood descriptions',
};

// What counts as "in scope" for each tool's learning guide. Intentionally broad —
// the kiosk patron benefits from understanding adjacent concepts (file formats,
// art styles, etc.), not just the tool's UI. Without this, the model interprets
// "only answer questions related to <tool>" too narrowly and refuses helpful
// questions like "what's the difference between JPEG and PNG?".
const TOOL_TOPIC_SCOPE: Record<string, string> = {
    chat: 'this chat tool, conversational AI, writing and language, prompting techniques, and general AI concepts that come up when using a chat assistant',
    code: 'this code tool, programming and software concepts, debugging, languages and frameworks, file formats, and ideas that come up when writing or running code',
    image: 'this image tool, AI image generation, image formats (JPEG, PNG, AVIF, SVG, etc.), art styles and visual composition, lighting and mood, and prompting techniques for images',
    video: 'this video tool, AI video generation, video formats (MP4, WebM, etc.), cinematic and motion concepts, scene composition, pacing, and prompting techniques for video',
    music: 'this music tool, AI music generation, audio formats (MP3, WAV, OGG, etc.), music theory basics, genres and instruments, lyrics, mood, and prompting techniques for music',
};

const TIER_LABELS: Record<number, string> = {
    1: "I'm new to technology and AI tools",
    2: "I use technology regularly but haven't explored AI tools yet",
    3: "I've tried AI tools and want to learn how to use them more effectively",
};

const TIER_GUIDANCE: Record<number, string> = {
    1: 'Use plain, everyday language with no jargon whatsoever. Use relatable, real-world analogies. Keep responses short and encouraging. If you must use a technical term, define it immediately in simple words.',
    2: 'You can use general technology terms, but explain AI-specific concepts clearly when you introduce them. Assume comfort with basic computer tasks but not with AI workflows.',
    3: 'You can use AI and technology terminology freely. Focus on nuance, effective prompting strategies, known limitations to watch for, and techniques for getting the best results.',
};

// Tier-aware response caps. wordLimit is communicated to the model in the system
// prompt (a soft guide); maxTokens is the hard ceiling enforced by the API.
// Multiplier ~1.4 token/word with a small headroom so sentences finish cleanly.
const TIER_CAPS: Record<number, { wordLimit: number; maxTokens: number }> = {
    1: { wordLimit: 80, maxTokens: 110 },
    2: { wordLimit: 60, maxTokens: 85 },
    3: { wordLimit: 50, maxTokens: 70 },
};

const MAX_INPUT_WORDS = 25;
const MAX_LIVE_EXCHANGES_PER_SESSION = 5;

const LIBRARIAN_REDIRECT =
    "You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian.";

// In-memory tracker for guest exchanges, keyed by JWT jti. This is per-lambda-
// instance: Vercel cold starts reset the count, so a determined guest could get
// more than the cap by waiting for the lambda to spin down. Acceptable because
// (a) kiosks are locked-down devices, (b) per-call cost is bounded by the word
// + maxTokens caps, (c) the redirect is a soft UX nudge, not a security gate.
const guestExchanges = new Map<string, number>();

function buildSystemPrompt(tool: string, tier: number): string {
    const toolDesc = TOOL_DESCRIPTIONS[tool] ?? `${tool} tool`;
    const tierLabel = TIER_LABELS[tier] ?? TIER_LABELS[2];
    const tierGuidance = TIER_GUIDANCE[tier] ?? TIER_GUIDANCE[2];
    const cap = TIER_CAPS[tier] ?? TIER_CAPS[2];
    const toolName = toolDesc.split(' —')[0];
    const scope = TOOL_TOPIC_SCOPE[tool] ?? `this ${tool} tool and concepts that come up while using it`;

    return `You are a specialist learning guide for the ${toolDesc} in a public library AI kiosk.

The user has described their experience level as: "${tierLabel}"

Tailor every response to this level: ${tierGuidance}

You may answer questions about: ${scope}.

Do not refuse questions that are tangentially related — file formats, terminology, underlying concepts, and prompting techniques are all in scope. Only redirect when a question is clearly outside this scope (e.g., weather, taxes, personal advice, or content meant for a different kiosk tool). When redirecting, briefly say you are here to help with the ${toolName} and offer to answer a related question instead.

Keep your response under ${cap.wordLimit} words. Write in short paragraphs separated by blank lines.`;
}

function countWords(s: string): number {
    const trimmed = s.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

async function getExchangeCount(user: TokenPayload): Promise<number> {
    if (user.role === 'GUEST') {
        return guestExchanges.get(user.jti ?? '') ?? 0;
    }
    // Patron path: count UsageLog rows for this user since their last login.
    // lastLoginAt is set on every successful login (see /api/auth/login).
    const row = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { lastLoginAt: true },
    });
    if (!row?.lastLoginAt) return 0;
    return prisma.usageLog.count({
        where: {
            userId: user.userId,
            mode: 'guide',
            createdAt: { gt: row.lastLoginAt },
        },
    });
}

function recordGuestExchange(jti: string | undefined): void {
    if (!jti) return;
    guestExchanges.set(jti, (guestExchanges.get(jti) ?? 0) + 1);
}

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    try {
        const { question, tool, tier: rawTier } = await request.json();

        if (!question?.trim() || !tool) {
            return NextResponse.json({ error: 'question and tool are required' }, { status: 400 });
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

        const tier = [1, 2, 3].includes(Number(rawTier)) ? Number(rawTier) : 2;

        // Session-quota check before incurring the cost of a model call.
        const exchangesUsed = await getExchangeCount(authResult.user);
        if (exchangesUsed >= MAX_LIVE_EXCHANGES_PER_SESSION) {
            return NextResponse.json({
                response: LIBRARIAN_REDIRECT,
                exchangesUsed,
                exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
                limitReached: true,
            });
        }

        const cap = TIER_CAPS[tier] ?? TIER_CAPS[2];
        const systemPrompt = buildSystemPrompt(tool, tier);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question.trim() },
        ];

        const model = modelConfig.chat.model;
        const response = await chatComplete(messages, model, getGenericNanogptKey(), { maxTokens: cap.maxTokens });

        // Record the exchange so it counts against the session quota.
        if (authResult.user.role === 'GUEST') {
            recordGuestExchange(authResult.user.jti);
        } else {
            // creditsUsed=0: the guide is free; this row is for visibility only.
            await logUsage(authResult.user.userId, 'guide', model, question.trim(), 0);
        }

        const newExchangeCount = exchangesUsed + 1;
        return NextResponse.json({
            response,
            exchangesUsed: newExchangeCount,
            exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
            limitReached: newExchangeCount >= MAX_LIVE_EXCHANGES_PER_SESSION,
        });
    } catch (error) {
        console.error('Guide chat error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Guide chat failed' },
            { status: 500 }
        );
    }
}
