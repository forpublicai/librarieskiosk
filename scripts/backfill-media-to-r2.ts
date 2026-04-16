/**
 * Backfill Media Sessions to Cloudflare R2
 *
 * Walks the MediaSession table and uploads any row that still points to a
 * legacy provider URL (or a base64 data URL) to R2, then updates the row with
 * the resulting objectKey / mimeType / byteSize / checksum.
 *
 * Idempotent: rows with storageStatus='UPLOADED' and a non-null objectKey are
 * skipped. Rerunning the script is safe.
 *
 * Usage:
 *   npx tsx scripts/backfill-media-to-r2.ts --dry-run
 *   npx tsx scripts/backfill-media-to-r2.ts --limit 50
 *   npx tsx scripts/backfill-media-to-r2.ts
 *
 * Requires the R2_* env vars to be populated (same set used by the app).
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    S3Client,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';

// ---------- Args ----------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit'));
const limit = limitArg
    ? Number(limitArg.split('=')[1] ?? args[args.indexOf(limitArg) + 1])
    : undefined;

// ---------- Env ----------

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v) {
        console.error(`Missing required env var: ${key}`);
        process.exit(1);
    }
    return v;
}

const R2_BUCKET = requireEnv('R2_BUCKET');
const R2_ENDPOINT = requireEnv('R2_ENDPOINT');
const R2_ACCESS_KEY_ID = requireEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = requireEnv('R2_SECRET_ACCESS_KEY');
const MAX_UPLOAD_BYTES = Number(process.env.R2_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

// ---------- Clients ----------

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
});

const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

// ---------- Helpers ----------

function extensionFor(mode: string, mimeType: string | null): string {
    if (mimeType) {
        if (mimeType.includes('png')) return 'png';
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
        if (mimeType.includes('webp')) return 'webp';
        if (mimeType.includes('mp4')) return 'mp4';
        if (mimeType.includes('webm')) return 'webm';
        if (mimeType.includes('mpeg')) return 'mp3';
        if (mimeType.includes('wav')) return 'wav';
        if (mimeType.includes('m4a')) return 'm4a';
    }
    if (mode === 'image') return 'png';
    if (mode === 'music') return 'mp3';
    if (mode === 'video') return 'mp4';
    return 'bin';
}

function defaultMime(mode: string): string {
    if (mode === 'image') return 'image/png';
    if (mode === 'music') return 'audio/mpeg';
    if (mode === 'video') return 'video/mp4';
    return 'application/octet-stream';
}

function buildObjectKey(userId: string, mode: string, extension: string): string {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `media/${mode}/${safeUserId}/${yyyy}/${mm}/${randomUUID()}.${extension}`;
}

async function fetchBinary(url: string): Promise<{
    buffer: Buffer;
    mimeType: string;
}> {
    // Data URL fast path
    const dataMatch = url.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
    if (dataMatch) {
        const mimeType = dataMatch[1] || 'application/octet-stream';
        const isBase64 = dataMatch[2] === ';base64';
        const body = dataMatch[3];
        const buffer = isBase64
            ? Buffer.from(body, 'base64')
            : Buffer.from(decodeURIComponent(body), 'utf-8');
        return { buffer, mimeType };
    }

    // HTTPS only for remote URLs
    if (!url.startsWith('https://')) {
        throw new Error(`Unsupported URL scheme: ${url.slice(0, 32)}`);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
        throw new Error(`Content too large: ${contentLength} > ${MAX_UPLOAD_BYTES}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`Downloaded too large: ${arrayBuffer.byteLength}`);
    }

    return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: res.headers.get('content-type') || 'application/octet-stream',
    };
}

async function uploadBuffer(
    key: string,
    buffer: Buffer,
    mimeType: string
): Promise<{ byteSize: number; checksum: string }> {
    const checksum = createHash('sha256').update(buffer).digest('hex');
    await s3.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            ContentLength: buffer.byteLength,
            Metadata: { sha256: checksum },
        })
    );
    return { byteSize: buffer.byteLength, checksum };
}

// ---------- Main ----------

type BackfillRow = {
    id: string;
    userId: string;
    mode: string;
    resultUrl: string | null;
    storageStatus: string;
    objectKey: string | null;
};

async function backfillRow(row: BackfillRow): Promise<'ok' | 'skip' | 'error'> {
    if (row.storageStatus === 'UPLOADED' && row.objectKey) {
        return 'skip';
    }
    if (!row.resultUrl) {
        return 'skip';
    }

    try {
        const { buffer, mimeType: fetchedMime } = await fetchBinary(row.resultUrl);
        const mimeType = fetchedMime || defaultMime(row.mode);
        const extension = extensionFor(row.mode, mimeType);
        const key = buildObjectKey(row.userId, row.mode, extension);

        if (dryRun) {
            console.log(
                `  [dry-run] would upload ${row.id} (${row.mode}, ${buffer.byteLength}B) → ${key}`
            );
            return 'ok';
        }

        const { byteSize, checksum } = await uploadBuffer(key, buffer, mimeType);

        await prisma.mediaSession.update({
            where: { id: row.id },
            data: {
                storageStatus: 'UPLOADED',
                objectKey: key,
                mimeType,
                byteSize,
                checksum,
                sourceProviderUrl: row.resultUrl,
            },
        });

        console.log(`  ✅ ${row.id} → ${key} (${byteSize}B)`);
        return 'ok';
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ ${row.id}: ${msg}`);
        if (!dryRun) {
            await prisma.mediaSession
                .update({
                    where: { id: row.id },
                    data: {
                        storageStatus: 'FAILED',
                        sourceProviderUrl: row.resultUrl,
                    },
                })
                .catch(() => {
                    // best-effort: swallow so one bad row doesn't halt the run
                });
        }
        return 'error';
    }
}

async function main() {
    console.log('\n🪣  R2 Media Backfill');
    console.log(`  dry-run: ${dryRun}`);
    console.log(`  limit:   ${limit ?? 'none'}`);
    console.log(`  bucket:  ${R2_BUCKET}\n`);

    const rows = await prisma.mediaSession.findMany({
        where: {
            OR: [
                { storageStatus: { not: 'UPLOADED' } },
                { objectKey: null },
            ],
            resultUrl: { not: null },
        },
        select: {
            id: true,
            userId: true,
            mode: true,
            resultUrl: true,
            storageStatus: true,
            objectKey: true,
        },
        orderBy: { createdAt: 'asc' },
        ...(limit && Number.isFinite(limit) ? { take: limit } : {}),
    });

    console.log(`Found ${rows.length} candidate row(s).\n`);

    let ok = 0;
    let skip = 0;
    let err = 0;
    for (const row of rows) {
        const result = await backfillRow(row);
        if (result === 'ok') ok++;
        else if (result === 'skip') skip++;
        else err++;
    }

    console.log(`\nDone. uploaded=${ok} skipped=${skip} failed=${err}\n`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
