export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthResult } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            role: true,
            credits: true,
            createdAt: true,
            _count: { select: { usageLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { username, password, credits = 100 } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            );
        }

        const { hashPassword } = await import('@/lib/auth');

        const user = await prisma.user.create({
            data: {
                username,
                passwordHash: hashPassword(password),
                credits,
                role: 'PATRON',
            },
            select: {
                id: true,
                username: true,
                role: true,
                credits: true,
            },
        });

        return NextResponse.json({ user }, { status: 201 });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
            return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
        }
        console.error('Create user error:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}
