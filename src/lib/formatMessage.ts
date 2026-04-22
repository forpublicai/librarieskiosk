function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const CHAT_PRE_STYLE = "background:var(--bg-secondary); padding:16px; border:1px solid var(--border-color); margin:12px 0; font-family:'NB Mono', monospace; font-size:0.85rem; overflow-x:auto; white-space:pre; word-break:normal;";
const CODE_PRE_STYLE = "background:var(--bg-secondary); padding:12px; border:1px solid var(--border-color); margin:8px 0; font-family:'NB Mono', monospace; font-size:0.8rem; overflow-x:auto; white-space:pre; word-break:normal;";
const CHAT_INLINE_STYLE = "background:var(--bg-secondary); padding:2px 6px; font-family:'NB Mono', monospace; font-size:0.9em;";
const CODE_INLINE_STYLE = "background:var(--bg-secondary); padding:2px 4px; font-family:'NB Mono', monospace;";

export function formatAssistantMessage(text: string, variant: 'chat' | 'code'): string {
    const escaped = escapeHtml(text);
    const preStyle = variant === 'chat' ? CHAT_PRE_STYLE : CODE_PRE_STYLE;
    const inlineStyle = variant === 'chat' ? CHAT_INLINE_STYLE : CODE_INLINE_STYLE;

    // Fenced code blocks: contents are already HTML-escaped, so any HTML the
    // model emits appears as literal text rather than rendered elements.
    // Emit them first using a placeholder to avoid inline/bold regex touching
    // them, then restore.
    const blocks: string[] = [];
    let withBlocks = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, body) => {
        const idx = blocks.length;
        blocks.push(`<pre style="${preStyle}"><code>${body}</code></pre>`);
        return `\u0000BLOCK${idx}\u0000`;
    });

    withBlocks = withBlocks
        .replace(new RegExp('`([^`]+)`', 'g'), `<code style="${inlineStyle}">$1</code>`)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');

    return withBlocks.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i) => blocks[Number(i)]);
}
