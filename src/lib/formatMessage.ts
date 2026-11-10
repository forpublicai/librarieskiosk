function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Styling comes from `.lk-msg__body pre` and `.lk-msg__body code` in globals.css.
export function formatAssistantMessage(text: string): string {
    const escaped = escapeHtml(text);

    // Fenced code blocks: contents are already HTML-escaped, so any HTML the
    // model emits appears as literal text rather than rendered elements.
    // Emit them first using a placeholder to avoid inline/bold regex touching
    // them, then restore.
    const blocks: string[] = [];
    let withBlocks = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, body) => {
        const idx = blocks.length;
        blocks.push(`<pre><code>${body}</code></pre>`);
        return `\u0000BLOCK${idx}\u0000`;
    });

    withBlocks = withBlocks
        .replace(new RegExp('`([^`]+)`', 'g'), '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');

    return withBlocks.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i) => blocks[Number(i)]);
}
