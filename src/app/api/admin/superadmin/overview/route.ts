export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/admin/superadmin/overview — aggregated stats across all libraries
export async function GET(request: NextRequest) {
    const authResult = await requireSuperAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        // Get all libraries
        const libraries = await prisma.library.findMany({
            orderBy: { name: 'asc' },
        });

        // Get user counts per library
        const userCountsByLibrary = await prisma.user.groupBy({
            by: ['library'],
            _count: true,
            where: { role: { not: 'GUEST' } },
        });

        // Get usage stats per library
        const usageByLibrary = await prisma.$queryRaw<
            { library: string; totalUsage: bigint; totalCredits: bigint }[]
        >`
            SELECT u."library", COUNT(ul.id)::bigint as "totalUsage", COALESCE(SUM(ul."creditsUsed"), 0)::bigint as "totalCredits"
            FROM "User" u
            LEFT JOIN "UsageLog" ul ON ul."userId" = u.id
            WHERE u."role" != 'GUEST'
            GROUP BY u."library"
        `;

        // Get total stats
        const totalUsers = await prisma.user.count({ where: { role: { not: 'GUEST' } } });
        const totalGuests = await prisma.user.count({ where: { role: 'GUEST' } });
        const totalUsageLogs = await prisma.usageLog.count();
        const totalCreditsUsed = await prisma.usageLog.aggregate({
            _sum: { creditsUsed: true },
        });

        // Usage by mode (global)
        const usageByMode = await prisma.usageLog.groupBy({
            by: ['mode'],
            _count: true,
            _sum: { creditsUsed: true },
        });

        // Get all users with usage (non-guest)
        const allUsers = await prisma.user.findMany({
            where: { role: { not: 'GUEST' } },
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
        const userIds = allUsers.map((u) => u.id);
        const usageLogs = await prisma.usageLog.groupBy({
            by: ['userId', 'mode'],
            where: { userId: { in: userIds } },
            _sum: { creditsUsed: true },
            _count: true,
        });

        const usageMap: Record<string, Record<string, { count: number; credits: number }>> = {};
        usageLogs.forEach((log) => {
            if (!usageMap[log.userId]) usageMap[log.userId] = {};
            usageMap[log.userId][log.mode] = {
                count: log._count,
                credits: log._sum.creditsUsed || 0,
            };
        });

        const enrichedUsers = allUsers.map((u) => ({
            ...u,
            totalUsage: u._count.usageLogs,
            usageByMode: usageMap[u.id] || {},
        }));

        // Build library breakdown
        const userCountMap = Object.fromEntries(userCountsByLibrary.map((u) => [u.library, u._count]));
        const usageMap2 = Object.fromEntries(
            usageByLibrary.map((u) => [u.library, {
                totalUsage: Number(u.totalUsage),
                totalCredits: Number(u.totalCredits),
            }])
        );

        const libraryBreakdown = libraries.map((lib) => ({
            name: lib.name,
            weeklyPool: lib.weeklyPool,
            poolRemaining: lib.poolRemaining,
            userCount: userCountMap[lib.name] || 0,
            totalUsage: usageMap2[lib.name]?.totalUsage || 0,
            totalCredits: usageMap2[lib.name]?.totalCredits || 0,
        }));

        return NextResponse.json({
            overview: {
                totalUsers,
                totalGuests,
                totalLibraries: libraries.length,
                totalUsageLogs,
                totalCreditsUsed: totalCreditsUsed._sum.creditsUsed || 0,
            },
            libraryBreakdown,
            usageByMode: usageByMode.map((m) => ({
                mode: m.mode,
                count: m._count,
                credits: m._sum.creditsUsed || 0,
            })),
            users: enrichedUsers,
        });
    } catch (error) {
        console.error('Super admin overview error:', error);
        return NextResponse.json({ error: 'Failed to fetch overview' }, { status: 500 });
    }
}
