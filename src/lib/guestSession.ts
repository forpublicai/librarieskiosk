const PREFIX = 'kiosk_guest_';

export function guestKey(suffix: string): string {
    return `${PREFIX}${suffix}`;
}

export function loadGuestState<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(guestKey(key));
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function saveGuestState<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(guestKey(key), JSON.stringify(value));
    } catch {
        /* ignore quota/serialization failures */
    }
}

export function clearGuestState(key: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(guestKey(key));
    } catch {
        /* ignore */
    }
}

export function clearAllGuestState(): void {
    if (typeof window === 'undefined') return;
    try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i += 1) {
            const k = window.sessionStorage.key(i);
            if (k && k.startsWith(PREFIX)) toRemove.push(k);
        }
        toRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
        /* ignore */
    }
}
