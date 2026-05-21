/**
 * End-to-end verification for the credit hold-and-settle implementation.
 *
 * Run with: `npm run verify:credits`
 *
 * Creates a sentinel user (`verify_credithold_<ts>`) and a handful of
 * MediaSession rows against the configured Postgres, walks through:
 *   1. burn   — hold cleared, balance unchanged
 *   2. refund — hold cleared, balance += held amount
 *   3. idempotency — second settle is a no-op
 *   4. sweeper — backdated row gets refunded by sweepStaleCreditHolds
 *   5. refundCredits standalone
 *
 * Cleans up every row it created in a finally-block, even on assertion
 * failure. Safe to re-run.
 */

import { prisma } from '../src/lib/db';
import {
    settleCreditHold,
    refundCredits,
    sweepStaleCreditHolds,
} from '../src/lib/credits';

const STARTING_CREDITS = 100;
const HOLD = 25;

let userId: string | null = null;
const createdMediaSessionIds: string[] = [];

function ok(label: string) {
    console.log(`  ✓ ${label}`);
}

function fail(label: string, expected: unknown, actual: unknown): never {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    throw new Error(`assertion failed: ${label}`);
}

function assertEq<T>(label: string, expected: T, actual: T) {
    if (expected !== actual) fail(label, expected, actual);
    else ok(label);
}

async function getBalance(): Promise<number> {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId! }, select: { credits: true } });
    return u.credits;
}

async function getHeld(id: string): Promise<number | null> {
    const r = await prisma.mediaSession.findUniqueOrThrow({ where: { id }, select: { heldCredits: true } });
    return r.heldCredits;
}

async function createHeldSession(amount: number, createdAt?: Date): Promise<string> {
    const row = await prisma.mediaSession.create({
        data: {
            userId: userId!,
            mode: 'video',
            prompt: 'verify-credithold',
            providerRunId: `verify_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            storageProvider: 'R2',
            storageStatus: 'PENDING',
            heldCredits: amount,
            ...(createdAt ? { createdAt } : {}),
        },
        select: { id: true },
    });
    createdMediaSessionIds.push(row.id);
    return row.id;
}

async function resetBalance() {
    await prisma.user.update({
        where: { id: userId! },
        data: {
            credits: STARTING_CREDITS,
            // Pin creditsResetAt comfortably in the future so refunds don't
            // accidentally cross the weekly reset boundary mid-test.
            creditsResetAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
    });
}

async function setup() {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = `verify_credithold_${suffix}`;
    const user = await prisma.user.create({
        data: {
            username,
            passwordHash: 'verify-only-not-a-real-hash',
            library: 'Verify',
            role: 'PATRON',
            status: 'APPROVED',
            credits: STARTING_CREDITS,
            creditsResetAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
    });
    userId = user.id;
    console.log(`Created sentinel user ${username} (${userId}) credits=${STARTING_CREDITS}`);
}

async function teardown() {
    if (createdMediaSessionIds.length > 0) {
        await prisma.mediaSession.deleteMany({ where: { id: { in: createdMediaSessionIds } } });
        console.log(`Deleted ${createdMediaSessionIds.length} MediaSession row(s)`);
    }
    if (userId) {
        await prisma.user.delete({ where: { id: userId } });
        console.log(`Deleted sentinel user ${userId}`);
    }
}

async function scenarioBurn() {
    console.log('\nScenario 1: burn');
    await resetBalance();
    const balBefore = await getBalance();
    const id = await createHeldSession(HOLD);

    const claimed = await settleCreditHold(id, 'burn');
    assertEq('settleCreditHold returns true on claim', true, claimed);
    assertEq('heldCredits cleared', null, await getHeld(id));
    assertEq('balance unchanged', balBefore, await getBalance());
}

async function scenarioRefund() {
    console.log('\nScenario 2: refund');
    await resetBalance();
    const balBefore = await getBalance();
    const id = await createHeldSession(HOLD);

    const claimed = await settleCreditHold(id, 'refund');
    assertEq('settleCreditHold returns true on claim', true, claimed);
    assertEq('heldCredits cleared', null, await getHeld(id));
    assertEq('balance += HOLD', balBefore + HOLD, await getBalance());
}

async function scenarioIdempotent() {
    console.log('\nScenario 3: double-settle idempotency');
    await resetBalance();
    const balBefore = await getBalance();
    const id = await createHeldSession(HOLD);

    const first = await settleCreditHold(id, 'refund');
    const second = await settleCreditHold(id, 'refund');
    assertEq('first settle claims', true, first);
    assertEq('second settle is a no-op', false, second);
    assertEq('balance incremented exactly once', balBefore + HOLD, await getBalance());
}

async function scenarioSweeper() {
    console.log('\nScenario 4: sweeper picks up stale holds, ignores fresh ones');
    await resetBalance();
    const balBefore = await getBalance();

    const oldId = await createHeldSession(10, new Date(Date.now() - 2 * 60 * 60 * 1000));
    const freshId = await createHeldSession(7);

    const refunded = await sweepStaleCreditHolds(30);
    // sweepStaleCreditHolds counts ALL stale rows in the DB matching the cutoff,
    // not just ours. Assert ours specifically.
    assertEq('stale row heldCredits cleared', null, await getHeld(oldId));
    assertEq('fresh row heldCredits untouched', 7, await getHeld(freshId));
    // Balance must reflect our row only — other stale rows in the DB would
    // refund to their own users.
    assertEq('balance += stale hold amount (10)', balBefore + 10, await getBalance());
    console.log(`  ↪ sweepStaleCreditHolds(30) reported ${refunded} row(s) total`);
}

async function scenarioRefundCredits() {
    console.log('\nScenario 5: refundCredits standalone');
    await resetBalance();
    const balBefore = await getBalance();

    await refundCredits(userId!, 13);
    assertEq('refundCredits adds amount', balBefore + 13, await getBalance());

    await refundCredits(userId!, 0);
    assertEq('refundCredits ignores zero', balBefore + 13, await getBalance());
}

async function main() {
    await setup();
    try {
        await scenarioBurn();
        await scenarioRefund();
        await scenarioIdempotent();
        await scenarioSweeper();
        await scenarioRefundCredits();
        console.log('\nAll scenarios passed ✓');
    } finally {
        console.log('\nCleaning up...');
        await teardown();
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
});
