export type GuideTextPart =
    | { type: 'text'; text: string }
    | { type: 'link'; text: string; href: string };

export function splitGuideTextLinks(text: string): GuideTextPart[] {
    const urlRe = /\bhttps?:\/\/[^\s,)]+/g;
    const parts: GuideTextPart[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRe.exec(text)) !== null) {
        if (match.index > last) {
            parts.push({ type: 'text', text: text.slice(last, match.index) });
        }
        const raw = match[0];
        parts.push({ type: 'link', text: raw, href: raw });
        last = match.index + raw.length;
    }

    if (last < text.length) {
        parts.push({ type: 'text', text: text.slice(last) });
    }

    return parts.length ? parts : [{ type: 'text', text }];
}
