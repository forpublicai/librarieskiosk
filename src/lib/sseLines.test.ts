import { describe, expect, it } from 'vitest';
import { createSseDataParser } from './sseLines';

describe('createSseDataParser', () => {
    it('returns payloads for complete lines', () => {
        const p = createSseDataParser();
        expect(p.push('data: {"a":1}\n\ndata: {"a":2}\n\n')).toEqual(['{"a":1}', '{"a":2}']);
    });

    it('holds a line split across chunks until it is complete', () => {
        const p = createSseDataParser();
        expect(p.push('data: {"choices":[{"delta":{"con')).toEqual([]);
        expect(p.push('tent":"hi"}}]}\n\n')).toEqual(['{"choices":[{"delta":{"content":"hi"}}]}']);
    });

    it('handles a split between the data prefix and the payload', () => {
        const p = createSseDataParser();
        expect(p.push('data:')).toEqual([]);
        expect(p.push(' x\n')).toEqual(['x']);
    });

    it('handles a split right before the newline', () => {
        const p = createSseDataParser();
        expect(p.push('data: x')).toEqual([]);
        expect(p.push('\n')).toEqual(['x']);
    });

    it('accepts CRLF line endings, including a CR/LF split across chunks', () => {
        const p = createSseDataParser();
        expect(p.push('data: a\r')).toEqual([]);
        expect(p.push('\ndata: b\r\n')).toEqual(['a', 'b']);
    });

    it('ignores non-data lines', () => {
        const p = createSseDataParser();
        expect(p.push(': keep-alive\nevent: message\ndata: x\n')).toEqual(['x']);
    });

    it('flush returns a final line that had no trailing newline', () => {
        const p = createSseDataParser();
        expect(p.push('data: tail')).toEqual([]);
        expect(p.flush()).toEqual(['tail']);
        expect(p.flush()).toEqual([]);
    });

    it('reassembles the same payloads however the stream is chunked', () => {
        const stream = 'data: {"n":1}\n\ndata: {"n":2}\r\n\r\ndata: [DONE]\n\n';
        const expected = ['{"n":1}', '{"n":2}', '[DONE]'];
        for (let size = 1; size <= stream.length; size++) {
            const p = createSseDataParser();
            const out: string[] = [];
            for (let i = 0; i < stream.length; i += size) out.push(...p.push(stream.slice(i, i + size)));
            out.push(...p.flush());
            expect(out).toEqual(expected);
        }
    });
});
