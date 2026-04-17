export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { pollVideoStatus, getNanogptKey } from '@/lib/nanogpt';
import { isR2Enabled } from '@/lib/env';
import { finalizeVideoUpload } from '@/lib/mediaPersistence';

export async function GET(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    // Guest accounts don't benefit from R2 persistence; skip finalization
    if (authResult.user.role === 'GUEST') {
        try {
            const runId =
                request.nextUrl.searchParams.get('runId') ||
                request.nextUrl.searchParams.get('requestId') ||
                request.nextUrl.searchParams.get('id');
            if (!runId) {
                return NextResponse.json({ error: 'runId is required' }, { status: 400 });
            }
            const status = await pollVideoStatus(runId, getNanogptKey(authResult.user.library));
            // Return status without persisting to R2
            return NextResponse.json({ ...status, ephemeral: true });
        } catch (error) {
            console.error('Video status error:', error);
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Status check failed' },
                { status: 500 }
            );
        }
    }

    const runId =
        request.nextUrl.searchParams.get('runId') ||
        request.nextUrl.searchParams.get('requestId') ||
        request.nextUrl.searchParams.get('id');
    if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    try {
        const status = await pollVideoStatus(runId, getNanogptKey(authResult.user.library));

        const isCompleted =
            String(status.status).toUpperCase() === 'COMPLETED' && !!status.videoUrl;

        if (!isR2Enabled() || !isCompleted) {
            return NextResponse.json(status);
        }

        const finalized = await finalizeVideoUpload({
            userId: authResult.user.userId,
            runId,
            providerVideoUrl: status.videoUrl!,
        });

        // If no row matched (legacy runId) return raw status unchanged
        if (!finalized.mediaSessionId) {
            return NextResponse.json(status);
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
