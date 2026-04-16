export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { username: String(username).trim().toLowerCase() },
        });

        if (!user || !comparePassword(password, user.passwordHash)) {
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            );
        }

        if (user.status === 'BANNED') {
            return NextResponse.json(
                { error: 'This account has been suspended.' },
                { status: 403 }
            );
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { loginCount: { increment: 1 } },
        });

        const token = await signToken({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        // Library admins see the library pool as their credit count.
        let displayCredits = user.credits;
        if (user.role === 'ADMIN') {
            const library = await prisma.library.findUnique({
                where: { name: user.library },
                select: { poolRemaining: true },
            });
            if (library) displayCredits = library.poolRemaining;
        }

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                status: user.status,
                credits: displayCredits,
                library: user.library,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
