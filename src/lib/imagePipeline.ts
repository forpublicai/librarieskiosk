import 'server-only';

import sharp from 'sharp';

/**
 * Image transformation pipeline: source buffer → AVIF full + AVIF thumbnail.
 *
 * Why AVIF: generated images are most often PNG coming back from providers.
 * PNG is lossless and huge (1–4 MB per 1024x1024). AVIF at quality 60 is
 * ~85% smaller with no visible difference for AI-generated imagery. Every
 * modern browser Public AI targets (Chromium 85+, Firefox 93+, Safari 16+)
 * supports AVIF natively, so no fallback is needed.
 *
 * Thumbnail is 480px on the long edge, quality 50 — used for history
 * sidebars and grid views to cut bytes-per-list by ~95%.
 */

const FULL_QUALITY = 60;
const THUMBNAIL_QUALITY = 50;
const THUMBNAIL_MAX_DIM = 480;
const THUMBNAIL_EFFORT = 4; // 0-9, higher = smaller but slower (4 is a good balance)

export interface EncodedImage {
    full: {
        buffer: Buffer;
        contentType: 'image/avif';
        extension: 'avif';
    };
    thumbnail: {
        buffer: Buffer;
        contentType: 'image/avif';
        extension: 'avif';
        width: number;
        height: number;
    };
    width: number;
    height: number;
}

/**
 * Converts an input image buffer (PNG/JPEG/WebP/etc.) into an AVIF full-size
 * and an AVIF thumbnail, both ready to upload to R2.
 *
 * If encoding fails for any reason the caller should fall back to storing the
 * original buffer as-is.
 */
export async function encodeImageWithThumbnail(
    input: Buffer
): Promise<EncodedImage> {
    // Decode once, reuse the pipeline for both outputs to avoid double-parse
    const pipeline = sharp(input, { failOn: 'none' });
    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const full = await pipeline
        .clone()
        .avif({ quality: FULL_QUALITY, effort: THUMBNAIL_EFFORT })
        .toBuffer();

    const thumbPipeline = pipeline.clone().resize({
        width: THUMBNAIL_MAX_DIM,
        height: THUMBNAIL_MAX_DIM,
        fit: 'inside',
        withoutEnlargement: true,
    });
    const thumbResult = await thumbPipeline
        .avif({ quality: THUMBNAIL_QUALITY, effort: THUMBNAIL_EFFORT })
        .toBuffer({ resolveWithObject: true });

    return {
        full: {
            buffer: full,
            contentType: 'image/avif',
            extension: 'avif',
        },
        thumbnail: {
            buffer: thumbResult.data,
            contentType: 'image/avif',
            extension: 'avif',
            width: thumbResult.info.width,
            height: thumbResult.info.height,
        },
        width,
        height,
    };
}
