export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { renewalIso, resetLibraryPoolIfNeeded } from '@/lib/credits';

// GET /api/admin/credit-pool — get library pool info
export async function GET(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    const admin = await prisma.user.findUnique({
        where: { id: authResult.user.userId },
        select: { library: true },
    });

    if (!admin) {
        return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const library = await resetLibraryPoolIfNeeded(admin.library);

    if (!library) {
        // System admins or admins without a library record — return synthetic pool
        return NextResponse.json({
            library: { name: admin.library, weeklyPool: 1750, poolRemaining: 1750, poolRenewAt: null },
        });
    }

    return NextResponse.json({ library: { ...library, poolRenewAt: renewalIso(library.poolResetAt) } });
}

// POST /api/admin/credit-pool — send credits from pool to a user
export async function POST(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { userId, amount } = await request.json();

        if (!userId || !amount || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json(
                { error: 'userId and positive amount are required' },
                { status: 400 }
            );
        }

        const admin = await prisma.user.findUnique({
            where: { id: authResult.user.userId },
            select: { library: true },
        });

        if (!admin) {
            return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
        }

        // Verify target user belongs to admin's library
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { library: true, credits: true },
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (admin.library !== 'System' && targetUser.library !== admin.library) {
            return NextResponse.json({ error: 'Cannot send credits to users from another library' }, { status: 403 });
        }

        // Check pool (reset if a week has passed)
        const library = await resetLibraryPoolIfNeeded(admin.library);

        if (!library || library.poolRemaining < amount) {
            return NextResponse.json(
                { error: `Insufficient pool credits. Available: ${library?.poolRemaining || 0}` },
                { status: 400 }
            );
        }

        // Deduct from pool and add to user
        await prisma.library.update({
            where: { name: admin.library },
            data: { poolRemaining: { decrement: amount } },
        });

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: amount } },
            select: { id: true, username: true, credits: true },
        });

        return NextResponse.json({
            user: updatedUser,
            poolRemaining: library.poolRemaining - amount,
            poolRenewAt: renewalIso(library.poolResetAt),
        });
    } catch (error) {
        console.error('Send credits error:', error);
        return NextResponse.json({ error: 'Failed to send credits' }, { status: 500 });
    }
}
