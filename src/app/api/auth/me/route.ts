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

    // For library admins, the "credits" shown in the header is the library's
    // remaining weekly pool — that's what they dispense to patrons.
    let displayCredits = user.credits;
    if (user.role === 'ADMIN') {
        const library = await prisma.library.findUnique({
            where: { name: user.library },
            select: { poolRemaining: true },
        });
        if (library) displayCredits = library.poolRemaining;
    }

    return NextResponse.json({
        user: { ...user, credits: displayCredits },
    });
}
