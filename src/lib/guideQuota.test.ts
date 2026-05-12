import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const guideExchange = vi.hoisted(() => ({
    createMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    prisma: { guideExchange },
}));

import { MAX_LIVE_EXCHANGES_PER_SESSION } from './guideConstants';
import { reserveGuideExchange } from './guideQuota';

const user = {
    userId: 'user_1',
    username: 'patron',
    role: 'PATRON' as const,
    library: 'Pottsboro, TX',
    jti: 'session_1',
};

describe('reserveGuideExchange', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        guideExchange.createMany.mockResolvedValue({ count: 0 });
        guideExchange.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('claims a slot with an atomic guarded increment', async () => {
        guideExchange.updateMany.mockResolvedValue({ count: 1 });
        guideExchange.findUnique.mockResolvedValue({ count: 3 });

        await expect(reserveGuideExchange(user)).resolves.toEqual({
            claimed: true,
            exchangesUsed: 3,
        });
        expect(guideExchange.updateMany).toHaveBeenCalledWith({
            where: {
                jti: 'session_1',
                count: { lt: MAX_LIVE_EXCHANGES_PER_SESSION },
            },
            data: { count: { increment: 1 } },
        });
    });

    it('reports the first exchange for a fresh session row', async () => {
        guideExchange.updateMany.mockResolvedValue({ count: 1 });
        guideExchange.findUnique.mockResolvedValue({ count: 1 });

        await expect(reserveGuideExchange(user)).resolves.toEqual({
            claimed: true,
            exchangesUsed: 1,
        });
        expect(guideExchange.createMany).toHaveBeenCalledWith({
            data: {
                jti: 'session_1',
                userId: 'user_1',
                role: 'PATRON',
                count: 0,
            },
            skipDuplicates: true,
        });
    });

    it('reports the quota as reached when the guarded increment updates no rows', async () => {
        guideExchange.updateMany.mockResolvedValue({ count: 0 });
        guideExchange.findUnique.mockResolvedValue({ count: MAX_LIVE_EXCHANGES_PER_SESSION });

        await expect(reserveGuideExchange(user)).resolves.toEqual({
            claimed: false,
            exchangesUsed: MAX_LIVE_EXCHANGES_PER_SESSION,
        });
    });
});
