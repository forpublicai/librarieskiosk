/**
 * Credit cost per mode. Kept free of `server-only` so client screens can show
 * the same numbers the server charges. Server code imports it via `credits.ts`.
 */
export const CREDIT_COSTS: Record<string, number> = {
    image: 1,
    music: 5,   // per 10 seconds
    video: 25,  // per 10 seconds
    chat: 0,
    code: 1,
};

/** Short patron-facing cost label for one use of a mode, e.g. "5 credits per 10 sec". */
export function formatModeCost(mode: string): string {
    const cost = CREDIT_COSTS[mode] ?? 1;
    if (cost === 0) return 'Free';
    const unit = `${cost} ${cost === 1 ? 'credit' : 'credits'}`;
    return mode === 'music' || mode === 'video' ? `${unit} per 10 sec` : unit;
}
