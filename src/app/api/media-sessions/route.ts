export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { isR2Enabled } from '@/lib/env';
import { getMediaReadUrl } from '@/lib/mediaUrlCache';

// GET /api/media-sessions?mode=image|video|music — list user's sessions
export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const mode = request.nextUrl.searchParams.get('mode');

    const rows = await prisma.mediaSession.findMany({
        where: {
            userId: authResult.user.userId,
            ...(mode ? { mode } : {}),
        },
        select: {
            id: true,
            mode: true,
            prompt: true,
            resultUrl: true,
            objectKey: true,
            thumbnailKey: true,
            mimeType: true,
            byteSize: true,
            storageStatus: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    // Presign only what the sidebar actually displays:
    //   - Images show a thumbnail inline → presign thumbnailKey (or fall back
    //     to objectKey for legacy pre-thumbnail rows).
    //   - Video & music show prompt text only → skip presign entirely. The
    //     full URL is fetched on-click via /api/media-sessions/[id]/url.
    //
    // This cuts class-A operations on video/music pages from 20 presigns/load
    // to 0, and images from 40 (full+thumb) to 20 (thumb only).
    const sessions = await Promise.all(
        rows.map(async (row) => {
            let thumbnailUrl: string | null = null;
            const needsInlinePreview = row.mode === 'image';

            if (
                needsInlinePreview &&
                row.storageStatus === 'UPLOADED' &&
                (row.thumbnailKey || row.objectKey)
            ) {
                const key = row.thumbnailKey ?? row.objectKey!;
                try {
                    const resolved = await getMediaReadUrl(key);
                    thumbnailUrl = resolved.url;
                } catch (err) {
                    console.error('Failed to resolve thumbnail', row.id, err);
                }
            }

            // Legacy rows without objectKey keep returning resultUrl so old
            // history still renders during the compat window.
            const legacyUrl =
                row.storageStatus !== 'UPLOADED' || !row.objectKey
                    ? row.resultUrl
                    : null;

            return {
                id: row.id,
                mode: row.mode,
                prompt: row.prompt,
                // url is intentionally null for R2-backed rows. Clients fetch
                // the presigned URL on-click via /api/media-sessions/[id]/url.
                url: legacyUrl,
                thumbnailUrl,
                mimeType: row.mimeType,
                byteSize: row.byteSize,
                storageStatus: row.storageStatus,
                hasObject: Boolean(row.objectKey) && row.storageStatus === 'UPLOADED',
                createdAt: row.createdAt,
                // Back-compat: older clients read resultUrl
                resultUrl: legacyUrl,
            };
        })
    );

    return NextResponse.json({ sessions });
}

// POST /api/media-sessions — save a generation result.
// Legacy compatibility endpoint. When USE_R2_PERSISTENCE is enabled, generation
// routes create the row server-side, so this endpoint becomes a no-op that
// returns the most recent row for the given mode. Kept for one release cycle.
export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { mode, prompt, resultUrl } = await request.json();

        if (!mode || !['image', 'video', 'music'].includes(mode)) {
            return NextResponse.json({ error: 'Mode must be image, video, or music' }, { status: 400 });
        }
        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        if (isR2Enabled()) {
            // Server-side persistence already handled this generation. Return the
            // most recent matching row so old clients still get a 2xx they can
            // ignore. Do not create a duplicate row.
            const existing = await prisma.mediaSession.findFirst({
                where: { userId: authResult.user.userId, mode },
                orderBy: { createdAt: 'desc' },
            });
            return NextResponse.json({ session: existing, deprecated: true }, { status: 200 });
        }

        const session = await prisma.mediaSession.create({
            data: {
                userId: authResult.user.userId,
                mode,
                prompt: prompt.slice(0, 2000),
                resultUrl: resultUrl || null,
            },
        });

        return NextResponse.json({ session }, { status: 201 });
    } catch (error) {
        console.error('Create media session error:', error);
        return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
    }
}
