/**
 * Credit cost per mode. Kept free of `server-only` so client screens can show
 * the same numbers the server charges. Server code imports these via `credits.ts`.
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

/** "1 credit", "25 credits". */
export function formatCredits(credits: number): string {
    return `${credits} ${credits === 1 ? 'credit' : 'credits'}`;
}

/** Short patron-facing cost label for one use of a mode, e.g. "5 credits per 10 sec". */
export function formatModeCost(mode: string): string {
    const cost = CREDIT_COSTS[mode] ?? 1;
    if (cost === 0) return 'Free';
    const unit = formatCredits(cost);
    return mode === 'music' || mode === 'video' ? `${unit} per 10 sec` : unit;
}
