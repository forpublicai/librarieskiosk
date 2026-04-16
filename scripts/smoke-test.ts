/**
 * Smoke Test Script
 * 
 * Verifies the API endpoints are working correctly.
 * Usage: npm run smoke-test
 * 
 * Requires the dev server to be running on http://localhost:3000
 * and the database to be seeded.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PATRON_PASSWORD = process.env.PATRON_PASSWORD || 'patron123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

interface TestResult {
    name: string;
    passed: boolean;
    details?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        results.push({ name, passed: true });
        console.log(`  ✅ ${name}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name, passed: false, details: msg });
        console.log(`  ❌ ${name}: ${msg}`);
    }
}

async function main() {
    console.log('\n🧪 Library AI Kiosk — Smoke Tests\n');
    console.log(`Target: ${BASE_URL}\n`);

    let token = '';

    // 1. Login
    await test('Login as patron', async () => {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'patron', password: PATRON_PASSWORD }),
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!data.token) throw new Error('No token returned');
        token = data.token;
    });

    // 2. Get user info
    await test('Get current user (auth/me)', async () => {
        const res = await fetch(`${BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!data.user?.credits) throw new Error('No credits in response');
    });

    // 3. Chat completions (streaming)
    await test('Chat completions (streaming)', async () => {
        const res = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Status ${res.status}: ${err}`);
        }
        // Read a bit of the stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No stream');
        const { done, value } = await reader.read();
        reader.cancel();
        if (done && !value) throw new Error('Empty stream');
    });

    // 4. Image generation
    let imageMediaSessionId: string | null = null;
    await test('Image generation', async () => {
        const res = await fetch(`${BASE_URL}/api/image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prompt: 'A small red circle on white' }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Status ${res.status}: ${err}`);
        }
        const data = await res.json();
        if (!data.url && !data.b64_json) throw new Error('No image data');
        // When R2 is enabled the response carries mediaSessionId + a presigned url
        if (data.mediaSessionId) imageMediaSessionId = data.mediaSessionId;
    });

    // 4b. Fresh signed URL endpoint (only runs if R2 path is active)
    await test('Media session signed URL (ownership + refresh)', async () => {
        if (!imageMediaSessionId) {
            // R2 persistence not enabled — skip without failing the suite
            console.log('     (skipped: USE_R2_PERSISTENCE=false)');
            return;
        }
        const res = await fetch(
            `${BASE_URL}/api/media-sessions/${imageMediaSessionId}/url`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!data.url || !data.url.startsWith('https://')) {
            throw new Error('Refreshed URL missing or not https');
        }
        // expiresAt may be null for legacy rows, but for R2 rows it must parse to a future date
        if (data.expiresAt) {
            const t = Date.parse(data.expiresAt);
            if (Number.isNaN(t) || t <= Date.now()) throw new Error('expiresAt not in future');
        }
    });

    // 4c. Media sessions list returns presigned urls
    await test('Media sessions list (presigned urls)', async () => {
        const res = await fetch(`${BASE_URL}/api/media-sessions?mode=image`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.sessions)) throw new Error('No sessions array');
        if (data.sessions.length === 0) return; // nothing to assert on
        const first = data.sessions[0];
        // `url` field is always populated (presigned for R2, legacy resultUrl otherwise)
        if (!first.url) throw new Error('First session missing url');
    });

    // 5. Video generation (submit only — polling is slow and gated by SKIP_VIDEO)
    if (process.env.SKIP_VIDEO !== 'true') {
        await test('Video generation (submit)', async () => {
            const res = await fetch(`${BASE_URL}/api/video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ prompt: 'A ball bouncing' }),
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Status ${res.status}: ${err}`);
            }
            const data = await res.json();
            if (!data.runId) throw new Error('No runId returned');
            // With R2 on, submit also creates a pending media session row
            // (mediaSessionId may be null when the flag is off — don't assert)
        });
    }

    // 6. Music generation
    await test('Music generation', async () => {
        const res = await fetch(`${BASE_URL}/api/music`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prompt: 'A short drum beat' }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Status ${res.status}: ${err}`);
        }
        const data = await res.json();
        if (!data.audioUrl) throw new Error('No audio URL');
    });

    // 7. Admin login
    let adminToken = '';
    await test('Login as admin', async () => {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        adminToken = data.token;
    });

    // 8. Admin list users
    await test('Admin: list users', async () => {
        const res = await fetch(`${BASE_URL}/api/admin/users`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.users)) throw new Error('No users array');
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${passed}/${results.length} tests passed\n`);

    if (passed < results.length) {
        process.exit(1);
    }
}

main().catch(console.error);
