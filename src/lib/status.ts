/**
 * Status-gating helper.
 * Checks that a user has APPROVED status before allowing access to services.
 */
import { NextResponse } from 'next/server';
import { prisma } from './db';

export async function requireApproved(userId: string): Promise<NextResponse | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.status === 'BANNED') {
        return NextResponse.json({ error: 'Account has been suspended' }, { status: 403 });
    }

    if (user.status === 'PENDING') {
        return NextResponse.json({ error: 'Account is pending approval' }, { status: 403 });
    }

    return null; // Approved — proceed
}
