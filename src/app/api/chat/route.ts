export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { chatStream, getNanogptKey } from '@/lib/nanogpt';
import { logUsage } from '@/lib/credits';
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

        const model = modelConfig.chat.model;
        const lastMessage = messages[messages.length - 1]?.content || '';
        await logUsage(authResult.user.userId, 'chat', model, lastMessage, 0);

        const stream = await chatStream(messages, model, getNanogptKey(authResult.user.library));

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Chat generation failed' },
            { status: 500 }
        );
    }
}
