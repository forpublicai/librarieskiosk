import 'server-only';

import { getR2Env } from './env';
import { generateSignedGetUrl } from './storage';

/**
 * Read-URL resolution for R2 objects.
 *
 * Strategy, in order:
 *   1. If R2_PUBLIC_BASE_URL is set, return a cacheable public URL. Since
 *      objects are written with a 1-year immutable Cache-Control header and
 *      each object key contains a UUID, public URLs are safe and cacheable at
 *      the CDN edge + browser — no expiry, no refresh round-trips.
 *   2. Otherwise fall through to presigned URLs. We memoize them in-process
 *      so repeat reads (list endpoints, refresh calls within the TTL window)
 *      don't re-sign every time. Each entry expires 5 minutes before the
 *      actual signature does, so clients never see a URL that's about to die.
 *
 * The memo is a plain Map keyed by objectKey. In a multi-instance deploy
 * this is per-pod, which is fine — correctness doesn't depend on sharing.
 */

interface CacheEntry {
    url: string;
    expiresAtMs: number;
}

const memo = new Map<string, CacheEntry>();
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export interface MediaReadUrl {
    url: string;
    /** ISO timestamp when this URL stops being usable. null for public URLs. */
    expiresAt: string | null;
    /** True if served via public base URL (browser/CDN-cacheable). */
    public: boolean;
}

export async function getMediaReadUrl(objectKey: string): Promise<MediaReadUrl> {
    const env = getR2Env();

    if (env.publicBaseUrl) {
        const base = env.publicBaseUrl.replace(/\/+$/, '');
        const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
        return {
            url: `${base}/${encoded}`,
            expiresAt: null,
            public: true,
        };
    }

    const now = Date.now();
    const cached = memo.get(objectKey);
    if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > now) {
        return {
            url: cached.url,
            expiresAt: new Date(cached.expiresAtMs).toISOString(),
            public: false,
        };
    }

    const url = await generateSignedGetUrl(objectKey);
    const expiresAtMs = now + env.signedUrlTtlSeconds * 1000;
    memo.set(objectKey, { url, expiresAtMs });

    // Opportunistic GC: if the map grows large, drop expired entries
    if (memo.size > 1000) {
        for (const [k, v] of memo) {
            if (v.expiresAtMs <= now) memo.delete(k);
        }
    }

    return {
        url,
        expiresAt: new Date(expiresAtMs).toISOString(),
        public: false,
    };
}

export function invalidateMediaReadUrl(objectKey: string): void {
    memo.delete(objectKey);
}

export function _resetMediaUrlCache(): void {
    memo.clear();
}
