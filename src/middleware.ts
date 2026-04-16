import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'kiosk_access';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export function middleware(request: NextRequest) {
    const token = process.env.KIOSK_ACCESS_TOKEN;
    const { pathname, searchParams } = request.nextUrl;

    // If no token is configured, allow all access (dev/preview mode)
    if (!token) {
        return NextResponse.next();
    }

    // If the secret token is in the URL, set the cookie and redirect to clean URL
    const param = searchParams.get('access');
    if (param === token) {
        const cleanUrl = new URL(pathname, request.url);
        const response = NextResponse.redirect(cleanUrl);
        response.cookies.set(COOKIE_NAME, 'true', {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: COOKIE_MAX_AGE,
            path: '/',
        });
        return response;
    }

    // If cookie is present, allow through
    const cookie = request.cookies.get(COOKIE_NAME);
    if (cookie?.value === 'true') {
        return NextResponse.next();
    }

    // No cookie, no token — blocked
    return new NextResponse(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Access Restricted</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; background: #f5f5f5; color: #111; }
    .box { text-align: center; padding: 60px 40px; }
    h1 { font-size: 1.5rem; font-weight: bold; margin-bottom: 12px; }
    p { font-size: 0.95rem; color: #666; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Access Restricted</h1>
    <p>This service is only available on authorized library kiosk devices.</p>
  </div>
</body>
</html>`,
        {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
        }
    );
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon, fonts, images, and other public assets
         */
        '/((?!_next/static|_next/image|favicon.ico|fonts|images|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)',
    ],
};
