/**
 * nano-gpt API Client
 * 
 * All AI generation routes through this module.
 * The API key is server-side only — never exposed to the browser.
 */

const NANOGPT_BASE_URL = 'https://nano-gpt.com';

/**
 * Resolve the NanoGPT API key for a given library.
 * Falls back to NANOGPT_API_KEY when no per-library key is set.
 * Library name is slugged: uppercase, non-alphanumerics collapsed to `_`.
 * E.g. "Pottsboro, TX" -> NANOGPT_API_KEY_POTTSBORO_TX.
 */
export function getNanogptKey(library: string | null | undefined): string {
    if (library) {
        const slug = library.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const scoped = process.env[`NANOGPT_API_KEY_${slug}`];
        if (scoped) return scoped;
    }
    return process.env.NANOGPT_API_KEY || '';
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Don't retry on 4xx client errors (except 429)
            if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
                return response;
            }
            if (attempt < retries) {
                await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
            } else {
                return response;
            }
        } catch (error) {
            if (attempt === retries) throw error;
            await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
    }
    throw new Error('Max retries exceeded');
}

// ---------------------
// Chat Completions (SSE Streaming)
// ---------------------
export async function chatStream(
    messages: Array<{ role: string; content: string }>,
    model: string,
    apiKey: string
): Promise<ReadableStream> {
    const response = await fetchWithRetry(
        `${NANOGPT_BASE_URL}/api/v1/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error ${response.status}: ${error}`);
    }

    if (!response.body) {
        throw new Error('No response body from chat API');
    }

    return response.body;
}

// ---------------------
// Image Generation
// ---------------------
export interface ImageResult {
    url?: string;
    b64_json?: string;
}

export async function generateImage(
    prompt: string,
    model: string,
    apiKey: string
): Promise<ImageResult> {
    const response = await fetchWithRetry(
        `${NANOGPT_BASE_URL}/api/v1/images/generations`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                prompt,
                n: 1,
                size: '1024x1024',
                response_format: 'url',
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Image API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.data?.[0] || {};
}

// ---------------------
// Video Generation (Async + Polling)
// ---------------------
export interface VideoSubmitResult {
    runId: string;
    status: string;
    cost?: number;
}

export async function submitVideoGeneration(
    prompt: string,
    model: string,
    apiKey: string,
    duration: number = 5
): Promise<VideoSubmitResult> {
    const response = await fetchWithRetry(
        `${NANOGPT_BASE_URL}/api/generate-video`,
        {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                model,
                showExplicitContent: false,
                wan27_has_video_input: false,
                wan27_has_reference_images: false,
                voice: 'af_bella',
                duration: String(duration),
                aspect_ratio: '16:9',
                cfg_scale: 0.5,
                sound: false,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Video API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const normalizedRunId =
        data.runId ||
        data.id ||
        data.requestId ||
        data.data?.runId ||
        data.data?.id ||
        data.data?.requestId;

    if (!normalizedRunId) {
        throw new Error(`Video API did not return a generation ID: ${JSON.stringify(data)}`);
    }

    return {
        runId: normalizedRunId,
        status: data.status || data.data?.status || 'IN_QUEUE',
        cost: data.cost,
    };
}

export interface VideoStatusResult {
    status: string;
    videoUrl?: string;
    error?: string;
    details?: string;
}

export async function pollVideoStatus(
    runId: string,
    apiKey: string
): Promise<VideoStatusResult> {
    const response = await fetchWithRetry(
        `${NANOGPT_BASE_URL}/api/video/status?requestId=${encodeURIComponent(runId)}`,
        {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
            },
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Video status API error ${response.status}: ${error}`);
    }

    const result = await response.json();
    const data = result.data || result;

    return {
        status: data.status || result.status || 'UNKNOWN',
        videoUrl: data.output?.video?.url || data.videoUrl || result.videoUrl,
        error: data.error || data.userFriendlyError,
        details: data.details,
    };
}

// ---------------------
// Music Generation
// ---------------------
export interface MusicResult {
    audioUrl?: string;
    audioBuffer?: ArrayBuffer;
    contentType?: string;
}

interface TtsStatusParams {
    runId: string;
    model: string;
    apiKey: string;
    cost?: number;
    paymentSource?: string;
    isApiRequest?: boolean;
}

async function pollTtsStatus(params: TtsStatusParams): Promise<MusicResult> {
    const maxAttempts = 40;
    const delayMs = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const search = new URLSearchParams({
            runId: params.runId,
            model: params.model,
        });

        if (typeof params.cost === 'number') {
            search.set('cost', String(params.cost));
        }
        if (params.paymentSource) {
            search.set('paymentSource', params.paymentSource);
        }
        if (typeof params.isApiRequest === 'boolean') {
            search.set('isApiRequest', String(params.isApiRequest));
        }

        const response = await fetchWithRetry(
            `${NANOGPT_BASE_URL}/api/tts/status?${search.toString()}`,
            {
                method: 'GET',
                headers: {
                    'x-api-key': params.apiKey,
                },
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`TTS status API error ${response.status}: ${error}`);
        }

        const data = await response.json();
        const statusRaw = data.status || data.data?.status || '';
        const status = String(statusRaw).toLowerCase();
        const audioUrl = data.audioUrl || data.url || data.data?.audioUrl || data.data?.url;

        if (status === 'completed' && audioUrl) {
            return { audioUrl };
        }

        if (status === 'error' || status === 'failed' || status === 'canceled') {
            throw new Error(data.error || data.userFriendlyError || 'Music generation failed');
        }

        await sleep(delayMs);
    }

    throw new Error('Music generation timed out while waiting for completion');
}

export async function generateMusic(
    prompt: string,
    lyrics: string,
    model: string,
    apiKey: string,
    duration: number = 10
): Promise<MusicResult> {
    const promptText = (prompt || '').trim();
    const lyricsText = (lyrics || '').trim();
    const input = lyricsText
        ? `${promptText}\n\nLyrics:\n${lyricsText}`.trim()
        : promptText;

    if (!input) {
        throw new Error('Music input is required');
    }

    const response = await fetchWithRetry(
        `${NANOGPT_BASE_URL}/api/v1/audio/speech`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input,
                voice: 'af_bella',
                speed: 1,
                model,
                duration,
                sampleRate: 44100,
                bitrate: 128,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Music API error ${response.status}: ${error}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        const data = await response.json();
        const directAudioUrl =
            data.audioUrl ||
            data.url ||
            data.data?.audioUrl ||
            data.data?.url;

        if (directAudioUrl) {
            return { audioUrl: directAudioUrl };
        }

        const runId = data.runId || data.id || data.requestId;
        const status = String(data.status || '').toLowerCase();
        if (runId && (status === 'pending' || status === 'in_progress' || status === 'in_queue' || !status)) {
            return pollTtsStatus({
                runId,
                model,
                apiKey,
                cost: typeof data.cost === 'number' ? data.cost : undefined,
                paymentSource: typeof data.paymentSource === 'string' ? data.paymentSource : undefined,
                isApiRequest: true,
            });
        }

        throw new Error(`Music API returned no audio URL: ${JSON.stringify(data)}`);
    } else {
        const buffer = await response.arrayBuffer();
        return { audioBuffer: buffer, contentType };
    }
}
