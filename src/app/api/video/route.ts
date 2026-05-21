export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { submitVideoGeneration, getNanogptKey } from '@/lib/nanogpt';
import {
    deductCredits,
    refundCredits,
    logUsage,
    calculateCredits,
    InsufficientCreditsError,
} from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import { isR2Enabled } from '@/lib/env';
import { createPendingVideoSession } from '@/lib/mediaPersistence';
import modelConfig from '@/config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    const isGuest = authResult.user.role === 'GUEST';

    let parsed: { prompt?: unknown; duration?: unknown };
    try {
        parsed = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { prompt, duration = 5 } = parsed;
    if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const durationSec = Math.max(3, Math.min(15, Number(duration) || 5));
    const creditCost = calculateCredits('video', durationSec);

    try {
        await deductCredits(authResult.user.userId, creditCost);
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return NextResponse.json({ error: 'Insufficient credits', required: creditCost }, { status: 402 });
        }
        throw error;
    }

    const model = modelConfig.video.model;
    await logUsage(authResult.user.userId, 'video', model, prompt, creditCost);

    // From here on, any failure before we hand off to async polling must
    // refund the credits we just deducted — the client has no way to recover
    // them otherwise.
    try {
        const result = await submitVideoGeneration(
            prompt,
            model,
            getNanogptKey(authResult.user.library),
            durationSec
        );

        let mediaSessionId: string | null = null;
        if (isR2Enabled() && result.runId) {
            const pending = await createPendingVideoSession({
                userId: authResult.user.userId,
                prompt,
                runId: result.runId,
                heldCredits: creditCost,
            });
            mediaSessionId = pending.mediaSessionId;
        }

        return NextResponse.json({
            runId: result.runId,
            status: result.status,
            creditsUsed: creditCost,
            mediaSessionId,
            ...(isGuest ? { ephemeral: true } : {}),
        });
    } catch (error) {
        await refundCredits(authResult.user.userId, creditCost).catch((refundErr) => {
            console.error('Video submit refund failed:', refundErr);
        });
        console.error('Video submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Video generation failed' },
            { status: 502 }
        );
    }
}
