export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/admin/accounts — list users for admin's library with usage stats
export async function GET(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    // Get admin's library
    const admin = await prisma.user.findUnique({
        where: { id: authResult.user.userId },
        select: { library: true },
    });

    if (!admin) {
        return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const isSystemAdmin = admin.library === 'System';

    const users = await prisma.user.findMany({
        where: isSystemAdmin ? {} : { library: admin.library },
        select: {
            id: true,
            username: true,
            role: true,
            status: true,
            credits: true,
            library: true,
            createdAt: true,
            _count: { select: { usageLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Get per-user usage breakdown
    const userIds = users.map((u) => u.id);
    const usageLogs = await prisma.usageLog.groupBy({
        by: ['userId', 'mode'],
        where: { userId: { in: userIds } },
        _sum: { creditsUsed: true },
        _count: true,
    });

    // Build usage map
    const usageMap: Record<string, Record<string, { count: number; credits: number }>> = {};
    usageLogs.forEach((log) => {
        if (!usageMap[log.userId]) usageMap[log.userId] = {};
        usageMap[log.userId][log.mode] = {
            count: log._count,
            credits: log._sum.creditsUsed || 0,
        };
    });

    const enrichedUsers = users.map((u) => ({
        ...u,
        totalUsage: u._count.usageLogs,
        usageByMode: usageMap[u.id] || {},
    }));

    return NextResponse.json({ users: enrichedUsers, library: admin.library });
}

// PATCH /api/admin/accounts — update user status (approve/ban)
export async function PATCH(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { userId, status } = await request.json();

        if (!userId || !status || !['APPROVED', 'BANNED', 'PENDING'].includes(status)) {
            return NextResponse.json(
                { error: 'userId and status (APPROVED/BANNED/PENDING) are required' },
                { status: 400 }
            );
        }

        // Verify the user belongs to admin's library
        const admin = await prisma.user.findUnique({
            where: { id: authResult.user.userId },
            select: { library: true },
        });

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { library: true, role: true },
        });

        if (!admin || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (admin.library !== 'System' && targetUser.library !== admin.library) {
            return NextResponse.json({ error: 'Cannot manage users from another library' }, { status: 403 });
        }

        if (targetUser.role === 'ADMIN') {
            return NextResponse.json({ error: 'Cannot change admin status' }, { status: 403 });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { status },
            select: { id: true, username: true, status: true },
        });

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Update account status error:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
}
