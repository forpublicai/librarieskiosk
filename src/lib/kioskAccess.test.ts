import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
    KIOSK_ACCESS_MAX_AGE_SEC,
    createKioskAccessCookieValue,
    isValidKioskAccessCookie,
    timingSafeEqualString,
} from './kioskAccess';

vi.mock('server-only', () => ({}));

const TOKEN = 'test-kiosk-access-token';
const NOW = new Date('2026-10-07T12:00:00.000Z');

describe('isValidKioskAccessCookie', () => {
    it('rejects the legacy forgeable "true" value', async () => {
        expect(await isValidKioskAccessCookie('true', TOKEN, NOW)).toBe(false);
    });

    it('rejects a missing or empty cookie', async () => {
        expect(await isValidKioskAccessCookie(undefined, TOKEN, NOW)).toBe(false);
        expect(await isValidKioskAccessCookie('', TOKEN, NOW)).toBe(false);
    });

    it('accepts a value signed with the current token', async () => {
        const value = await createKioskAccessCookieValue(TOKEN, NOW);
        expect(await isValidKioskAccessCookie(value, TOKEN, NOW)).toBe(true);
    });

    it('rejects the old cookie after the token is rotated', async () => {
        const value = await createKioskAccessCookieValue(TOKEN, NOW);
        expect(await isValidKioskAccessCookie(value, 'rotated-token', NOW)).toBe(false);
    });

    it('rejects the cookie once the 8h window has passed', async () => {
        const value = await createKioskAccessCookieValue(TOKEN, NOW);
        const justBefore = new Date(NOW.getTime() + (KIOSK_ACCESS_MAX_AGE_SEC - 1) * 1000);
        const after = new Date(NOW.getTime() + (KIOSK_ACCESS_MAX_AGE_SEC + 1) * 1000);
        expect(await isValidKioskAccessCookie(value, TOKEN, justBefore)).toBe(true);
        expect(await isValidKioskAccessCookie(value, TOKEN, after)).toBe(false);
    });

    it('rejects a tampered signature', async () => {
        const value = await createKioskAccessCookieValue(TOKEN, NOW);
        const tampered = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
        expect(await isValidKioskAccessCookie(tampered, TOKEN, NOW)).toBe(false);
    });

    it('rejects a JWT signed with the raw token instead of the derived key', async () => {
        const value = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setAudience('kiosk_access')
            .setExpirationTime('8h')
            .sign(new TextEncoder().encode(TOKEN));
        expect(await isValidKioskAccessCookie(value, TOKEN, NOW)).toBe(false);
    });

    it('rejects an unsigned alg=none token', async () => {
        const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const exp = Math.floor(NOW.getTime() / 1000) + 3600;
        const value = `${encode({ alg: 'none' })}.${encode({ aud: 'kiosk_access', exp })}.`;
        expect(await isValidKioskAccessCookie(value, TOKEN, NOW)).toBe(false);
    });
});

describe('timingSafeEqualString', () => {
    it('matches only identical strings', () => {
        expect(timingSafeEqualString(TOKEN, TOKEN)).toBe(true);
        expect(timingSafeEqualString(TOKEN, `${TOKEN}x`)).toBe(false);
        expect(timingSafeEqualString(TOKEN, TOKEN.replace(/.$/, 'X'))).toBe(false);
        expect(timingSafeEqualString('', TOKEN)).toBe(false);
    });
});
