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
    'try', 'figure', 'explain', 'show', 'describe', 'mean', 'means', 'define', 'said', 'ask',
    'dont', 'cant', 'wont', 'doesnt', 'isnt', 'arent', 'didnt', 'wasnt', 'havent',
    'just', 'really', 'maybe', 'perhaps', 'like', 'sort', 'kind', 'bit', 'way',
    'please', 'hi', 'hello', 'hey', 'okay', 'yeah', 'yes', 'sure', 'right', 'actually',
    'make', 'give',
    'good', 'more', 'very', 'much', 'many', 'only', 'well', 'new', 'own', 'any',
    'something', 'done', 'over', 'here',
]);

export function splitIntoBubbles(text: string): string[] {
    return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}

// Strip a trailing 's' from plurals ("styles"→"style", "images"→"image",
// "artworks"→"artwork"). Applied symmetrically to both query and corpus tokens
// so matching is consistent. Excludes 'ss' endings (business, process, class).
function stem(word: string): string {
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

export function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !FUZZY_STOP.has(w))
        .map(stem);
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
        .replace(/(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+(?:of|to)\s+/gi, '')
        .replace(/what(?:'s|\s+is|\s+are)\s+(?:a\s+|the\s+)?(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+to\s+/gi, '')
        .replace(/i\s+want\s+to\s+(know|learn|understand)\s+(about\s+)?/gi, '')
        .trim();
}

// Normalise a string to bare lowercase alphanumeric words for exact-match comparison.
function normStr(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// Definitional/explanatory queries are never use-case intents — route them to FAQ/live model.
// "how do I" is excluded: normalizeQuery strips it, and it legitimately maps to use cases.
// "what is the best/good/easiest way to X" is excluded: it's a how-to intent, not a definition.
const DEFINITIONAL_RE = /^\s*(what\s+(is|are|was|were)(?!\s+(?:a\s+|the\s+)?(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+to\b)|how\s+does|how\s+do(?!\s+i\b)|why\s+(is|are|does|do)|when\s+(is|are|does|do)|who\s+(is|are))\s+/i;

export function fuzzyMatchFaqs(query: string, faqs: GuideMatchFAQ[]): GuideMatchFAQ | null {
    const qTokens = tokenize(normalizeQuery(query));
    if (!qTokens.length) return null;

    const corpusTokens = new Set(faqs.flatMap((f) => [...tokenize(f.q), ...tokenize(f.a)]));
    const faqMaxOrphans = qTokens.length >= 4 ? 1 : 0;
    if (qTokens.filter((t) => !corpusTokens.has(t)).length > faqMaxOrphans) return null;

    // Exact match against question text always wins.
    const qNorm = normStr(query);
    const exact = faqs.find(f => normStr(f.q) === qNorm);
    if (exact) return exact;

    // For definitional queries ("what is X", "how does X work"), only accept a hit when
    // ALL query tokens appear in the FAQ question text. This prevents answer-text bleed
    // from pulling in the wrong FAQ (e.g. "what is music style" matching "How does the
    // music tool create songs?" because "style" appears in that answer).
    // On ties, prefer the shorter (more focused) question.
    if (DEFINITIONAL_RE.test(query)) {
        let best: { faq: GuideMatchFAQ; hits: number; qLen: number } | null = null;
        for (const faq of faqs) {
            const faqQTokenSet = new Set(tokenize(faq.q));
            const hits = qTokens.filter((t) => faqQTokenSet.has(t)).length;
            const qLen = faq.q.split(/\s+/).length;
            if (!best || hits > best.hits || (hits === best.hits && qLen < best.qLen))
                best = { faq, hits, qLen };
        }
        return best && best.hits === qTokens.length ? best.faq : null;
    }

    // First pass: score against question text only. On ties, prefer shorter question.
    let best: { faq: GuideMatchFAQ; score: number; hits: number; qLen: number } | null = null;
    for (const faq of faqs) {
        const faqQTokenSet = new Set(tokenize(faq.q));
        const hits = qTokens.filter((t) => faqQTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        const qLen = faq.q.split(/\s+/).length;
        if (!best || score > best.score || (score === best.score && qLen < best.qLen))
            best = { faq, score, hits, qLen };
    }
    if (best && best.score >= 0.35 && !(qTokens.length > 1 && best.hits < 2)) return best.faq;

    // Second pass: score against combined question + answer text. On ties, prefer shorter question.
    best = null;
    for (const faq of faqs) {
        const faqTokenSet = new Set(tokenize(`${faq.q} ${faq.a}`));
        const hits = qTokens.filter((t) => faqTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        const qLen = faq.q.split(/\s+/).length;
        if (!best || score > best.score || (score === best.score && qLen < best.qLen))
            best = { faq, score, hits, qLen };
    }
    if (!best || best.score < 0.35) return null;
    if (qTokens.length > 1 && best.hits < 2) return null;
    return best.faq;
}

export function fuzzyMatchUseCase<T extends GuideMatchUseCase>(
    query: string,
    useCases: T[]
): T | null {
    if (DEFINITIONAL_RE.test(query)) return null;
    const qTokens = tokenize(normalizeQuery(query));
    if (!qTokens.length) return null;

    // Orphan-token check: route to the live model if too many query tokens are
    // absent from the use-case corpus. Short queries (< 4 tokens) require a
    // perfect corpus match; longer natural-language queries allow 1 unknown
    // token so a single descriptive word doesn't discard an otherwise strong hit.
    const corpusTokens = new Set(
        useCases.flatMap((uc) => {
            if (!uc.gettingStarted) return [];
            const gs = uc.gettingStarted;
            return tokenize([uc.label, gs.intro, gs.examplePrompt, ...gs.tips, ...gs.cautions].join(' '));
        })
    );
    const ucMaxOrphans = qTokens.length >= 4 ? 1 : 0;
    if (qTokens.filter((t) => !corpusTokens.has(t)).length > ucMaxOrphans) return null;

    // Exact match against use-case label always wins.
    const qNorm = normStr(query);
    const exact = useCases.find(uc => uc.gettingStarted && normStr(uc.label) === qNorm);
    if (exact) return exact;

    // Token scoring. On ties, prefer the use case with the shorter label.
    let best: { uc: T; score: number; hits: number; labelLen: number } | null = null;
    for (const uc of useCases) {
        if (!uc.gettingStarted) continue;
        const gs = uc.gettingStarted;
        const text = [uc.label, gs.intro, gs.examplePrompt, ...gs.tips, ...gs.cautions].join(' ');
        const ucTokenSet = new Set(tokenize(text));
        const hits = qTokens.filter((t) => ucTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        const labelLen = uc.label.split(/\s+/).length;
        if (!best || score > best.score || (score === best.score && labelLen < best.labelLen))
            best = { uc, score, hits, labelLen };
    }

    if (!best || best.score < 0.25) return null;
    if (qTokens.length > 1 && best.hits < 2) return null;
    return best.uc;
}
