export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resetAllDueUserCreditsIfNeeded, resetLibrariesPoolsIfNeeded } from '@/lib/credits';

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
        const [usersRenewed, libraryPoolsRenewed] = await Promise.all([
            resetAllDueUserCreditsIfNeeded(),
            resetLibrariesPoolsIfNeeded(),
        ]);

        return NextResponse.json({
            ok: true,
            usersRenewed,
            libraryPoolsRenewed,
            checkedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Cron credit renewal error:', error);
        return NextResponse.json({ error: 'Failed to renew credits' }, { status: 500 });
    }
}
