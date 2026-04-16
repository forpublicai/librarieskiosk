import 'server-only';

import { prisma } from './db';
import {
    buildObjectKey,
    deleteObject,
    extensionForMime,
    generateSignedGetUrl,
    uploadBuffer,
    uploadFromDataUrl,
    uploadFromUrl,
    type UploadResult,
} from './storage';
import type { ImageResult, MusicResult } from './nanogpt';

/**
 * Shared glue between generation routes and the storage layer.
 *
 * Each helper:
 *   1. Picks the right upload branch (remote URL / data URL / buffer)
 *   2. Catches failures and records a FAILED row so the user still sees output
 *   3. Returns a freshly presigned URL so the route can hand it to the client
 *      without a second DB hop
 */

export interface PersistedMedia {
    mediaSessionId: string;
    url: string;
    mimeType: string;
    byteSize: number | null;
    storageStatus: 'UPLOADED' | 'FAILED';
}

// ---------- Image ----------

export interface PersistImageInput {
    userId: string;
    prompt: string;
    result: ImageResult;
}

export async function persistImageResult({
    userId,
    prompt,
    result,
}: PersistImageInput): Promise<PersistedMedia> {
    // Resolve the binary: prefer the remote URL, fall back to base64
    let upload: UploadResult | null = null;
    let uploadError: unknown = null;
    let key: string | null = null;

    try {
        if (result.url) {
            key = buildObjectKey({
                userId,
                mode: 'image',
                extension: 'png',
            });
            upload = await uploadFromUrl(result.url, key, 'image/*');
        } else if (result.b64_json) {
            key = buildObjectKey({
                userId,
                mode: 'image',
                extension: 'png',
            });
            const dataUrl = `data:image/png;base64,${result.b64_json}`;
            upload = await uploadFromDataUrl(dataUrl, key);
        } else {
            throw new Error('Image result contained neither url nor b64_json');
        }
    } catch (err) {
        uploadError = err;
    }

    // Upload failed: record a FAILED row, preserve the provider URL so the user
    // can still view their generation at least once before the provider link expires
    if (!upload || !key) {
        const failed = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'image',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'FAILED',
                sourceProviderUrl: result.url ?? null,
                resultUrl: result.url ?? null,
            },
        });
        console.error('persistImageResult upload failed', uploadError);
        return {
            mediaSessionId: failed.id,
            url: result.url || '',
            mimeType: 'image/png',
            byteSize: null,
            storageStatus: 'FAILED',
        };
    }

    // Upload succeeded: insert the row, rolling back R2 on insert failure
    // so we never leak an orphan object
    try {
        const row = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'image',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'UPLOADED',
                objectKey: key,
                mimeType: upload.mimeType,
                byteSize: upload.byteSize,
                checksum: upload.checksum,
                sourceProviderUrl: result.url ?? null,
                resultUrl: null,
            },
        });
        const signed = await generateSignedGetUrl(key);
        return {
            mediaSessionId: row.id,
            url: signed,
            mimeType: upload.mimeType,
            byteSize: upload.byteSize,
            storageStatus: 'UPLOADED',
        };
    } catch (err) {
        await safeDelete(key);
        throw err;
    }
}

// ---------- Music ----------

export interface PersistMusicInput {
    userId: string;
    prompt: string;
    result: MusicResult;
}

export async function persistMusicResult({
    userId,
    prompt,
    result,
}: PersistMusicInput): Promise<PersistedMedia> {
    let upload: UploadResult | null = null;
    let key: string | null = null;
    let uploadError: unknown = null;

    try {
        if (result.audioUrl) {
            key = buildObjectKey({
                userId,
                mode: 'music',
                extension: 'mp3',
            });
            upload = await uploadFromUrl(result.audioUrl, key, 'audio/*');
        } else if (result.audioBuffer) {
            const mime = result.contentType || 'audio/mpeg';
            const ext = extensionForMime(mime, 'music');
            key = buildObjectKey({ userId, mode: 'music', extension: ext });
            const buffer = Buffer.from(result.audioBuffer);
            upload = await uploadBuffer(key, buffer, mime);
        } else {
            throw new Error('Music result contained neither audioUrl nor audioBuffer');
        }
    } catch (err) {
        uploadError = err;
    }

    if (!upload || !key) {
        const failed = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'music',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'FAILED',
                sourceProviderUrl: result.audioUrl ?? null,
                resultUrl: result.audioUrl ?? null,
            },
        });
        console.error('persistMusicResult upload failed', uploadError);
        return {
            mediaSessionId: failed.id,
            url: result.audioUrl || '',
            mimeType: result.contentType || 'audio/mpeg',
            byteSize: null,
            storageStatus: 'FAILED',
        };
    }

    try {
        const row = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'music',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'UPLOADED',
                objectKey: key,
                mimeType: upload.mimeType,
                byteSize: upload.byteSize,
                checksum: upload.checksum,
                sourceProviderUrl: result.audioUrl ?? null,
                resultUrl: null,
            },
        });
        const signed = await generateSignedGetUrl(key);
        return {
            mediaSessionId: row.id,
            url: signed,
            mimeType: upload.mimeType,
            byteSize: upload.byteSize,
            storageStatus: 'UPLOADED',
        };
    } catch (err) {
        await safeDelete(key);
        throw err;
    }
}

