import 'server-only';

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import { getR2Env, R2ConfigError } from './env';

/**
 * Cloudflare R2 storage abstraction.
 *
 * Responsibilities:
 *   - Lazy S3 client creation against the R2 endpoint
 *   - Deterministic object key building
 *   - Buffer / remote URL / data URL uploads
 *   - SSRF-safe remote fetches for provider URL uploads
 *   - Short-lived presigned GET URL generation
 *   - Object deletion for orphan cleanup
 *
 * Server-only: never imported from client components.
 */

// ---------- Types ----------

export type MediaMode = 'image' | 'music' | 'video';

export interface UploadResult {
    key: string;
    byteSize: number;
    checksum: string;
    mimeType: string;
}

export interface BuildKeyInput {
    userId: string;
    mode: MediaMode;
    extension: string;
}

// ---------- Client ----------

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
    if (cachedClient) return cachedClient;
    const env = getR2Env();
    cachedClient = new S3Client({
        region: 'auto',
        endpoint: env.endpoint,
        credentials: {
            accessKeyId: env.accessKeyId,
            secretAccessKey: env.secretAccessKey,
        },
        // R2 does not support S3's bucket-in-host addressing by default
        forcePathStyle: true,
    });
    return cachedClient;
}

// For tests
export function resetR2ClientCache(): void {
    cachedClient = null;
}

// ---------- Key builder ----------

/**
 * Deterministic object key format:
 *   media/{mode}/{userId}/{yyyy}/{mm}/{uuid}.{ext}
 *
 * The random UUID segment prevents collisions when a user generates multiple
 * assets in the same month. yyyy/mm partitioning keeps R2 listings browsable.
 */
export function buildObjectKey({ userId, mode, extension }: BuildKeyInput): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const uuid = randomUUID();
    const ext = extension.replace(/^\./, '').toLowerCase();
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `media/${mode}/${safeUserId}/${yyyy}/${mm}/${uuid}.${ext}`;
}

// ---------- Content-type / extension helpers ----------

const EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
};

const DEFAULT_EXT_BY_MODE: Record<MediaMode, string> = {
    image: 'png',
    music: 'mp3',
    video: 'mp4',
};

export function extensionForMime(mime: string, mode: MediaMode): string {
    const normalized = mime.toLowerCase().split(';')[0].trim();
    return EXT_BY_MIME[normalized] || DEFAULT_EXT_BY_MODE[mode];
}

export function defaultMimeForMode(mode: MediaMode): string {
    return mode === 'image' ? 'image/png' : mode === 'music' ? 'audio/mpeg' : 'video/mp4';
}

function mimeMatchesGlob(mime: string, glob: string): boolean {
    // glob is "image/*" or "audio/*" or explicit mime
    const normalized = mime.toLowerCase().split(';')[0].trim();
    if (glob.endsWith('/*')) {
        return normalized.startsWith(glob.slice(0, -1));
    }
    return normalized === glob.toLowerCase();
}

// ---------- Upload helpers ----------

function sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

export async function uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string
): Promise<UploadResult> {
    const env = getR2Env();
    const client = getR2Client();
    const checksum = sha256Hex(buffer);

    if (buffer.byteLength > env.maxUploadBytes) {
        throw new Error(
            `Upload rejected: ${buffer.byteLength} bytes exceeds R2_MAX_UPLOAD_BYTES=${env.maxUploadBytes}`
        );
    }

    await client.send(
        new PutObjectCommand({
            Bucket: env.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ContentLength: buffer.byteLength,
            Metadata: {
                checksum,
            },
        })
    );

    return {
        key,
        byteSize: buffer.byteLength,
        checksum,
        mimeType: contentType,
    };
}

/**
 * Download a buffer from a URL with SSRF protection, then upload to R2.
 *
 * Safety measures:
 *  - HTTPS only
 *  - DNS resolution + private IP rejection
 *  - One redirect hop allowed (re-validated)
 *  - Content-Length capped via R2_MAX_UPLOAD_BYTES
 *  - Content-Type allow list via `expectedMimeGlob`
 *  - No forwarded cookies/auth headers
 */
export async function uploadFromUrl(
    sourceUrl: string,
    key: string,
    expectedMimeGlob?: string
): Promise<UploadResult> {
    const { buffer, contentType } = await safeFetchBuffer(sourceUrl, expectedMimeGlob);
    return uploadBuffer(key, buffer, contentType);
}

