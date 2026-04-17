export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';

/**
 * POST /api/auth/guest
 *
 * Returns a token for the shared guest account.
 * Guest sessions:
 * - Share a single database account (for credit tracking & weekly resets)
 * - Do not persist conversations, usage logs, or content
 * - Have a max 8-hour session before auto-logout
 * - Can be used concurrently by multiple kiosk users
 */
export async function POST() {
    try {
        // Fetch the shared guest account
        const guest = await prisma.user.findUnique({
            where: { username: 'guest' },
        });

        if (!guest) {
            return NextResponse.json(
                { error: 'Guest account not configured. Please run database seed.' },
                { status: 500 }
            );
        }

        // Issue token for the guest account
        const token = await signToken({
            userId: guest.id,
            username: guest.username,
            role: guest.role,
            library: guest.library,
        });

        return NextResponse.json({
            token,
            user: {
                id: guest.id,
                username: guest.username,
                role: guest.role,
                status: guest.status,
                credits: guest.credits,
                library: guest.library,
            },
        });
    } catch (error) {
        console.error('Guest login error:', error);
        return NextResponse.json(
            { error: 'Failed to access guest account' },
            { status: 500 }
        );
    }
}
