export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { getDownloadProxyAllowedHosts, DownloadProxyConfigError } from '@/lib/env';
import {
    generateSignedGetUrl,
    fetchBytesFromUrl,
    extensionForMime,
    defaultMimeForMode,
    mimeGlobForMode,
    buildAttachmentDisposition,
    DownloadHostNotAllowedError,
    type MediaMode,
} from '@/lib/storage';

/**
 * GET /api/media-sessions/[id]/download
 *
 * Download proxy for a patron-owned media session. Two paths:
 *
 * 1. UPLOADED to R2  → 302 redirect to a presigned R2 URL that includes
 *    `Content-Disposition: attachment` in the signature. The kiosk server is
 *    NOT in the byte path — R2 streams directly to the browser. Free.
 *
 * 2. R2 upload failed (PENDING / UPLOADING / FAILED) but a provider URL is
 *    still on the row → server fetches the bytes from the provider via the
 *    SSRF-safe `fetchBytesFromUrl`, then streams them back with the attachment
 *    header attached. Pays Vercel bandwidth. Used only as a fallback so the
 *    download UX stays consistent across all sessions.
 *
 * Auth: requires a valid JWT (`requireAuth`). Ownership-check ensures only the
 * session's owner can download. We intentionally don't use `requireActiveSession`
 * here so a stale patron click that just barely missed the 10-min idle window
 * doesn't fail loudly on a click that doesn't write any state.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const session = await prisma.mediaSession.findUnique({
        where: { id },
        select: {
            userId: true,
            mode: true,
            mimeType: true,
            objectKey: true,
            resultUrl: true,
            sourceProviderUrl: true,
            storageStatus: true,
        },
    });

    if (!session) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (session.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mode = session.mode as MediaMode;
    const mime = session.mimeType ?? defaultMimeForMode(mode);
    const ext = extensionForMime(mime, mode);
    const filename = `generated-${mode}.${ext}`;

    // Direct R2 path — free, kiosk server not in byte path.
    if (session.storageStatus === 'UPLOADED' && session.objectKey) {
        const url = await generateSignedGetUrl(session.objectKey, undefined, {
            downloadFilename: filename,
        });
        return NextResponse.redirect(url);
    }

    // Proxy fallback — kiosk pays bandwidth, but only for sessions where the
    // R2 upload didn't land. resultUrl is the legacy field; sourceProviderUrl
    // is the dedicated fallback written by finalizeVideoUpload on failure.
    const fallbackUrl = session.resultUrl ?? session.sourceProviderUrl;
    if (!fallbackUrl) {
        return NextResponse.json({ error: 'Media not available' }, { status: 404 });
    }

    try {
        const { buffer, contentType } = await fetchBytesFromUrl(fallbackUrl, mimeGlobForMode(mode), {
            allowedHosts: getDownloadProxyAllowedHosts(),
        });
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': contentType || mime,
                'Content-Disposition': buildAttachmentDisposition(filename),
                'Content-Length': String(buffer.byteLength),
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('Patron download proxy failed', err);
        if (err instanceof DownloadHostNotAllowedError) {
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        if (err instanceof DownloadProxyConfigError) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'Download failed' }, { status: 502 });
    }
}
