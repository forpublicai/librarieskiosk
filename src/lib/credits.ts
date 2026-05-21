import 'server-only';

import { prisma } from './db';
import { getFixedWeeklyRenewalWindow, nextFixedWeeklyRenewAt } from './creditRenewalWindow';

export class InsufficientCreditsError extends Error {
    constructor() {
        super('Insufficient credits');
        this.name = 'InsufficientCreditsError';
    }
}

/**
 * Credit costs per mode (per 10 seconds for time-based modes).
 * Video: 25 credits per 10s
 * Music: 5 credits per 10s
 * Image: 1 credit (flat)
 * Chat: 0 (free model)
 * Code: 1 credit (flat)
 */
export const CREDIT_COSTS: Record<string, number> = {
    image: 1,
    music: 5,   // per 10 seconds
    video: 25,  // per 10 seconds
    chat: 0,
    code: 1,
};

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEKLY_CREDITS: Record<string, number> = {
    SUPER_ADMIN: 9999,
    ADMIN: 1750,
    PATRON: 100,
    GUEST: 100,
};

type DueUser = {
    id: string;
    role: string;
};

type DueLibrary = {
    name: string;
    weeklyPool: number;
};

function hasValidResetDate(resetAt: Date | string | null | undefined): boolean {
    if (!resetAt) return false;
    const resetDate = resetAt instanceof Date ? resetAt : new Date(resetAt);
    return !Number.isNaN(resetDate.getTime());
}

export function renewalIso(resetAt: Date | string | null | undefined): string | null {
    if (!hasValidResetDate(resetAt)) return null;
    return nextFixedWeeklyRenewAt().toISOString();
}

function weeklyCreditsForRole(role: string): number {
    return WEEKLY_CREDITS[role] ?? 100;
}

function weeklyCreditsSqlCase() {
    return `
        CASE
            WHEN "role"::text = 'SUPER_ADMIN' THEN ${WEEKLY_CREDITS.SUPER_ADMIN}
            WHEN "role"::text = 'ADMIN' THEN ${WEEKLY_CREDITS.ADMIN}
            WHEN "role"::text = 'PATRON' THEN ${WEEKLY_CREDITS.PATRON}
            WHEN "role"::text = 'GUEST' THEN ${WEEKLY_CREDITS.GUEST}
            ELSE 100
        END
    `;
}

async function resetDueUserRows(users: DueUser[], resetBoundary: Date): Promise<number> {
    const byResetAmount: Record<string, string[]> = {};

    for (const user of users) {
        const resetAmount = String(weeklyCreditsForRole(user.role));
        byResetAmount[resetAmount] ??= [];
        byResetAmount[resetAmount].push(user.id);
    }

    const results = await Promise.all(Object.entries(byResetAmount).map(([resetAmount, ids]) => (
        prisma.user.updateMany({
            where: {
                id: { in: ids },
                creditsResetAt: { lt: resetBoundary },
            },
            data: {
                credits: Number(resetAmount),
                creditsResetAt: resetBoundary,
            },
        })
    )));

    return results.reduce((total, result) => total + result.count, 0);
}

async function resetDueLibraryRows(libraries: DueLibrary[], resetBoundary: Date): Promise<number> {
    const byWeeklyPool: Record<string, string[]> = {};

    for (const library of libraries) {
        const weeklyPool = String(library.weeklyPool);
        byWeeklyPool[weeklyPool] ??= [];
        byWeeklyPool[weeklyPool].push(library.name);
    }

    const results = await Promise.all(Object.entries(byWeeklyPool).map(([weeklyPool, names]) => (
        prisma.library.updateMany({
            where: {
                name: { in: names },
                poolResetAt: { lt: resetBoundary },
            },
            data: {
                poolRemaining: Number(weeklyPool),
                poolResetAt: resetBoundary,
            },
        })
    )));

    return results.reduce((total, result) => total + result.count, 0);
}

/**
 * Calculate credits for a generation based on mode and duration.
 */
