import { hashSync, compareSync } from 'bcryptjs';
import { createHmac } from 'crypto';

export const SECURITY_QUESTIONS = [
    'What was the name of your first pet?',
    "What is your mother's maiden name?",
    'What was the name of your first school?',
    'In what city were you born?',
    'What is the name of the street you grew up on?',
    'What was your childhood nickname?',
    "What is your father's middle name?",
    'What was the make of your first car?',
    'What is the name of your favorite teacher?',
    'What was the name of your first employer?',
] as const;

// Fixed bcrypt hash of a random secret; used to equalize timing when a user
// doesn't exist so callers can't distinguish missing-user from wrong-answer
// via bcrypt latency. Never matches any real answer.
export const DUMMY_BCRYPT_HASH =
    '$2a$10$CwTycUXWue0Thq9StjUM0uJ8oFGF0vM8tK1Q9uJZ7b3vC1mYy8Uaa';

// Deterministic "decoy" question for usernames that don't exist (or are
// otherwise ineligible for recovery). Using HMAC over the normalized username
// with the server's JWT_SECRET keeps the response stable for a given username
// (so repeated probes don't flip) but indistinguishable from a real user's
// question to anyone without the secret.
export function decoySecurityQuestion(username: string): string {
    const secret = process.env.JWT_SECRET || '';
    const hmac = createHmac('sha256', secret)
        .update(username.trim().toLowerCase())
        .digest();
    const idx = hmac.readUInt32BE(0) % SECURITY_QUESTIONS.length;
    return SECURITY_QUESTIONS[idx];
}

export type SecurityQuestion = (typeof SECURITY_QUESTIONS)[number];

export function isValidSecurityQuestion(q: unknown): q is SecurityQuestion {
    return typeof q === 'string' && (SECURITY_QUESTIONS as readonly string[]).includes(q);
}

// Normalize: lowercase, strip punctuation, collapse whitespace, trim.
// Makes answers resilient to formatting (e.g. "St. Mary's" vs "st marys").
export function normalizeSecurityAnswer(answer: string): string {
    return answer
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation/symbols
        .replace(/\s+/g, ' ')
        .trim();
}

export function hashSecurityAnswer(answer: string): string {
    return hashSync(normalizeSecurityAnswer(answer), 10);
}

export function verifySecurityAnswer(answer: string, hash: string): boolean {
    return compareSync(normalizeSecurityAnswer(answer), hash);
}
