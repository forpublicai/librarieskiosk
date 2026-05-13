import { describe, expect, it } from 'vitest';
import imageGuide from '@/config/guide/image.json';
import chatGuide from '@/config/guide/chat.json';
import musicGuide from '@/config/guide/music.json';
import {
    fuzzyMatchFaqs,
    fuzzyMatchUseCase,
    splitIntoBubbles,
    tokenize,
    normalizeQuery,
} from './guideMatch';

// FAQs are flattened in the same criticalUse → practical → concept order as
// GuidePanel's allFaqs union, so test conditions reflect production matching.
const imageFaqs = [
    ...imageGuide.faqs.criticalUse,
    ...imageGuide.faqs.practical,
    ...imageGuide.faqs.concept,
];
const chatFaqs = [
    ...chatGuide.faqs.criticalUse,
    ...chatGuide.faqs.practical,
    ...chatGuide.faqs.concept,
];
const musicFaqs = [
    ...musicGuide.faqs.criticalUse,
    ...musicGuide.faqs.practical,
    ...musicGuide.faqs.concept,
];

describe('tokenize', () => {
    it('strips punctuation and stop words', () => {
        expect(tokenize('What is a prompt?')).toEqual(['prompt']);
    });

    it('keeps 2-character tokens like "AI"', () => {
        expect(tokenize('what is AI')).toEqual(['ai']);
    });

    it('splits hyphenated terms into separate tokens', () => {
        // "AI-generated" used to collapse to "aigenerated"; should now split.
        expect(tokenize('AI-generated image')).toEqual(['ai', 'generat', 'imag']);
    });

    it('breaks apostrophe contractions safely', () => {
        // "what's" → "what" (stop) + "s" (filtered for length) → all dropped.
        expect(tokenize("what's AI")).toEqual(['ai']);
    });
});

describe('stem (via tokenize)', () => {
    it('collapses write / writes / writing to a shared stem', () => {
        expect(tokenize('write')).toEqual(['writ']);
        expect(tokenize('writes')).toEqual(['writ']);
        expect(tokenize('writing')).toEqual(['writ']);
    });

    it('collapses all create forms', () => {
        expect(tokenize('create')).toEqual(['creat']);
        expect(tokenize('creates')).toEqual(['creat']);
        expect(tokenize('created')).toEqual(['creat']);
        expect(tokenize('creating')).toEqual(['creat']);
        expect(tokenize('creation')).toEqual(['creat']);
    });

    it('collapses download variants', () => {
        expect(tokenize('download')).toEqual(['download']);
        expect(tokenize('downloads')).toEqual(['download']);
        expect(tokenize('downloaded')).toEqual(['download']);
        expect(tokenize('downloading')).toEqual(['download']);
    });

    it('handles -ies → -y mutation', () => {
        expect(tokenize('tries')).toEqual(['try']);
        expect(tokenize('studies')).toEqual(['study']);
    });

    it('handles -ed with y-mutation', () => {
        expect(tokenize('tried')).toEqual(['try']);
    });

    it('does not over-stem short words', () => {
        expect(tokenize('thing')).toEqual(['thing']);
        expect(tokenize('being')).toEqual(['being']);
    });

    it('does not over-stem -ss endings', () => {
        expect(tokenize('business')).toEqual(['business']);
        expect(tokenize('process')).toEqual(['process']);
    });
});

describe('normalizeQuery', () => {
    it('strips "I don\'t know what" framing', () => {
        expect(normalizeQuery("I don't know what AI is")).toBe('AI is');
    });

    it('strips "how do I" framing so use-case verbs surface', () => {
        expect(normalizeQuery('How do I download my image?')).toBe('download my image?');
    });

    it('strips "best/easiest way to/of" patterns', () => {
        expect(normalizeQuery('best way of writing a resume')).toBe('writing a resume');
        expect(normalizeQuery('easiest way to make a video')).toBe('make a video');
    });

    it('strips "what is the best way to" patterns', () => {
        expect(normalizeQuery('what is the best way to write a resume')).toBe('write a resume');
        expect(normalizeQuery("what's the easiest way to make music")).toBe('make music');
    });
});

