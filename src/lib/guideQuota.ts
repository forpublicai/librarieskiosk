import 'server-only';

import { prisma } from '@/lib/db';
import { MAX_LIVE_EXCHANGES_PER_SESSION } from '@/lib/guideConstants';
import type { TokenPayload } from '@/lib/auth';

const GUIDE_EXCHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const GUIDE_EXCHANGE_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPruneAt = 0;

async function pruneGuideExchanges(now = new Date()): Promise<void> {
    const nowMs = now.getTime();
    if (nowMs - lastPruneAt < GUIDE_EXCHANGE_PRUNE_INTERVAL_MS) return;
    lastPruneAt = nowMs;

    const cutoff = new Date(nowMs - GUIDE_EXCHANGE_TTL_MS);
    await prisma.guideExchange.deleteMany({
        where: { updatedAt: { lt: cutoff } },
    });
}

export interface GuideExchangeReservation {
    claimed: boolean;
    exchangesUsed: number;
}

export async function reserveGuideExchange(user: TokenPayload): Promise<GuideExchangeReservation> {
    const jti = user.jti;
    if (!jti) {
        throw new Error('Session expired');
    }

    void pruneGuideExchanges().catch((err) => {
        console.warn('Guide exchange pruning failed:', err);
    });

    await prisma.guideExchange.createMany({
        data: {
            jti,
            userId: user.userId,
            role: user.role,
            count: 0,
        },
        skipDuplicates: true,
    });

    const claim = await prisma.guideExchange.updateMany({
        where: {
            jti,
            count: { lt: MAX_LIVE_EXCHANGES_PER_SESSION },
        },
        data: { count: { increment: 1 } },
    });

    const quota = await prisma.guideExchange.findUnique({
        where: { jti },
        select: { count: true },
    });

    const exchangesUsed = quota?.count ?? MAX_LIVE_EXCHANGES_PER_SESSION;
    return {
        claimed: claim.count > 0,
        exchangesUsed,
    };
}
