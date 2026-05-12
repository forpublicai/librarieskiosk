import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const dnsLookup = vi.hoisted(() => vi.fn());

vi.mock('dns/promises', () => ({
    lookup: dnsLookup,
}));

import {
    buildAttachmentDisposition,
    DownloadHostNotAllowedError,
    extensionForMime,
    fetchBytesFromUrl,
    mimeGlobForMode,
} from './storage';
import { getDownloadProxyAllowedHosts, resetR2EnvCache } from './env';

describe('storage download helpers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('fetch', vi.fn());
        dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        process.env.R2_ACCOUNT_ID = 'account';
        process.env.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
        process.env.R2_BUCKET = 'bucket';
        process.env.R2_ACCESS_KEY_ID = 'access';
        process.env.R2_SECRET_ACCESS_KEY = 'secret';
        process.env.R2_MAX_UPLOAD_BYTES = '1048576';
        resetR2EnvCache();
    });

    it('maps music mode to audio MIME globs', () => {
        expect(mimeGlobForMode('image')).toBe('image/*');
        expect(mimeGlobForMode('music')).toBe('audio/*');
        expect(mimeGlobForMode('video')).toBe('video/*');
    });

    it('uses friendly media extensions for common provider MIME types', () => {
        expect(extensionForMime('audio/mpeg', 'music')).toBe('mp3');
        expect(extensionForMime('audio/wav', 'music')).toBe('wav');
        expect(extensionForMime('video/mp4', 'video')).toBe('mp4');
    });

    it('sanitizes attachment filenames for header safety', () => {
        const disposition = buildAttachmentDisposition('bad"\r\nname.mp3');
        expect(disposition).toContain('filename="bad___name.mp3"');
        expect(disposition).toContain("filename*=UTF-8''bad%22%0D%0Aname.mp3");
    });

    it('parses download proxy allowed hosts and fails closed when unset', () => {
        delete process.env.DOWNLOAD_PROXY_ALLOWED_HOSTS;
        expect(() => getDownloadProxyAllowedHosts()).toThrow('DOWNLOAD_PROXY_ALLOWED_HOSTS');

        process.env.DOWNLOAD_PROXY_ALLOWED_HOSTS = 'https://cdn.example.com, media.example.org ';
        expect(getDownloadProxyAllowedHosts()).toEqual(new Set(['cdn.example.com', 'media.example.org']));
    });

    it('rejects non-allowlisted original hosts before fetching', async () => {
        await expect(
            fetchBytesFromUrl('https://evil.example/file.mp3', 'audio/*', {
                allowedHosts: new Set(['allowed.example']),
            })
        ).rejects.toBeInstanceOf(DownloadHostNotAllowedError);
        expect(fetch).not.toHaveBeenCalled();
        expect(dnsLookup).not.toHaveBeenCalled();
    });

    it('rejects redirects to non-allowlisted hosts before reading the body', async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue(new Response(null, {
            status: 302,
            headers: { location: 'https://evil.example/file.mp3' },
        }));

        await expect(
            fetchBytesFromUrl('https://allowed.example/file.mp3', 'audio/*', {
                allowedHosts: new Set(['allowed.example']),
            })
        ).rejects.toBeInstanceOf(DownloadHostNotAllowedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
