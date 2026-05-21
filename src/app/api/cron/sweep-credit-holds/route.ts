export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sweepStaleCreditHolds } from '@/lib/credits';

const ORPHAN_MINUTES = 30;

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret) {
        return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const refunded = await sweepStaleCreditHolds(ORPHAN_MINUTES);
        return NextResponse.json({
            ok: true,
            refunded,
            olderThanMinutes: ORPHAN_MINUTES,
            checkedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Cron credit-hold sweep error:', error);
        return NextResponse.json({ error: 'Failed to sweep credit holds' }, { status: 500 });
    }
}
