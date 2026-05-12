export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { getDownloadProxyAllowedHosts, DownloadProxyConfigError } from '@/lib/env';
import {
    fetchBytesFromUrl,
    buildAttachmentDisposition,
    mimeGlobForMode,
    DownloadHostNotAllowedError,
    type MediaMode,
} from '@/lib/storage';

/**
 * POST /api/media-sessions/download/proxy
 *
 * Generic download proxy for cases where the caller doesn't have a
 * MediaSession row — primarily guests, who never write MediaSession rows by
 * design (see ARCHITECTURE.md §2.4). The caller passes the provider URL it
 * already received from the generation route, and the server streams the bytes
 * back with `Content-Disposition: attachment` attached.
 *
 * Used as a *fallback* only — the client should first try a direct blob fetch
 * of the provider URL (free, works when the provider's CORS is permissive,
 * e.g. ElevenLabs for music). This proxy is what handles the providers that
 * don't allow cross-origin reads (e.g. Nano Banana for images).
 *
 * Safety: relies on `fetchBytesFromUrl` (SSRF-safe wrapper around
 * `safeFetchBuffer` in lib/storage.ts) for HTTPS-only, private-IP rejection,
 * redirect cap, content-length pre-check, and content-type allow list. Caller
 * must be authenticated (any role); the kiosk-gate cookie also gates this
 * endpoint via `middleware.ts`.
 *
 * Body: { url: string, filename: string, mode: 'image' | 'music' | 'video' }
 * The `mode` tightens the content-type allowlist on the fetch.
 */

interface ProxyBody {
    url?: unknown;
    filename?: unknown;
    mode?: unknown;
}

function sanitizeFilename(name: string): string {
    // Cap length and strip path separators to keep the filename a leaf name.
    const trimmed = name.trim().slice(0, 200);
    return trimmed.replace(/[\\/]/g, '_') || 'download';
}

function isMediaMode(mode: unknown): mode is MediaMode {
    return mode === 'image' || mode === 'music' || mode === 'video';
}

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    let body: ProxyBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body.url !== 'string' || typeof body.filename !== 'string') {
        return NextResponse.json({ error: 'url and filename are required' }, { status: 400 });
    }

    if (!isMediaMode(body.mode)) {
        return NextResponse.json({ error: 'mode must be image, music, or video' }, { status: 400 });
    }

    const filename = sanitizeFilename(body.filename);
    const expectedMimeGlob = mimeGlobForMode(body.mode);

    try {
        const { buffer, contentType } = await fetchBytesFromUrl(body.url, expectedMimeGlob, {
            allowedHosts: getDownloadProxyAllowedHosts(),
        });
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Disposition': buildAttachmentDisposition(filename),
                'Content-Length': String(buffer.byteLength),
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('Guest download proxy failed', err);
        if (err instanceof DownloadHostNotAllowedError) {
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        if (err instanceof DownloadProxyConfigError) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
        const message = err instanceof Error ? err.message : 'Download failed';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