export function calculateCredits(mode: string, durationSeconds?: number): number {
    const baseCost = CREDIT_COSTS[mode] ?? 1;
    if (baseCost === 0) return 0;
    if (mode === 'image') return baseCost;

    // For music/video, scale proportionally by duration (rate is per 10s)
    if ((mode === 'music' || mode === 'video') && durationSeconds) {
        return Math.max(1, Math.round((durationSeconds / 10) * baseCost));
    }
    return baseCost;
}

/**
 * Atomically deducts credits from a user's balance.
 * Throws InsufficientCreditsError if balance is insufficient.
 * Returns the new balance.
 */
export async function deductCredits(userId: string, amount: number): Promise<number> {
    if (amount <= 0) return (await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }))?.credits ?? 0;

    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const weeklyCreditsCase = weeklyCreditsSqlCase();
    const updated = await prisma.$queryRawUnsafe<{ credits: number }[]>(
        `
            UPDATE "User"
            SET
                "credits" = CASE
                    WHEN "creditsResetAt" < $2 THEN (${weeklyCreditsCase}) - $3
                    ELSE "credits" - $3
                END,
                "creditsResetAt" = CASE
                    WHEN "creditsResetAt" < $2 THEN $2
                    ELSE "creditsResetAt"
                END
            WHERE "id" = $1
              AND (
                  CASE
                      WHEN "creditsResetAt" < $2 THEN (${weeklyCreditsCase})
                      ELSE "credits"
                  END
              ) >= $3
            RETURNING "credits"
        `,
        userId,
        currentResetAt,
        amount
    );

    if (updated.length === 0) {
        throw new InsufficientCreditsError();
    }

    return updated[0].credits;
}

/**
 * Atomically credit `amount` back to a user's balance.
 *
 * Mirrors `deductCredits`' CASE on `creditsResetAt` so a refund that lands
 * after the weekly window rolled over resets-and-adds rather than being
 * wiped by the renewal.
 */
export async function refundCredits(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;

    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const weeklyCreditsCase = weeklyCreditsSqlCase();
    await prisma.$executeRawUnsafe(
        `
            UPDATE "User"
            SET
                "credits" = CASE
                    WHEN "creditsResetAt" < $2 THEN (${weeklyCreditsCase}) + $3
                    ELSE "credits" + $3
                END,
                "creditsResetAt" = CASE
                    WHEN "creditsResetAt" < $2 THEN $2
                    ELSE "creditsResetAt"
                END
            WHERE "id" = $1
        `,
        userId,
        currentResetAt,
        amount
    );
}

/**
 * Settle an outstanding credit hold on a MediaSession row.
 *
 * Atomically claims the hold (only one caller wins under contention) and:
 *  - 'burn'   — clears the hold; balance unchanged (credits already deducted on submit).
 *  - 'refund' — clears the hold and credits the held amount back to the user.
 *
 * Returns true iff this call claimed the hold (false = already settled or no hold).
 */
export async function settleCreditHold(
    mediaSessionId: string,
    outcome: 'burn' | 'refund'
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        // SELECT...FOR UPDATE captures the pre-clear amount under a row lock.
        // (UPDATE...RETURNING returns post-update values, so it can't read the
        // old heldCredits in a single statement.) Concurrent settlers block on
        // the lock; only one sees the WHERE match before the UPDATE clears it.
        const claimed = await tx.$queryRawUnsafe<{ heldCredits: number; userId: string }[]>(
            `
                SELECT "heldCredits", "userId"
                FROM "MediaSession"
                WHERE "id" = $1 AND "heldCredits" IS NOT NULL
                FOR UPDATE
            `,
            mediaSessionId
        );

        if (claimed.length === 0) return false;

        await tx.$executeRawUnsafe(
            `UPDATE "MediaSession" SET "heldCredits" = NULL WHERE "id" = $1`,
            mediaSessionId
        );

        if (outcome === 'burn') return true;

        const { heldCredits, userId } = claimed[0];
        if (heldCredits <= 0) return true;

        const { currentResetAt } = getFixedWeeklyRenewalWindow();
        const weeklyCreditsCase = weeklyCreditsSqlCase();
        await tx.$executeRawUnsafe(
            `
                UPDATE "User"
                SET
                    "credits" = CASE
                        WHEN "creditsResetAt" < $2 THEN (${weeklyCreditsCase}) + $3
                        ELSE "credits" + $3
                    END,
                    "creditsResetAt" = CASE
                        WHEN "creditsResetAt" < $2 THEN $2
                        ELSE "creditsResetAt"
                    END
                WHERE "id" = $1
            `,
            userId,
            currentResetAt,
            heldCredits
        );
        return true;
    });
}

