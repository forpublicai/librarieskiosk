import { SignJWT, jwtVerify } from 'jose';
import { hashSync, compareSync } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './db';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET env var is required'); })()
);

export interface TokenPayload {
    userId: string;
    username: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PATRON' | 'GUEST';
    library: string;
    jti?: string;
}

export const SESSION_IDLE_MS = 10 * 60 * 1000; // 10 minutes

export async function signToken(payload: TokenPayload): Promise<string> {
    const jti = payload.jti || crypto.randomUUID();
    const { jti: _ignored, ...rest } = payload;
    return new SignJWT(rest as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime('8h')
        .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
        ...(payload as unknown as TokenPayload),
        jti: payload.jti,
    };
}

export function hashPassword(plain: string): string {
    return hashSync(plain, 10);
}

export function comparePassword(plain: string, hash: string): boolean {
    return compareSync(plain, hash);
}

export async function requireAuth(
    request: NextRequest
): Promise<{ user: TokenPayload } | NextResponse> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const token = authHeader.slice(7);
        const user = await verifyToken(token);
        return { user };
    } catch {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
}

/**
 * Enforces that patron sessions have a live ActiveSession row whose
 * lastActivity is within SESSION_IDLE_MS. Admins, super-admins, and guests
 * bypass session tracking entirely. On success, touches lastActivity.
 */
export async function requireActiveSession(
    request: NextRequest
): Promise<{ user: TokenPayload } | NextResponse> {
    const result = await requireAuth(request);
    if (result instanceof NextResponse) return result;
    const { user } = result;

    if (user.role !== 'PATRON') return result;

    if (!user.jti) {
        return NextResponse.json(
            { error: 'Session expired', code: 'SESSION_EXPIRED' },
            { status: 401 }
        );
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

    return result;
}

export async function requireAdmin(
    request: NextRequest
): Promise<{ user: TokenPayload } | NextResponse> {
    const result = await requireAuth(request);
    if (result instanceof NextResponse) return result;
    if (result.user.role !== 'ADMIN' && result.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return result;
}

export async function requireSuperAdmin(
    request: NextRequest
): Promise<{ user: TokenPayload } | NextResponse> {
    const result = await requireAuth(request);
    if (result instanceof NextResponse) return result;
    if (result.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }
    return result;
}

export function isAuthResult(
    result: { user: TokenPayload } | NextResponse
): result is { user: TokenPayload } {
    return 'user' in result;
}
