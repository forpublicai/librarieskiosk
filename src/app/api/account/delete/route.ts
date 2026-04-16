export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, requireAuth, isAuthResult } from '@/lib/auth';
import { verifySecurityAnswer } from '@/lib/security';
import { deleteObject } from '@/lib/storage';

const CONFIRMATION_PHRASE = 'delete my account';

// DELETE /api/account/delete
// Permanently deletes the authenticated user's account and all associated data.
// Requires: current password, security answer, and the exact confirmation phrase.
export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    try {
        const { password, answer, confirmation } = await request.json();

        if (!password || !answer || !confirmation) {
            return NextResponse.json(
                { error: 'Password, security answer, and confirmation are required' },
                { status: 400 }
            );
        }

        if (typeof confirmation !== 'string' || confirmation.trim().toLowerCase() !== CONFIRMATION_PHRASE) {
            return NextResponse.json(
                { error: `Type "${CONFIRMATION_PHRASE}" exactly to confirm deletion` },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: authResult.user.userId },
            select: {
                id: true,
                passwordHash: true,
                securityAnswerHash: true,
                role: true,
                status: true,
            },
        });

        if (!user || user.role === 'GUEST') {
            return NextResponse.json({ error: 'Account not eligible for deletion' }, { status: 403 });
        }

        if (user.status === 'BANNED') {
            return NextResponse.json({ error: 'This account has been suspended.' }, { status: 403 });
        }

        if (!comparePassword(password, user.passwordHash)) {
            return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
        }

        if (!user.securityAnswerHash || !verifySecurityAnswer(String(answer), user.securityAnswerHash)) {
            return NextResponse.json({ error: 'Incorrect security answer' }, { status: 401 });
        }

        // Fetch all R2 object keys before deleting DB rows
        const mediaSessions = await prisma.mediaSession.findMany({
            where: { userId: user.id, objectKey: { not: null }, storageStatus: 'UPLOADED' },
            select: { objectKey: true },
        });

        // Delete all related DB rows in dependency order, then the user
        await prisma.$transaction([
            prisma.usageLog.deleteMany({ where: { userId: user.id } }),
            prisma.mediaSession.deleteMany({ where: { userId: user.id } }),
            prisma.conversation.deleteMany({ where: { userId: user.id } }),
            prisma.creditRequest.deleteMany({ where: { userId: user.id } }),
            prisma.user.delete({ where: { id: user.id } }),
        ]);

        // Delete R2 objects after DB rows are gone (best-effort; log failures)
        await Promise.allSettled(
            mediaSessions
                .map((s) => s.objectKey!)
                .filter(Boolean)
                .map((key) =>
                    deleteObject(key).catch((err) =>
                        console.error('Failed to delete R2 object during account deletion', key, err)
                    )
                )
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Account deletion error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
