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
}

export async function signToken(payload: TokenPayload): Promise<string> {
    return new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('8h')
        .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
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
