import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
    const tx = {
        $queryRawUnsafe: vi.fn(),
        $executeRawUnsafe: vi.fn(),
    };
    return {
        tx,
        prisma: {
            $transaction: vi.fn(async (callback: (txArg: typeof tx) => unknown) => callback(tx)),
            $executeRawUnsafe: vi.fn(),
            mediaSession: {
                findMany: vi.fn(),
            },
        },
    };
});

vi.mock('@/lib/db', () => ({
    prisma: mocks.prisma,
}));

// Fix the renewal window so test SQL assertions are stable.
const FIXED_NOW = new Date('2026-05-20T12:00:00.000Z');
vi.mock('./creditRenewalWindow', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./creditRenewalWindow')>();
    return {
        ...actual,
        getFixedWeeklyRenewalWindow: vi.fn(() =>
            actual.getFixedWeeklyRenewalWindow(FIXED_NOW)
        ),
    };
});

import { refundCredits, settleCreditHold, sweepStaleCreditHolds } from './credits';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('refundCredits', () => {
    it('no-ops on non-positive amounts', async () => {
        await refundCredits('user_1', 0);
        await refundCredits('user_1', -5);
        expect(mocks.prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('increments the user balance with a reset-race-safe CASE', async () => {
        mocks.prisma.$executeRawUnsafe.mockResolvedValue(1);

        await refundCredits('user_1', 25);

        expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
        const [sql, userId, , amount] = mocks.prisma.$executeRawUnsafe.mock.calls[0];
        expect(userId).toBe('user_1');
        expect(amount).toBe(25);
        // Reset-race CASE must be present so a refund landing after the
        // weekly boundary resets-and-adds rather than being silently wiped.
        expect(sql).toMatch(/"creditsResetAt" < \$2/);
        expect(sql).toMatch(/\+ \$3/);
    });
});

describe('settleCreditHold', () => {
    it('burn: claims the hold and clears heldCredits without touching User.credits', async () => {
        mocks.tx.$queryRawUnsafe.mockResolvedValueOnce([
            { heldCredits: 25, userId: 'user_1' },
        ]);
        mocks.tx.$executeRawUnsafe.mockResolvedValueOnce(1);

        const claimed = await settleCreditHold('ms_1', 'burn');

        expect(claimed).toBe(true);
        // Burn does exactly one UPDATE (clear hold). Refund would do two.
        expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
        const [clearSql] = mocks.tx.$executeRawUnsafe.mock.calls[0];
        expect(clearSql).toMatch(/UPDATE "MediaSession" SET "heldCredits" = NULL/);
    });

    it('refund: claims the hold, clears it, and credits User.credits back by the held amount', async () => {
        mocks.tx.$queryRawUnsafe.mockResolvedValueOnce([
            { heldCredits: 25, userId: 'user_1' },
        ]);
        mocks.tx.$executeRawUnsafe.mockResolvedValue(1);

        const claimed = await settleCreditHold('ms_1', 'refund');

        expect(claimed).toBe(true);
        // 1: clear hold, 2: increment user balance.
        expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
        const [refundSql, userId, , amount] = mocks.tx.$executeRawUnsafe.mock.calls[1];
        expect(userId).toBe('user_1');
        expect(amount).toBe(25);
        // Same reset-race CASE as refundCredits.
        expect(refundSql).toMatch(/"creditsResetAt" < \$2/);
        expect(refundSql).toMatch(/\+ \$3/);
    });

    it('is idempotent: returns false and does not touch User.credits when the row has no outstanding hold', async () => {
        mocks.tx.$queryRawUnsafe.mockResolvedValueOnce([]);

        const claimed = await settleCreditHold('ms_1', 'refund');

        expect(claimed).toBe(false);
        expect(mocks.tx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('refund: does not touch User.credits when the claimed amount is zero', async () => {
        mocks.tx.$queryRawUnsafe.mockResolvedValueOnce([
            { heldCredits: 0, userId: 'user_1' },
        ]);
        mocks.tx.$executeRawUnsafe.mockResolvedValue(1);

        const claimed = await settleCreditHold('ms_1', 'refund');

        expect(claimed).toBe(true);
        // Only the clear UPDATE runs; no refund increment for a zero hold.
        expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('uses SELECT ... FOR UPDATE as the atomic claim primitive', async () => {
        mocks.tx.$queryRawUnsafe.mockResolvedValueOnce([
            { heldCredits: 5, userId: 'user_1' },
        ]);
        mocks.tx.$executeRawUnsafe.mockResolvedValue(1);

        await settleCreditHold('ms_1', 'burn');

        const [sql, mediaSessionId] = mocks.tx.$queryRawUnsafe.mock.calls[0];
        expect(mediaSessionId).toBe('ms_1');
        expect(sql).toMatch(/SELECT "heldCredits", "userId"/);
        expect(sql).toMatch(/FROM "MediaSession"/);
        expect(sql).toMatch(/"heldCredits" IS NOT NULL/);
        expect(sql).toMatch(/FOR UPDATE/);
    });
});

describe('sweepStaleCreditHolds', () => {
    it('settles each stale row as a refund and counts only claims that won', async () => {
        mocks.prisma.mediaSession.findMany.mockResolvedValueOnce([
            { id: 'ms_a' },
            { id: 'ms_b' },
            { id: 'ms_c' },
        ]);
        // First two claim successfully; third was settled by a concurrent poller.
        mocks.tx.$queryRawUnsafe
            .mockResolvedValueOnce([{ heldCredits: 10, userId: 'user_1' }])
            .mockResolvedValueOnce([{ heldCredits: 5, userId: 'user_2' }])
            .mockResolvedValueOnce([]);
        mocks.tx.$executeRawUnsafe.mockResolvedValue(1);

        const refunded = await sweepStaleCreditHolds(30);

        expect(refunded).toBe(2);
        expect(mocks.prisma.mediaSession.findMany).toHaveBeenCalledTimes(1);
        const findArgs = mocks.prisma.mediaSession.findMany.mock.calls[0][0];
        expect(findArgs.where.heldCredits).toEqual({ not: null });
        expect(findArgs.where.createdAt.lt).toBeInstanceOf(Date);
        // ~30 minutes before now, give or take execution time.
        const cutoffMs = (findArgs.where.createdAt.lt as Date).getTime();
        const expectedMs = Date.now() - 30 * 60 * 1000;
        expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(2000);
    });

    it('returns 0 when nothing is stale', async () => {
        mocks.prisma.mediaSession.findMany.mockResolvedValueOnce([]);

        await expect(sweepStaleCreditHolds(30)).resolves.toBe(0);
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });
});
