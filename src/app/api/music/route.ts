export const dynamic = 'force-dynamic';
// Music models (e.g. Google Lyria) are async: we submit then poll for ~30s+
// before the audio is ready. Without this, Vercel's short default timeout
// (10–15s) would kill the request mid-poll. 60s is the universally-allowed
// ceiling; raise toward 300 on Pro/Enterprise if longer tracks time out.
export const maxDuration = 60;

// Cap provider polling well under `maxDuration` so a controlled timeout is
// thrown — and credits refunded — before the platform kills the request. Leaves
// ~15s headroom for submit + R2 persistence + the response.
const MUSIC_POLL_BUDGET_MS = 45_000;

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { generateMusic, getNanogptKey } from '@/lib/nanogpt';
import { deductCredits, refundCredits, logUsage, calculateCredits, InsufficientCreditsError } from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import { isR2Enabled } from '@/lib/env';
import { persistMusicResult } from '@/lib/mediaPersistence';
import modelConfig from '@/config/models.json';

/**
 * Build the patron-facing error response for a failed music generation.
 *
 * Upstream provider outages surface as `Music API error 5xx` / `server_error`
 * (e.g. the Runware-backed Eleven Music model returning 502). Patrons should see
 * a clear "try again, you weren't charged" message — not the raw upstream JSON —
 * and the correct 503 status. Everything else falls back to the generic 500.
 */
function musicErrorResponse(error: unknown, refunded: boolean): NextResponse {
    const message = error instanceof Error ? error.message : 'Music generation failed';
    const upstreamUnavailable = /API error (5\d\d|429)\b/.test(message) || /server_error/.test(message);
    if (upstreamUnavailable) {
        return NextResponse.json(
            {
                error: refunded
                    ? 'The music service is temporarily unavailable. Your credits were not charged — please try again in a few minutes.'
                    : 'The music service is temporarily unavailable. Please try again in a few minutes.',
            },
            { status: 503 }
        );
    }
    return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    // Guest accounts have ephemeral sessions; no R2 storage
    if (authResult.user.role === 'GUEST') {
        let creditCost = 0;
        let creditsDeducted = false;
        let refundSucceeded = false;
        try {
            const { prompt, lyrics, duration = 10 } = await request.json();
            if (!prompt || typeof prompt !== 'string') {
                return NextResponse.json(
                    { error: 'Style prompt is required' },
                    { status: 400 }
                );
            }
            const durationSec = Math.max(10, Math.min(300, Number(duration) || 10));
            creditCost = calculateCredits('music', durationSec);
            try {
                await deductCredits(authResult.user.userId, creditCost);
                creditsDeducted = true;
            } catch (error) {
                if (error instanceof InsufficientCreditsError) {
                    return NextResponse.json({ error: 'Insufficient credits', required: creditCost }, { status: 402 });
                }
                throw error;
            }
            const model = modelConfig.music.model;
            await logUsage(authResult.user.userId, 'music', model, prompt, creditCost);
            const result = await generateMusic(prompt, lyrics || '', model, getNanogptKey(authResult.user.library), durationSec, MUSIC_POLL_BUDGET_MS);
            // Return provider URL directly without R2 persistence
            if (result.audioUrl) {
                return NextResponse.json({ audioUrl: result.audioUrl, ephemeral: true });
            }
            if (result.audioBuffer) {
                const base64 = Buffer.from(result.audioBuffer).toString('base64');
                const contentType = result.contentType || 'audio/mpeg';
                const dataUrl = `data:${contentType};base64,${base64}`;
                return NextResponse.json({ audioUrl: dataUrl, ephemeral: true });
            }
            return NextResponse.json(
                { error: 'No audio generated' },
                { status: 500 }
            );
        } catch (error) {
            // Refund the upfront deduction when generation fails (e.g. upstream
            // 502) so a provider outage never silently consumes credits.
            if (creditsDeducted) {
                refundSucceeded = await refundCredits(authResult.user.userId, creditCost)
                    .then(() => true)
                    .catch((refundErr) => {
                        console.error('Music refund failed:', refundErr);
                        return false;
                    });
            }
            console.error('Music error:', error);
            return musicErrorResponse(error, refundSucceeded);
        }
    }

    let creditCost = 0;
    let creditsDeducted = false;
    let refundSucceeded = false;
    try {
        const { prompt, lyrics, duration = 10 } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Style prompt is required' },
                { status: 400 }
            );
        }

        const durationSec = Math.max(10, Math.min(300, Number(duration) || 10));
        creditCost = calculateCredits('music', durationSec);

        // Deduct credits based on duration
        try {
            await deductCredits(authResult.user.userId, creditCost);
            creditsDeducted = true;
        } catch (error) {
            if (error instanceof InsufficientCreditsError) {
                return NextResponse.json({ error: 'Insufficient credits', required: creditCost }, { status: 402 });
            }
            throw error;
        }

        const model = modelConfig.music.model;
        await logUsage(authResult.user.userId, 'music', model, prompt, creditCost);

        const result = await generateMusic(prompt, lyrics || '', model, getNanogptKey(authResult.user.library), durationSec, MUSIC_POLL_BUDGET_MS);

        if (!isR2Enabled()) {
            // Legacy path
            if (result.audioUrl) {
                return NextResponse.json({ audioUrl: result.audioUrl });
            }
            if (result.audioBuffer) {
                const base64 = Buffer.from(result.audioBuffer).toString('base64');
                const contentType = result.contentType || 'audio/mpeg';
                const dataUrl = `data:${contentType};base64,${base64}`;
                return NextResponse.json({ audioUrl: dataUrl });
            }
            return NextResponse.json(
                { error: 'No audio generated' },
                { status: 500 }
            );
        }

        if (!result.audioUrl && !result.audioBuffer) {
            return NextResponse.json(
                { error: 'No audio generated' },
                { status: 500 }
            );
        }

        const persisted = await persistMusicResult({
            userId: authResult.user.userId,
            prompt,
            result,
        });

        return NextResponse.json({
            mediaSessionId: persisted.mediaSessionId,
            audioUrl: persisted.url,
            mimeType: persisted.mimeType,
            storageStatus: persisted.storageStatus,
        });
    } catch (error) {
        // Refund the upfront deduction when generation fails (e.g. upstream
        // 502) so a provider outage never silently consumes credits.
        if (creditsDeducted) {
            refundSucceeded = await refundCredits(authResult.user.userId, creditCost)
                .then(() => true)
                .catch((refundErr) => {
                    console.error('Music refund failed:', refundErr);
                    return false;
                });
        }
        console.error('Music error:', error);
        return musicErrorResponse(error, refundSucceeded);
    }
}
