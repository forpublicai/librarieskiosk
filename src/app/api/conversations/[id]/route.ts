export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/conversations/[id] — load full conversation with messages
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const { id } = await params;

    const conv = await prisma.conversation.findUnique({
        where: { id },
    });

    if (!conv || conv.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ conversation: conv });
}

// PATCH /api/conversations/[id] — update messages and/or title
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const { id } = await params;
    const { messages, title } = await request.json();

    // Guest sessions don't persist conversation updates
    if (authResult.user.role === 'GUEST') {
        return NextResponse.json({
            conversation: {
                id,
                mode: 'chat',
                title: title || 'New Chat',
                messages: messages || [],
                userId: authResult.user.userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }

    // Verify ownership
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing || existing.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    try {
        const updateData: Record<string, unknown> = {};
        if (messages !== undefined) updateData.messages = messages;
        if (title !== undefined) updateData.title = title;

        const conv = await prisma.conversation.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ conversation: conv });
    } catch (error) {
        console.error('Update conversation error:', error);
        return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
    }
}

// DELETE /api/conversations/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const { id } = await params;

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing || existing.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await prisma.conversation.delete({ where: { id } });

    return NextResponse.json({ success: true });
}
