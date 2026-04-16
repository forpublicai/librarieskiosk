import 'server-only';

/**
 * Centralized environment variable access for Cloudflare R2 persistence.
 *
 * Reads are lazy: the first call validates and caches the config. If any
 * required variable is missing when `getR2Env()` is first called, this throws
 * a clear R2ConfigError naming the missing key.
 *
 * The feature flag `USE_R2_PERSISTENCE` is checked separately via
 * `isR2Enabled()` so routes can gate R2 code paths without forcing config
 * validation when the flag is off.
 */

export class R2ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'R2ConfigError';
    }
}

export interface R2Env {
    accountId: string;
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    signedUrlTtlSeconds: number;
    maxUploadBytes: number;
    publicBaseUrl?: string;
}

let cached: R2Env | null = null;

function readRequired(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new R2ConfigError(
            `R2 environment variable ${name} is not set. Add it to .env and restart the server.`
        );
    }
    return value;
}

function readNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        throw new R2ConfigError(`R2 env var ${name} must be a positive number; got "${raw}"`);
    }
    return n;
}

/**
 * Returns true if the `USE_R2_PERSISTENCE` flag is enabled.
 * Does NOT validate the rest of the R2 config — call `getR2Env()` for that.
 */
export function isR2Enabled(): boolean {
    const v = (process.env.USE_R2_PERSISTENCE || '').toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Validates and returns the R2 configuration. Throws R2ConfigError on first
 * call if any required variable is missing.
 */
export function getR2Env(): R2Env {
    if (cached) return cached;
    cached = {
        accountId: readRequired('R2_ACCOUNT_ID'),
        endpoint: readRequired('R2_ENDPOINT'),
        bucket: readRequired('R2_BUCKET'),
        accessKeyId: readRequired('R2_ACCESS_KEY_ID'),
        secretAccessKey: readRequired('R2_SECRET_ACCESS_KEY'),
        signedUrlTtlSeconds: readNumber('R2_SIGNED_URL_TTL_SECONDS', 3600),
        maxUploadBytes: readNumber('R2_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
        publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || undefined,
    };
    return cached;
}

/**
 * Reset the cache. For tests only.
 */
export function resetR2EnvCache(): void {
    cached = null;
}
