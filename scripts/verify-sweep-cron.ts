/**
 * Seeds one stale held MediaSession, hits /api/cron/sweep-credit-holds with
 * the dev CRON_SECRET, asserts the user's balance was refunded, then cleans up.
 *
 * Run with: `npm run verify:cron-sweep` (requires `npm run dev` in another terminal
 * and a CRON_SECRET in .env or .env.local).
 *
 * BASE_URL env var overrides the default http://localhost:3000.
 */

import { prisma } from '../src/lib/db';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const STARTING = 100;
const HOLD = 17;

let userId: string | null = null;
let mediaSessionId: string | null = null;

async function setup() {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const user = await prisma.user.create({
        data: {
            username: `verify_sweep_${suffix}`,
            passwordHash: 'verify-only',
            library: 'Verify',
            role: 'PATRON',
            status: 'APPROVED',
            credits: STARTING,
            creditsResetAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
    });
    userId = user.id;

    const ms = await prisma.mediaSession.create({
        data: {
            userId,
            mode: 'video',
            prompt: 'verify-sweep',
            providerRunId: `verify_sweep_run_${suffix}`,
            storageProvider: 'R2',
            storageStatus: 'PENDING',
            heldCredits: HOLD,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        select: { id: true },
    });
    mediaSessionId = ms.id;
    console.log(`seeded user ${userId} credits=${STARTING}, held row ${mediaSessionId} heldCredits=${HOLD} createdAt=-2h`);
}

async function hitCron() {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error('CRON_SECRET not loaded');
    const res = await fetch(`${BASE}/api/cron/sweep-credit-holds`, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json();
    console.log(`cron HTTP ${res.status}:`, JSON.stringify(body));
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
}

async function verify() {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId! }, select: { credits: true } });
    const ms = await prisma.mediaSession.findUniqueOrThrow({ where: { id: mediaSessionId! }, select: { heldCredits: true } });

    const balanceOk = u.credits === STARTING + HOLD;
    const heldOk = ms.heldCredits === null;
    console.log(`balance: ${u.credits} ${balanceOk ? '✓' : '✗'} (expected ${STARTING + HOLD})`);
    console.log(`heldCredits: ${ms.heldCredits} ${heldOk ? '✓' : '✗'} (expected null)`);
    if (!balanceOk || !heldOk) throw new Error('sweep did not settle as expected');
}

async function teardown() {
    if (mediaSessionId) await prisma.mediaSession.delete({ where: { id: mediaSessionId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
}

async function main() {
    await setup();
    try {
        await hitCron();
        await verify();
        console.log('\nSweep cron end-to-end ✓');
    } finally {
        await teardown();
    }
}

main().catch((err) => {
    console.error('verify-sweep-cron failed:', err);
    process.exit(1);
});
