import { describe, expect, it } from 'vitest';
import { guideTierKey, normalizeGuideTier } from './guideConstants';

describe('guide constants helpers', () => {
    it('normalizes unknown guide tiers to Tier 2', () => {
        expect(normalizeGuideTier(1)).toBe(1);
        expect(normalizeGuideTier('3')).toBe(3);
        expect(normalizeGuideTier('advanced')).toBe(2);
    });

    it('scopes guide tier storage by account for users and token for guests', () => {
        expect(guideTierKey(null, null)).toBe('guide_tier_anon');
        expect(guideTierKey({ id: 'patron_1', role: 'PATRON' }, 'token')).toBe('guide_tier_user_patron_1');
        expect(guideTierKey({ id: 'guest_1', role: 'GUEST' }, 'abcdefghijklmnopqrstuvwxyz')).toBe(
            'guide_tier_guest_opqrstuvwxyz'
        );
    });
});
