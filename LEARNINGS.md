# Learnings

`LEARNINGS.md` is for durable engineering wisdom that should survive refactors and apply across the platform. Use the **scope ladder** when deciding where a new insight should live:

- **Repo-wide and durable** (works across apps/repos): put it in `LEARNINGS.md`.
- **App-specific architecture/policy** (states, flows, contracts, UX rules): put it in app architecture notes (for example [ai/ARCHITECTURE.md](ai/ARCHITECTURE.md)).
- **Symbol-local contract** (one module/function/type behavior): put it in code docblocks near the symbol.
- **Naming/API smell** (callers keep misusing it): prefer renaming/re-shaping the API over adding prose.
- Quick test: if it remains true after renaming modules and shipping new features, it is likely `LEARNINGS.md`; if it depends on current product behavior, it belongs in architecture docs.

---

## Concurrency

### Atomic claim via `updateMany` beats SELECT-then-UPDATE

When two callers may race for the same row (e.g. concurrent video status pollers, both wanting to do the upload), do the state transition with `updateMany({ where: { id, status: FROM }, data: { status: TO } })` and check `count`. The single caller whose row was still in `FROM` wins; the others observe the new state and bail. This is exactly how `finalizeVideoUpload` in [src/lib/mediaPersistence.ts](src/lib/mediaPersistence.ts) avoids double-uploading and how `deductCredits` in [src/lib/credits.ts](src/lib/credits.ts) avoids overdrafts.

Do not implement this with `SELECT ... FOR UPDATE` in this codebase. Prisma + serverless = each call is a fresh connection; advisory locks add no value over an atomic conditional update.

### Lazy GC beats cron jobs for soft expiry, but fixed wall-clock events need a trigger

`ActiveSession` rows for stale patrons are deleted opportunistically at login time (any row with `lastActivity < now - 10m` for the same library) rather than by a background job. **Why:** the platform is serverless; there is no always-on worker, and adding one for occasional housekeeping is a maintenance tax we don't need. **How to apply:** for soft "this should expire after T" requirements, prefer lazy expiry on the next access path that already touches the row. For product-visible fixed wall-clock events, use a scheduled trigger plus an idempotent lazy fallback. Weekly credit renewal is the example: Vercel cron calls the renewal route at Monday 12:00am America/Chicago, and login/read/generation/admin paths still run the same reset predicate if the scheduled run is missed.

## Multi-tenancy

### Choose one canonical slug rule and enforce it via shared helpers

The same library name has to produce the same env-var slug, URL slug, cookie value, and guest username — in five different places. The slug is computed in **one** place ([src/lib/library.ts](src/lib/library.ts)) and every consumer imports from there. **Why:** when this rule was duplicated, "Public AI" silently became `PUBLICAI` in one helper and `PUBLIC_AI` in another, and only manifested as "guests at this library share credits with the legacy guest". **How to apply:** any time the same identifier needs to flow through more than two layers, factor the derivation into a single helper module — never copy the regex.

### A multi-tenant key with no FK is a footgun magnet — guard it at every write site

