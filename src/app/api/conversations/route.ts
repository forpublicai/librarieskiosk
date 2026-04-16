export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';

// GET /api/conversations — list user's conversations (lean: id, title, mode, updatedAt)
export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    // Guest sessions don't persist conversations
    if (authResult.user.role === 'GUEST') {
        return NextResponse.json({ conversations: [] });
    }

    const mode = request.nextUrl.searchParams.get('mode');

    const conversations = await prisma.conversation.findMany({
        where: {
            userId: authResult.user.userId,
            ...(mode ? { mode } : {}),
        },
        select: {
            id: true,
            title: true,
            mode: true,
            updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
    });

    return NextResponse.json({ conversations });
}

// POST /api/conversations — create a new conversation
export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { mode, title, messages } = await request.json();

        if (!mode || !['chat', 'code'].includes(mode)) {
            return NextResponse.json({ error: 'Mode must be chat or code' }, { status: 400 });
        }

        // Guest sessions don't persist conversations
        // Return a fake ID for the session but don't save to DB
        if (authResult.user.role === 'GUEST') {
            return NextResponse.json({
                conversation: {
                    id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    mode,
                    title: title || 'New Chat',
                    messages: messages || [],
                    userId: authResult.user.userId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            }, { status: 201 });
        }

        const conv = await prisma.conversation.create({
            data: {
                userId: authResult.user.userId,
                mode,
                title: title || 'New Chat',
                messages: messages || [],
            },
        });

        return NextResponse.json({ conversation: conv }, { status: 201 });
    } catch (error) {
        console.error('Create conversation error:', error);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }
}
