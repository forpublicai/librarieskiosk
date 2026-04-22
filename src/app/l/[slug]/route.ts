import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    KIOSK_LIBRARY_COOKIE,
    libraryNameToUrlSlug,
    normalizeSlug,
} from '@/lib/library';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours, matches kiosk_access

/**
 * GET /l/<slug>
 *
 * Library bootstrap endpoint. Each kiosk device is provisioned with a start
 * URL of the form `https://<host>/l/<slug>?access=<KIOSK_ACCESS_TOKEN>`,
 * where <slug> is the lowercase library name with non-alphanumerics as `_`
 * (e.g. `pottsboro_tx`, `salem_city_ut`, `public_ai`).
 *
 * The middleware handles the `?access=` gate first; this handler validates
 * the slug against the Library table, stamps a long-lived `kiosk_library`
 * cookie, and redirects to `/`. Downstream, `/api/auth/guest` reads the
 * cookie to pick the library-scoped guest account so credits and NanoGPT
 * keys are isolated per library.
 *
 * Visiting the bare URL (no `/l/...`) is still supported — the guest
 * endpoint falls back to the legacy shared `guest` account in that case.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug: rawSlug } = await params;
    const normalized = normalizeSlug(rawSlug);
    if (!normalized) {
        return new NextResponse('Not found', { status: 404 });
    }

    // Resolve the Library row by matching slug-of-name. Small table.
    const libraries = await prisma.library.findMany({ select: { name: true } });
    const match = libraries.find(
        (lib) => libraryNameToUrlSlug(lib.name) === normalized.toLowerCase()
    );
    if (!match) {
        return new NextResponse('Unknown library', { status: 404 });
    }

    const redirectUrl = new URL('/', request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(KIOSK_LIBRARY_COOKIE, libraryNameToUrlSlug(match.name), {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
    });
    return response;
}
