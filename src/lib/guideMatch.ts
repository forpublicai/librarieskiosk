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
    // Meta-help / framing words — say "I want assistance" without being domain terms.
    'guidance', 'advice', 'support', 'assistance', 'tips', 'feedback', 'recommendations', 'suggestions',
    'dont', 'cant', 'wont', 'doesnt', 'isnt', 'arent', 'didnt', 'wasnt', 'havent',
    'whats', 'thats', 'lets', 'youre', 'theyre',
    'just', 'really', 'maybe', 'perhaps', 'like', 'sort', 'kind', 'bit', 'way',
    'please', 'hi', 'hello', 'hey', 'okay', 'yeah', 'yes', 'sure', 'right', 'actually',
    'make', 'give',
    'good', 'more', 'very', 'much', 'many', 'only', 'well', 'new', 'own', 'any',
    'something', 'done', 'over', 'here',
    'no', 'up', 'by', 'us', 'we', 'he', 'so', 'go',
]);

export function splitIntoBubbles(text: string): string[] {
    return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}

// Light Porter-style stemmer. Collapses common morphological variants to a
// shared base so query and corpus tokens match regardless of verb form, plural,
// or nominalization. The stem is not always a real word (write→writ,
// create→creat) — it just has to be consistent across both sides.
//
// Examples:
//   write / writes / writing                  → writ
//   create / creates / created / creating     → creat
//   generate / generation / generating        → generat
//   download / downloads / downloaded         → download
//   image / images / imaging                  → imag
//   try / tries / tried                       → try
//
// Min-length guards on each rule prevent over-stemming short common words
// (thing, being, doing stay intact).
function stem(word: string): string {
    // -ies → -y: tries→try, studies→study
    if (word.length >= 5 && word.endsWith('ies')) {
        return word.slice(0, -3) + 'y';
    }
    // -ing: writing→writ, downloading→download
    if (word.length >= 6 && word.endsWith('ing')) {
        return word.slice(0, -3);
    }
    // -ed: downloaded→download, tried→try (with y-mutation)
    if (word.length >= 5 && word.endsWith('ed')) {
        const stripped = word.slice(0, -2);
        return stripped.endsWith('i') ? stripped.slice(0, -1) + 'y' : stripped;
    }
    // Strip plural -s (chained with -ion/-e below: creations→creation→creat).
    // Excludes -ss endings (business, process, class).
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        word = word.slice(0, -1);
    }
    // -ion: generation→generat, creation→creat
    if (word.length >= 6 && word.endsWith('ion')) {
        return word.slice(0, -3);
    }
    // -e: write→writ, image→imag, create→creat. Excludes -ee (free, agree).
    if (word.length >= 4 && word.endsWith('e') && !word.endsWith('ee')) {
        return word.slice(0, -1);
    }
    return word;
}

