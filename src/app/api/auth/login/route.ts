export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, signToken, SESSION_IDLE_MS } from '@/lib/auth';
import { renewalIso, resetCreditsIfNeeded, resetLibraryPoolIfNeeded } from '@/lib/credits';

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

        await resetCreditsIfNeeded(user.id);

        const loggedInUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                loginCount: { increment: 1 },
                lastLoginAt: new Date(),
            },
            select: {
                id: true,
                username: true,
                role: true,
                status: true,
                credits: true,
                creditsResetAt: true,
                library: true,
            },
        });

        const token = await signToken({
            userId: loggedInUser.id,
            username: loggedInUser.username,
            role: loggedInUser.role,
            library: loggedInUser.library,
            jti,
        });

        // Library admins see the library pool as their credit count.
        let displayCredits = loggedInUser.credits;
        let creditsRenewAt = renewalIso(loggedInUser.creditsResetAt);
        if (loggedInUser.role === 'ADMIN') {
            const library = await resetLibraryPoolIfNeeded(loggedInUser.library);
            if (library) {
                displayCredits = library.poolRemaining;
                creditsRenewAt = renewalIso(library.poolResetAt);
            }
        }

        return NextResponse.json({
            token,
            user: {
                id: loggedInUser.id,
                username: loggedInUser.username,
                role: loggedInUser.role,
                status: loggedInUser.status,
                credits: displayCredits,
                library: loggedInUser.library,
                creditsRenewAt,
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
