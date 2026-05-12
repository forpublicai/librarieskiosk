export type GuideTier = 1 | 2 | 3;

export const MAX_INPUT_WORDS = 25;
export const SOFT_WARN_WORDS = 20;
export const MAX_LIVE_EXCHANGES_PER_SESSION = 5;

export const LIBRARIAN_REDIRECT =
    "You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian.";

export const TIER_LABELS: Record<GuideTier, string> = {
    1: "I'm new to technology and AI tools",
    2: "I use technology regularly but haven't explored AI tools yet",
    3: "I've tried AI tools and want to learn how to use them more effectively",
};

export const TIER_SHORT_LABELS: Record<GuideTier, string> = {
    1: 'New to tech',
    2: 'Tech-savvy',
    3: 'AI Explorer',
};

export const LEGACY_GUIDE_TIER_KEY = 'guide_tier';

export interface GuideTierStorageUser {
    id: string;
    role: string;
}

export function countWords(s: string): number {
    const trimmed = s.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

export function normalizeGuideTier(rawTier: unknown): GuideTier {
    const tier = Number(rawTier);
    return tier === 1 || tier === 2 || tier === 3 ? tier : 2;
}

export function guideTierKey(user: GuideTierStorageUser | null, token: string | null): string {
    if (!user) return 'guide_tier_anon';
    if (user.role === 'GUEST') return `guide_tier_guest_${token?.slice(-12) ?? 'anon'}`;
    return `guide_tier_user_${user.id}`;
}
