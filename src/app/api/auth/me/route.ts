export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { resetCreditsIfNeeded } from '@/lib/credits';

export async function GET(request: NextRequest) {
    const result = await requireAuth(request);
    if (!isAuthResult(result)) return result;

    // Reset credits if a week has passed
    await resetCreditsIfNeeded(result.user.userId);

    const user = await prisma.user.findUnique({
        where: { id: result.user.userId },
        select: {
            id: true,
            username: true,
            role: true,
            status: true,
            credits: true,
            library: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
}
