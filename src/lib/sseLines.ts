/**
 * Incremental parser for the `data:` lines of a server-sent-events stream.
 *
 * Network chunks do not respect line boundaries, so a `data: {...}` line can
 * arrive split across two reads. `push` buffers the trailing partial line and
 * only returns payloads for complete lines; `flush` returns whatever is left
 * once the stream has ended.
 */
export function createSseDataParser() {
    let buffer = '';

    const extract = (lines: string[]): string[] => {
        const payloads: string[] = [];
        for (const raw of lines) {
            const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
            if (line.startsWith('data: ')) payloads.push(line.slice(6));
        }
        return payloads;
    };

    return {
        push(text: string): string[] {
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            return extract(lines);
        },
        flush(): string[] {
            const rest = buffer;
            buffer = '';
            return extract([rest]);
        },
    };
}
