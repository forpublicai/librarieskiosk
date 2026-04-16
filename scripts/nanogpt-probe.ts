/**
 * NanoGPT direct probe script for debugging music/video API payloads.
 *
 * Usage:
 *   npx tsx scripts/nanogpt-probe.ts
 *
 * Requires:
 *   NANOGPT_API_KEY in environment (.env loaded by your shell or VS Code).
 */

import 'dotenv/config';

const API_KEY = process.env.NANOGPT_API_KEY;

if (!API_KEY) {
    console.error('Missing NANOGPT_API_KEY');
    process.exit(1);
}

const REQUIRED_API_KEY: string = API_KEY;

async function probeMusic() {
    const response = await fetch('https://nano-gpt.com/api/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${REQUIRED_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'Elevenlabs-Music-V1',
            input: 'A short cinematic ambient music bed with soft strings and light percussion, 90 BPM',
        }),
    });

    const contentType = response.headers.get('content-type') || '';
    console.log('\n[MUSIC] status:', response.status);
    console.log('[MUSIC] content-type:', contentType);

    if (!response.ok) {
        const text = await response.text();
        console.log('[MUSIC] error body:', text);
        return;
    }

    if (contentType.includes('application/json')) {
        const data = await response.json();
        console.log('[MUSIC] json body:', data);

        const runId = data.runId || data.id || data.requestId;
        const status = String(data.status || '').toLowerCase();
        if (runId && status === 'pending') {
            const statusUrl = new URL('https://nano-gpt.com/api/tts/status');
            statusUrl.searchParams.set('runId', runId);
            statusUrl.searchParams.set('model', 'Elevenlabs-Music-V1');
            if (typeof data.cost === 'number') {
                statusUrl.searchParams.set('cost', String(data.cost));
            }
            if (typeof data.paymentSource === 'string') {
                statusUrl.searchParams.set('paymentSource', data.paymentSource);
            }
            statusUrl.searchParams.set('isApiRequest', 'true');

            for (let attempt = 1; attempt <= 8; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 3000));

                const pollResp = await fetch(statusUrl.toString(), {
                    headers: { 'x-api-key': REQUIRED_API_KEY },
                });
                const pollData = await pollResp.json();
                console.log(`[MUSIC poll ${attempt}]`, pollData);

                const pollStatus = String(pollData.status || '').toLowerCase();
                if (pollStatus === 'completed' || pollStatus === 'error') {
                    break;
                }
            }
        }
        return;
    }

    const bytes = await response.arrayBuffer();
    console.log('[MUSIC] bytes:', bytes.byteLength);
}

async function probeVideo() {
    const submitResponse = await fetch('https://nano-gpt.com/api/generate-video', {
        method: 'POST',
        headers: {
            'x-api-key': REQUIRED_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'bytedance-seedance-v1-pro-fast',
            prompt: 'A red paper airplane flying above a calm ocean at sunset',
            duration: '5',
            aspect_ratio: '16:9',
        }),
    });

    const submitText = await submitResponse.text();
    console.log('\n[VIDEO submit] status:', submitResponse.status);
    console.log('[VIDEO submit] body:', submitText);

    if (!submitResponse.ok) return;

    let submitData: Record<string, unknown> = {};
    try {
        submitData = JSON.parse(submitText) as Record<string, unknown>;
    } catch {
        return;
    }

    const runIdValue = submitData.runId || submitData.id || submitData.requestId;
    const runId = typeof runIdValue === 'string' ? runIdValue : '';
    if (!runId) {
        console.log('[VIDEO submit] no runId/id/requestId found');
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(
        `https://nano-gpt.com/api/video/status?requestId=${encodeURIComponent(runId)}`,
        {
            method: 'GET',
            headers: {
                'x-api-key': REQUIRED_API_KEY,
            },
        }
    );

    const statusText = await statusResponse.text();
    console.log('\n[VIDEO status] status:', statusResponse.status);
    console.log('[VIDEO status] body:', statusText);
}

async function main() {
    await probeMusic();
    await probeVideo();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