export async function uploadFromDataUrl(
    dataUrl: string,
    key: string
): Promise<UploadResult> {
    const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!match) {
        throw new Error('Invalid data URL');
    }
    const [, mime, base64Flag, payload] = match;
    const contentType = mime || 'application/octet-stream';
    const buffer = base64Flag
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
    return uploadBuffer(key, buffer, contentType);
}

// ---------- Signed URL / delete ----------

export async function generateSignedGetUrl(
    key: string,
    ttlSeconds?: number
): Promise<string> {
    const env = getR2Env();
    const client = getR2Client();
    const ttl = ttlSeconds ?? env.signedUrlTtlSeconds;
    return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: env.bucket, Key: key }),
        { expiresIn: ttl }
    );
}

export async function deleteObject(key: string): Promise<void> {
    const env = getR2Env();
    const client = getR2Client();
    await client.send(
        new DeleteObjectCommand({ Bucket: env.bucket, Key: key })
    );
}

// ---------- SSRF-safe fetch ----------

const MAX_REDIRECT_HOPS = 1;

function isPrivateIpv4(ip: string): boolean {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
}

function isPrivateIpv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) {
        // IPv4-mapped — re-check the v4 address
        const v4 = lower.slice('::ffff:'.length);
        return isPrivateIpv4(v4);
    }
    return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
    // If the hostname is already a literal IP, validate directly
    const literal = isIP(hostname);
    if (literal === 4) {
        if (isPrivateIpv4(hostname)) {
            throw new Error(`Refused fetch: ${hostname} is a private IPv4 address`);
        }
        return;
    }
    if (literal === 6) {
        if (isPrivateIpv6(hostname)) {
            throw new Error(`Refused fetch: ${hostname} is a private IPv6 address`);
        }
        return;
    }

    // Otherwise resolve DNS and check every answer
    const addrs = await dnsLookup(hostname, { all: true });
    if (!addrs.length) {
        throw new Error(`Refused fetch: ${hostname} did not resolve to any address`);
    }
    for (const { address, family } of addrs) {
        if (family === 4 && isPrivateIpv4(address)) {
            throw new Error(
                `Refused fetch: ${hostname} resolves to private IPv4 ${address}`
            );
        }
        if (family === 6 && isPrivateIpv6(address)) {
            throw new Error(
                `Refused fetch: ${hostname} resolves to private IPv6 ${address}`
            );
        }
    }
}

async function safeFetchBuffer(
    rawUrl: string,
    expectedMimeGlob?: string,
    redirectHops = 0
): Promise<{ buffer: Buffer; contentType: string }> {
    const env = getR2Env();

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL: ${rawUrl}`);
    }

    if (parsed.protocol !== 'https:') {
        throw new Error(`Refused fetch: only https: is allowed, got ${parsed.protocol}`);
    }

    await assertPublicHost(parsed.hostname);

    const response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'manual',
        // Do NOT forward auth or cookies
        headers: {
            Accept: expectedMimeGlob || '*/*',
            'User-Agent': 'publicai-library-kiosk/1.0',
        },
    });

    // Handle manual redirects
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
            throw new Error(`Redirect response ${response.status} without Location header`);
        }
        if (redirectHops >= MAX_REDIRECT_HOPS) {
            throw new Error(`Refused fetch: exceeded ${MAX_REDIRECT_HOPS} redirect hops`);
        }
        const nextUrl = new URL(location, parsed).toString();
        return safeFetchBuffer(nextUrl, expectedMimeGlob, redirectHops + 1);
    }

    if (!response.ok) {
        throw new Error(`Upstream fetch failed: ${response.status} ${response.statusText}`);
    }

    // Enforce Content-Length cap BEFORE reading the body
    const declared = response.headers.get('content-length');
    if (declared) {
        const declaredBytes = parseInt(declared, 10);
        if (Number.isFinite(declaredBytes) && declaredBytes > env.maxUploadBytes) {
            throw new Error(
                `Refused fetch: declared size ${declaredBytes} exceeds cap ${env.maxUploadBytes}`
            );
        }
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (expectedMimeGlob && !mimeMatchesGlob(contentType, expectedMimeGlob)) {
        throw new Error(
            `Refused fetch: content-type ${contentType} does not match ${expectedMimeGlob}`
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > env.maxUploadBytes) {
        throw new Error(
            `Refused fetch: body size ${arrayBuffer.byteLength} exceeds cap ${env.maxUploadBytes}`
        );
    }

    return {
        buffer: Buffer.from(arrayBuffer),
        contentType: contentType.split(';')[0].trim(),
    };
}

// Re-export for convenience
export { R2ConfigError };
