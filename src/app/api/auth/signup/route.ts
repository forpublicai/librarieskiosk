export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken } from '@/lib/auth';
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
        const ALLOWED_LIBRARIES = ['Pottsboro, TX', 'Salem City, UT'];
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

        // Auto-login: return token
        const token = await signToken({
            userId: user.id,
            username: user.username,
            role: user.role,
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
