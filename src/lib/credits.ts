import { prisma } from './db';

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

    const result = await prisma.user.updateMany({
        where: {
            id: userId,
            credits: { gte: amount },
        },
        data: {
            credits: { decrement: amount },
        },
    });

    if (result.count === 0) {
        throw new InsufficientCreditsError();
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
    });

    return user?.credits ?? 0;
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEKLY_CREDITS: Record<string, number> = {
    SUPER_ADMIN: 9999,
    ADMIN: 1750,
    PATRON: 100,
    GUEST: 100,
};

/**
 * Reset user credits if a week has passed since their last reset.
 * Returns the updated user or null if no reset was needed.
 */
export async function resetCreditsIfNeeded(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, credits: true, creditsResetAt: true },
    });
    if (!user) return null;

    if (Date.now() >= user.creditsResetAt.getTime() + WEEK_MS) {
        const resetAmount = WEEKLY_CREDITS[user.role] ?? 100;
        return prisma.user.update({
            where: { id: userId },
            data: {
                credits: resetAmount,
                creditsResetAt: new Date(),
            },
        });
    }
    return null;
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