/**
 * Refund credits on MediaSessions whose hold has been outstanding longer than
 * `minutesOld` — long-tail safety net for jobs whose terminal status never
 * reached the status route (server crash, browser closed, etc).
 *
 * Returns the number of holds refunded.
 */
export async function sweepStaleCreditHolds(minutesOld: number): Promise<number> {
    const cutoff = new Date(Date.now() - minutesOld * 60 * 1000);
    const stale = await prisma.mediaSession.findMany({
        where: {
            heldCredits: { not: null },
            createdAt: { lt: cutoff },
        },
        select: { id: true },
    });

    let refunded = 0;
    for (const row of stale) {
        if (await settleCreditHold(row.id, 'refund')) refunded += 1;
    }
    return refunded;
}

/**
 * Get current credit balance for a user.
 */
export async function getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
    });
    return user?.credits ?? 0;
}

/**
 * Reset user credits if a week has passed since their last reset.
 * Returns the updated user or null if no reset was needed.
 */
export async function resetCreditsIfNeeded(userId: string) {
    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, credits: true, creditsResetAt: true },
    });
    if (!user) return null;

    if (user.creditsResetAt >= currentResetAt) return null;

    await resetDueUserRows([user], currentResetAt);
    return prisma.user.findUnique({ where: { id: userId } });
}

export async function resetUsersCreditsIfNeeded(userIds: string[]): Promise<number> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) return 0;

    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const users = await prisma.user.findMany({
        where: {
            id: { in: uniqueUserIds },
            creditsResetAt: { lt: currentResetAt },
        },
        select: { id: true, role: true },
    });

    return resetDueUserRows(users, currentResetAt);
}

export async function resetAllDueUserCreditsIfNeeded(): Promise<number> {
    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const users = await prisma.user.findMany({
        where: { creditsResetAt: { lt: currentResetAt } },
        select: { id: true, role: true },
    });

    return resetDueUserRows(users, currentResetAt);
}

export async function resetLibraryPoolIfNeeded(libraryName: string) {
    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const library = await prisma.library.findUnique({
        where: { name: libraryName },
    });
    if (!library) return null;

    if (library.poolResetAt < currentResetAt) {
        await resetDueLibraryRows([library], currentResetAt);
        return prisma.library.findUnique({ where: { name: libraryName } });
    }

    return library;
}

export async function resetLibrariesPoolsIfNeeded(libraryNames?: string[]): Promise<number> {
    const uniqueLibraryNames = libraryNames ? Array.from(new Set(libraryNames)) : null;
    if (uniqueLibraryNames && uniqueLibraryNames.length === 0) return 0;

    const { currentResetAt } = getFixedWeeklyRenewalWindow();
    const libraries = uniqueLibraryNames
        ? await prisma.library.findMany({
            where: {
                name: { in: uniqueLibraryNames },
                poolResetAt: { lt: currentResetAt },
            },
            select: { name: true, weeklyPool: true },
        })
        : await prisma.library.findMany({
            where: { poolResetAt: { lt: currentResetAt } },
            select: { name: true, weeklyPool: true },
        });

    return resetDueLibraryRows(libraries, currentResetAt);
}

/**
 * Log a usage event. Skips logging for the shared guest account.
 */
export async function logUsage(
    userId: string,
    mode: string,
    model: string,
    prompt: string,
    creditsUsed: number = 1
): Promise<void> {
    // Skip logging for the shared guest account (ephemeral sessions, data not persisted)
    if (userId === 'guest') {
        return;
    }

    await prisma.usageLog.create({
        data: {
            userId,
            mode,
            model,
            prompt: prompt.slice(0, 500), // truncate for storage
            creditsUsed,
        },
    });
}
