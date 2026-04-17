export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            return NextResponse.json({ ok: true });
        }

        let jti: string | undefined;
        try {
            const payload = await verifyToken(token);
            jti = payload.jti;
        } catch {
            return NextResponse.json({ ok: true });
        }

        if (jti) {
            await prisma.activeSession.deleteMany({ where: { jti } });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json({ ok: true });
    }
}
