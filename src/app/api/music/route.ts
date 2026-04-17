export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { generateMusic, getNanogptKey } from '@/lib/nanogpt';
import { deductCredits, logUsage, calculateCredits, InsufficientCreditsError } from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import { isR2Enabled } from '@/lib/env';
import { persistMusicResult } from '@/lib/mediaPersistence';
import modelConfig from '../../../../config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    // Guest accounts have ephemeral sessions; no R2 storage
    if (authResult.user.role === 'GUEST') {
        try {
            const { prompt, lyrics, duration = 10 } = await request.json();
            if (!prompt || typeof prompt !== 'string') {
                return NextResponse.json(
                    { error: 'Style prompt is required' },
                    { status: 400 }
                );
            }
            const durationSec = Math.max(10, Math.min(300, Number(duration) || 10));
            const creditCost = calculateCredits('music', durationSec);
            try {
                await deductCredits(authResult.user.userId, creditCost);
            } catch (error) {
                if (error instanceof InsufficientCreditsError) {
                    return NextResponse.json({ error: 'Insufficient credits', required: creditCost }, { status: 402 });
                }
                throw error;
            }
            const model = modelConfig.music.model;
            await logUsage(authResult.user.userId, 'music', model, prompt, creditCost);
            const result = await generateMusic(prompt, lyrics || '', model, getNanogptKey(authResult.user.library), durationSec);
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
            console.error('Music error:', error);
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Music generation failed' },
                { status: 500 }
            );
        }
    }

    try {
        const { prompt, lyrics, duration = 10 } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Style prompt is required' },
                { status: 400 }
            );
        }

        const durationSec = Math.max(10, Math.min(300, Number(duration) || 10));
        const creditCost = calculateCredits('music', durationSec);

        // Deduct credits based on duration
        try {
            await deductCredits(authResult.user.userId, creditCost);
        } catch (error) {
            if (error instanceof InsufficientCreditsError) {
                return NextResponse.json({ error: 'Insufficient credits', required: creditCost }, { status: 402 });
            }
            throw error;
        }

        const model = modelConfig.music.model;
        await logUsage(authResult.user.userId, 'music', model, prompt, creditCost);

        const result = await generateMusic(prompt, lyrics || '', model, getNanogptKey(authResult.user.library), durationSec);

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
        console.error('Music error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Music generation failed' },
            { status: 500 }
        );
    }
}
