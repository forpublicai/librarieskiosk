export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { renewalIso, resetCreditsIfNeeded } from '@/lib/credits';
import {
    KIOSK_LIBRARY_COOKIE,
    guestUsernameForLibrary,
    libraryNameToUrlSlug,
    normalizeSlug,
} from '@/lib/library';

/**
 * POST /api/auth/guest
 *
 * Returns a token for a guest account.
 *
 * Library resolution:
 * - If the kiosk has been bootstrapped via `/l/<slug>` (sets `kiosk_library`
 *   cookie), issue a token for that library's dedicated guest account
 *   (`guest_<slug>`), so credits and NanoGPT keys are isolated per library.
 * - If no cookie is present (someone hits the bare URL, or the kiosk URL has
 *   not yet been updated to include the library slug), fall back to the
 *   legacy shared `guest` account. This keeps the vanilla URL working.
 *
 * Guest sessions:
 * - Share a single database account per library (for credit tracking & weekly resets)
 * - Do not persist conversations, usage logs, or content
 * - Have a max 8-hour session before auto-logout
 * - Can be used concurrently by multiple kiosk users
 */
export async function POST(request: NextRequest) {
    try {
        const cookieSlugRaw = request.cookies.get(KIOSK_LIBRARY_COOKIE)?.value;
        const cookieSlug = cookieSlugRaw ? normalizeSlug(cookieSlugRaw).toLowerCase() : '';

        let guest = null as Awaited<ReturnType<typeof prisma.user.findUnique>>;

        if (!cookieSlug) {
            console.warn('[guest login] no kiosk_library cookie; falling back to legacy guest account');
        }

        if (cookieSlug) {
            // Validate against the Library table and look up the scoped guest row.
            const libraries = await prisma.library.findMany({ select: { name: true } });
            const match = libraries.find(
                (lib) => libraryNameToUrlSlug(lib.name) === cookieSlug
            );

            if (match) {
                const username = guestUsernameForLibrary(match.name);
                guest = await prisma.user.findUnique({ where: { username } });

                if (!guest) {
                    // Seed hasn't been re-run since the per-library guests were
                    // added. Warn and fall through to the legacy guest.
                    console.warn(
                        `[guest login] no guest row for library "${match.name}" (username=${username}); falling back to legacy guest account`
                    );
                }
            } else {
                console.warn(
                    `[guest login] kiosk_library cookie "${cookieSlugRaw}" does not match any Library; falling back to legacy guest account`
                );
            }
        }

        if (!guest) {
            guest = await prisma.user.findUnique({ where: { username: 'guest' } });
        }

        if (!guest) {
            return NextResponse.json(
                { error: 'Guest account not configured. Please run database seed.' },
                { status: 500 }
            );
        }

        await resetCreditsIfNeeded(guest.id);

        const loggedInGuest = await prisma.user.update({
            where: { id: guest.id },
            data: {
                loginCount: { increment: 1 },
                lastLoginAt: new Date(),
            },
            select: {
                id: true,
                username: true,
                role: true,
                status: true,
                credits: true,
                creditsResetAt: true,
                library: true,
            },
        });

        // Issue token for the resolved guest account
        const token = await signToken({
            userId: loggedInGuest.id,
            username: loggedInGuest.username,
            role: loggedInGuest.role,
            library: loggedInGuest.library,
        });

        return NextResponse.json({
            token,
            user: {
                id: loggedInGuest.id,
                username: loggedInGuest.username,
                role: loggedInGuest.role,
                status: loggedInGuest.status,
                credits: loggedInGuest.credits,
                library: loggedInGuest.library,
                creditsRenewAt: renewalIso(loggedInGuest.creditsResetAt),
            },
        });
    } catch (error) {
        console.error('Guest login error:', error);
        return NextResponse.json(
            { error: 'Failed to access guest account' },
            { status: 500 }
        );
    }
}
