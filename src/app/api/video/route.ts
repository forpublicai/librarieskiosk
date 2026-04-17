export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { submitVideoGeneration, getNanogptKey } from '@/lib/nanogpt';
import { deductCredits, logUsage, calculateCredits, InsufficientCreditsError } from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import { isR2Enabled } from '@/lib/env';
import { createPendingVideoSession } from '@/lib/mediaPersistence';
import modelConfig from '../../../../config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    // Guest accounts have ephemeral sessions; no R2 storage
    if (authResult.user.role === 'GUEST') {
        try {
            const { prompt, duration = 5 } = await request.json();
            if (!prompt || typeof prompt !== 'string') {
                return NextResponse.json(
                    { error: 'Prompt is required' },
                    { status: 400 }
                );
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
            const result = await submitVideoGeneration(prompt, model, getNanogptKey(authResult.user.library), durationSec);
            // Return without creating persistent MediaSession for guest
            return NextResponse.json({
                runId: result.runId,
                status: result.status,
                creditsUsed: creditCost,
                ephemeral: true,
            });
        } catch (error) {
            console.error('Video submit error:', error);
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Video generation failed' },
                { status: 500 }
            );
        }
    }

    try {
        const { prompt, duration = 5 } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const durationSec = Math.max(3, Math.min(15, Number(duration) || 5));
        const creditCost = calculateCredits('video', durationSec);

        // Deduct credits based on duration
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

        const result = await submitVideoGeneration(prompt, model, getNanogptKey(authResult.user.library), durationSec);

        let mediaSessionId: string | null = null;
        if (isR2Enabled() && result.runId) {
            const pending = await createPendingVideoSession({
                userId: authResult.user.userId,
                prompt,
                runId: result.runId,
            });
            mediaSessionId = pending.mediaSessionId;
        }

        return NextResponse.json({
            runId: result.runId,
            status: result.status,
            creditsUsed: creditCost,
            mediaSessionId,
        });
    } catch (error) {
        console.error('Video submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Video generation failed' },
            { status: 500 }
        );
    }
}
