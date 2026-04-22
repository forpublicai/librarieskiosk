/**
 * Shared helpers for mapping library names to URL / env-var slugs.
 *
 * The slug rule matches what is used for per-library NanoGPT keys
 * (see src/lib/nanogpt.ts): uppercase the name, collapse runs of
 * non-alphanumeric characters to a single `_`, and trim leading/trailing `_`.
 *
 *   "Pottsboro, TX"  -> "POTTSBORO_TX"
 *   "Salem City, UT" -> "SALEM_CITY_UT"
 *   "Public AI"      -> "PUBLIC_AI"
 */

export function libraryNameToSlug(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

/** Lowercase variant used in URLs and the `kiosk_library` cookie value. */
export function libraryNameToUrlSlug(name: string): string {
    return libraryNameToSlug(name).toLowerCase();
}

/** Normalize an untrusted slug from URL / cookie into the canonical upper form. */
export function normalizeSlug(slug: string): string {
    return libraryNameToSlug(slug);
}

/** Per-library guest username derived from the library name. */
export function guestUsernameForLibrary(name: string): string {
    return `guest_${libraryNameToUrlSlug(name)}`;
}

/** Cookie name set by the `/l/[slug]` bootstrap route. */
export const KIOSK_LIBRARY_COOKIE = 'kiosk_library';
