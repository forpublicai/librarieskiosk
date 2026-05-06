# AGENTS.md

Persistent context for AI agents and developers working on **Libraries Kiosk**. `claude.md` points here. This is the entry point — start by reading this file end-to-end, then descend into [ai/ARCHITECTURE.md](ai/ARCHITECTURE.md), [LEARNINGS.md](LEARNINGS.md), and [ai/DESIGN.md](ai/DESIGN.md) as needed.

## What this project is

Libraries Kiosk is a Next.js (App Router) web app that runs on locked-down kiosk hardware in public libraries. Patrons sit down at a kiosk and use AI services — chat, image, music, video, code — all backed by [nano-gpt](https://nano-gpt.com) and metered against per-library weekly credit pools. Generated media is durably stored in Cloudflare R2.

Live deployment serves multiple branded library "groups" (Pottsboro TX, Salem City UT, Public AI, Tremonton UT, Sussex County NJ) from a single codebase. Per-library isolation is enforced along five axes: users, credit pools, concurrent sessions, NanoGPT billing keys, and guest accounts. See [docs/adding-a-library.md](docs/adding-a-library.md).

## Stack

| Layer | Choice |
|------|--------|
| Framework | Next.js 16 (App Router, React 19, server components) |
| Language | TypeScript, strict |
| DB | PostgreSQL (NeonDB in prod) via Prisma 7 + `@prisma/adapter-pg` |
| Auth | Custom JWT (jose) + bcryptjs, 8h tokens, `ActiveSession` rows for patrons |
| AI provider | nano-gpt (chat, image, music, video) |
| Object storage | Cloudflare R2 via AWS SDK v3 (S3-compatible) |
| Image transform | sharp (PNG → AVIF) |
| Styling | Plain CSS in `src/app/globals.css` with CSS custom properties for theming. No Tailwind, no CSS-in-JS lib. |

## Repo layout

```
src/
  app/                      Next App Router
    api/                    Route handlers (POST endpoints)
      auth/                 login, signup, logout, guest, me, heartbeat, cleanup, forgot-password, change-password
      cron/renew-credits    Scheduled weekly credit/pool renewal
      chat|code|image|music|video/   Generation endpoints
      conversations/        Persisted chat/code threads
      media-sessions/       Persisted images/music/video
      credit-requests/      Patron asks admin for credits
      account/usage|delete  Patron self-service
      admin/                Library-admin endpoints
        superadmin/overview Cross-library super-admin endpoints
    l/[slug]/route.ts       Kiosk bootstrap — sets `kiosk_library` cookie
    chat|code|image|music|video|account|signup|forgot-password|getting-started|resources|faqs|admin|dashboard
    layout.tsx              AuthProvider + ThemeToggle wrapper
    globals.css             Design system (theme variables, components)
  components/               Header, AuthProvider, ThemeToggle (only the truly shared pieces)
  hooks/                    useGenerationProgress
  lib/                      auth, credits, db, env, library, nanogpt, status, storage, mediaPersistence, mediaUrlCache, imagePipeline, formatMessage, guestSession, security, mediaClient
  middleware.ts             Kiosk access-token gate (cookie + ?access= param)
  generated/                Prisma client output (gitignored conceptually; do not edit)
prisma/
  schema.prisma             User, Library, ActiveSession, Conversation, UsageLog, MediaSession, CreditRequest
  migrations/               Standard prisma migrations
  scripts/                  One-off ops scripts (e.g. move-to-public-ai)
  seed.ts                   Idempotent seed for libraries, admins, patron, guests
config/models.json          Model IDs and labels per mode (chat/coding/image/video/music)
docs/                       adding-a-library.md, r2-integration-plan.md, r2-optimization.md
ai/                         AI-agent-facing context (this file's neighbors)
scripts/                    Smoke tests, NanoGPT probe, R2 backfill
```

## Conventions

### TypeScript / Next

- `'use client'` only when you need state, hooks, or browser APIs. Default to server components.
- All API routes export `dynamic = 'force-dynamic'` — these are dynamic by definition (auth, DB writes).
- Server-only modules import `'server-only'` at the top so accidental client imports fail at build time. Always do this for anything touching env vars or DB.
- Use the `@/...` alias (`src/...`) for imports. Never use long relative paths like `../../../../`.
- Prefer `NextResponse.json(...)` over `new Response(JSON.stringify(...))`.
- Keep route handlers thin: validate, call into `lib/`, return JSON. Business logic lives in `lib/`.

### Auth pattern (use this exactly — every API route follows it)

```ts
import { requireActiveSession, isAuthResult } from '@/lib/auth';
import { requireApproved } from '@/lib/status';

export async function POST(request: NextRequest) {
    const authResult = await requireActiveSession(request);
    if (!isAuthResult(authResult)) return authResult;   // returns the 401 NextResponse

    const statusCheck = await requireApproved(authResult.user.userId);
    if (statusCheck) return statusCheck;                 // returns the 403 NextResponse

    // ... business logic, using authResult.user.{userId,role,library,jti}
}
```

Variants: `requireAuth` (any role, no idle check), `requireActiveSession` (PATRON: enforces ActiveSession + idle window; ADMIN/SUPER_ADMIN/GUEST bypass), `requireAdmin`, `requireSuperAdmin`.

### Generation endpoints — guest fork

Every media generation endpoint (`/api/image`, `/api/video`, `/api/music`) has two branches:
- `role === 'GUEST'`: deduct credits, log usage (skipped for the legacy shared `guest` user), call NanoGPT, return provider URL with `ephemeral: true`. **Never** persist to R2 or write a `MediaSession` row.
- otherwise: same flow but if `isR2Enabled()`, call into `mediaPersistence.persistXxxResult()` to upload + dedup + return signed URL.

Chat and code don't store binaries; they persist messages via `Conversation` and stream via SSE.

### Credits

- Costs in `src/lib/credits.ts`: image=1, code=1, music=5/10s, video=25/10s, chat=0.
- Always use `calculateCredits(mode, durationSec)` — never hardcode.
- `deductCredits(userId, amount)` is atomic and reset-aware: if the account missed the current fixed weekly reset boundary, it resets and deducts in one DB write. Throw `InsufficientCreditsError` → return 402.
- `logUsage` skips the legacy `guest` userId (it shares one row across all unconfigured kiosks; logging would mix users).
- Weekly renewals are fixed: every Monday at 12:00am America/Chicago, all user credits and library pools renew together. Vercel cron hits `/api/cron/renew-credits`; lazy reset helpers remain on login/read/admin/generation paths only as a fallback if the scheduled job is missed.
- `creditsResetAt` / `poolResetAt` store the most recent fixed Monday Central boundary, not a user-specific moving window. Renewal hover text should point to the next fixed Monday boundary.

### Per-library isolation

Five axes, all keyed off the library `name` string (which **also** doubles as the join key for `User.library`):

1. **Users** — `User.library` is a string, not an FK. Must match `Library.name` exactly (whitespace, punctuation, casing). Mismatch silently breaks capacity checks.
2. **Credit pool** — `Library.weeklyPool` / `poolRemaining`.
3. **Concurrent sessions** — `Library.maxConcurrentSessions` (default 1). Checked on login & signup. Admins/super-admins/guests bypass.
4. **NanoGPT billing** — `getNanogptKey(library)` resolves `NANOGPT_API_KEY_<SLUG>` env var; falls back to `NANOGPT_API_KEY`. Slug rule: uppercase, non-alphanumerics → `_`, trim `_`.
5. **Guest accounts** — `guest_<slug>` users, one per library, isolated 100-credit pool. Resolved by `kiosk_library` cookie set by `/l/[slug]` bootstrap. Vanilla URL falls back to legacy shared `guest` user.

When adding a library, follow [docs/adding-a-library.md](docs/adding-a-library.md) — there is a 7-step checklist; missing any step silently breaks one of the axes above.

### Slug helpers

Always use `src/lib/library.ts` — never hand-roll the slug regex. The same rule must produce the same slug across NanoGPT keys, URL slugs, cookie values, and guest usernames.

| Helper | Purpose | Example |
|--------|---------|---------|
| `libraryNameToSlug(name)` | Uppercase env-var slug | `"Pottsboro, TX"` → `"POTTSBORO_TX"` |
| `libraryNameToUrlSlug(name)` | Lowercase URL/cookie slug | `"Pottsboro, TX"` → `"pottsboro_tx"` |
| `normalizeSlug(slug)` | Sanitize untrusted input | normalises any case |
| `guestUsernameForLibrary(name)` | Per-library guest username | `"guest_pottsboro_tx"` |
| `KIOSK_LIBRARY_COOKIE` | Cookie name (`kiosk_library`) | — |

### R2 / media persistence

- Feature-flagged with `USE_R2_PERSISTENCE`. When off, generation routes return provider URLs and the **client** writes to `/api/media-sessions` (legacy path).
- `getR2Env()` lazy-validates config on first call. `isR2Enabled()` checks the flag without forcing validation, so build/dev without R2 doesn't blow up.
- `lib/storage.ts` has full S3 wrapper: `uploadBuffer`, `uploadFromUrl` (SSRF-safe), `uploadFromDataUrl`, `generateSignedGetUrl`, `deleteObject`. SSRF guard: HTTPS only, DNS lookup, private IP rejection, max-1 redirect, content-type allow list, no forwarded auth.
- Object key format: `media/{mode}/{userId}/{yyyy}/{mm}/{uuid}.{ext}`. UUID prevents same-month collisions; year/month prefix keeps R2 listings browsable.
- Images: server-side AVIF encode + thumbnail via `lib/imagePipeline.ts` before upload. Quality 60 full / 45 thumbnail.
- Dedup: per-user SHA-256 checksum lookup; if matched, write a new `MediaSession` row pointing at the existing `objectKey` (no re-upload).
- Video: async — POST creates a `PENDING` row, status route claims via atomic `PENDING → UPLOADING` `updateMany` so concurrent pollers don't double-upload.
- Read URLs: `getMediaReadUrl` prefers `R2_PUBLIC_BASE_URL` (cacheable) and otherwise memoizes signed URLs in-process with a 5-minute refresh margin.

### Naming

- Components: `PascalCase.tsx` (only `Header`, `AuthProvider`, `ThemeToggle` are shared — most pages keep their components inline because the app is small).
- Lib modules: `camelCase.ts`.
- API routes: kebab-case folders (`credit-requests`, `media-sessions`).
- Env vars: `SCREAMING_SNAKE_CASE`. Per-library NanoGPT keys: `NANOGPT_API_KEY_<SLUG>`.

### Indentation & style

- 4-space indent (look at any `.ts` file — this is the existing convention).
- Single quotes for strings; backticks for templates.
- ESLint via `eslint-config-next`. Run `npm run lint` before declaring a task done.

## Workflows

### Setup

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL, NANOGPT_API_KEY, JWT_SECRET
npm run db:setup            # initial migrate + seed
npm run dev
```

### Common scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Next dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run db:migrate` | `prisma migrate dev` (new migration) |
| `npm run db:push` | Push schema without a migration (dev only) |
| `npm run db:deploy` | `prisma migrate deploy` (prod) |
| `npm run db:seed` | Idempotent seed |
| `npm run db:reset` | Wipe + re-migrate + seed |
| `npm run smoke-test` | Hits live API surface end-to-end |
| `npm run probe:nanogpt` | Sanity-checks NanoGPT keys |

### Test accounts (after seed)

- `superadmin` / `$ADMIN_PASSWORD` (Public AI, SUPER_ADMIN — also acts as Public AI's library admin)
- `admin_pottsboro` / `$ADMIN_PASSWORD`
- `admin_salem`, `admin_tremonton`, `admin_sussex` / `$ADMIN_PASSWORD`
- `patron` / `$PATRON_PASSWORD` (Pottsboro)
- `guest`, `guest_pottsboro_tx`, `guest_salem_city_ut`, `guest_public_ai`, `guest_tremonton_ut`, `guest_sussex_county_nj` (no UI login — reached via "Continue as Guest" + bootstrap URL)

### Running the kiosk gate locally

If `KIOSK_ACCESS_TOKEN` is set, the middleware blocks bare URLs. To unlock a browser session, hit `/?access=<token>` once (or `/l/<slug>?access=<token>` to also set the library cookie). The token is cached in a cookie for 8h.

## Adding a feature: pre-flight checklist

Before writing code, confirm:

- [ ] Does this need to live behind `requireActiveSession`? (almost always yes)
- [ ] Does the user need to be `APPROVED`? (`requireApproved` — yes for generation endpoints; no for self-service status reads)
- [ ] Is there a credit cost? Use `calculateCredits` and `deductCredits`. Always log via `logUsage`.
- [ ] Is this per-library? Use the helpers in `lib/library.ts`; never hand-derive slugs.
- [ ] Is this a media endpoint? Add the GUEST fork that skips R2 + `MediaSession`.
- [ ] Are you reading env vars? Use `lib/env.ts` if R2-related; otherwise document new vars in `.env.example`.
- [ ] Is the model ID hard-coded? Pull it from `config/models.json` instead.

## Workflow: planning and milestones

The repo uses milestone planning docs under `ai/PLAN.md` and `ai/PLAN_M{n}.md`. The detailed planning protocol — how to ask questions, write the plan, get a Claude review, execute the plan, and do post-implementation cleanup — is in [ai/PLAN.md](ai/PLAN.md). Read it before drafting a milestone plan.

Key rule: **decision-complete plans only**. The plan must be self-contained enough that a different engineer or agent can implement it without further questions. Validation steps must be concrete (typecheck clean, lint clean, plus feature-specific tests).

## When in doubt

- Cross-cutting engineering wisdom → [LEARNINGS.md](LEARNINGS.md).
- How a piece of the kiosk fits together → [ai/ARCHITECTURE.md](ai/ARCHITECTURE.md).
- Visual / UX intent → [ai/DESIGN.md](ai/DESIGN.md).
- Adding a library → [docs/adding-a-library.md](docs/adding-a-library.md).
- R2 background → [docs/r2-integration-plan.md](docs/r2-integration-plan.md), [docs/r2-optimization.md](docs/r2-optimization.md).
