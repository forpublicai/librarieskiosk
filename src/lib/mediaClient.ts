/**
 * Client-side helpers for working with R2-backed media sessions.
 *
 * Generation routes return a presigned URL that expires (default 1 hour). If a
 * kiosk tab is left idle past the TTL, <img>/<audio>/<video> tags will 403.
 * The pages call `refreshMediaUrl(sessionId, token)` from their onError
 * handler to swap in a fresh URL without a page reload.
 */

export interface RefreshedMedia {
    url: string;
    mimeType: string | null;
    expiresAt: string | null;
    storageStatus: string | null;
}

export async function refreshMediaUrl(
    sessionId: string,
    token: string
): Promise<RefreshedMedia | null> {
    try {
        const res = await fetch(`/api/media-sessions/${sessionId}/url`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            url: data.url,
            mimeType: data.mimeType ?? null,
            expiresAt: data.expiresAt ?? null,
            storageStatus: data.storageStatus ?? null,
        };
    } catch {
        return null;
    }
}
