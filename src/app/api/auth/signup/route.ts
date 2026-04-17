export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, SESSION_IDLE_MS } from '@/lib/auth';
import { hashSecurityAnswer, isValidSecurityQuestion, normalizeSecurityAnswer } from '@/lib/security';

export async function POST(request: NextRequest) {
    try {
        const { username, password, library, securityQuestion, securityAnswer } = await request.json();

        if (!username || !password || !library) {
            return NextResponse.json(
                { error: 'Username, password, and library are required' },
                { status: 400 }
            );
        }

        if (!securityQuestion || !securityAnswer) {
            return NextResponse.json(
                { error: 'Security question and answer are required' },
                { status: 400 }
            );
        }

        if (!isValidSecurityQuestion(securityQuestion)) {
            return NextResponse.json(
                { error: 'Invalid security question' },
                { status: 400 }
            );
        }

        if (normalizeSecurityAnswer(securityAnswer).length < 2) {
            return NextResponse.json(
                { error: 'Security answer must contain at least 2 characters' },
                { status: 400 }
            );
        }

        // Validate username
        const trimmedUsername = username.trim().toLowerCase();
        if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
            return NextResponse.json(
                { error: 'Username must be 3–30 characters' },
                { status: 400 }
            );
        }
        if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
            return NextResponse.json(
                { error: 'Username can only contain letters, numbers, and underscores' },
                { status: 400 }
            );
        }

        // Validate password
        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            );
        }

        // Validate library
        const trimmedLibrary = library.trim();
        const ALLOWED_LIBRARIES = ['Pottsboro, TX', 'Salem City, UT', 'Public AI'];
        if (!ALLOWED_LIBRARIES.includes(trimmedLibrary)) {
            return NextResponse.json(
                { error: 'Please select a valid library' },
                { status: 400 }
            );
        }

        // Check if username already exists
        const existing = await prisma.user.findUnique({
            where: { username: trimmedUsername },
        });
        if (existing) {
            return NextResponse.json(
                { error: 'Username is already taken' },
                { status: 409 }
            );
        }

        // Create user
        const user = await prisma.user.create({
            data: {
                username: trimmedUsername,
                passwordHash: hashPassword(password),
                library: trimmedLibrary,
                role: 'PATRON',
                credits: 100,
                securityQuestion,
                securityAnswerHash: hashSecurityAnswer(securityAnswer),
            },
        });

        // Enforce concurrent-session cap for the user's library before auto-login
        const lib = await prisma.library.findUnique({
            where: { name: user.library },
            select: { maxConcurrentSessions: true },
        });
        const cap = lib?.maxConcurrentSessions ?? 1;
        const cutoff = new Date(Date.now() - SESSION_IDLE_MS);
        await prisma.activeSession.deleteMany({
            where: { library: user.library, lastActivity: { lt: cutoff } },
        });
        const active = await prisma.activeSession.count({ where: { library: user.library } });
        if (active >= cap) {
            return NextResponse.json(
                {
                    error: 'Library at capacity, try again later or contact library admin.',
                    code: 'LIBRARY_AT_CAPACITY',
                },
                { status: 409 }
            );
        }

        const jti = crypto.randomUUID();
        await prisma.activeSession.create({
            data: { userId: user.id, library: user.library, jti },
        });

        // Auto-login: return token
        const token = await signToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            library: user.library,
            jti,
        });

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                status: user.status,
                credits: user.credits,
                library: user.library,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
