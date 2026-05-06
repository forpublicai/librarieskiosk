export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { renewalIso, resetCreditsIfNeeded, resetLibraryPoolIfNeeded } from '@/lib/credits';

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
            creditsResetAt: true,
            library: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // For library admins, the "credits" shown in the header is the library's
    // remaining weekly pool — that's what they dispense to patrons.
    let displayCredits = user.credits;
    let creditsRenewAt = renewalIso(user.creditsResetAt);
    if (user.role === 'ADMIN') {
        const library = await resetLibraryPoolIfNeeded(user.library);
        if (library) {
            displayCredits = library.poolRemaining;
            creditsRenewAt = renewalIso(library.poolResetAt);
        }
    }

    return NextResponse.json({
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            status: user.status,
            credits: displayCredits,
            library: user.library,
            creditsRenewAt,
        },
    });
}