export function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        // Replace non-alphanumeric with space so hyphenated terms split correctly
        // ("AI-generated" → "ai generated") and contractions break apart
        // ("what's" → "what s", where both halves get filtered).
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        // Length >= 2 to keep meaningful 2-char tokens like "ai", "mp3", "id".
        // Common 2-char noise is already filtered via FUZZY_STOP.
        .filter((w) => w.length >= 2 && !FUZZY_STOP.has(w))
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
        // Longer pattern first so "what is the best way to X" strips cleanly before
        // the shorter standalone "best way to/of" pattern can leave "what is the" stranded.
        .replace(/what(?:'s|\s+is|\s+are)\s+(?:a\s+|the\s+)?(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+to\s+/gi, '')
        .replace(/(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+(?:of|to)\s+/gi, '')
        .replace(/i\s+want\s+to\s+(know|learn|understand)\s+(about\s+)?/gi, '')
        .trim();
}

// Normalise a string to bare lowercase alphanumeric words for exact-match comparison.
function normStr(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Definitional/explanatory queries are never use-case intents — route them to FAQ/live model.
// "how do I" is excluded: normalizeQuery strips it, and it legitimately maps to use cases.
// "what is the best/good/easiest way to X" is excluded: it's a how-to intent, not a definition.
// Also matches "what's" / "whats" contractions.
const DEFINITIONAL_RE = /^\s*(what(?:'?s|\s+(?:is|are|was|were))(?!\s+(?:a\s+|the\s+)?(?:best|good|better|easiest|simplest|fastest|quickest|right|proper|correct|effective)\s+way\s+to\b)|how\s+does|how\s+do(?!\s+i\b)|why\s+(is|are|does|do)|when\s+(is|are|does|do)|who\s+(is|are))\s+/i;

// Classify a question by its leading interrogative. Used as a tiebreaker in FAQ
// scoring: when two FAQs tie on token overlap, prefer the one whose question
// shape matches the query's shape (procedural query → procedural FAQ).
//
//   procedural   — asking about an action or possibility (How do I, Can I, Should I)
//   descriptive  — asking about a property or definition (What is, Which, How many)
//   reasoning    — asking about cause (Why)
//   other        — no leading interrogative (statements, fragments)
type QuestionClass = 'procedural' | 'descriptive' | 'reasoning' | 'other';
function classifyQuestion(s: string): QuestionClass {
    const t = s.toLowerCase().trim();
    if (/^why\b/.test(t)) return 'reasoning';
    // "How many / how much" are quantitative — closer to descriptive than procedural.
    if (/^how\s+(many|much)\b/.test(t)) return 'descriptive';
    if (/^(how|can|could|do|does|will|would|should|may|are|is|am)\b/.test(t)) return 'procedural';
    if (/^(what|which|where|who|whose|when)\b/.test(t)) return 'descriptive';
    return 'other';
}

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

    // Token overlap alone cannot always distinguish FAQs that share the same
    // meaningful tokens (e.g. "Can I download my image?" vs "What format is the
    // downloaded image?" both reduce to download/imag). Use the query's question
    // shape (procedural / descriptive / reasoning) as a tiebreaker — a procedural
    // query like "How do I download" matches a procedural FAQ like "Can I download"
    // better than a descriptive FAQ like "What format...".
    const qClass = classifyQuestion(query);

    // First pass: score against question text only. On ties, prefer matching
    // question class; if classes also tie, preserve authored order (first-wins).
    let best: { faq: GuideMatchFAQ; score: number; hits: number; classMatch: boolean } | null = null;
    for (const faq of faqs) {
        const faqQTokenSet = new Set(tokenize(faq.q));
        const hits = qTokens.filter((t) => faqQTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        const classMatch = classifyQuestion(faq.q) === qClass;
        if (!best || score > best.score || (score === best.score && classMatch && !best.classMatch))
            best = { faq, score, hits, classMatch };
    }
    if (best && best.score >= 0.35 && !(qTokens.length > 1 && best.hits < 2)) return best.faq;

    // Second pass: score against combined question + answer text. Same class-match
    // tiebreaker. Class is still computed against the FAQ question (not the answer)
    // because the question's shape is what reflects the FAQ's intent.
    best = null;
    for (const faq of faqs) {
        const faqTokenSet = new Set(tokenize(`${faq.q} ${faq.a}`));
        const hits = qTokens.filter((t) => faqTokenSet.has(t)).length;
        const score = hits / qTokens.length;
        const classMatch = classifyQuestion(faq.q) === qClass;
        if (!best || score > best.score || (score === best.score && classMatch && !best.classMatch))
            best = { faq, score, hits, classMatch };
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

    // Orphan-token check uses the FULL corpus (label + intro + prompt + tips + cautions)
    // to recognise all known vocabulary for this tool. Tips/cautions are kept here so
    // a query word that appears only in those sections is still considered "known".
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

    // Token scoring uses only intent-bearing text: label + intro + examplePrompt.
    // Tips and cautions are excluded because they describe execution details
    // ("Make sure to...", "Be careful when...") and contain generic words that
    // pollute scoring without describing what the use case is about. They remain
    // in the orphan-check corpus above so their vocabulary is still recognised.
    // On ties, prefer the use case with the shorter label (more focused intent).
    let best: { uc: T; score: number; hits: number; labelLen: number } | null = null;
    for (const uc of useCases) {
        if (!uc.gettingStarted) continue;
        const gs = uc.gettingStarted;
        const ucTokenSet = new Set(tokenize([uc.label, gs.intro, gs.examplePrompt].join(' ')));
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
