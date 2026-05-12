import { describe, expect, it } from 'vitest';
import imageGuide from '@/config/guide/image.json';
import { fuzzyMatch, fuzzyMatchUseCase, splitIntoBubbles } from './guideMatch';

const imageFaqs = [
    ...imageGuide.faqs.concept,
    ...imageGuide.faqs.practical,
    ...imageGuide.faqs.criticalUse,
];

describe('guide fuzzy matching', () => {
    it('matches JPEG definition questions to the JPEG FAQ', () => {
        expect(fuzzyMatch("I don't know what a JPEG is", imageFaqs)?.q).toBe('What is a JPEG file?');
        expect(fuzzyMatch('JPEG means?', imageFaqs)?.q).toBe('What is a JPEG file?');
    });

    it('returns null when the query has orphan tokens outside the static corpus', () => {
        expect(fuzzyMatch('Is PNG the same as JPEG?', imageFaqs)).toBeNull();
    });

    it('matches download questions to the download FAQ', () => {
        expect(fuzzyMatch('How do I download my image?', imageFaqs)?.q).toBe(
            'Can I download or save my generated image?'
        );
    });

    it('requires two overlapping use-case tokens for multi-token queries', () => {
        expect(fuzzyMatchUseCase('business product photo', imageGuide.useCases)?.label).toBe(
            'Generate product photos or promotional visuals for your small business'
        );
        expect(fuzzyMatchUseCase('image aardvark', imageGuide.useCases)).toBeNull();
    });

    it('splits paragraph-style answers into non-empty bubbles', () => {
        expect(splitIntoBubbles('One.\n\nTwo.\n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
    });
});