// ---------- Video ----------

export interface CreatePendingVideoInput {
    userId: string;
    prompt: string;
    runId: string;
}

export async function createPendingVideoSession({
    userId,
    prompt,
    runId,
}: CreatePendingVideoInput): Promise<{ mediaSessionId: string }> {
    const row = await prisma.mediaSession.create({
        data: {
            userId,
            mode: 'video',
            prompt: prompt.slice(0, 2000),
            providerRunId: runId,
            storageProvider: 'R2',
            storageStatus: 'PENDING',
        },
    });
    return { mediaSessionId: row.id };
}

export interface FinalizeVideoInput {
    userId: string;
    runId: string;
    providerVideoUrl: string;
}

export interface FinalizeVideoResult {
    mediaSessionId: string | null;
    signedUrl: string | null;
    mimeType: string | null;
    storageStatus: 'UPLOADED' | 'FAILED' | 'UPLOADING' | 'PENDING' | null;
    /** If true, this invocation was the one that performed the upload */
    uploadedThisCall: boolean;
}

/**
 * Finalizes a video upload atomically. Intended to be called from the video
 * status polling route whenever the provider reports COMPLETED.
 *
 * Idempotency guarantee: concurrent pollers contend via a PENDING → UPLOADING
 * updateMany claim; only the winner performs the upload. Losers observe the
 * final state and return a signed URL.
 */
export async function finalizeVideoUpload({
    userId,
    runId,
    providerVideoUrl,
}: FinalizeVideoInput): Promise<FinalizeVideoResult> {
    const row = await prisma.mediaSession.findFirst({
        where: { providerRunId: runId, userId },
        select: { id: true, storageStatus: true, objectKey: true, mimeType: true },
    });

    if (!row) {
        return {
            mediaSessionId: null,
            signedUrl: null,
            mimeType: null,
            storageStatus: null,
            uploadedThisCall: false,
        };
    }

    // Already uploaded — fast path
    if (row.storageStatus === 'UPLOADED' && row.objectKey) {
        const signedUrl = await generateSignedGetUrl(row.objectKey);
        return {
            mediaSessionId: row.id,
            signedUrl,
            mimeType: row.mimeType,
            storageStatus: 'UPLOADED',
            uploadedThisCall: false,
        };
    }

    // Atomic claim: only one concurrent poller wins
    const claim = await prisma.mediaSession.updateMany({
        where: { id: row.id, storageStatus: 'PENDING' },
        data: { storageStatus: 'UPLOADING' },
    });

    if (claim.count === 0) {
        // Another poller is uploading or the row reached a terminal state
        const fresh = await prisma.mediaSession.findUnique({
            where: { id: row.id },
            select: { storageStatus: true, objectKey: true, mimeType: true },
        });
        const signedUrl =
            fresh?.objectKey && fresh.storageStatus === 'UPLOADED'
                ? await generateSignedGetUrl(fresh.objectKey)
                : null;
        return {
            mediaSessionId: row.id,
            signedUrl,
            mimeType: fresh?.mimeType ?? null,
            storageStatus: (fresh?.storageStatus as FinalizeVideoResult['storageStatus']) ?? null,
            uploadedThisCall: false,
        };
    }

    // We own the upload
    let key: string | null = null;
    try {
        key = buildObjectKey({
            userId,
            mode: 'video',
            extension: 'mp4',
        });
        const upload = await uploadFromUrl(providerVideoUrl, key, 'video/*');

        await prisma.mediaSession.update({
            where: { id: row.id },
            data: {
                storageStatus: 'UPLOADED',
                objectKey: key,
                mimeType: upload.mimeType,
                byteSize: upload.byteSize,
                checksum: upload.checksum,
                sourceProviderUrl: providerVideoUrl,
                resultUrl: null,
            },
        });
        const signedUrl = await generateSignedGetUrl(key);
        return {
            mediaSessionId: row.id,
            signedUrl,
            mimeType: upload.mimeType,
            storageStatus: 'UPLOADED',
            uploadedThisCall: true,
        };
    } catch (err) {
        if (key) await safeDelete(key);
        await prisma.mediaSession.update({
            where: { id: row.id },
            data: {
                storageStatus: 'FAILED',
                sourceProviderUrl: providerVideoUrl,
            },
        });
        console.error('finalizeVideoUpload failed', err);
        return {
            mediaSessionId: row.id,
            signedUrl: null,
            mimeType: null,
            storageStatus: 'FAILED',
            uploadedThisCall: false,
        };
    }
}

// ---------- Internal helpers ----------

async function safeDelete(key: string): Promise<void> {
    try {
        await deleteObject(key);
    } catch (err) {
        console.error('safeDelete failed for', key, err);
    }
}

