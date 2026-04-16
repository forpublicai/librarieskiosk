export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { verifySecurityAnswer, DUMMY_BCRYPT_HASH } from '@/lib/security';

// Uniform failure response — same status and body regardless of which check
// failed, so the endpoint can't be used to enumerate accounts.
function failure() {
    return NextResponse.json(
        { error: 'Incorrect answer or account cannot be recovered.' },
        { status: 401 }
    );
}

// POST /api/auth/forgot-password/reset
// Verifies the security answer and resets the user's password.
export async function POST(request: NextRequest) {
    try {
        const { username, answer, newPassword } = await request.json();

        if (!username || !answer || !newPassword) {
            return NextResponse.json(
                { error: 'Username, answer, and new password are required' },
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
            where: { username: String(username).trim().toLowerCase() },
            select: { id: true, securityAnswerHash: true, role: true, status: true },
        });

        const eligible =
            !!user &&
            !!user.securityAnswerHash &&
            user.role !== 'GUEST' &&
            user.status !== 'BANNED';

        // Always run bcrypt — against a dummy hash when ineligible — so the
        // response time doesn't reveal whether the account exists.
        const hashToCheck = eligible ? user!.securityAnswerHash! : DUMMY_BCRYPT_HASH;
        const answerOk = verifySecurityAnswer(String(answer), hashToCheck);

        if (!eligible || !answerOk) {
            return failure();
        }

        await prisma.user.update({
            where: { id: user!.id },
            data: { passwordHash: hashPassword(newPassword) },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Forgot password reset error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
