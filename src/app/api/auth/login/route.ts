export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, signToken, SESSION_IDLE_MS } from '@/lib/auth';

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

        const jti = crypto.randomUUID();

        if (user.role === 'PATRON') {
            const library = await prisma.library.findUnique({
                where: { name: user.library },
                select: { maxConcurrentSessions: true },
            });
            const cap = library?.maxConcurrentSessions ?? 1;

            const cutoff = new Date(Date.now() - SESSION_IDLE_MS);
            await prisma.activeSession.deleteMany({
                where: { library: user.library, lastActivity: { lt: cutoff } },
            });

            const active = await prisma.activeSession.count({
                where: { library: user.library },
            });

            if (active >= cap) {
                return NextResponse.json(
                    {
                        error: 'Library at capacity, try again later or contact library admin.',
                        code: 'LIBRARY_AT_CAPACITY',
                    },
                    { status: 409 }
                );
            }

            await prisma.activeSession.create({
                data: { userId: user.id, library: user.library, jti },
            });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { loginCount: { increment: 1 } },
        });

        const token = await signToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            library: user.library,
            jti,
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