describe('fuzzyMatchFaqs — exact match', () => {
    it('returns the FAQ matching the query exactly, ignoring case and punctuation', () => {
        expect(fuzzyMatchFaqs('What is art style?', imageFaqs)?.q).toBe('What is art style?');
        expect(fuzzyMatchFaqs('what is art style', imageFaqs)?.q).toBe('What is art style?');
    });

    it('beats other FAQs that share tokens when the query is an exact question', () => {
        // Both "What is art style?" (concept) and "What art styles can I ask for?" (practical)
        // tokenize identically. Exact match must pick the verbatim one.
        expect(fuzzyMatchFaqs('what is art style', imageFaqs)?.q).toBe('What is art style?');
    });
});

describe('fuzzyMatchFaqs — definitional queries', () => {
    it('matches "what is AI" to the AI concept FAQ', () => {
        expect(fuzzyMatchFaqs('what is AI', imageFaqs)?.q).toBe('What is AI?');
    });

    it('handles "what\'s" contractions', () => {
        expect(fuzzyMatchFaqs("what's AI", imageFaqs)?.q).toBe('What is AI?');
    });

    it('routes to live model when no FAQ question contains all query tokens', () => {
        // No music FAQ question has both "music" and "style" — answer-text bleed
        // used to match this incorrectly to a criticalUse FAQ.
        expect(fuzzyMatchFaqs('what is music style', musicFaqs)).toBeNull();
    });
});

describe('fuzzyMatchFaqs — regular queries', () => {
    it('matches "How do I download my image?" to the procedural download FAQ', () => {
        // Both "Can I download or save my generated image?" (procedural) and
        // "What file format is the downloaded image?" (descriptive) tokenize
        // identically (download, imag). The procedural query should match the
        // procedural FAQ via question-class tiebreaker.
        expect(fuzzyMatchFaqs('How do I download my image?', imageFaqs)?.q).toBe(
            'Can I download or save my generated image?'
        );
    });

    it('matches verb-form variants via stemming', () => {
        // "downloading" → stem → "download" → matches.
        // Query class is "other" (no leading interrogative); falls through to author order.
        expect(fuzzyMatchFaqs('downloading my image', imageFaqs)?.q).toBe(
            'Can I download or save my generated image?'
        );
    });

    it('routes procedural queries to procedural FAQs over descriptive ones on ties', () => {
        // Same disambiguation principle as above, phrased differently.
        // "Can I save my picture?" — procedural → expect Can/How-style FAQ to win
        // (this is a directionally illustrative case; exact matching depends on corpus.)
        const result = fuzzyMatchFaqs('How do I save my generated image?', imageFaqs);
        expect(result?.q).toBe('Can I download or save my generated image?');
    });

    it('returns null when the query contains orphan tokens', () => {
        // "aardvark" is not in any image FAQ corpus.
        expect(fuzzyMatchFaqs('image aardvark question', imageFaqs)).toBeNull();
    });
});

describe('fuzzyMatchUseCase — basic matching', () => {
    it('matches multi-token use-case queries to the right use case', () => {
        expect(fuzzyMatchUseCase('business product photo', imageGuide.useCases)?.label).toBe(
            'Generate product photos or promotional visuals for your small business'
        );
    });

    it('returns null for orphan-token queries', () => {
        expect(fuzzyMatchUseCase('image aardvark', imageGuide.useCases)).toBeNull();
    });
});

describe('fuzzyMatchUseCase — definitional guard', () => {
    it('blocks pure definitional queries from use-case matching', () => {
        // "what is product photography" is conceptual, not a use-case intent.
        expect(fuzzyMatchUseCase('what is product photography', imageGuide.useCases)).toBeNull();
    });

    it('allows "what is the best way to X" to reach the use-case matcher', () => {
        // Carve-out: "best way to" is a how-to intent in disguise.
        const result = fuzzyMatchUseCase(
            'what is the best way to write a resume',
            chatGuide.useCases
        );
        expect(result?.label).toBe('Write or improve a resume, cover letter, or job application');
    });

    it('allows standalone "best way of X" to reach the use-case matcher', () => {
        const result = fuzzyMatchUseCase('best way of writing a resume', chatGuide.useCases);
        expect(result?.label).toBe('Write or improve a resume, cover letter, or job application');
    });
});

describe('splitIntoBubbles', () => {
    it('splits paragraph-style answers into non-empty bubbles', () => {
        expect(splitIntoBubbles('One.\n\nTwo.\n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
    });
});
