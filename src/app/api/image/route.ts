export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { generateImage } from '@/lib/nanogpt';
import { deductCredits, logUsage, calculateCredits, InsufficientCreditsError } from '@/lib/credits';
import { requireApproved } from '@/lib/status';
import { isR2Enabled } from '@/lib/env';
import { persistImageResult } from '@/lib/mediaPersistence';
import modelConfig from '../../../../config/models.json';

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;

    // Guest accounts have ephemeral sessions; no R2 storage
    if (authResult.user.role === 'GUEST') {
        try {
            const { prompt } = await request.json();
            if (!prompt || typeof prompt !== 'string') {
                return NextResponse.json(
                    { error: 'Prompt is required' },
                    { status: 400 }
                );
            }
            const creditCost = calculateCredits('image');
            try {
                await deductCredits(authResult.user.userId, creditCost);
            } catch (error) {
                if (error instanceof InsufficientCreditsError) {
                    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
                }
                throw error;
            }
            const model = modelConfig.image.model;
            await logUsage(authResult.user.userId, 'image', model, prompt, creditCost);
            const result = await generateImage(prompt, model);
            // Return provider URL directly without R2 persistence
            return NextResponse.json({
                url: result.url,
                b64_json: result.b64_json,
                ephemeral: true,
            });
        } catch (error) {
            console.error('Image error:', error);
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Image generation failed' },
                { status: 500 }
            );
        }
    }

    try {
        const { prompt } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const creditCost = calculateCredits('image');

        try {
            await deductCredits(authResult.user.userId, creditCost);
        } catch (error) {
            if (error instanceof InsufficientCreditsError) {
                return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
            }
            throw error;
        }

        const model = modelConfig.image.model;
        await logUsage(authResult.user.userId, 'image', model, prompt, creditCost);

        const result = await generateImage(prompt, model);

        if (!isR2Enabled()) {
            // Legacy path: client handles persistence via POST /api/media-sessions
            return NextResponse.json({
                url: result.url,
                b64_json: result.b64_json,
            });
        }

        const persisted = await persistImageResult({
            userId: authResult.user.userId,
            prompt,
            result,
        });

        return NextResponse.json({
            mediaSessionId: persisted.mediaSessionId,
            url: persisted.url,
            mimeType: persisted.mimeType,
            storageStatus: persisted.storageStatus,
        });
    } catch (error) {
        console.error('Image error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Image generation failed' },
            { status: 500 }
        );
    }
}
