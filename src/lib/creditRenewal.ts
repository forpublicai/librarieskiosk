export function formatCreditRenewalTitle(renewAt: string | null | undefined, nowMs = Date.now()): string | undefined {
    if (!renewAt) return undefined;

    const renewDate = new Date(renewAt);
    if (Number.isNaN(renewDate.getTime())) return undefined;

    const minutes = Math.max(1, Math.ceil((renewDate.getTime() - nowMs) / (60 * 1000)));

    if (minutes >= 24 * 60) {
        const days = Math.ceil(minutes / (24 * 60));
        return `Renews in ${days} ${days === 1 ? 'day' : 'days'}`;
    }

    if (minutes >= 60) {
        const hours = Math.ceil(minutes / 60);
        return `Renews in ${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
    }

    return `Renews in ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
}
