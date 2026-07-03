import { describe, expect, it } from 'vitest';

import { resolveNanogptAssetUrl, isNanogptHost, NANOGPT_BASE_URL } from './nanogpt';

describe('resolveNanogptAssetUrl', () => {
    it('resolves provider-relative content paths against the API base', () => {
        const relative = '/api/generate-video/content?model=grok-imagine-video&runId=abc&variant=video';
        expect(resolveNanogptAssetUrl(relative)).toBe(`${NANOGPT_BASE_URL}${relative}`);
    });

    it('passes absolute http(s) URLs through unchanged', () => {
        const absolute = 'https://storage.example.com/video.mp4';
        expect(resolveNanogptAssetUrl(absolute)).toBe(absolute);
    });

    it('returns undefined for empty/missing input', () => {
        expect(resolveNanogptAssetUrl(undefined)).toBeUndefined();
        expect(resolveNanogptAssetUrl(null)).toBeUndefined();
        expect(resolveNanogptAssetUrl('   ')).toBeUndefined();
    });
});

describe('isNanogptHost', () => {
    it('matches NanoGPT-hosted URLs only', () => {
        expect(isNanogptHost('https://nano-gpt.com/api/generate-video/content?x=1')).toBe(true);
        expect(isNanogptHost('https://storage.example.com/video.mp4')).toBe(false);
        expect(isNanogptHost('/api/generate-video/content')).toBe(false);
    });
});
