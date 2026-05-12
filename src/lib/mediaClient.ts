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

/**
 * Trigger a download for a generated media asset. The flow has three layers,
 * ordered cheapest → most expensive:
 *
 *   1. **Direct R2 path** (free; preferred for patrons).
 *      `/api/media-sessions/<id>/url?download=true` returns
 *      `{ url, direct: true }` when the row is UPLOADED. The signed URL has
 *      `Content-Disposition: attachment` baked in, so `window.location.href`
 *      triggers an R2-to-browser download. The kiosk server isn't in the byte
 *      path.
 *
 *   2. **Direct blob fetch of the in-page URL** (free; works for permissive
 *      providers). When there is no sessionId (guest) we try fetching the
 *      provider URL as a blob and trigger `<a download>`. Works when the
 *      provider's CORS allows cross-origin reads (e.g. ElevenLabs for music).
 *
 *   3. **Server-side download proxy** (kiosk pays bandwidth; used only when
 *      paths 1 and 2 don't apply).
 *        - Patron with a failed R2 upload → server responds with
 *          `{ url: '/api/media-sessions/<id>/download', direct: false }` and
 *          we fetch that endpoint with auth; it streams the bytes back from
 *          the provider URL on the session row.
 *        - Guest whose provider URL is CORS-blocked → we POST to
 *          `/api/media-sessions/download/proxy` with the URL, filename, and mode; it
 *          fetches via the SSRF-safe `fetchBytesFromUrl` and streams back.
 *      In both proxy cases we get a blob and trigger `<a download>` on the
 *      client.
 *
 * Final fallback: `window.open(fallbackUrl, '_blank')` so the user can at
 * least right-click → save manually.
 */
export async function downloadMedia(params: {
    sessionId: string | null;
    token: string | null;
    fallbackUrl: string | null;
    fallbackFilename: string;
    /** Tightens the proxy's content-type allowlist for guests. */
    mode: 'image' | 'music' | 'video';
}): Promise<void> {
    const { sessionId, token, fallbackUrl, fallbackFilename, mode } = params;

    // Layer 1 + 3a — patron with a MediaSession row.
    if (sessionId && token) {
        try {
            const res = await fetch(
                `/api/media-sessions/${sessionId}/url?download=true`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
                const data = await res.json();
                if (data.direct && data.url) {
                    window.location.href = data.url;
                    return;
                }
                if (data.url) {
                    // Proxy path: fetch the streaming endpoint with auth, then trigger blob download.
                    const filename: string = data.filename || fallbackFilename;
                    if (await fetchAndSaveBlob(data.url, filename, { Authorization: `Bearer ${token}` })) return;
                }
            }
        } catch { /* fall through */ }
    }

    if (!fallbackUrl) return;

    // Layer 2 — direct blob fetch of the in-page URL.
    if (await fetchAndSaveBlob(fallbackUrl, fallbackFilename)) return;

    // Layer 3b — guest proxy. Requires a token (kiosk gate).
    if (token) {
        try {
            const res = await fetch('/api/media-sessions/download/proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ url: fallbackUrl, filename: fallbackFilename, mode }),
            });
            if (res.ok && await saveResponseAsBlob(res, fallbackFilename)) return;
        } catch { /* fall through */ }
    }

    // Last resort — let the user save it manually from a new tab.
    window.open(fallbackUrl, '_blank');
}

async function fetchAndSaveBlob(url: string, filename: string, headers?: Record<string, string>): Promise<boolean> {
    try {
        const res = await fetch(url, headers ? { headers } : undefined);
        if (!res.ok) return false;
        return saveResponseAsBlob(res, filename);
    } catch {
        return false;
    }
}

async function saveResponseAsBlob(res: Response, filename: string): Promise<boolean> {
    try {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
        return true;
    } catch {
        return false;
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
