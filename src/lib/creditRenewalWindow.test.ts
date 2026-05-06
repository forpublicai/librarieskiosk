import { describe, expect, it } from 'vitest';
import { getFixedWeeklyRenewalWindow } from './creditRenewalWindow';

function expectWindow(nowIso: string, currentIso: string, nextIso: string) {
    const window = getFixedWeeklyRenewalWindow(new Date(nowIso));
    expect(window.currentResetAt.toISOString()).toBe(currentIso);
    expect(window.nextResetAt.toISOString()).toBe(nextIso);
}

describe('getFixedWeeklyRenewalWindow', () => {
    it('uses the current Monday boundary exactly at Monday midnight during daylight time', () => {
        expectWindow(
            '2026-05-11T05:00:00.000Z',
            '2026-05-11T05:00:00.000Z',
            '2026-05-18T05:00:00.000Z'
        );
    });

    it('keeps Sunday 23:00 Central in the previous renewal window', () => {
        expectWindow(
            '2026-05-11T04:00:00.000Z',
            '2026-05-04T05:00:00.000Z',
            '2026-05-11T05:00:00.000Z'
        );
    });

    it('handles the spring-forward week when the next Monday is in daylight time', () => {
        expectWindow(
            '2026-03-08T12:00:00.000Z',
            '2026-03-02T06:00:00.000Z',
            '2026-03-09T05:00:00.000Z'
        );
    });

    it('handles the fall-back week when the next Monday is in standard time', () => {
        expectWindow(
            '2026-11-01T12:00:00.000Z',
            '2026-10-26T05:00:00.000Z',
            '2026-11-02T06:00:00.000Z'
        );
    });

    it('does not advance during the standard-time cron guard run before local midnight', () => {
        expectWindow(
            '2026-01-12T05:00:00.000Z',
            '2026-01-05T06:00:00.000Z',
            '2026-01-12T06:00:00.000Z'
        );
    });
});
