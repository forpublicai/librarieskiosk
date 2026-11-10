import 'server-only';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Kiosk-device gate cookie helpers, used by `src/middleware.ts` (edge runtime,
 * so only Web Crypto via `jose` — no Node `crypto`).
 *
 * The `kiosk_access` cookie holds a short-lived HS256 JWT signed with a key
 * derived from `KIOSK_ACCESS_TOKEN`. A browser cannot mint one without the
 * token, the server enforces the 8h expiry (not just the browser), and rotating
 * the token invalidates every outstanding cookie.
 */

export const KIOSK_ACCESS_COOKIE = 'kiosk_access';
export const KIOSK_ACCESS_MAX_AGE_SEC = 60 * 60 * 8; // 8 hours

const AUDIENCE = 'kiosk_access';

// Prefix the raw token so the signing key can never equal JWT_SECRET, even if
// an operator reuses the same value for both. Patron JWTs are not audience-checked.
function signingKey(accessToken: string): Uint8Array {
    return new TextEncoder().encode(`kiosk_access:v1:${accessToken}`);
}

export async function createKioskAccessCookieValue(
    accessToken: string,
    now: Date = new Date()
): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience(AUDIENCE)
        .setIssuedAt(iat)
        .setExpirationTime(iat + KIOSK_ACCESS_MAX_AGE_SEC)
        .sign(signingKey(accessToken));
}

/** Signature check runs through `crypto.subtle.verify`, which is constant-time. */
export async function isValidKioskAccessCookie(
    value: string | undefined,
    accessToken: string,
    now: Date = new Date()
): Promise<boolean> {
    if (!value) return false;
    try {
        await jwtVerify(value, signingKey(accessToken), {
            algorithms: ['HS256'],
            audience: AUDIENCE,
            currentDate: now,
            requiredClaims: ['exp'],
        });
        return true;
    } catch {
        return false;
    }
}

/** Constant-time string comparison (length is not hidden). */
export function timingSafeEqualString(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);
    if (aBytes.length !== bBytes.length) return false;
    let diff = 0;
    for (let i = 0; i < aBytes.length; i++) {
        diff |= aBytes[i] ^ bBytes[i];
    }
    return diff === 0;
}
