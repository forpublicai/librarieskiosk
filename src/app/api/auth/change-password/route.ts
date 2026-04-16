export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, hashPassword, requireAuth, isAuthResult } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { currentPassword, newPassword } = await request.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: authResult.user.userId },
            select: { id: true, passwordHash: true, role: true, status: true },
        });

        if (!user || user.role === 'GUEST') {
            return NextResponse.json({ error: 'Guests cannot change passwords' }, { status: 403 });
        }

        if (user.status === 'BANNED') {
            return NextResponse.json({ error: 'This account has been suspended.' }, { status: 403 });
        }

        if (!comparePassword(currentPassword, user.passwordHash)) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashPassword(newPassword) },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
