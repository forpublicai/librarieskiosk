const CREDIT_RENEWAL_TIME_ZONE = 'America/Chicago';

export type RenewalWindow = {
    currentResetAt: Date;
    nextResetAt: Date;
};

const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CREDIT_RENEWAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

function getChicagoParts(date: Date) {
    const parts = Object.fromEntries(
        chicagoFormatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)])
    );

    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
    };
}

function getChicagoOffsetMs(date: Date): number {
    const parts = getChicagoParts(date);
    const localAsUtcMs = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );

    return localAsUtcMs - date.getTime();
}

function chicagoLocalTimeToUtc(year: number, month: number, day: number): Date {
    const localAsUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
    let utcMs = localAsUtcMs;

    for (let i = 0; i < 3; i += 1) {
        const nextUtcMs = localAsUtcMs - getChicagoOffsetMs(new Date(utcMs));
        if (nextUtcMs === utcMs) break;
        utcMs = nextUtcMs;
    }

    return new Date(utcMs);
}

function utcDatePartsFromLocalDateOffset(year: number, month: number, day: number, dayOffset: number) {
    const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

export function getFixedWeeklyRenewalWindow(now = new Date()): RenewalWindow {
    const chicagoToday = getChicagoParts(now);
    const chicagoDateAsUtc = new Date(Date.UTC(
        chicagoToday.year,
        chicagoToday.month - 1,
        chicagoToday.day
    ));
    const dayOfWeek = chicagoDateAsUtc.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const currentResetDate = utcDatePartsFromLocalDateOffset(
        chicagoToday.year,
        chicagoToday.month,
        chicagoToday.day,
        -daysSinceMonday
    );
    const nextResetDate = utcDatePartsFromLocalDateOffset(
        currentResetDate.year,
        currentResetDate.month,
        currentResetDate.day,
        7
    );

    return {
        currentResetAt: chicagoLocalTimeToUtc(
            currentResetDate.year,
            currentResetDate.month,
            currentResetDate.day
        ),
        nextResetAt: chicagoLocalTimeToUtc(
            nextResetDate.year,
            nextResetDate.month,
            nextResetDate.day
        ),
    };
}

export function nextFixedWeeklyRenewAt(now = new Date()): Date {
    return getFixedWeeklyRenewalWindow(now).nextResetAt;
}
