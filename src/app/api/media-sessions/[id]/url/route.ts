export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { getMediaReadUrl } from '@/lib/mediaUrlCache';
import { generateSignedGetUrl, extensionForMime } from '@/lib/storage';
import type { MediaMode } from '@/lib/storage';

/**
 * GET /api/media-sessions/[id]/url
 *
 * Returns a freshly presigned R2 GET URL for a media session. Intended to be
 * called by the frontend whenever a cached URL has expired (e.g. from an
 * <img onError> handler).
 *
 * Enforces ownership: the session's userId must match the caller's JWT.
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
            id: true,
            userId: true,
            mode: true,
            mimeType: true,
            byteSize: true,
            objectKey: true,
            thumbnailKey: true,
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

    const isDownload = request.nextUrl.searchParams.get('download') === 'true';

    // Download intent: return either a direct presigned R2 URL with attachment
    // disposition baked in (free path), or point the client at the server-side
    // download proxy (`/api/media-sessions/<id>/download`) which streams the
    // bytes through the kiosk server. The `direct` flag tells the client which
    // path to take.
    if (isDownload) {
        const mode = session.mode as MediaMode;
        const ext = extensionForMime(session.mimeType ?? '', mode);
        const filename = `generated-${session.mode}.${ext}`;

        if (session.storageStatus === 'UPLOADED' && session.objectKey) {
            const url = await generateSignedGetUrl(session.objectKey, undefined, {
                downloadFilename: filename,
            });
            return NextResponse.json({
                url,
                direct: true,
                expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
                mimeType: session.mimeType,
                mode: session.mode,
                filename,
            });
        }

        if (session.resultUrl || session.sourceProviderUrl) {
            return NextResponse.json({
                url: `/api/media-sessions/${session.id}/download`,
                direct: false,
                mimeType: session.mimeType,
                mode: session.mode,
                filename,
            });
        }

        return NextResponse.json(
            { error: 'Media not available', storageStatus: session.storageStatus },
            { status: 409 }
        );
    }

    // Preview intent (default): existing behavior — return a non-attachment
    // signed URL for in-page <img>/<audio>/<video>.
    if (session.storageStatus !== 'UPLOADED' || !session.objectKey) {
        if (session.resultUrl) {
            return NextResponse.json({
                url: session.resultUrl,
                expiresAt: null,
                mimeType: session.mimeType,
                mode: session.mode,
                byteSize: session.byteSize,
                storageStatus: session.storageStatus,
                legacy: true,
            });
        }
        return NextResponse.json(
            { error: 'Media not available', storageStatus: session.storageStatus },
            { status: 409 }
        );
    }

    const resolved = await getMediaReadUrl(session.objectKey);
    const thumbnail = session.thumbnailKey
        ? await getMediaReadUrl(session.thumbnailKey).catch(() => null)
        : null;

    return NextResponse.json({
        url: resolved.url,
        expiresAt: resolved.expiresAt ? String(resolved.expiresAt) : null,
        public: resolved.public ?? false,
        thumbnailUrl: thumbnail?.url ?? null,
        mimeType: session.mimeType,
        mode: session.mode,
        byteSize: session.byteSize,
        storageStatus: session.storageStatus,
    });
}
