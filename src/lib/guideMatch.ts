export interface GuideMatchFAQ {
    q: string;
    a: string;
}

export interface GuideMatchUseCase {
    label: string;
    gettingStarted: {
        intro: string;
        examplePrompt: string;
        tips: string[];
        cautions: string[];
    } | null;
}

export const FUZZY_STOP = new Set([
    'the', 'a', 'an', 'is', 'it', 'i', 'do', 'can', 'my', 'me', 'to', 'of', 'in', 'for',
    'what', 'how', 'why', 'when', 'does', 'should', 'will', 'are', 'be', 'have', 'this',
    'that', 'with', 'get', 'use', 'if', 'but', 'not', 'and', 'or', 'as', 'at', 'about',
    'could', 'would', 'might', 'also', 'even', 'still', 'already', 'yet', 'too', 'its',
    'know', 'understand', 'think', 'want', 'need', 'help', 'tell', 'find', 'learn',
    'try', 'figure', 'explain', 'show', 'describe', 'mean', 'means', 'define', 'said',
    'dont', 'cant', 'wont', 'doesnt', 'isnt', 'arent', 'didnt', 'wasnt', 'havent',
    'just', 'really', 'maybe', 'perhaps', 'like', 'sort', 'kind', 'bit', 'way',
    'please', 'hi', 'hello', 'hey', 'okay', 'yeah', 'yes', 'sure', 'right', 'actually',
]);

export function splitIntoBubbles(text: string): string[] {
    return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}

export function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !FUZZY_STOP.has(w));
}

// Strip common intent-framing wrappers so "I don't know what X is" becomes "X".
export function normalizeQuery(q: string): string {
    return q
        .replace(/i\s+don'?t\s+know\s+(what|how|why|if|whether)\s+/gi, '')
        .replace(/i\s+(don'?t|do\s+not)\s+understand\s+/gi, '')
        .replace(/can\s+you\s+\w+\s+(me\s+)?(about\s+)?/gi, '')
        .replace(/help\s+me\s+\w+\s+/gi, '')
        .replace(/tell\s+me\s+(about\s+)?/gi, '')
        .replace(/what\s+does\s+(.+?)\s+mean\??$/gi, '$1')
        .replace(/explain\s+(.+?)\s+to\s+me\??$/gi, '$1')
        .replace(/how\s+do\s+i\s+/gi, '')
        .replace(/i\s+want\s+to\s+(know|learn|understand)\s+(about\s+)?/gi, '')
        .trim();
}

export function fuzzyMatch(query: string, faqs: GuideMatchFAQ[]): GuideMatchFAQ | null {
    const qTokens = tokenize(normalizeQuery(query));
    if (!qTokens.length) return null;

    const corpusTokens = new Set(faqs.flatMap((f) => [...tokenize(f.q), ...tokenize(f.a)]));
    if (qTokens.some((t) => !corpusTokens.has(t))) return null;

    let best: { faq: GuideMatchFAQ; score: number } | null = null;
    for (const faq of faqs) {
        const faqQTokenSet = new Set(tokenize(faq.q));
        const hits = qTokens.filter((t) => faqQTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        if (!best || score > best.score) best = { faq, score };
    }
    if (best && best.score >= 0.35) return best.faq;

    best = null;
    for (const faq of faqs) {
        const faqTokenSet = new Set(tokenize(`${faq.q} ${faq.a}`));
        const hits = qTokens.filter((t) => faqTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        if (!best || score > best.score) best = { faq, score };
    }
    return best && best.score >= 0.35 ? best.faq : null;
}

export function fuzzyMatchUseCase<T extends GuideMatchUseCase>(
    query: string,
    useCases: T[]
): T | null {
    const qTokens = tokenize(normalizeQuery(query));
    if (!qTokens.length) return null;

    let best: { uc: T; score: number; hits: number } | null = null;
    for (const uc of useCases) {
        if (!uc.gettingStarted) continue;
        const gs = uc.gettingStarted;
        const text = [uc.label, gs.intro, gs.examplePrompt, ...gs.tips, ...gs.cautions].join(' ');
        const ucTokenSet = new Set(tokenize(text));
        const hits = qTokens.filter((t) => ucTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        if (!best || score > best.score) best = { uc, score, hits };
    }

    if (!best || best.score < 0.25) return null;
    if (qTokens.length > 1 && best.hits < 2) return null;
    return best.uc;
}
