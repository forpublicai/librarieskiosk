export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { pollVideoStatus, getNanogptKey } from '@/lib/nanogpt';
import { isR2Enabled } from '@/lib/env';
import { finalizeVideoUpload } from '@/lib/mediaPersistence';
import { settleCreditHold } from '@/lib/credits';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const runId =
        request.nextUrl.searchParams.get('runId') ||
        request.nextUrl.searchParams.get('requestId') ||
        request.nextUrl.searchParams.get('id');
    if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const isGuest = authResult.user.role === 'GUEST';

    try {
        const status = await pollVideoStatus(runId, getNanogptKey(authResult.user.library));

        const normalized = String(status.status || '').toUpperCase();
        const isCompleted = normalized === 'COMPLETED' && !!status.videoUrl;
        const isFailed = normalized === 'FAILED' || normalized === 'CANCELED';

        const heldRow = (normalized === 'COMPLETED' || isFailed)
            ? await prisma.mediaSession.findFirst({
                where: { providerRunId: runId, userId: authResult.user.userId },
                select: { id: true },
            })
            : null;

        let finalized = null as Awaited<ReturnType<typeof finalizeVideoUpload>> | null;
        if (!isGuest && isR2Enabled() && isCompleted) {
            finalized = await finalizeVideoUpload({
                userId: authResult.user.userId,
                runId,
                providerVideoUrl: status.videoUrl!,
                apiKey: getNanogptKey(authResult.user.library),
            });
        }

        if (heldRow) {
            if (normalized === 'COMPLETED') {
                await settleCreditHold(heldRow.id, 'burn');
            } else if (isFailed) {
                await settleCreditHold(heldRow.id, 'refund');
            }
        }

        // GUEST or R2 disabled or non-terminal: return raw status.
        if (!finalized || !finalized.mediaSessionId) {
            return NextResponse.json({
                ...status,
                ...(isGuest ? { ephemeral: true } : {}),
            });
        }

        return NextResponse.json({
            ...status,
            // Prefer the signed R2 URL; fall back to the provider URL if
            // upload failed so the user still sees their video once.
            videoUrl: finalized.signedUrl ?? status.videoUrl,
            mediaSessionId: finalized.mediaSessionId,
            mimeType: finalized.mimeType,
            storageStatus: finalized.storageStatus,
        });
    } catch (error) {
        console.error('Video status error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Status check failed' },
            { status: 500 }
        );
    }
}
