export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult, SESSION_IDLE_MS } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const result = await requireAuth(request);
    if (!isAuthResult(result)) return result;
    const { user } = result;

    if (user.role !== 'PATRON' || !user.jti) {
        return new NextResponse(null, { status: 204 });
    }

    const session = await prisma.activeSession.findUnique({ where: { jti: user.jti } });
    const now = new Date();

    if (!session || now.getTime() - session.lastActivity.getTime() > SESSION_IDLE_MS) {
        if (session) {
            await prisma.activeSession.delete({ where: { jti: user.jti } }).catch(() => {});
        }
        return NextResponse.json(
            { error: 'Session expired', code: 'SESSION_EXPIRED' },
            { status: 401 }
        );
    }

    await prisma.activeSession.update({
        where: { jti: user.jti },
        data: { lastActivity: now },
    });

    return new NextResponse(null, { status: 204 });
}
