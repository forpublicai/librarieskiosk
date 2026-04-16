export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decoySecurityQuestion } from '@/lib/security';

// POST /api/auth/forgot-password/lookup
// Returns a security question for a username. To prevent account enumeration,
// the response shape is identical whether or not the user exists: unknown /
// ineligible usernames receive a deterministic decoy question derived from
// JWT_SECRET. Actual verification happens in /reset against the stored hash.
export async function POST(request: NextRequest) {
    try {
        const { username } = await request.json();

        if (!username || typeof username !== 'string') {
            return NextResponse.json({ error: 'Username is required' }, { status: 400 });
        }

        const normalized = username.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { username: normalized },
            select: { securityQuestion: true, role: true, status: true },
        });

        const eligible =
            !!user &&
            !!user.securityQuestion &&
            user.role !== 'GUEST' &&
            user.status !== 'BANNED';

        const question = eligible ? user!.securityQuestion! : decoySecurityQuestion(normalized);

        return NextResponse.json({ question });
    } catch (error) {
        console.error('Forgot password lookup error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
