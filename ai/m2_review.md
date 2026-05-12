# M2 Review & Remediation Plan — Interactive Learning Guide + UX polish

Companion to [ai/PLAN_M2.md](PLAN_M2.md). This document captures the issues found while reviewing the work landed on `arpita-explore` and lays out a concrete plan to fix each one. Phased so a future executor can do the high-priority work in one pass.

Reviewer scope: read the diff and the code on disk. No browser-side verification was done; the §"AI VALIDATION RESULTS" in PLAN_M2.md is taken at face value.

This document was peer-reviewed after a first draft; corrections from that review have been folded in. Notable changes from the first draft: the rate-limit design now accounts for guests not having `ActiveSession` rows and explicitly chooses per-auth-session semantics; the download lock-down covers both proxy routes (and fixes a latent `music/*` MIME bug) including redirects; the ThemeToggle fix respects the existing public/auth chrome split; the tier-key fix separates shared guest accounts from patron accounts; the URL_RE fix updates the JSON content in the same pass; tool allowlisting is promoted to Phase 1 because the value is interpolated into the system prompt.

## Overall verdict

The milestone delivers what it set out to deliver. Static-first guide content with a live-model backstop, a forced-attachment R2 download path, per-tool coachmarks, header-mounted theme toggle, R2 retry wrapper. LEARNINGS.md additions (two-pass fuzzy match, orphan-token detection, ≥2-token use-case guard) are durable wisdom worth keeping.

Four observable correctness/safety problems make it through to production:
1. The live rate-limit's stated UX ("you've used your live questions for this session") isn't enforceable on Vercel.
2. ThemeToggle is gone from every page without a generation Header.
3. Both download proxies accept arbitrary HTTPS hosts; the patron proxy additionally uses an invalid `music/*` MIME glob that bricks the music download fallback path.
4. `tool` is untrusted input interpolated into the live-guide system prompt with no allowlist.

Beyond those: a pile of redundancy / KISS debt around guide constants, fuzzy-match locality, and CSS that doesn't theme.

Plan itself is *retrospective* (acknowledged) — that's fine for documenting work already done, but it means the §"AI VALIDATION RESULTS" section mixes genuine verification with statements that just describe code shape. For M3, draft before implementing so the Claude-review loop from [ai/PLAN.md](PLAN.md) can do its job.

---

## Execution plan

The fixes are split into three phases. Phase 1 should land before M3 begins; Phase 2 should land during M3's hardening pass; Phase 3 is opportunistic.

| Phase | Theme | Items |
|------:|-------|------:|
| 1 | Correctness / safety blockers | 1, 2, 3, 4 |
| 2 | Quality + KISS debt | 5, 6, 7, 8, 9, 10, 11 |
| 3 | Polish | 12, 13, 14, 15, 16 |

Each fix below has: **Problem**, **Location**, **Fix**, **Validation**.

---

## Phase 1 — Blockers

### Fix 1. Make the live-question rate limit actually enforceable

**Problem.** Two failure modes:

- Guests are tracked in an in-memory `Map<jti, count>` at module scope ([src/app/api/guide/route.ts:64](../src/app/api/guide/route.ts)). On Vercel, requests from the same kiosk routinely land on different lambdas, so a guest can exceed the 5-exchange cap by simply being unlucky (or determined). The map is also never pruned and will leak memory in a long-running container.
- Patrons are counted via `UsageLog.count({ where: { mode: 'guide', createdAt: { gt: lastLoginAt } } })` ([route.ts:93-110](../src/app/api/guide/route.ts)). This is durable across lambda restarts, but it is still the wrong source of truth: it adds a DB roundtrip per call, repurposes `UsageLog` (billing/visibility) as a quota table, and is non-atomic under concurrent requests.

Scope decision: keep the UX promise literal. The cap is **per auth session**, so signing out and back in starts a new guide quota. If product wants a re-login-proof "per kiosk visit" cap later, use a separate server-issued guide-session cookie or a fixed user/time-window key. Do not silently claim both semantics.

**Important constraint discovered during peer review.** `ActiveSession` is patron-only. Per [src/lib/auth.ts:76](../src/lib/auth.ts), `requireActiveSession` bypasses non-PATRON roles entirely, and [src/app/api/auth/guest/route.ts](../src/app/api/auth/guest/route.ts) does not create an `ActiveSession` row for guests. So a "store the counter on ActiveSession" design — which my first draft proposed — does not cover guests at all.

