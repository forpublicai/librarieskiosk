/**
 * Client-side helpers for working with R2-backed media sessions.
 *
 * Generation routes return a presigned URL that expires (default 1 hour). If a
 * kiosk tab is left idle past the TTL, <img>/<audio>/<video> tags will 403.
 * The pages call `refreshMediaUrl(sessionId, token)` from their onError
 * handler to swap in a fresh URL without a page reload.
 *
 * A small sessionStorage cache dedupes calls within a tab. Browsing to a
 * history item, navigating away, and coming back should not re-fetch the URL
 * if the cached one is still valid. Cache is keyed by sessionId + token
 * (so logout invalidates). Stored under a dedicated key so it doesn't
 * collide with app state.
 */

const CACHE_KEY_PREFIX = 'mediaUrlCache:v1:';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // treat URL as dead 5 min before actual expiry

export interface RefreshedMedia {
    url: string;
    thumbnailUrl: string | null;
    mimeType: string | null;
    expiresAt: string | null;
    storageStatus: string | null;
}

interface CachedEntry {
    url: string;
    thumbnailUrl: string | null;
    mimeType: string | null;
    expiresAt: string | null;
    storageStatus: string | null;
    /** Absolute ms epoch when the URL becomes unsafe to use */
    expiresAtMs: number;
    /** Short fingerprint of the auth token so logout invalidates */
    tokenFingerprint: string;
}

function tokenFingerprint(token: string): string {
    // Last 12 chars is plenty to detect token changes without logging the token
    return token.slice(-12);
}

function cacheKey(sessionId: string): string {
    return `${CACHE_KEY_PREFIX}${sessionId}`;
}

function readCache(sessionId: string, token: string): RefreshedMedia | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(cacheKey(sessionId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedEntry;
        if (parsed.tokenFingerprint !== tokenFingerprint(token)) return null;
        if (parsed.expiresAtMs - REFRESH_MARGIN_MS <= Date.now()) return null;
        return {
            url: parsed.url,
            thumbnailUrl: parsed.thumbnailUrl,
            mimeType: parsed.mimeType,
            expiresAt: parsed.expiresAt,
            storageStatus: parsed.storageStatus,
        };
    } catch {
        return null;
    }
}

function writeCache(sessionId: string, token: string, fresh: RefreshedMedia): void {
    if (typeof sessionStorage === 'undefined') return;
    // Never cache legacy rows without a known expiry — they can't go stale
    // the same way presigned URLs do, but they also can't benefit from this
    // cache, so just skip.
    if (!fresh.expiresAt) return;
    const expiresAtMs = Date.parse(fresh.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;
    try {
        const entry: CachedEntry = {
            url: fresh.url,
            thumbnailUrl: fresh.thumbnailUrl,
            mimeType: fresh.mimeType,
            expiresAt: fresh.expiresAt,
            storageStatus: fresh.storageStatus,
            expiresAtMs,
            tokenFingerprint: tokenFingerprint(token),
        };
        sessionStorage.setItem(cacheKey(sessionId), JSON.stringify(entry));
    } catch {
        // Storage full / disabled — drop silently
    }
}

export function invalidateCachedMediaUrl(sessionId: string): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(cacheKey(sessionId));
    } catch {
        /* ignore */
    }
}

export async function refreshMediaUrl(
    sessionId: string,
    token: string,
    options: { force?: boolean } = {}
): Promise<RefreshedMedia | null> {
    if (!options.force) {
        const cached = readCache(sessionId, token);
        if (cached) return cached;
    }
    try {
        const res = await fetch(`/api/media-sessions/${sessionId}/url`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const fresh: RefreshedMedia = {
            url: data.url,
            thumbnailUrl: data.thumbnailUrl ?? null,
            mimeType: data.mimeType ?? null,
            expiresAt: data.expiresAt ?? null,
            storageStatus: data.storageStatus ?? null,
        };
        writeCache(sessionId, token, fresh);
        return fresh;
    } catch {
        return null;
    }
}
