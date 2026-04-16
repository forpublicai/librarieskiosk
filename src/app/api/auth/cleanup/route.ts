/**
 * POST /api/auth/cleanup
 *
 * Cleans up ephemeral guest session data (media created during this session).
 * Called by AuthProvider.logout() for guest users.
 *
 * Accepts a token and deletes all MediaSession rows for the guest user
 * created *after* the token was issued (i.e., during this session only).
 * Ignores concurrent guest sessions on other displays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { token } = await request.json();

        if (!token || typeof token !== 'string') {
            return NextResponse.json(
                { error: 'Token is required' },
                { status: 400 }
            );
        }

        // Decode token to extract user ID and issued-at time
        let tokenPayload: Record<string, unknown>;
        try {
            const payload = await verifyToken(token);
            tokenPayload = payload as unknown as Record<string, unknown>;
        } catch {
            // Invalid/expired token — still allow cleanup (session is dead anyway)
            return NextResponse.json({ cleaned: 0, message: 'Token invalid; session already ended' });
        }

        const userId = tokenPayload.userId;
        const tokenIssuedAt = tokenPayload.iat ? new Date((tokenPayload.iat as number) * 1000) : new Date(0);

        // Only clean up if this is a guest user
        const user = await prisma.user.findUnique({ where: { id: userId as string } });
        if (!user || user.role !== 'GUEST') {
            return NextResponse.json(
                { error: 'Cleanup only allowed for guest sessions' },
                { status: 403 }
            );
        }

        // Delete all MediaSession rows for this guest user created during this session
        // (i.e., after the token was issued).
        const result = await prisma.mediaSession.deleteMany({
            where: {
                userId: userId as string,
                createdAt: {
                    gte: tokenIssuedAt,
                },
            },
        });

        console.log(`Guest session cleanup: deleted ${result.count} MediaSession rows for user ${userId}`);

        return NextResponse.json({ cleaned: result.count });
    } catch (error) {
        console.error('Cleanup error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Cleanup failed' },
            { status: 500 }
        );
    }
}