**Location.**
- [src/app/api/guide/route.ts](../src/app/api/guide/route.ts) lines 53–116 (counter, recordGuestExchange, getExchangeCount).
- [prisma/schema.prisma](../prisma/schema.prisma) — new model.

**Fix.** New dedicated model keyed by JWT `jti`, used for both patrons and guests. This deliberately implements the per-auth-session scope above:

```prisma
model GuideExchange {
  jti       String   @id
  userId    String
  role      Role     // informational; useful for analytics/debugging
  count     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([updatedAt])
}
```

Rate-limit flow inside `POST /api/guide`:

1. **Reserve the slot before calling the model**, with this exact create-then-guarded-increment flow:
   ```ts
   const jti = authResult.user.jti;
   if (!jti) {
       return NextResponse.json({ error: 'Session expired' }, { status: 401 });
   }

   await prisma.guideExchange.createMany({
       data: { jti, userId, role, count: 0 },
       skipDuplicates: true,
   });

   const claim = await prisma.guideExchange.updateMany({
       where: { jti, count: { lt: MAX_LIVE_EXCHANGES_PER_SESSION } },
       data: { count: { increment: 1 } },
   });

   const quota = await prisma.guideExchange.findUnique({
       where: { jti },
       select: { count: true },
   });

   if (claim.count === 0) {
       const exchangesUsed = quota?.count ?? MAX_LIVE_EXCHANGES_PER_SESSION;
       return NextResponse.json({
           response: LIBRARIAN_REDIRECT,
           exchangesUsed,
           exchangesLimit: MAX_LIVE_EXCHANGES_PER_SESSION,
           limitReached: true,
       });
   }
   ```
   Do **not** use `upsert` with an unconditional increment; that creates an exceed-by-one implementation and makes the plan ambiguous. The atomic claim is the `updateMany` count. This is the same pattern as `lib/credits.ts deductCredits` and `lib/mediaPersistence.ts finalizeVideoUpload` (see LEARNINGS.md §"Atomic claim via `updateMany"`).
2. **Provider failure semantics**: leave the reservation counted if NanoGPT was called and then failed. The request consumed provider-side opportunity/cost, and decrementing creates another race surface. If a future product decision says only successful answers count, document that separately and decrement in the catch block with a floor guard.
3. **Pruning**: a daily cron-or-lazy GC pass deleting rows where `updatedAt < now - 24h`. Lazy variant: piggyback on the existing `ActiveSession` cleanup that runs on login (LEARNINGS.md §"Lazy GC beats cron jobs for soft expiry"). Doesn't have to be precise — JWTs themselves expire in 8h so 24h is plenty of headroom.

Drop `guestExchanges` Map, `recordGuestExchange`, and the patron `UsageLog.count` query. The patron `UsageLog` row with `mode: 'guide'`, `creditsUsed: 0` can stay for visibility, but it's no longer the rate-limit source.

**Validation.**
- Unit test (Vitest): mock `prisma.guideExchange.updateMany` and assert the route returns `limitReached: true` when the guarded update reports 0.
- Integration: hit `/api/guide` 6 times with the same JWT across simulated lambda restarts (kill + restart `npm run dev` between calls). The 6th must bounce regardless of which lambda serves it.
- Sign out and sign back in, then ask again: quota resets because this plan intentionally scopes the cap to the auth session. If that behavior is not desired, change the keying strategy before implementation.
- Confirm UsageLog still gets `mode: 'guide'` rows for patrons (visibility only).
- Confirm no model call is made when limit is reached (DevTools Network, or a NanoGPT mock counting hits).

---

### Fix 2. Restore ThemeToggle on pages without a generation Header

**Problem.** Layout-level `<ThemeToggle />` was removed ([src/app/layout.tsx](../src/app/layout.tsx)) and the only render site is now inside `Header` ([Header.tsx:49](../src/components/Header.tsx)). `Header` returns `null` when there's no `user`, so logged-out pages have no toggle. The following pages currently have no toggle reachable:

- `/` (login) — pre-auth, no chrome
- `/signup`, `/forgot-password` — pre-auth, no chrome
- `/dashboard` — auth, has its own page layout, not `Header`
- `/getting-started`, `/resources`, `/faqs` — **public info pages with their own `info-topbar` chrome** (confirmed by `grep -l info-topbar src/app/**/*.tsx`). Wrapping them in `Header` would render nothing for logged-out users and duplicate chrome for logged-in users.

PLAN_M2.md §"Locked user decisions" #6 ("Theme toggle lives in the header") does not address pages that aren't generation pages. This is the gap.

**Location.**
- [src/app/layout.tsx](../src/app/layout.tsx)
- [src/app/getting-started/page.tsx](../src/app/getting-started/page.tsx), [src/app/resources/page.tsx](../src/app/resources/page.tsx), [src/app/faqs/page.tsx](../src/app/faqs/page.tsx) — `.info-topbar` chrome
- [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx) — has its own page-level header
- [src/app/page.tsx](../src/app/page.tsx), [src/app/signup/page.tsx](../src/app/signup/page.tsx), [src/app/forgot-password/page.tsx](../src/app/forgot-password/page.tsx) — pre-auth screens

**Fix.** Match the existing chrome per page family:

1. **Info pages (`info-topbar`)**: add `<ThemeToggle />` to the topbar JSX. Place it after the "Back to Sign In" link, with the same compact 32×32 styling used in `Header`.
2. **Dashboard**: it already has a header region (with logout and credit display per its existing structure). Add `<ThemeToggle />` next to the existing actions.
3. **Pre-auth screens** (`/`, `/signup`, `/forgot-password`): no chrome to add to. Add a small floating toggle, either by introducing a `<ThemeToggle floating />` variant or by placing a fixed-position container in each page. A single shared component (e.g. `<FloatingThemeToggle />`) is simplest.

This avoids the first-draft mistake of conflating "no Header" with "no chrome." Four pages have existing chrome (dashboard + three info pages); three don't. The fix differs.

**Validation.**
- Manually visit every page logged-out and logged-in (different roles). Toggle reachable in both states on all pages.
- Run `npm run lint` + `npx tsc --noEmit`.
- Confirm dark/light is sticky across navigations from each entry point.

---

### Fix 3. Lock down both download proxies, and fix the patron `music/*` bug

**Problem.** Two distinct issues live in the download paths:

1. **Both proxies accept any HTTPS host.** PLAN_M2.md §"Locked user decisions" #15 says the proxy is "fallback-only," but only client behavior keeps it that way:
   - Guest proxy [src/app/api/media-sessions/download/proxy/route.ts:44](../src/app/api/media-sessions/download/proxy/route.ts) accepts any URL; when `mode` is omitted, the MIME allowlist is bypassed too.
   - Patron proxy [src/app/api/media-sessions/[id]/download/route.ts:89](../src/app/api/media-sessions/[id]/download/route.ts) fetches `resultUrl ?? sourceProviderUrl` straight from the DB. While that field was written by the kiosk during a successful generation, a future code change could let it be set from a less-trusted source.
2. **Patron proxy uses an invalid MIME glob for music.** Line 89 builds `\`${mode}/*\`` for the expected mime — but `mode === 'music'` produces `music/*`, which doesn't match any real audio Content-Type. The guest proxy ([proxy/route.ts:61-65](../src/app/api/media-sessions/download/proxy/route.ts)) correctly maps `music → audio/*`. So today, every patron music download that falls back to the proxy path (i.e. the R2 upload failed for that row) will fail at `safeFetchBuffer` with a content-type mismatch. This is a latent correctness bug, not just a hardening item.

**Location.**
- [src/app/api/media-sessions/[id]/download/route.ts:89](../src/app/api/media-sessions/[id]/download/route.ts)
- [src/app/api/media-sessions/download/proxy/route.ts:60-65](../src/app/api/media-sessions/download/proxy/route.ts)
- [src/lib/storage.ts](../src/lib/storage.ts) — natural home for the new helpers.

**Fix.**

1. **Shared `mimeGlobForMode()` helper in `lib/storage.ts`**:
   ```ts
   export function mimeGlobForMode(mode: MediaMode): string {
       return mode === 'image' ? 'image/*' : mode === 'music' ? 'audio/*' : 'video/*';
   }
   ```
   Replace `\`${mode}/*\`` in the patron route with `mimeGlobForMode(mode)`. Replace the inline ternary in the guest proxy with the same helper.

2. **Hostname allowlist enforced inside the fetch helper, including redirects.** Add the env read in `lib/env.ts` (or a new `lib/downloadProxy.ts`):
   ```ts
   export function getDownloadProxyAllowedHosts(): Set<string> {
       const raw = process.env.DOWNLOAD_PROXY_ALLOWED_HOSTS;
       if (!raw) throw new Error('DOWNLOAD_PROXY_ALLOWED_HOSTS is required for proxied downloads');
       return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
   }
   ```
   Then thread it into storage as an option:
   ```ts
   fetchBytesFromUrl(url, expectedMimeGlob, { allowedHosts });
   ```
   `safeFetchBuffer` must check `allowedHosts` after parsing the original URL **and again after resolving every redirect target**. A check only in the route is insufficient because an allowlisted provider URL can redirect to an unallowlisted CDN or attacker-controlled host before `safeFetchBuffer` reads the body.

   Deployment note: no silent empty default. An unset allowlist should fail closed with a clear 500/config error in proxy paths. `.env.example` documents the var, and the deploy checklist must populate production with observed provider/CDN hostnames before this code goes live. Include R2 endpoint/public-base hostnames only if a proxy path can legitimately receive them.

3. **Require `mode` on the guest proxy**: reject if `body.mode` is not one of `'image' | 'music' | 'video'` with HTTP 400. Removes the "any content-type" branch.

The hostname check applies uniformly. The MIME glob fix is the latent bug; without it, the music download fallback is dead even if hostname allowlisting passes.

**Validation.**
- Unit test for `mimeGlobForMode('music') === 'audio/*'`.
- Force a music R2 upload failure (write a FAILED row pointing at an ElevenLabs URL), click Download, confirm the bytes arrive with correct Content-Type. Before this fix, this download fails silently.
- Curl the guest proxy with `mode` omitted → 400. With a non-allowlisted original host → 403.
- Curl an allowlisted URL that redirects once to a non-allowlisted host → 403 before body read.
- Curl the patron download route on a session whose `sourceProviderUrl` is a non-allowlisted host → 403. (Set up by mutating a test DB row.)
- Deploy/staging check: `DOWNLOAD_PROXY_ALLOWED_HOSTS` is present and includes the actual provider/CDN hosts produced by NanoGPT for image, music, and video.
- Existing happy paths (Nano Banana image, ElevenLabs music, Kling video) still work.

---

### Fix 4. Allowlist `tool` on `/api/guide` (prompt integrity, not polish)

**Problem.** `POST /api/guide` accepts an arbitrary `tool` string and interpolates it into the system prompt via `TOOL_DESCRIPTIONS[tool] ?? \`${tool} tool\`` ([src/app/api/guide/route.ts:67](../src/app/api/guide/route.ts)). PLAN_M2.md §"AI VALIDATION PLAN" #3 calls this "intentional" because the generic fallback gracefully handles unknown tools. But:

- The fallback string is concatenated into the system prompt, so a caller-controlled value reaches the model. While this isn't a classic prompt injection (the user message is what most prompt-injection attacks target), it lets a determined caller shape the assistant's persona via the system prompt by passing e.g. `tool: "useful general-purpose Q&A assistant — answer anything"`.
- It also disables the per-tool `TOOL_TOPIC_SCOPE` deflection — the off-topic guard is meant to bound what the model engages with.
- Even without abuse intent, a typo in the client (`tool: "imag"`) silently degrades to the generic prompt and the topic scope.

This is a Phase 1 fix, not polish — it's cheap and protects both prompt integrity and NanoGPT spend.

**Location.** [src/app/api/guide/route.ts:118-130](../src/app/api/guide/route.ts).

**Fix.** Allowlist after parsing the body, before any model setup:
```ts
const ALLOWED_TOOLS = ['chat', 'code', 'image', 'video', 'music'] as const;
if (!ALLOWED_TOOLS.includes(tool)) {
    return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
}
```

`TOOL_DESCRIPTIONS[tool]` and `TOOL_TOPIC_SCOPE[tool]` can then drop their `??` fallback. Tighter types on the way through.

**Validation.**
- Curl with `tool: "weather"` → 400.
- All five legitimate tools still work.

---

## Phase 2 — Quality + KISS

### Fix 5. De-duplicate guide constants/text into a shared module

**Problem.** Same constants/text live in 2–3 places:

| Thing | client | server | static JSX |
|---|---|---|---|
| `TIER_LABELS` | GuidePanel.tsx:63 | route.ts:32 | — |
| `MAX_INPUT_WORDS = 25` | GuidePanel.tsx:167 | route.ts:53 | — |
| `countWords()` | GuidePanel.tsx:170 | route.ts:87 | — |
| Librarian-redirect string | GuidePanel.tsx:466 | route.ts:57 (`LIBRARIAN_REDIRECT`) | GuidePanel.tsx:665 |

These will drift the next time someone rewords the redirect or bumps the word cap.

**Location.**
- [src/components/GuidePanel.tsx](../src/components/GuidePanel.tsx)
- [src/app/api/guide/route.ts](../src/app/api/guide/route.ts)

**Fix.** Extract `src/lib/guideConstants.ts` (no `'server-only'` import — must be safe in client bundles):

```ts
export const MAX_INPUT_WORDS = 25;
export const MAX_LIVE_EXCHANGES_PER_SESSION = 5;
export const LIBRARIAN_REDIRECT = "You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian.";

export type Tier = 1 | 2 | 3;
export const TIER_LABELS: Record<Tier, string> = { ... };
export const TIER_SHORT_LABELS: Record<Tier, string> = { ... };

export function countWords(s: string): number { ... }
```

`TIER_GUIDANCE`, `TIER_CAPS`, `TOOL_DESCRIPTIONS`, `TOOL_TOPIC_SCOPE` move to `src/lib/guidePrompt.ts` with `'server-only'` — they only matter to `/api/guide` and grouping the prompt-construction logic is cheap.

Both files import from these new modules.

**Validation.**
- `npm run lint` + `npx tsc --noEmit`.
- Grep for the redirect string — should appear exactly once outside `guideConstants.ts`. (The guide-limit-banner JSX in GuidePanel can be replaced with `{LIBRARIAN_REDIRECT}`.)

---

### Fix 6. Scope guide-tier persistence per user/session without leaking between kiosk users

**Problem.** [GuidePanel.tsx:61](../src/components/GuidePanel.tsx) `const TIER_LS_KEY = 'guide_tier'` — single global key, never cleared on logout. On a shared kiosk, Patron B inherits Patron A's tier. CoachmarkTour already keys by username; tier should too.

**Correction from first draft.** I previously suggested `sessionStorage` as the cleanest fix. That's incomplete: [src/components/AuthProvider.tsx:59-62](../src/components/AuthProvider.tsx) clears `kiosk_token` and guest state on logout but does **not** clear `sessionStorage` (which would also nuke the guest-state hydration on the same tab). `sessionStorage` survives logout-followed-by-second-patron-login in the same tab, which is exactly the kiosk scenario.

**Location.** [src/components/GuidePanel.tsx:61, 249, 289, 475](../src/components/GuidePanel.tsx); [src/components/AuthProvider.tsx:59-62](../src/components/AuthProvider.tsx).

**Fix.** Use an explicit keying helper; do not keep the global `guide_tier` key:

```ts
function guideTierKey(user: User | null, token: string | null): string {
    if (!user) return 'guide_tier_anon';
    if (user.role === 'GUEST') return `guide_tier_guest_${token?.slice(-12) ?? 'anon'}`;
    return `guide_tier_user_${user.id}`;
}
```

Why this split:
- Patrons/admins get durable per-account persistence across visits, without Patron B inheriting Patron A's tier.
- Guests must **not** key by username, because guest accounts are shared per library (`guest_pottsboro_tx`, etc.). Use a token fragment so a new guest login gets a fresh wizard.

Logout behavior:
- Remove the legacy unscoped `guide_tier` key during logout or first guide mount.
- For guests, remove the current `guide_tier_guest_<token-fragment>` key on logout to avoid localStorage accumulation.
- For patrons/admins, do **not** remove `guide_tier_user_<id>` on normal logout if the intended behavior is per-account persistence. If product wants per-visit behavior instead, use the token-fragment key for all roles and say so.

**Validation.**
- Sign in as patron A, pick Tier 1, sign out, sign in as patron B → B sees the wizard or B's own saved tier, never A's.
- Sign back in as patron A → A's tier is still remembered (per-account persistence).
- Continue as guest, pick a tier, exit, continue as guest again → wizard appears because the token-fragment key changed or was cleared.

---

### Fix 7. Resolve plan/code mismatch on Tier 3 `max_tokens`

**Problem.** PLAN_M2.md §"Locked user decisions" #12 (line 67) and §"Subsystem 3" (line 187) both say Tier 3 → 50 words / 65 tokens. Code at [src/app/api/guide/route.ts:50](../src/app/api/guide/route.ts) says `maxTokens: 70`. The comment in code claims "Multiplier ~1.4 token/word with a small headroom"; 50 × 1.4 = 70 (matches code). The plan number is off by 5.

**Location.**
- [ai/PLAN_M2.md](PLAN_M2.md) — two mentions of "65".
- [src/app/api/guide/route.ts:50](../src/app/api/guide/route.ts).

**Fix.** Update PLAN_M2.md to say 70 in both places. The code is correct (matches its own comment's rule).

**Validation.** `grep '65' ai/PLAN_M2.md` after edit returns no token-count matches.

---

### Fix 8. Extract URL_RE and fuzzy matchers to a tested lib module

**Problem.** `tokenize`, `normalizeQuery`, `fuzzyMatch`, `fuzzyMatchUseCase`, `FUZZY_STOP`, `URL_RE`, `renderText`, `splitIntoBubbles`, `countWords`, `MAX_INPUT_WORDS`, `SOFT_WARN_WORDS` all live in [GuidePanel.tsx](../src/components/GuidePanel.tsx). Almost none are React-specific. They can't be unit-tested where they are.

PLAN_M2.md §"Backlog" already names this for a *future* second surface — but testability for the current surface alone is enough reason to do it now.

**Location.** [src/components/GuidePanel.tsx:81-196](../src/components/GuidePanel.tsx).

**Fix.** New files:

- `src/lib/guideMatch.ts` — `FUZZY_STOP`, `tokenize`, `normalizeQuery`, `fuzzyMatch`, `fuzzyMatchUseCase`, `splitIntoBubbles`. Pure functions, no React imports.
- `src/lib/guideMatch.test.ts` — port the four manual checks from PLAN_M2.md §"AI VALIDATION PLAN" #4 as Vitest cases, plus a couple of orphan-token cases (e.g. "Is PNG the same as JPEG?" → null).

`renderText` (returns ReactNode) stays in GuidePanel.tsx or moves to its own component file. `URL_RE` moves with `renderText`; while moving, construct the regex inside the function body to drop the module-level mutable `lastIndex` state.

**Validation.**
- `npm run test` — new tests pass.
- The four PLAN_M2.md §"AI VALIDATION PLAN" #4 cases are now automated.

---

### Fix 9. Restrict `URL_RE` to safer matches AND update guide JSON to use explicit URLs

**Problem.** Two distinct issues with the regex, plus a content correction:

- TLD list `(org|com|edu|gov|net|io|ai)` misses common ones (`.us`, `.app`, `.co.uk`, `.gov.uk`) and over-matches `.ai` in an AI-themed app (any "social.ai"-style phrase becomes a link).
- The bare-word alternation has no leading `\b`, so it can match the tail of a longer word.

**Correction from first draft.** I previously claimed the JSON files all use explicit protocol-bearing URLs. That's wrong — `grep -n 'canva.com\|code.org\|factcheck.org'` shows three bare-domain references that today render as clickable links thanks to the bare-word alternation:

- [config/guide/chat.json:56](../config/guide/chat.json), [chat.json:202](../config/guide/chat.json): `factcheck.org` (×2)
- [config/guide/image.json:39](../config/guide/image.json): `canva.com`
- [config/guide/code.json:92](../config/guide/code.json): `code.org`

If the bare-word alternation is dropped, these become plain text. Either is acceptable as long as the content matches the regex's expectations.

**Location.** Wherever `URL_RE` ends up after Fix 8 (currently [GuidePanel.tsx:85](../src/components/GuidePanel.tsx)); plus the four JSON spots above.

**Fix.** Two changes in the same commit:

1. **Drop the bare-word alternation**:
   ```ts
   const URL_RE = /\bhttps?:\/\/[^\s,)]+/g;
   ```
2. **Update the four JSON sites** to use `https://factcheck.org`, `https://canva.com`, `https://code.org`. Keep the surrounding prose intact.

If preserving the casual "factcheck.org" style is preferred, the alternative is to ship a hand-tuned allowlist of bare hostnames rather than a TLD-based regex. That has lower ongoing cost (no JSON edits needed when new content lands) but more code. Either is fine; recommendation is the simpler "explicit protocol" rule.

**Validation.**
- Re-open each tool's guide and click through to the FAQs / use cases that mention the three domains. Confirm they render as clickable links (with the protocol included).
- Render a live-model response containing the substring "social.ai" — no spurious link.
- The new Vitest cases for `renderText` cover both explicit-protocol matching and the absence of bare-domain matching.

---

### Fix 10. Hardcoded indigo colors break theming

**Problem.** ~21 occurrences of `#6366f1`, `#a5b4fc`, `#c7d2fe`, `#818cf8`, `rgba(99, 102, 241, X)` in the new guide and coachmark styles in [src/app/globals.css](../src/app/globals.css). The rest of the kiosk uses CSS custom properties (`var(--accent-orange)` etc.). In light mode the indigo doesn't adapt and contrast against the panel background is poor.

**Location.** [src/app/globals.css](../src/app/globals.css) — guide-toggle, guide-copy, guide-link, cm-ring, cm-* sections.

**Fix.** Add indigo tokens to the theme block:

```css
:root {
  --accent-indigo: #6366f1;
  --accent-indigo-soft: rgba(99, 102, 241, 0.12);
  --accent-indigo-strong: #818cf8;
  --accent-indigo-text: #c7d2fe;
}
[data-theme="light"] {
  --accent-indigo: #4f46e5;
  --accent-indigo-soft: rgba(79, 70, 229, 0.10);
  --accent-indigo-strong: #4338ca;
  --accent-indigo-text: #312e81;
}
```

Replace the hardcoded values throughout. (Alternative: reuse `--accent-orange` for the guide too — single accent across the kiosk. Design call.)

**Validation.** Flip to light theme — guide panel, coachmark ring, copy-prompt block, learning-guide button stay legible.

---

### Fix 11. Switch `config/` imports to a path alias

**Problem.** Six API routes use `import modelConfig from '../../../../config/models.json'`:

- [src/app/api/chat/route.ts:8](../src/app/api/chat/route.ts)
- [src/app/api/code/route.ts:8](../src/app/api/code/route.ts)
- [src/app/api/guide/route.ts:9](../src/app/api/guide/route.ts)
- [src/app/api/image/route.ts:10](../src/app/api/image/route.ts)
- [src/app/api/music/route.ts:10](../src/app/api/music/route.ts)
- [src/app/api/video/route.ts:10](../src/app/api/video/route.ts)

AGENTS.md §"TypeScript / Next" is explicit: "Use the `@/...` alias … Never use long relative paths like `../../../../`." Current `tsconfig.json` only maps `@/* → ./src/*`, so `@/config/...` does not resolve — the alias change has to come with either moving `config/` into `src/` or adding a second mapping.

**Location.** [tsconfig.json:21-23](../tsconfig.json), plus all six route files above.

**Fix.** Two viable options:

**Path A: add a `@/config` alias.**
```jsonc
"paths": {
  "@/*": ["./src/*"],
  "@/config/*": ["./config/*"]
}
```
Update all six imports to `import modelConfig from '@/config/models.json'`. Cheapest change; keeps `config/` at the repo root.

**Path B: move `config/` under `src/config/`.**
Single alias keeps working; physical layout matches code. Has to also update the dynamic JSON imports in `GuidePanel.tsx` (`import('../../config/guide/...')` → `import('@/config/guide/...')`). Bigger change, but more conventional Next.js layout.

A is cheaper. B is cleaner long-term. Either resolves the AGENTS.md violation across all six routes at once.

**Validation.** `npm run build` clean. All six routes still resolve `modelConfig`. Dynamic guide JSON imports still split per-tool (verify in `npm run build` output).

---

## Phase 3 — Polish

### Fix 12. Replace non-null assertion on "other use case"

[GuidePanel.tsx:545](../src/components/GuidePanel.tsx):
```ts
onClick={() => handleUseCaseSelect(content.useCases.find(uc => !uc.gettingStarted)!)}
```
If a future JSON omits the "I have something else in mind" entry, this throws on click. Fix:
```ts
const other = content.useCases.find(uc => !uc.gettingStarted);
// ...
{other && <button ... onClick={() => handleUseCaseSelect(other)}>...</button>}
```

### Fix 13. Empty live response shouldn't silently leave the user hanging

[GuidePanel.tsx:416-425](../src/components/GuidePanel.tsx) — if `data.response` is empty or whitespace, `segments` is empty, the loop never runs, no message is pushed, but `setIsThinking(false)` runs. The user sees the typing dots disappear with no answer.

Fix: after `splitIntoBubbles`, if `segments.length === 0`, push the same error message the `catch` block uses ("I wasn't able to answer that right now…"). Also `console.error` the original failure in the catch block — currently `catch {}` discards `err`.

### Fix 14. Use the existing `add()` helper in `callLiveGuide`

[GuidePanel.tsx:402-433](../src/components/GuidePanel.tsx) reinvents the bot-bubble-with-delay choreography. Replace the manual `for` loop with `await add(...segments.map(s => ({ role: 'bot', content: s })))`. Drop ~10 lines and a footgun (manual `setIsThinking` toggling can desync if a future caller adds an early return).

### Fix 15. Smooth-scroll storm on multi-bubble responses

[GuidePanel.tsx:243](../src/components/GuidePanel.tsx) runs `scrollIntoView({behavior:'smooth'})` on every `messages` change. `add()` appends bot messages one by one with 500 ms gaps → N overlapping smooth-scrolls for an N-paragraph FAQ. Fix: change to `behavior: 'auto'` (instant snap), or debounce to once per `add()` call.

### Fix 16. Validate guide JSON shape at load time

[GuidePanel.tsx:212](../src/components/GuidePanel.tsx) casts `mod.default as GuideContent`. A malformed JSON (missing `faqs.criticalUse`) will crash on first FAQ click. Add a small runtime guard (hand-rolled shape check; no zod elsewhere in the repo yet):

```ts
function isGuideContent(x: unknown): x is GuideContent {
    // shallow shape check on whatIsIt, useCases, faqs.{concept,practical,criticalUse}
}
```

Crash on guard failure with a clear error in `console.error`; render a "Guide content failed to load" bot message instead of `return null;`.

---

## Items deferred (already in PLAN_M2.md backlog)

These are real but the plan already names them and they don't need to block M3:

- Multi-turn follow-up in the live guide.
- Analytics on FAQ-hit vs. live-model-hit ratios.
- Coachmark target rect doesn't reflow on scroll (kiosk pages currently fit on screen — no action needed today).
- AVIF on download for guests vs. patrons.
- Background reaper for `MediaSession.storageStatus = 'FAILED'`.
- Code page's nested layout containers.
- Fallback download extensions hardcoded in page components.

If any of these become user-visible problems, promote into a phase. The R2 retry wrapper in `lib/storage.ts` is fine as-is; the fallback download chain is the right model and doesn't need collapsing.

## Items I'd leave alone (KISS)

- The 690-line `GuidePanel.tsx` can be split, but the state machine + `renderOptions` layout reads cleanly top-to-bottom. After Fix 8 pulls out the fuzzy/match helpers, what's left is genuinely cohesive.
- Dynamic JSON imports per tool are a nice code-split — don't pre-bundle.
- Two-pass FAQ matcher + orphan-token check is a smart, simple approach. Don't replace with embeddings.
- `withRetry` in `lib/storage.ts` is focused and the transient-error classifier is solid. Don't generalize until a second call site demands it.

## Process: tighten the plan loop for M3

PLAN_M2.md is explicitly *retrospective*. That's a deviation from [ai/PLAN.md](PLAN.md) and from LEARNINGS.md §"Decision-complete plans only." For M3:

1. Draft the plan **before** the first commit.
2. Run the Claude-review loop from [ai/PLAN.md](PLAN.md) §"HOW TO EXECUTE A MILESTONE" step 3, iterating until reviewer feedback either lands or is pre-defended in the plan.
3. Fill §"AI VALIDATION RESULTS" with independent checks — not "I wrote this code and here's what it does."

The retrospective format is fine for documenting work that already shipped (as this M2 record does), but it should not become the default.

---

## Summary checklist

When a future executor picks this up:

**Phase 1 (blockers — land before M3 begins):**
- [ ] Fix 1 — Durable per-auth-session rate-limit counter via new `GuideExchange` model, **pre-call reserve** + atomic guarded increment, covers patrons + guests
- [ ] Fix 2 — `ThemeToggle` placed correctly per-page: info-topbar for the three info pages, dashboard's own header, floating variant for pre-auth screens
- [ ] Fix 3 — Redirect-safe hostname allowlist + required `mode` on **both** download routes; `mimeGlobForMode()` helper fixes the latent `music/*` MIME bug in the patron route
- [ ] Fix 4 — Allowlist `tool` on `/api/guide` (prompt integrity, cost control)

**Phase 2 (quality — land during M3's hardening pass):**
- [ ] Fix 5 — Extract `src/lib/guideConstants.ts` and `src/lib/guidePrompt.ts`
- [ ] Fix 6 — Per-account tier key for patrons/admins, token-scoped tier key for guests, legacy key cleanup
- [ ] Fix 7 — Reconcile plan/code mismatch on Tier 3 `max_tokens` (plan → 70)
- [ ] Fix 8 — Extract fuzzy matchers + Vitest tests to `src/lib/guideMatch.ts`
- [ ] Fix 9 — Restrict `URL_RE` **and** update three JSON files to use `https://` for `factcheck.org`, `canva.com`, `code.org`
- [ ] Fix 10 — Indigo CSS tokens that theme
- [ ] Fix 11 — Add `@/config` alias (or move `config/` under `src/`) and update all six route imports

**Phase 3 (polish — opportunistic):**
- [ ] Fix 12 — Remove non-null assertion on "other use case"
- [ ] Fix 13 — Handle empty live response + log caught errors
- [ ] Fix 14 — Use `add()` in `callLiveGuide`
- [ ] Fix 15 — Fix scroll storm on multi-bubble add
- [ ] Fix 16 — Runtime guard on guide JSON shape
