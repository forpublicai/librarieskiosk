export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/admin/credit-requests — list pending requests for admin's library
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

    const isSystemAdmin = admin.library === 'System';

    const requests = await prisma.creditRequest.findMany({
        where: {
            status: 'PENDING',
            user: isSystemAdmin ? {} : { library: admin.library },
        },
        include: {
            user: {
                select: { id: true, username: true, credits: true, library: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
}

// PATCH /api/admin/credit-requests — approve or decline
export async function PATCH(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { requestId, action } = await request.json();

        if (!requestId || !action || !['APPROVED', 'DECLINED'].includes(action)) {
            return NextResponse.json(
                { error: 'requestId and action (APPROVED/DECLINED) are required' },
                { status: 400 }
            );
        }

        const creditReq = await prisma.creditRequest.findUnique({
            where: { id: requestId },
            include: { user: { select: { id: true, library: true } } },
        });

        if (!creditReq) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        // Verify admin owns this library
        const admin = await prisma.user.findUnique({
            where: { id: authResult.user.userId },
            select: { library: true },
        });

        if (!admin) {
            return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
        }

        if (admin.library !== 'System' && creditReq.user.library !== admin.library) {
            return NextResponse.json({ error: 'Cannot manage requests from another library' }, { status: 403 });
        }

        const updated = await prisma.creditRequest.update({
            where: { id: requestId },
            data: { status: action },
        });

        // If approved, transfer credits from pool
        if (action === 'APPROVED') {
            const library = await prisma.library.findUnique({
                where: { name: admin.library },
            });

            if (library && library.poolRemaining >= creditReq.amount) {
                await prisma.library.update({
                    where: { name: admin.library },
                    data: { poolRemaining: { decrement: creditReq.amount } },
                });
                await prisma.user.update({
                    where: { id: creditReq.userId },
                    data: { credits: { increment: creditReq.amount } },
                });
            }
        }

        return NextResponse.json({ request: updated });
    } catch (error) {
        console.error('Handle credit request error:', error);
        return NextResponse.json({ error: 'Failed to handle request' }, { status: 500 });
    }
}
