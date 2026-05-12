import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const authUser = {
    userId: 'user_1',
    username: 'patron',
    role: 'PATRON' as const,
    library: 'Pottsboro, TX',
    jti: 'session_1',
};

const requireActiveSession = vi.hoisted(() => vi.fn());
const requireApproved = vi.hoisted(() => vi.fn());
const reserveGuideExchange = vi.hoisted(() => vi.fn());
const chatComplete = vi.hoisted(() => vi.fn());
const logUsage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
    requireActiveSession,
    isAuthResult: (result: unknown) => Boolean(result && typeof result === 'object' && 'user' in result),
}));

vi.mock('@/lib/status', () => ({ requireApproved }));
vi.mock('@/lib/guideQuota', () => ({ reserveGuideExchange }));
vi.mock('@/lib/nanogpt', () => ({
    chatComplete,
    getGenericNanogptKey: () => 'nanogpt_key',
}));
vi.mock('@/lib/credits', () => ({ logUsage }));

import { MAX_LIVE_EXCHANGES_PER_SESSION } from '@/lib/guideConstants';
import { POST } from './route';

function guideRequest(body: unknown) {
    return new Request('https://example.test/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function rawGuideRequest(body: string) {
    return new Request('https://example.test/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

describe('POST /api/guide', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireActiveSession.mockResolvedValue({ user: authUser });
        requireApproved.mockResolvedValue(null);
        reserveGuideExchange.mockResolvedValue({ claimed: true, exchangesUsed: 1 });
        chatComplete.mockResolvedValue('A prompt is the instruction you give the tool.');
        logUsage.mockResolvedValue(undefined);
    });

    it('rejects unknown tools before reserving quota', async () => {
        const response = await POST(guideRequest({
            question: 'what is this',
            tool: 'weather',
            tier: 1,
        }) as never);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Unknown tool' });
        expect(reserveGuideExchange).not.toHaveBeenCalled();
        expect(chatComplete).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON bodies', async () => {
        const response = await POST(rawGuideRequest('{not json') as never);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
        expect(reserveGuideExchange).not.toHaveBeenCalled();
        expect(chatComplete).not.toHaveBeenCalled();
    });

    it('returns the librarian redirect without calling NanoGPT when quota is reached', async () => {
        reserveGuideExchange.mockResolvedValue({
            claimed: false,
            exchangesUsed: MAX_LIVE_EXCHANGES_PER_SESSION,
        });

        const response = await POST(guideRequest({
            question: 'what is a prompt',
            tool: 'image',
            tier: 1,
        }) as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.limitReached).toBe(true);
        expect(body.exchangesUsed).toBe(MAX_LIVE_EXCHANGES_PER_SESSION);
        expect(chatComplete).not.toHaveBeenCalled();
    });

    it('returns a live guide response and logs patron visibility usage on success', async () => {
        const response = await POST(guideRequest({
            question: 'what is a prompt',
            tool: 'image',
            tier: 1,
        }) as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            response: 'A prompt is the instruction you give the tool.',
            exchangesUsed: 1,
            exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
            limitReached: false,
        });
        expect(chatComplete).toHaveBeenCalledOnce();
        expect(logUsage).toHaveBeenCalledWith(
            'user_1',
            'guide',
            expect.any(String),
            'what is a prompt',
            0
        );
    });

    it('skips UsageLog visibility rows for guests', async () => {
        requireActiveSession.mockResolvedValue({
            user: { ...authUser, role: 'GUEST' },
        });

        const response = await POST(guideRequest({
            question: 'what is a prompt',
            tool: 'image',
            tier: 1,
        }) as never);

        expect(response.status).toBe(200);
        expect(chatComplete).toHaveBeenCalledOnce();
        expect(logUsage).not.toHaveBeenCalled();
    });

    it('rejects overlong questions before reserving quota', async () => {
        const question = Array.from({ length: 26 }, (_, i) => `word${i}`).join(' ');
        const response = await POST(guideRequest({
            question,
            tool: 'image',
            tier: 1,
        }) as never);

        expect(response.status).toBe(400);
        expect(reserveGuideExchange).not.toHaveBeenCalled();
        expect(chatComplete).not.toHaveBeenCalled();
    });

    it('rejects authenticated requests with no jti', async () => {
        requireActiveSession.mockResolvedValue({
            user: { ...authUser, jti: undefined },
        });

        const response = await POST(guideRequest({
            question: 'what is a prompt',
            tool: 'image',
            tier: 1,
        }) as never);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body).toEqual({ error: 'Session expired', code: 'SESSION_EXPIRED' });
        expect(reserveGuideExchange).not.toHaveBeenCalled();
    });
});
