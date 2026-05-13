export type GuideTextPart =
    | { type: 'text'; text: string }
    | { type: 'link'; text: string; href: string };

export function splitGuideTextLinks(text: string): GuideTextPart[] {
    // Matches full URLs (https?://) or bare domains containing .com/.org/.net/.edu/.gov
    const urlRe = /\bhttps?:\/\/[^\s,)]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov)(?:\/[^\s,)]*)?/gi;
    const parts: GuideTextPart[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRe.exec(text)) !== null) {
        if (match.index > last) {
            parts.push({ type: 'text', text: text.slice(last, match.index) });
        }
        const raw = match[0];
        const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        parts.push({ type: 'link', text: raw, href });
        last = match.index + raw.length;
    }

    if (last < text.length) {
        parts.push({ type: 'text', text: text.slice(last) });
    }

    return parts.length ? parts : [{ type: 'text', text }];
}
