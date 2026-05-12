import { describe, expect, it } from 'vitest';
import { splitGuideTextLinks } from './guideLinks';

describe('guide link splitting', () => {
    it('links explicit http and https URLs', () => {
        expect(splitGuideTextLinks('Try https://factcheck.org or http://example.com/test.')).toEqual([
            { type: 'text', text: 'Try ' },
            { type: 'link', text: 'https://factcheck.org', href: 'https://factcheck.org' },
            { type: 'text', text: ' or ' },
            { type: 'link', text: 'http://example.com/test.', href: 'http://example.com/test.' },
        ]);
    });

    it('does not link bare domains or AI-themed phrases', () => {
        expect(splitGuideTextLinks('Try factcheck.org, not social.ai as plain text.')).toEqual([
            { type: 'text', text: 'Try factcheck.org, not social.ai as plain text.' },
        ]);
    });
});
