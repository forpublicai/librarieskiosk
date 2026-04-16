export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { userId, credits } = await request.json();

        if (!userId || credits === undefined || typeof credits !== 'number') {
            return NextResponse.json(
                { error: 'userId and credits (number) are required' },
                { status: 400 }
            );
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { credits: Math.max(0, credits) },
            select: {
                id: true,
                username: true,
                credits: true,
            },
        });

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Update credits error:', error);
        return NextResponse.json(
            { error: 'Failed to update credits' },
            { status: 500 }
        );
    }
}
