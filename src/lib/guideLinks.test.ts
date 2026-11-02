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

    it('links bare .com/.org/.net/.edu/.gov domains with an https href', () => {
        expect(splitGuideTextLinks('Try factcheck.org, or usa.gov/help.')).toEqual([
            { type: 'text', text: 'Try ' },
            { type: 'link', text: 'factcheck.org', href: 'https://factcheck.org' },
            { type: 'text', text: ', or ' },
            { type: 'link', text: 'usa.gov/help.', href: 'https://usa.gov/help.' },
        ]);
    });

    it('does not link other bare domains or AI-themed phrases', () => {
        expect(splitGuideTextLinks('Not social.ai or chat.io as plain text.')).toEqual([
            { type: 'text', text: 'Not social.ai or chat.io as plain text.' },
        ]);
    });
});
