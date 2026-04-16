export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';

// GET /api/account/usage — per-user credit spend history (self)
export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const userId = authResult.user.userId;

    const [totals, byMode, recent] = await Promise.all([
        prisma.usageLog.aggregate({
            where: { userId },
            _sum: { creditsUsed: true },
            _count: true,
        }),
        prisma.usageLog.groupBy({
            by: ['mode'],
            where: { userId },
            _sum: { creditsUsed: true },
            _count: true,
        }),
        prisma.usageLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                mode: true,
                model: true,
                prompt: true,
                creditsUsed: true,
                createdAt: true,
            },
        }),
    ]);

    return NextResponse.json({
        totals: {
            totalCreditsSpent: totals._sum.creditsUsed ?? 0,
            totalEvents: totals._count,
        },
        byMode: byMode.map((b) => ({
            mode: b.mode,
            credits: b._sum.creditsUsed ?? 0,
            count: b._count,
        })),
        recent,
    });
}