`User.library` is a string, not a foreign key (deliberately, so legacy guests can carry a `"Guest"` library that doesn't exist in the table). Every code path that *creates* a User must validate the library against the same hard-coded whitelist. Both server-side ([src/app/api/auth/signup/route.ts](src/app/api/auth/signup/route.ts)) **and** client-side ([src/app/signup/page.tsx](src/app/signup/page.tsx)). **Why:** without a FK, a typo never surfaces — capacity checks silently fall back to a default, NanoGPT requests silently use the global key. **How to apply:** if a foreign key would constrain you in undesired ways, add a centralized whitelist constant and validate at every write site. Document the trade-off where the whitelist lives.

### Vanilla URLs must keep working — no breakage on missing config

Kiosks that haven't been re-provisioned to the `/l/<slug>` start URL still load. The guest endpoint falls back to a legacy shared `guest` user instead of 500-ing. The server logs a warning so ops can fix it, but the patron-facing flow keeps working. **Why:** rolling out a multi-tenancy change across N library sites with N different IT teams is slow; you cannot ship a change that makes "old URL" mean "broken kiosk". **How to apply:** when introducing per-tenant identity to a previously-untenanted system, design the fallback path *first* and log loudly so it doesn't become permanent.

## Server / client boundary

### Use `'server-only'` aggressively for env- and DB-touching modules

Anything that reads `process.env` or talks to Prisma (e.g. `lib/env.ts`, `lib/storage.ts`, `lib/mediaPersistence.ts`, `lib/imagePipeline.ts`, `lib/mediaUrlCache.ts`) imports `'server-only'` at the top so an accidental `'use client'` import fails at build time. **Why:** Next will happily bundle DB code into a client chunk and only fail at runtime with a confusing message; `'server-only'` shifts the failure to compile time. **How to apply:** if a module reads secrets, signs URLs, or constructs a DB client — `import 'server-only';` on the first line, no exceptions.

### Lazy-init singletons via Proxy or function so build doesn't need runtime config

The Prisma client in [src/lib/db.ts](src/lib/db.ts) is wrapped in a `Proxy` so the actual client isn't constructed until the first method call. R2 env validation in [src/lib/env.ts](src/lib/env.ts) is `getR2Env()` (lazy) plus a separate `isR2Enabled()` that reads only the feature flag. **Why:** `next build` and `next start --import` both import every server module; if module-load time triggers `throw new Error('DATABASE_URL is missing')`, build breaks in CI. **How to apply:** for any singleton that requires runtime config, lazy-init on first use. Don't validate at module top level.

## API design

### Generation routes belong in `lib/`, not in route handlers

Route handlers are thin: validate input, call `requireActiveSession`/`requireApproved`, deduct credits, log usage, and delegate to a `lib/` function for the rest. The image, music, and video routes all share `lib/mediaPersistence.ts` and `lib/storage.ts`; the guest forks differ only by skipping the persistence step. **Why:** when persistence semantics change (dedup, AVIF transcode, signed URL refresh), there is one place to touch. **How to apply:** if you find yourself copy-pasting flow between two routes, the shared body belongs in `lib/`.

### Always use `NextResponse.json` and treat `{ user: ... } | NextResponse` as the auth result type

The `requireXxx` helpers return `{ user } | NextResponse`. Route handlers do `if (!isAuthResult(r)) return r;` instead of branching on a thrown exception. **Why:** keeps the happy path linear and the error path a one-liner; no `try/catch` for control flow. **How to apply:** when adding a new gate (e.g. a future "library is paused" check), return `NextResponse.json(...)` directly and have the route do an `if` check, matching the existing pattern.

### `dynamic = 'force-dynamic'` is the default for API routes here

Every API route exports `export const dynamic = 'force-dynamic'`. Without it Next 16 will sometimes try to statically render auth-gated routes, which silently breaks in deploys. **Why:** auth, DB writes, and provider calls cannot be cached. **How to apply:** new API route → `export const dynamic = 'force-dynamic'` at the top, before imports.

## Storage and content

### Encode at write time — never serve raw provider PNGs

Generated PNGs are 1–4 MB; AVIF q60 is ~85% smaller and indistinguishable for AI imagery on every browser the kiosk targets. The encode happens once at upload time in `lib/imagePipeline.ts`. Thumbnails are also encoded at write time at 320px so list views serve sub-50KB images. **Why:** kiosks live on small uplinks; serving raw PNGs is the difference between a 200ms and a 3s page load. **How to apply:** any media generated by an external provider should be transcoded into a sensible web format on the server before R2 upload — don't push that cost to the browser.

### Object keys must include a UUID — never overwrite

`media/{mode}/{userId}/{yyyy}/{mm}/{uuid}.{ext}`. Same user re-prompts → new key + dedup row. Never reuse keys, even when the bytes are identical. **Why:** keys with random suffixes are cache-safe forever — we set `Cache-Control: public, max-age=31536000, immutable` and don't worry about CDN invalidation. **How to apply:** if you're tempted to write to a deterministic key (`avatars/{userId}.png`), don't. Add the UUID, store the latest pointer in the DB.

### SSRF protection is non-negotiable for provider URL → R2 uploads

`uploadFromUrl` enforces HTTPS, DNS lookup with private-IP rejection (IPv4 + IPv6 incl. `::ffff:` v4-mapped), `redirect: 'manual'` with at most one hop, content-length pre-check, content-type allow list, and never forwards auth/cookies. **Why:** taking a URL from an external service and fetching it server-side is a textbook SSRF. Cloud metadata endpoints (`169.254.169.254`) are reachable from naive `fetch` calls. **How to apply:** any new "fetch this URL on the server and store it" feature must reuse `safeFetchBuffer` (or its public wrappers `uploadFromUrl` / `fetchBytesFromUrl`). Do not handroll a `fetch` for this.

### Forced-attachment downloads from cross-origin presigned URLs require `ResponseContentDisposition` in the *signed* URL

The HTML `<a download="...">` attribute is ignored when the response comes from a different origin without a matching `Content-Disposition: attachment` header — clicking the link opens the file in a new tab instead of downloading it. For S3/R2 presigned URLs, the only way to attach `Content-Disposition` is to set `ResponseContentDisposition` on the `GetObjectCommand` *before* signing — appending it as a query string after the fact breaks the signature. **Why:** this was the entire reason the old `<a download>` pattern silently failed for image/video/audio downloads; the file would render in the browser instead of saving. **How to apply:** any "download this from R2" feature should call `generateSignedGetUrl(key, ttl, { downloadFilename })`. If you need a different disposition or filename per request, do not cache the URL — generate a fresh signed URL per click, since the cache key would have to include the disposition.

## Data model

### Prisma's `prisma-client` (v7) generator outputs to `src/generated/prisma`

Imports look like `import { PrismaClient } from '@/generated/prisma/client'` — not `@prisma/client`. The `postinstall` hook runs `prisma generate`. **Why:** Prisma 7 split the runtime; the generator emits a fully self-contained client. **How to apply:** never edit anything under `src/generated/`; update `prisma/schema.prisma` and re-run `npm run db:migrate`.

### Idempotent seeds use `upsert` with empty `update: {}` for fields that should not be reset

`prisma/seed.ts` uses `upsert({ where, update: {}, create: { ... } })` for libraries and guests so re-running never resets balances. Where state *should* be enforced on every run (e.g. `status: 'APPROVED'` for guests after a status migration), put it in `update`. **Why:** seed scripts get re-run after schema changes and after `db:reset` — they must be safe to invoke against a populated DB. **How to apply:** decide explicitly what `update` should overwrite, and document the choice inline. Default to `update: {}`.

## Frontend

### Heartbeat only when there's been activity

The kiosk client sends `/api/auth/heartbeat` every 60s — but only if the user has interacted (mouse/keyboard/touch/scroll) since the last tick. Idle kiosks deliberately let their server session lapse so the cap frees up. **Why:** an always-on heartbeat would hold the concurrent-session cap forever for a kiosk no one's using. **How to apply:** for any "I'm still here" signal, gate the ping on real interaction, not on a wall clock.

### SSR-safe theme via inline `<script>` in `<head>`

Theme is set by `localStorage['theme']` but read before React mounts via a tiny inline `<script>` in `layout.tsx` that sets `document.documentElement.dataset.theme`. **Why:** without this, dark-mode users see a white flash on every navigation. **How to apply:** any state that affects first paint and lives in `localStorage` needs an inline script in the `<head>`. Don't try to do it in a React effect.

### `'use client'` is a leaf decision, not a tree decision

Pages are mostly `'use client'` because they're heavily interactive, but `lib/` and route handlers stay server-side. Don't reach for `'use client'` at the top of a layout to "make children easier" — push it down to the leaves and keep server boundaries crisp.

### Anchor visual overlays via `data-*` attributes, not CSS classes or refs

The first-visit page tour (`CoachmarkTour`) finds its targets via `document.querySelector('[data-tour="..."]')`. The mapping between tour-step config and DOM elements is decoupled from the page markup: pages can be restructured, classes renamed, components swapped — the tour keeps working as long as a sensibly-shaped element still carries the data attribute. **Why:** class-based targeting breaks every time the design system tightens; ref-based targeting forces tour content to be embedded inside the page component instead of in a single config. **How to apply:** any cross-cutting overlay (tours, A/B-test highlights, analytics anchors) should join to the DOM via a dedicated `data-*` attribute, not through styling or component refs.

### Header `actions` slot is the canonical extension point — don't fork the component

Per-page chrome (the Learning Guide button, future per-page helpers) goes through `<Header actions={...} />`. There is no `<Header2>` and there shouldn't be — the cost of a parallel header component is that the two drift in spacing, theme, and accessibility. **Why:** every shared layout component on this surface eventually grows page-specific buttons; a slot keeps the component shared while letting each page own its own affordance. **How to apply:** when you need page-specific UI in shared chrome, add a `ReactNode` slot prop to the existing component before reaching for a new one.

## AI-assisted UI surfaces

### Static content first, live model as the long-tail backstop

For any "explain this" surface that runs on metered model calls, the right default is curated static content with the live model only invoked when the user clearly asks something the static content doesn't cover. The Learning Guide ships hand-authored JSON for every tool; the live `/api/guide` route only fires when fuzzy-matching against the FAQs and use-cases finds nothing. **Why:** static content is free, deterministic, and authored by people who know the product — the model is the cleanup crew, not the front line. The reverse default ("live model with optional static fallback") burns credits answering questions the team has already answered better, and ships answers that drift session-to-session. **How to apply:** any onboarding, help, or "what is this" surface should start as static content; add a live-model fallback only after you can point at the specific class of question the static content can't reasonably cover.

### FAQ matchers need a two-pass score, not just a combined-text score

When matching a user query against `[{q, a}, ...]`, score against `q` *first*, and only fall back to `q + a` combined if the question-only pass produces no result above threshold. **Why:** combined-text scoring lets vocabulary that incidentally appears in an *answer* outweigh the actual question intent — the original bug was "I don't know what a JPEG is" matching the *file format* FAQ instead of the *what is JPEG* FAQ, because the file-format answer mentioned "JPEG" once and the JPEG-definition question's answer mentioned it many times. Question-only matching disambiguates cleanly because each FAQ's question is a unique handle. **How to apply:** for any small-corpus retrieval over `(label, body)` pairs, score against the label first; treat the body as a tiebreaker.

### Reject "orphan tokens" before fuzzy-matching anything

Before scoring a query against any corpus, build the union of tokens that appear anywhere in the corpus and check that *every* meaningful query token is present in that union. If even one is missing, return no match. **Why:** a query whose tokens partially overlap the corpus by accident ("Is PNG the same as JPEG?" matched the JPEG FAQ via "same") will always score above zero; a strict threshold is not enough. The orphan check is a cheap one-liner that catches "you're asking about something we don't cover" much more reliably than tuning the score floor. **How to apply:** any fuzzy/keyword retrieval that has a "no match → fall back to live model / search / ..." path should orphan-check first. The orphan check is also a free partial spell-check signal.

## Documentation

### Every multi-step setup must have a checklist

[docs/adding-a-library.md](docs/adding-a-library.md) is a 7-step checklist with explicit verification commands at each step. The checklist exists because someone (twice) added a Library row but forgot to update the signup whitelist, and the failure was silent. **Why:** without a checklist, partial setups are normal — everything works for the new library's existing patrons but new signups silently fail. **How to apply:** any setup involving `>= 3` files or systems gets a numbered checklist with verification at each step.

### Decision-complete plans only

Milestone plans under `ai/PLAN_M{n}.md` must be self-contained: an implementer reading only the plan file should not need to ask follow-up questions. The full planning protocol (ask first, research, draft, Claude-review loop, then sign-off) is in [ai/PLAN.md](ai/PLAN.md). **Why:** a half-decision-complete plan dumps decision-making onto whoever picks it up later, often weeks later, often without the original context. **How to apply:** before declaring a plan ready, ask: "could a different engineer execute this from this file alone?" If no, keep iterating.
