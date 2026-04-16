import 'server-only';

import { createHash } from 'crypto';
import { prisma } from './db';
import {
    buildObjectKey,
    deleteObject,
    extensionForMime,
    uploadBuffer,
    uploadFromUrl,
    fetchBytesFromUrl,
    bufferFromDataUrl,
    type UploadResult,
} from './storage';
import { getMediaReadUrl } from './mediaUrlCache';
import { encodeImageWithThumbnail } from './imagePipeline';
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
    thumbnailUrl?: string | null;
    mimeType: string;
    byteSize: number | null;
    storageStatus: 'UPLOADED' | 'FAILED';
    /** True if an existing row with the same checksum was reused (no new upload) */
    deduplicated?: boolean;
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
    // 1. Fetch the raw bytes from the provider (URL or base64). We need the
    //    bytes locally so we can transcode PNG → AVIF + thumbnail before upload.
    let sourceBuffer: Buffer | null = null;
    let sourceError: unknown = null;
    try {
        if (result.url) {
            const fetched = await fetchBytesFromUrl(result.url, 'image/*');
            sourceBuffer = fetched.buffer;
        } else if (result.b64_json) {
            const { buffer } = bufferFromDataUrl(`data:image/png;base64,${result.b64_json}`);
            sourceBuffer = buffer;
        } else {
            throw new Error('Image result contained neither url nor b64_json');
        }
    } catch (err) {
        sourceError = err;
    }

    if (!sourceBuffer) {
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
        console.error('persistImageResult fetch failed', sourceError);
        return {
            mediaSessionId: failed.id,
            url: result.url || '',
            mimeType: 'image/png',
            byteSize: null,
            storageStatus: 'FAILED',
        };
    }

    // 2. Transcode to AVIF + thumbnail. Fall back to storing original bytes as
    //    PNG if sharp can't handle the input (rare — sharp reads everything
    //    modern providers emit).
    let encoded: Awaited<ReturnType<typeof encodeImageWithThumbnail>> | null = null;
    try {
        encoded = await encodeImageWithThumbnail(sourceBuffer);
    } catch (err) {
        console.error('persistImageResult encode failed, falling back to PNG', err);
    }

    // 3. Dedup check: if the same userId already stored an identical checksum
    //    and the row is UPLOADED, reuse it instead of writing again.
    const fullBuffer = encoded?.full.buffer ?? sourceBuffer;
    const fullMime = encoded?.full.contentType ?? 'image/png';
    const fullExt = encoded?.full.extension ?? 'png';
    const dedupChecksum = sha256Hex(fullBuffer);

    const existing = await prisma.mediaSession.findFirst({
        where: {
            userId,
            checksum: dedupChecksum,
            storageStatus: 'UPLOADED',
            objectKey: { not: null },
        },
        select: { id: true, objectKey: true, thumbnailKey: true, mimeType: true, byteSize: true },
    });

    if (existing?.objectKey) {
        const row = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'image',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'UPLOADED',
                objectKey: existing.objectKey,
                thumbnailKey: existing.thumbnailKey,
                mimeType: existing.mimeType,
                byteSize: existing.byteSize,
                checksum: dedupChecksum,
                sourceProviderUrl: result.url ?? null,
                resultUrl: null,
            },
        });
        const full = await getMediaReadUrl(existing.objectKey);
        const thumb = existing.thumbnailKey
            ? await getMediaReadUrl(existing.thumbnailKey).catch(() => null)
            : null;
        return {
            mediaSessionId: row.id,
            url: full.url,
            thumbnailUrl: thumb?.url ?? null,
            mimeType: existing.mimeType || fullMime,
            byteSize: existing.byteSize ?? null,
            storageStatus: 'UPLOADED',
            deduplicated: true,
        };
    }

    // 4. Upload full + thumbnail in parallel.
    const fullKey = buildObjectKey({ userId, mode: 'image', extension: fullExt });
    const thumbKey = encoded
        ? buildObjectKey({ userId, mode: 'image', extension: encoded.thumbnail.extension })
        : null;

    let upload: UploadResult | null = null;
    let uploadError: unknown = null;
    try {
        const [fullUpload] = await Promise.all([
            uploadBuffer(fullKey, fullBuffer, fullMime),
            thumbKey && encoded
                ? uploadBuffer(thumbKey, encoded.thumbnail.buffer, encoded.thumbnail.contentType)
                : Promise.resolve(null),
        ]);
        upload = fullUpload;
    } catch (err) {
        uploadError = err;
    }

    if (!upload) {
        // Best-effort cleanup of any partial uploads
        await Promise.all([safeDelete(fullKey), thumbKey ? safeDelete(thumbKey) : Promise.resolve()]);
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
            mimeType: fullMime,
            byteSize: null,
            storageStatus: 'FAILED',
        };
    }

    // 5. Insert DB row; roll back R2 objects on insert failure.
    try {
        const row = await prisma.mediaSession.create({
            data: {
                userId,
                mode: 'image',
                prompt: prompt.slice(0, 2000),
                storageProvider: 'R2',
                storageStatus: 'UPLOADED',
                objectKey: fullKey,
                thumbnailKey: thumbKey,
                mimeType: upload.mimeType,
                byteSize: upload.byteSize,
                checksum: upload.checksum,
                sourceProviderUrl: result.url ?? null,
                resultUrl: null,
            },
        });
        const full = await getMediaReadUrl(fullKey);
        const thumb = thumbKey ? await getMediaReadUrl(thumbKey).catch(() => null) : null;
        return {
            mediaSessionId: row.id,
            url: full.url,
            thumbnailUrl: thumb?.url ?? null,
            mimeType: upload.mimeType,
            byteSize: upload.byteSize,
            storageStatus: 'UPLOADED',
        };
    } catch (err) {
        await Promise.all([safeDelete(fullKey), thumbKey ? safeDelete(thumbKey) : Promise.resolve()]);
        throw err;
    }
}

function sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
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
        const { url } = await getMediaReadUrl(key);
        return {
            mediaSessionId: row.id,
            url,
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
        const { url } = await getMediaReadUrl(row.objectKey);
        return {
            mediaSessionId: row.id,
            signedUrl: url,
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
                ? (await getMediaReadUrl(fresh.objectKey)).url
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
        const { url } = await getMediaReadUrl(key);
        return {
            mediaSessionId: row.id,
            signedUrl: url,
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

