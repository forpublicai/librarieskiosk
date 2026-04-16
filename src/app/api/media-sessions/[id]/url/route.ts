export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { getMediaReadUrl } from '@/lib/mediaUrlCache';

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
            storageStatus: true,
        },
    });

    if (!session) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (session.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.storageStatus !== 'UPLOADED' || !session.objectKey) {
        // Legacy row with a provider URL is still usable (will expire eventually)
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
            {
                error: 'Media not available',
                storageStatus: session.storageStatus,
            },
            { status: 409 }
        );
    }

    const resolved = await getMediaReadUrl(session.objectKey);
    const thumbnail = session.thumbnailKey
        ? await getMediaReadUrl(session.thumbnailKey).catch(() => null)
        : null;

    return NextResponse.json({
        url: resolved.url,
        expiresAt: resolved.expiresAt,
        public: resolved.public,
        thumbnailUrl: thumbnail?.url ?? null,
        mimeType: session.mimeType,
        mode: session.mode,
        byteSize: session.byteSize,
        storageStatus: session.storageStatus,
    });
}
