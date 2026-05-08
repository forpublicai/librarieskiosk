export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { requireApproved } from '@/lib/status';
import { chatComplete, getNanogptKey } from '@/lib/nanogpt';
import modelConfig from '../../../../config/models.json';

const TOOL_DESCRIPTIONS: Record<string, string> = {
    chat: 'Chat tool — a conversational AI assistant that helps with writing, research, planning, and thinking through problems',
    code: 'Code Assistant tool — an AI tool for writing, debugging, and explaining code',
    image: 'Image Generator tool — an AI tool that creates images from text descriptions',
    video: 'Video Generator tool — an AI tool that creates short video clips from text descriptions',
    music: 'Music Generator tool — an AI tool that composes original music from style and mood descriptions',
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

function buildSystemPrompt(tool: string, tier: number): string {
    const toolDesc = TOOL_DESCRIPTIONS[tool] ?? `${tool} tool`;
    const tierLabel = TIER_LABELS[tier] ?? TIER_LABELS[2];
    const tierGuidance = TIER_GUIDANCE[tier] ?? TIER_GUIDANCE[2];
    const toolName = toolDesc.split(' —')[0];

    return `You are a specialist learning guide for the ${toolDesc} in a public library AI kiosk.

The user has described their experience level as: "${tierLabel}"

Tailor every response to this level: ${tierGuidance}

Only answer questions related to the ${toolName}. If the user asks about anything unrelated to this tool, respond with a single short message: tell them you are specifically here to help with the ${toolName}, suggest they open the learning guide for the other tool they are asking about, and ask if there is something about the ${toolName} you can help with instead.

Keep responses concise and conversational — this appears in a small side panel. Write in short paragraphs. If you have multiple distinct points to make, separate each with a blank line.`;
}

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    try {
        const { question, tool, tier } = await request.json();

        if (!question?.trim() || !tool) {
            return NextResponse.json({ error: 'question and tool are required' }, { status: 400 });
        }

        const systemPrompt = buildSystemPrompt(tool, Number(tier) || 2);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question.trim() },
        ];

        const response = await chatComplete(messages, modelConfig.chat.model, getNanogptKey(authResult.user.library));
        return NextResponse.json({ response });
    } catch (error) {
        console.error('Guide chat error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Guide chat failed' },
            { status: 500 }
        );
    }
}
