export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/credit-requests — patron submits a credit request
export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { amount, reason } = await request.json();

        if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 100) {
            return NextResponse.json(
                { error: 'Amount must be between 1 and 100' },
                { status: 400 }
            );
        }

        // Check for existing pending request
        const existing = await prisma.creditRequest.findFirst({
            where: {
                userId: authResult.user.userId,
                status: 'PENDING',
            },
        });

        if (existing) {
            return NextResponse.json(
                { error: 'You already have a pending credit request' },
                { status: 409 }
            );
        }

        const req = await prisma.creditRequest.create({
            data: {
                userId: authResult.user.userId,
                amount,
                reason: reason?.slice(0, 500) || null,
            },
        });

        return NextResponse.json({ request: req }, { status: 201 });
    } catch (error) {
        console.error('Credit request error:', error);
        return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
    }
}

// GET /api/credit-requests — patron views their request history
export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const requests = await prisma.creditRequest.findMany({
        where: { userId: authResult.user.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    return NextResponse.json({ requests });
}
