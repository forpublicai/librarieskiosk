# M2 plan: Interactive Learning Guide + UX polish

> **Note:** This document is a *retrospective* milestone record. Unlike a forward-looking PLAN_M{n}.md it was written after the work landed on the `arpita-explore` branch. Sections that ordinarily capture pre-implementation alignment (Locked user decisions, AI VALIDATION PLAN) are written from observed behavior. The file otherwise follows the [ai/PLAN.md](PLAN.md) template so future milestones have a precedent.

## Summary

This milestone makes the kiosk genuinely usable by patrons who have never met an AI tool before. It introduces:

1. A new **Learning Guide** side panel (`GuidePanel`) on every generation page (chat, image, video, music, code) that combines:
   - a 3-tier "describe yourself" gate that customizes complexity of explanations,
   - structured static content (per-tier "what is this", use-case-driven "getting started" walkthroughs, three-bucket FAQs),
   - free-form questions answered by either fuzzy-matching against the static FAQs or, when no match, calling a tier-aware live model via a new `/api/guide` route.
2. A **Coachmark page tour** (`CoachmarkTour`) that highlights the major UI regions the first time a user lands on a tool.
3. A **proper download path** for generated images, video, and audio that goes through R2 with a forced `Content-Disposition: attachment` instead of relying on the browser's `<a download>` heuristic.
4. UI polish: theme toggle moved into the header, "Try:" example-prompt chips on every generation page, dashboard footer links, an extra password-recovery FAQ, and small video-history resilience fixes.

Validation: type-check clean, the guide functions across all five tools, the download button produces a real file (not a new tab), and patrons returning to a tool see the page tour exactly once until they explicitly restart it from the guide panel.

## HOW TO EXECUTE A MILESTONE

[Verbatim from [ai/PLAN.md](PLAN.md) §"HOW TO EXECUTE A MILESTONE", reproduced here so this file is self-contained.]

If the user asks you to execute on a plan, these are the steps to take.

1. Implement the plan
   - You should check your work with AI autonomous validation and testing.
   - The hope is that implementation can be done with a minimum of user interaction, preferably none at all.
   - Once it is complete, fill in the "Validation" section to the bottom of the plan showing how you have validated it and what were the results.
   - You might have discovered better engineering
2. Perform your testing and validation
   - Update the "AI VALIDATION RESULTS" section of your PLAN_M{n}.md file
3. Review your own code. Also, ask Claude to review your work
   - You will need to provide it context: your plan document PLAN_M{n}.md, and tell it which files or functions you've worked on. Ask it also to review your validation steps.
   - If Claude found no blockers or problems with your work, you may proceed. Do static checking (formatting, eslint, typechecking). If you need any fixes, static check again to make sure it's clean.
   - If you couldn't get Claude to run for whatever reason, the user wants you to abort and report what's wrong.
   - Keep iterating with Claude until you no longer make changes (either because you've taken on Claude's feedback from past rounds, or because your plan no successfully defends its positions so Claude accepts them). However, if you take more than 10 rounds, then something is wrong, so stop and let the user know.
   - We aren't looking for "blocker vs non-blocker" decisions. Instead for every suggestion from Claude you must evaluate "will this improve my code? if so then modify your code, and if not then pre-emptively defend (in code comments) why not". And if you made modifications or comments, then circle back with Claude again.
   - Do NOT reference previous rounds when you invoke it: Claude does best if starting from scratch each round, so it can re-examine the whole ask from fundamentals. Note that each time you invoke Claude it has no memory of previous invocations, which is good and will help this goal! Also, avoid asking it something like "please review the updated files" since (1) you should not reference previous rounds implicitly or explicitly, (2) it has no understanding of what the updates were; it only knows about the current state of files+repo on disk.
4. After implementation, do a "better engineering" phase
   - Clean up LEARNINGS.md and ARCHITECTURE.md. If any information there is just restating information from other files then delete it. If it would belong better elsewhere, move it. Please be careful to follow the "learnings decision tree" — LEARNINGS.md for durable engineering wisdom, ARCHITECTURE.md for things that will apply to CodexAgent.ts in its finished state, PLAN_M{n}.md for milestone-specific notes
   - You will have several Claude review tasks to do, below. You must launch all the following Claude review tasks in parallel, since they each take some time: prepare all their inputs, then execute them all in parallel. You should start addressing the first findings as soon as you get them, rather than waiting for all to be consolidated. You can be doing your own review while you wait for Claude.
   - (1) Review the code for correctness. Also ask Claude to evaluate this.
   - (2) Validate whether work obeys the codebase style guidelines in AGENTS.md. Also ask Claude to evaluate this. The user is INSISTENT that they must be obeyed.
   - (3) Validate whether the work obeys each learning you gathered in LEARNINGS.md. Also ask Claude to evaluate this. (A separate instance of Claude; it can't do too much in one go).
   - (4) Validate whether the work has satisfied the milestone's goals. Also ask Claude to evaluate this.
   - (5) Check if there is KISS, or consolidation, or refactoring that would improve quality of codebase. Also ask Claude the same question.
   - If you make changes, they'll need a pass of static checking (formatting, eslint, typechecking), and again to make sure it's clean.
   - You might decide to do better engineering yourself. If not, write notes about whats needed in the "BETTER ENGINEERING INSIGHTS" section of the plan.
   - Tell the user how you have done code cleanup. The user is passionate about clean code and will be delighted to hear how you have improved it.
5. Upon completion, ask for user review. Tell the user what to test, what commands to use, what gestures to try out, what to look for

## Locked user decisions

These are the decisions that were made (often interactively, over multiple iterations) during the work and that future milestones should treat as constraints unless explicitly revisited.

1. **Three audience tiers, not one.** Patrons identify themselves as `Tier 1` (new to tech), `Tier 2` (tech-savvy, AI-new) or `Tier 3` (AI explorer). All on-screen and live explanations switch language, jargon, and depth based on the chosen tier. The choice is persisted per patron/admin account and per guest auth token via namespaced localStorage keys, and editable from a chip in the panel header.
2. **Static content is canonical; the live model fills gaps.** Every tool ships hand-written copy in `config/guide/<tool>.json`. The live model is only invoked when the user types a free-form question that doesn't match any FAQ or use-case. Static content is sourced verbatim from authored PDFs (Music, Image, Video Static Content; Chat and Code to follow). Wording is not paraphrased.
3. **Three-dot menu and the explicit Download button must both work** for music and video. The audio/video elements keep their browser-native controls; the explicit `Download` button is the *primary* affordance. Confirmed by the user that both paths work.
4. **Forced-download header on the API.** A query param `?download=true` on `/api/media-sessions/[id]/url` produces a presigned URL with `Content-Disposition: attachment; filename="..."`. The client prefers this over the legacy blob-fetch path because the latter triggers a CORS preflight against R2 that some kiosk browsers block.
5. **Coachmark tour is per-user, per-tool, persistent.** Storage key `cm_<username>_<tool>`, value `'true'` once dismissed. A guest's tour state is keyed under `cm_anon_<tool>`. The tour is restartable from the Learning Guide's "↺ Restart page tour" link.
6. **Theme toggle lives in the visible page chrome.** Removed from `layout.tsx`; added inside `<Header>` to the right of the credit badge for generation pages, inside the info-page topbar for public info pages, inside the dashboard header, and as a compact floating control only on pre-auth screens that have no chrome. CSS shrunk to 32×32 to match other header controls.
7. **Headers expose an `actions` slot.** The Learning Guide button is per-page, not global, so `<Header>` accepts an `actions: React.ReactNode` prop. Each generation page passes its own button. This is the canonical extension point for any future per-page header chrome.
8. **Guide chats are stateless.** No history is persisted server-side or in the DB. The `/api/guide` route takes one question and one tier and returns one response. Following questions are independent calls.
9. **Off-topic deflection in the live guide system prompt.** If the user asks a question that isn't about the current tool, the live guide is instructed to politely refuse, point at the matching tool's own guide, and ask if there's anything about *this* tool to help with.
10. **Bubble splitting on `\n\n`.** Both static and live answers are split on blank lines into multiple sequential bubbles separated by ~500ms typing animation. The model's system prompt explicitly asks for blank-line-separated paragraphs.
11. **Live guide uses the generic `NANOGPT_API_KEY`**, not the per-library key. The guide is an onboarding feature, not a creative-generation feature; its spend should not draw against any one library's pool or appear on a library's NanoGPT bill.
12. **Live guide is rate-bounded per call and per session.** Each call is capped at 25 input words (hard reject), and the response is tier-aware: Tier 1 → 80 words / `max_tokens: 110`, Tier 2 → 60 / 85, Tier 3 → 50 / 70. The session is capped at 5 live exchanges; once reached, the server short-circuits with a "ask a librarian" redirect and never calls the model.
13. **Live guide does not deduct credits.** Patron exchanges write a `UsageLog` row with `mode: 'guide'`, `creditsUsed: 0` (visibility only). Patrons and guests share the same durable per-auth-session quota counter in `GuideExchange`, keyed by JWT `jti`. The guide is fundamentally onboarding — charging patrons for asking how the kiosk works was rejected.
14. **Live guide topic scope is intentionally broad.** The system prompt names file formats, art styles, prompting techniques, and underlying concepts as in-scope per tool — not just the tool's UI. This is in response to the JPEG-vs-PNG deflection bug; the original "only answer questions about <tool>" wording was too strict.
15. **Download proxy is fallback-only.** Patron + UPLOADED R2 row goes through a direct presigned URL (free, R2-to-browser). Guest + permissive-CORS provider goes through a direct blob fetch (free). The server-side proxy only fires when those two free paths can't apply — patron with a failed R2 upload, or guest with a CORS-blocked provider. Bandwidth posture is "the kiosk pays only when there's no free option."
16. **R2 uploads retry on transient failures.** `withRetry` wraps both `client.send(PutObjectCommand)` and the provider `fetch()` in `safeFetchBuffer`. 2 retries (3 attempts total), ~500ms then ~1000ms backoff with jitter. Retries on 5xx/429/408 and Node fetch network errors; not on 4xx, SSRF refusals, validation errors, or MIME mismatches. Logged with `[r2.putObject]` / `[fetch <host>]` labels so monitoring can grep for them.

## PLAN

### Files added

```
config/guide/chat.json                       (+214 lines)  static guide content for Chat
config/guide/code.json                       (+191 lines)  static guide content for Code
config/guide/image.json                      (+153 lines)  static guide content for Image
config/guide/music.json                      (+150 lines)  static guide content for Music
config/guide/video.json                      (+152 lines)  static guide content for Video
src/app/api/guide/route.ts                   (+ 75 lines)  POST /api/guide → tier-aware live answer
src/components/CoachmarkTour.tsx             (+155 lines)  per-tool first-visit page tour
src/components/GuidePanel.tsx                (+649 lines)  the main side-panel UI
```

### Files modified

```
src/app/api/media-sessions/[id]/url/route.ts   ?download=true → forced-attachment signed URL
src/app/api/media-sessions/route.ts            list endpoint exposes sourceProviderUrl + falls back to it
src/app/chat/page.tsx                          guide panel + coachmarks + chips + sendMessage(content)
src/app/code/page.tsx                          guide panel + coachmarks + chips
src/app/dashboard/page.tsx                     footer Resources/FAQs links
src/app/faqs/page.tsx                          new "forgot password" FAQ
src/app/globals.css                            +500 lines: guide panel, coachmark, chips, header toggle
src/app/image/page.tsx                         guide panel + coachmarks + chips + handleDownload
src/app/layout.tsx                             ThemeToggle removed (moved into Header)
src/app/music/page.tsx                         guide panel + coachmarks + chips + handleDownload
src/app/video/page.tsx                         guide panel + coachmarks + chips + handleDownload + history fallback
src/components/Header.tsx                      actions prop + ThemeToggle in right side
src/lib/mediaPersistence.ts                    finalizeVideoUpload writes resultUrl on claim + on failure
src/lib/guideLinks.ts                          bare-domain detection (.com/.org/.net/.edu/.gov → clickable links)
src/lib/guideMatch.ts                          fuzzyMatch→fuzzyMatchFaqs; exact-match-first + word-count tiebreaker in both functions; DEFINITIONAL_RE guard; two-token minimum; normStr helper
src/lib/guidePrompt.ts                         unified intent-detecting system prompt; split useCaseWordLimit/faqWordLimit in TIER_CAPS
src/lib/nanogpt.ts                             new exported chatComplete() (non-streaming) for /api/guide
src/lib/storage.ts                             generateSignedGetUrl options.downloadFilename
```

Total: 23 files changed, ~2,600 insertions, ~83 deletions.

### Subsystem 1 — Static guide content schema

Each `config/guide/<tool>.json` file conforms to:

```ts
interface GuideContent {
  whatIsIt: { tier1: string; tier2: string; tier3: string };  // free text, may contain "\n\n"
  useCases: Array<{
    id: string;
    label: string;                                             // shown as a button
    gettingStarted: {
      intro: string;
      examplePrompt: string;                                   // copy-able by the user
      tips: string[];
      cautions: string[];
    } | null;                                                  // null = "I have something else in mind"
  }>;
  faqs: {
    criticalUse: Array<{ q: string; a: string }>;             // "What should I know about safety and trust?"
    practical:   Array<{ q: string; a: string }>;             // "How do I use it?"
    concept:     Array<{ q: string; a: string }>;             // "What is this and how does it work?"
  };
}
```

The bot bubbles render whitespace-aware: any `\n\n` in `whatIsIt[tier]` or `faqs[*].a` produces a bubble break. Tips and cautions render as bullet lists.

The "I have something else in mind" use-case (always last; `gettingStarted: null`) is the entry point to a free-form question.

### Subsystem 2 — `GuidePanel` state machine

`Screen` state values:

```
tier-select → entry-point → ┬→ what-is-it
                            ├→ use-cases → getting-started
                            │                ↘
                            │                 → open-question (for "I have something else in mind")
                            └→ faq-categories → faq-list → faq-answer
```

Free-form input is allowed on every screen except `tier-select`. On submit:

1. Try `fuzzyMatchUseCase` against `content.useCases`. On hit (score ≥ 0.25), render the use-case's getting-started bundle and transition to `getting-started`.
2. Try `fuzzyMatchFaqs` against the union of all FAQs. On hit (score ≥ 0.35), render the answer and transition to `faq-answer`.
3. Otherwise, call `/api/guide` with `{question, tool, tier}` and render the streamed segments. Transition to `faq-answer`.

#### Fuzzy matching algorithm

Located in `src/lib/guideMatch.ts`. Refinements that came out of testing:

1. **Query normalization**: strip intent-framing wrappers ("I don't know what X is" → "X", "What does X mean?" → "X", "Tell me about X" → "X") before tokenizing. See `normalizeQuery()`.
2. **Stop-word list**: a hand-tuned list of 60+ words covering structural grammar, intent framing, and conversational fillers. See `FUZZY_STOP`.
3. **Orphan-token check**: build the union of tokens that appear anywhere in the FAQ corpus (questions + answers). If *any* query token is missing from the corpus, the question is by definition about something the static content doesn't cover — return `null` and let the live model handle it. This was the fix for "Is PNG the same as JPEG?" incorrectly matching the JPEG FAQ.
4. **Two-pass scoring** (`fuzzyMatchFaqs`): first pass scores against question text only; if no result above threshold, fall back to question + answer combined. This was the fix for "I don't know what a JPEG is" matching the *file format* FAQ instead of the *what is JPEG* FAQ — the question-only pass disambiguates between FAQs whose answers happen to share vocabulary.
5. **Exact match first**: before any token scoring, both `fuzzyMatchFaqs` and `fuzzyMatchUseCase` check for a normalized string match (`normStr`) against the question/label. An exact hit is returned immediately without scoring. This ensures "what is art style?" matches "What is art style?" rather than a shorter FAQ that happens to share tokens.
6. **Word-count tiebreaker**: when two candidates score equally, both functions prefer the shorter question/label (fewer raw words). Shorter means more focused on the query terms rather than incidentally containing them.
7. **Definitional guard** (`DEFINITIONAL_RE`): queries starting with "what is/are", "how does", "why is/does", etc. are blocked from `fuzzyMatchUseCase` entirely (they are never use-case intents). In `fuzzyMatchFaqs` they are subject to a stricter rule: all query tokens must appear in the FAQ *question text* (not the answer), preventing answer-text bleed. This was the fix for "what is music style" matching a criticalUse FAQ whose answer happened to mention "style".
8. **Minimum two token hits for multi-token queries**: for queries with more than one meaningful token, a single-token overlap is not enough to declare a match in either function. This prevents high-frequency domain words (e.g. "music", "image") from matching unrelated FAQs or use cases by accident.

Thresholds: `fuzzyMatchFaqs` requires score ≥ 0.35; `fuzzyMatchUseCase` requires score ≥ 0.25. Both were tuned empirically.

#### Bubble cadence

`add(...messages)` separates messages by role: user messages render immediately; bot messages are queued through a `setTimeout(500ms)` chain so each bubble appears after a typing-dots indicator. The same cadence is used for live model responses by manually toggling `isThinking` between segments.

#### Tier persistence and reset

- `localStorage['guide_tier_user_<id>']` stores `"1" | "2" | "3"` for patrons/admins. `localStorage['guide_tier_guest_<token-fragment>']` stores the same for a single guest auth token. The legacy unscoped `guide_tier` key is removed on guide mount/logout.
- Read on first open of the panel; bypass `tier-select` if a valid tier is present.
- The header chip ("New to tech ✎" etc.) is the reset affordance — clicking it removes the localStorage entry and reopens the wizard.
- One-time highlight pulse on the chip after the user picks a tier so they discover the chip exists. Same mechanism (a separate `--highlight` modifier with a CSS keyframe) is used to draw attention to the input on `open-question`.

### Subsystem 3 — Live guide route (`/api/guide`)

`POST /api/guide` body: `{ question: string, tool: string, tier: 1|2|3 }`.

- Authentication: same as every other generation route — `requireActiveSession` then `requireApproved`.
- **API key**: `getGenericNanogptKey()` — the generic `NANOGPT_API_KEY`, not the per-library key. Keeps the onboarding feature off any individual library's NanoGPT account.
- **Model**: `modelConfig.chat.model`. Chosen because it's already proven on this kiosk surface and is not video/image/code-specialized.
- **Input cap (server-enforced)**: 25 words. Hard reject with HTTP 400 + `error: 'Question too long'`. The client (`GuidePanel`) also shows a live counter and disables submit past the cap; this is defense in depth.
- **Output cap (server-enforced)**: tier-aware. `TIER_CAPS[tier]` gives separate word limits for use-case and FAQ responses plus a `max_tokens` ceiling. Tier 1 → 100 use-case / 80 FAQ words / 140 tokens, Tier 2 → 80 / 60 / 112, Tier 3 → 70 / 50 / 98.
- **Per-session exchange limit**: 5. Counter source:
  - `GuideExchange` row keyed by JWT `jti`, used for both patrons and guests. The route creates the row if needed, then atomically claims a slot with `updateMany({ where: { jti, count: { lt: 5 } }, data: { count: { increment: 1 } } })`.
  - The claim happens before the model call. Provider failures after NanoGPT is called still consume the reserved opportunity.
  - Rows are lazily pruned after 24 hours; JWTs expire after 8 hours, so this leaves headroom without needing a dedicated cron.
  - When the guarded claim updates 0 rows, the route returns `{ response: <librarian-redirect>, limitReached: true, exchangesUsed, exchangesLimit }` without calling the model. No UsageLog row is written for the bounce.
- **UsageLog on success**: patrons get `mode: 'guide'`, `model`, `prompt` (truncated), `creditsUsed: 0`. Guests do not write UsageLog (consistent with "guests are ephemeral"); their quota is still counted in `GuideExchange`.
- **System prompt** has four pieces:
  - `TOOL_DESCRIPTIONS[tool]` — e.g. "Image Generator tool — an AI tool that creates images from text descriptions".
  - `TIER_LABELS[tier]` — reproduced verbatim so the model can refer to the user's self-description.
  - `TIER_GUIDANCE[tier]` — Tier 1: plain language + analogies + short. Tier 2: general tech terms ok, AI-specific terms explained. Tier 3: AI/tech terminology free, focus on nuance and prompting.
  - `TOOL_TOPIC_SCOPE[tool]` — per-tool list of *adjacent* concepts that are in-scope. For `image`, e.g.: "AI image generation, image formats (JPEG, PNG, AVIF, SVG, etc.), art styles and visual composition, lighting and mood, and prompting techniques for images." Followed by explicit "Do not refuse questions that are tangentially related — file formats, terminology, underlying concepts, and prompting techniques are all in scope."
- **Off-topic deflection**: only fires for clearly out-of-scope questions (weather, taxes, content meant for another kiosk tool). The redirect tells the user where to go but stays brief. The original deflection was too eager — it would refuse "JPEG vs PNG" on the image guide because "files" sounded off-topic. The `TOOL_TOPIC_SCOPE` rewrite fixes that.

Why non-streaming: the response is short (≤110 tokens), the bubble-splitter wants the full text, and it lets us reuse a simple `chatComplete(messages, model, apiKey, { maxTokens })` helper rather than threading SSE through a side-panel use case.

### Subsystem 4 — `CoachmarkTour`

A standalone component that mounts at the bottom of every generation page. It does not depend on `GuidePanel` other than via the `cm-restart` window event.

- Tour content lives in `TOURS: Record<tool, Step[]>` inside the component. Each step has `{target, title, body, pos}`.
- `target` is matched against `data-tour="<value>"` on the page. Each generation page tagged the relevant regions: e.g. `data-tour="chat-sidebar"`, `data-tour="image-prompt"`, `data-tour="guide-btn"` (the Learning Guide toggle in the header).
- Storage key `cm_<username>_<tool>`; the value is the literal string `'true'` once dismissed.
- The component renders a four-rect backdrop (cropping a hole around the highlighted element), a glowing ring around the cropped region, and a fixed-position tooltip with skip / back / next.
- On first paint or window resize, the rect is recomputed via `getBoundingClientRect()`.
- Restart: GuidePanel emits `new CustomEvent('cm-restart', { detail: { tool } })` after clearing `localStorage[cm_*]`. CoachmarkTour listens, resets `stepIdx=0`, and reopens.

### Subsystem 5 — Download path

The pre-existing `<a href={imageUrl} download="...">` pattern was replaced because it does not work on R2 presigned URLs (the browser ignores the `download` hint when the response is from a cross-origin host without `Content-Disposition`). Download is now a **three-layer fallback chain**, ordered cheapest → most expensive, with a shared `downloadMedia()` helper in `src/lib/mediaClient.ts`.

```
patron click ─┐
              ▼
┌── /api/media-sessions/<id>/url?download=true ────────────────────────┐
│  UPLOADED row → { url: <R2 presigned + attachment>, direct: true }  │ ⚡ FREE — kiosk not in byte path
│  else, fallback row → { url: '/api/.../download', direct: false }    │ → triggers Layer 3a
└──────────────────────────────────────────────────────────────────────┘

guest click ─┐
             ▼
┌── no sessionId, skip the API path ───────────────────────────────────┐
│  fetch(providerUrl) → blob → <a download>                            │ ⚡ FREE when provider CORS allows
│  on CORS failure → POST /api/media-sessions/download/proxy           │ 💰 PROXY (kiosk pays bandwidth)
│                    body: { url, filename, mode }                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Routes:**

- **`/api/media-sessions/[id]/url?download=true`** (existing route, modified) — now returns `{ url, direct: true|false }` instead of just `{ url }`. For UPLOADED rows: `direct: true` plus a presigned R2 URL with `Content-Disposition: attachment` baked into the signature via `ResponseContentDisposition`. For non-UPLOADED rows with a `resultUrl` or `sourceProviderUrl`: `direct: false` and `url: '/api/media-sessions/<id>/download'`. The `filename` (derived from the row's mime via `extensionForMime`) is included so the client can use it on the proxy path.
- **`/api/media-sessions/[id]/download`** (new patron proxy) — `GET`. Ownership-checked. For UPLOADED rows: `NextResponse.redirect(<presigned R2>)`. For non-UPLOADED rows with a provider URL: fetches the bytes via SSRF-safe `fetchBytesFromUrl`, streams them back with `Content-Disposition: attachment`. The kiosk pays Vercel bandwidth only on this branch.
- **`/api/media-sessions/download/proxy`** (new guest proxy) — `POST`. Body: `{ url, filename, mode }`. Requires auth (any role). Uses `fetchBytesFromUrl` with a required `mode`-derived content-type allowlist (`image/*` / `audio/*` / `video/*`) and `DOWNLOAD_PROXY_ALLOWED_HOSTS`, checked on the original URL and every redirect target. Streams back with `Content-Disposition: attachment`. Used for guest cases since guests don't have MediaSession rows.

**Helper (`src/lib/mediaClient.ts`):**

`downloadMedia({ sessionId, token, fallbackUrl, fallbackFilename, mode })` — a single canonical implementation, used by image / music / video pages. Three layers:

1. If `sessionId && token`: hit `/url?download=true`. On `direct: true` → `window.location.href = data.url`. On `direct: false` → fetch the proxy URL with auth, get blob, `<a download>`.
2. Else (or if layer 1 fails): blob-fetch `fallbackUrl` directly. Works when the provider's CORS allows cross-origin reads.
3. Else (or if layer 2 fails): POST to `/api/media-sessions/download/proxy` with `{ url, filename, mode }` — server-side proxy. Last-resort `window.open` if even the proxy fails.

**Filename safety (`buildAttachmentDisposition`):**

The `Content-Disposition` header value is built from the filename via `buildAttachmentDisposition(filename)` in `src/lib/storage.ts`. CRLF, quotes, backslashes, and control chars are stripped from the ASCII fallback (closes a header-injection class bug); the canonical form uses RFC 5987 `filename*=UTF-8''<percent-encoded>` so non-ASCII filenames work in modern browsers. Used by both the URL route's signed URL and the proxy routes' Content-Disposition.

**Filename extension correctness:**

The download filename is built from `extensionForMime(session.mimeType, mode)` rather than splitting `mimeType` on `/`. Two fixes that landed here:
- Audio mime `audio/mpeg` now produces `.mp3` (Windows opens it correctly as MP3), not the previous `.mpeg` (Windows sees it as an MPEG video container).
- `image/avif` is now in `EXT_BY_MIME` (so AVIF downloads carry an honest `.avif` extension; previously fell back to `.png` which lied about the bytes).

**Preview path unchanged:** the non-download path (`?download` absent) still goes through `getMediaReadUrl` so public-base-URL mode (Cloudflare in front of R2) returns a cacheable URL.

### Subsystem 6 — Header `actions` slot + ThemeToggle relocation

`Header` accepts `{ title?, showBack?, actions? }`. Each generation page passes its `<button data-tour="guide-btn">` for the Learning Guide. ThemeToggle is rendered inside `Header` between "My Account" and "Sign Out" — never as a fixed-position floating button anymore. The CSS for `.theme-toggle` was rewritten: `position: fixed`, `width/height: 44px`, `bottom/right: 24px`, `z-index: 1000` all removed; size shrunk to 32×32 to match the rest of the header chrome. `layout.tsx` no longer renders the toggle.

### Subsystem 7 — Example-prompt chips

Every generation page (chat, image, video, music, code) has a `.example-prompts` block under the input with two `.example-chip` buttons that prefill the input on click.

- Image / video / music / code: chips are static and always visible while there's room.
- Chat: chips disappear after the second user message and once the user begins typing. Used chips are tracked in a `Set<string>` (`usedChips`) so they don't reappear after `New Chat`. The set is cleared on `handleNewChat`.

### Subsystem 8 — Video history resilience

Three small fixes:

1. `finalizeVideoUpload` now writes `resultUrl: providerVideoUrl` *both* on the atomic `PENDING → UPLOADING` claim and inside the failure handler. Reason: if the upload fails mid-way, the row otherwise has `objectKey: null` and `resultUrl: null`, leaving the sidebar item permanently broken.
2. `/api/media-sessions` now selects `sourceProviderUrl` and uses it as a final fallback when the row is non-UPLOADED and `resultUrl` is also null. This keeps even pre-fix rows recoverable for the lifetime of the provider URL.
3. The video page sidebar item handler now clears `videoUrl` and surfaces an error (`"This video is no longer available."`) when neither stored nor presigned URLs are available, instead of silently doing nothing.

### Subsystem 9 — Misc

- New non-streaming export `chatComplete(messages, model, apiKey, options?)` in `lib/nanogpt.ts`. Reuses `fetchWithRetry`, posts `{ model, messages, stream: false, max_tokens? }` to `/api/v1/chat/completions`, returns `data.choices[0].message.content`. The `options.maxTokens` is the hard ceiling on response length for the guide route's tier-aware caps.
- New export `getGenericNanogptKey()` in `lib/nanogpt.ts` — returns the generic `NANOGPT_API_KEY` regardless of library. Used by `/api/guide` to keep onboarding spend off library accounts.
- Chat page's submit logic was refactored to a `sendMessage(content: string)` helper so the chips can pass a string directly instead of going via `setInput` + simulated form submit. Chat error handling now wraps `res.json()` in `try/catch` since some upstream failures return non-JSON.
- Dashboard footer now has Resources / FAQs links centered below the tile grid.
- FAQs page has a new entry: "If I forgot my password, how can I reset it?".

### Subsystem 10 — R2 upload retry (`withRetry`)

Added a `withRetry(fn, options)` helper in `src/lib/storage.ts` plus an `isTransientStorageError` classifier and a private `RetryableHttpError` sentinel. Wrapped around two call sites:

- `client.send(new PutObjectCommand(...))` inside `uploadBuffer` — catches R2 5xx/429/408 and AWS SDK network errors.
- The `fetch(...)` inside `safeFetchBuffer` — catches provider 5xx/429/408 (Nano Banana, Kling, ElevenLabs occasionally return these) and Node fetch errors (`UND_ERR_*`, `ECONN*`, `ETIMEDOUT`, etc.). Retryable HTTP statuses are promoted to a thrown `RetryableHttpError` *inside* the retry wrapper so the body is drained back to the pool before retry.

Policy: 2 retries (3 total attempts), exponential backoff ~500ms then ~1000ms with jitter. Worst case: ~1.5s of extra latency before final failure. Logged with `[r2.putObject]` / `[fetch <host>]` labels so monitoring can grep for them.

Every persistence path benefits transparently — image full + thumbnail uploads, music `uploadFromUrl` + `uploadBuffer`, video `finalizeVideoUpload`'s `uploadFromUrl`. No call-site changes; this is purely a wrapper.

Explicitly **not** retried: 4xx other than 408/429 (auth failure, request validation), SSRF refusals (`Refused fetch: ...`), URL validation errors, oversize payloads, MIME mismatches. Those are permanent and retrying wastes time + may hit rate caps.

### Subsystem 11 — Lazy-loaded guide content (per-tool code split)

`GuidePanel` originally `import`ed all five `config/guide/<tool>.json` files at the top of the module. That bundled ~30KB of unused content into every generation page (a chat page shipped image / video / music / code JSON it never reads).

Refactored to a dynamic-import loader map + a wrapper/inner component split:

```ts
const CONTENT_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  chat:  () => import('@/config/guide/chat.json'),
  music: () => import('@/config/guide/music.json'),
  image: () => import('@/config/guide/image.json'),
  video: () => import('@/config/guide/video.json'),
  code:  () => import('@/config/guide/code.json'),
};

export default function GuidePanel({ tool, isOpen }) {
  const [content, setContent] = useState<GuideContent | null>(null);
  useEffect(() => {
    if (!isOpen || content) return;
    const load = CONTENT_LOADERS[tool];
    if (!load) return;
    // ... await load(), setContent ...
  }, [isOpen, tool, content]);
  if (!content) return null;
  return <GuidePanelInner content={content} tool={tool} isOpen={isOpen} />;
}

function GuidePanelInner({ content, tool, isOpen }) {
  // ... the entire previous component body, with `content: GuideContent` as a prop ...
}
```

The bundler emits five separate chunks (one per tool). A patron on the Image page only fetches `image.json` if they actually open the Learning Guide on that page. Browser caches the chunk for subsequent opens. The wrapper/inner split lets the implementation rely on `content: GuideContent` (non-null) without guards in every handler.

Insights gained while building this milestone, plus things that should be improved in a future milestone but were out of scope.

### Insights worth keeping

- **Static-first, model-second is the right default** for any "explain this tool" affordance on a kiosk that has metered credits. The static content is always free and always consistent; the model is the long-tail backstop. Patron credit is not spent unless the question genuinely needs the model.
- **Two-pass fuzzy matching beats fancier scoring** for FAQ disambiguation. Question-text-priority handles the case where two FAQs share answer vocabulary (the original "JPEG" bug). Combined-text fallback handles questions whose phrasing diverges from the FAQ wording.
- **Orphan-token detection is a small but high-leverage check.** It cheaply routes truly novel questions to the live model. It also doubles as a partial spell-check signal: a typo'd word that doesn't match any corpus token will route to the model rather than fuzzy-matching to something irrelevant.
- **Require ≥2 token overlaps for use-case fuzzy matching** when the query has more than one meaningful token. A single common word like "image" or "code" in a multi-token query is too noisy as a use-case match (the "what is image resolution" → "Create a custom image or artwork" bug). Single-token queries get a free pass since they have only one possible hit.
- **`data-tour` attribute as the join key** between page markup and the tour-step config is durable: pages can be rearranged structurally without breaking the tour as long as the data attribute stays on a sensibly-shaped element. This is preferable to CSS-class targeting (brittle) or React refs (would force the tour data structure inside each page).
- **`ResponseContentDisposition` is part of the signature**, not a header you can attach client-side. Forced-download for cross-origin presigned URLs only works if the disposition is folded into the signed URL.
- **`Content-Disposition` filename needs escaping.** CRLF in the filename is a header-injection class bug; quotes terminate the ASCII `filename="..."` form prematurely. Strip control chars + use RFC 5987 `filename*=UTF-8''<percent-encoded>` for safety and non-ASCII support.
- **Cheapest-first fallback chain for cross-origin downloads.** Direct presigned URL → direct blob fetch → server-side proxy. Direct paths are bandwidth-free; the proxy is the bandwidth-costing safety net. Building all three lets you guarantee consistent UX without making the kiosk pay for downloads that would work without it.
- **Topic scope in system prompts should name what's in-scope, not just what's out-of-scope.** The original "only answer questions related to <tool>" was interpreted narrowly by the model; the rewritten form (`TOOL_TOPIC_SCOPE` listing adjacent concepts + explicit "do not refuse tangentially related questions") fixed the JPEG-vs-PNG deflection without loosening the truly-off-topic guard.
- **Server-derived filenames over client-supplied ones.** When the server proxies bytes, it knows the actual response content-type. Let it build the filename from that (`extensionForMime`) rather than trusting whatever the client typed — prevents extension spoofing and keeps the filename truthful to the bytes. (This is the principle even though the audio extension fix is what currently exercises it.)
- **Retry storage operations with an error classifier**, not a blanket retry. `withRetry` distinguishes transient (5xx/429/408, network) from permanent (SSRF refusal, validation, 4xx other) and only retries the transient class. Blanket retry would burn budget on permanent failures and possibly hit upstream rate caps.
- **Code-split per-tool when the tool is the rendering axis.** Loading 5 tools' worth of guide JSON into a page that only ever uses one is wasted bandwidth on a kiosk uplink. Dynamic `import()` keyed on the tool prop emits per-tool chunks; the bundler handles the rest.

### Resolved during the hardening pass (originally on this backlog)

- ~~**Live guide answers are not credit-deducted / logged.**~~ Patrons now write `UsageLog` rows with `mode: 'guide'`, `creditsUsed: 0`. Patrons and guests are rate-limited through durable `GuideExchange` rows keyed by JWT `jti`. Decision: no credit deduction — the guide is onboarding, not a creative tool.
- ~~**`handleDownload` duplicated across image / music / video pages.**~~ Extracted into a single `downloadMedia()` helper in `src/lib/mediaClient.ts`.
- ~~**`handleFreeInputSubmit` ran the same use-case → FAQ → live-guide pipeline twice.**~~ Branches collapsed; helpers (`renderUseCase`, `renderFaqAnswer`) extracted.
- ~~**All 5 guide JSON files bundled into every generation page.**~~ Now dynamic-imported per tool — Subsystem 11.
- ~~**Audio downloads named `.mpeg` instead of `.mp3`.**~~ Route now uses `extensionForMime` from `src/lib/storage.ts`.
- ~~**`downloadFilename` not escaped in `Content-Disposition`.**~~ Header is built via `buildAttachmentDisposition` with CRLF/quote/control-char stripping + RFC 5987 form.

### Backlog (deferred, not blocking)

- ~~**Guide content for Chat and Code**~~ — All five guide JSON files (`chat.json`, `code.json`, `image.json`, `music.json`, `video.json`) have been verbatim-aligned against the user-supplied PDFs. FAQ category order standardised to `criticalUse → practical → concept` across all files and in `GuidePanel`'s `allFaqs` union and category button rendering.
- **Single-question stateless live guide.** Multi-turn follow-up ("can you explain that more simply?") is not supported. This is intentional for now (keeps state simple) but is the most likely thing a Tier 1 patron will want — it should be revisited if user testing surfaces it.
- **No analytics on which static FAQs are read vs. which questions go to the live model.** A lightweight client-side ping on FAQ open / use-case open / live-guide invocation would tell us where the static content is too thin.
- **Coachmark target rect doesn't auto-update on layout changes other than resize.** If a tour step's target element scrolls or is otherwise repositioned without a window resize, the ring drifts. Acceptable for the kiosk's current pages (no virtualized lists) but a future content-rich page would need an `IntersectionObserver` or a per-frame poll.
- **The guide tier is still browser-local storage, not a server-side user field.** Namespacing prevents kiosk-user leakage, but a patron logging in on a different kiosk gets the wizard again. If a persistent login surface ever materializes, this should move to `User.guideTier`.
- **AVIF on download for guests vs. patrons.** Patrons get AVIF (transcoded server-side in `imagePipeline`); guests get whatever the provider sent (currently PNG). Three options were discussed (accept the split + word the FAQ around it; transcode in the guest proxy; transcode at generation time). Deferred pending team alignment.
- **Background reaper for `MediaSession.storageStatus = 'FAILED'`.** The R2 upload retry catches most transient failures, and the download proxy serves any that still slip through, but a weekly cron that re-attempts FAILED rows with a still-live `sourceProviderUrl` would let those sessions transition to UPLOADED and benefit from the free direct path on subsequent clicks.
- **Code page has nested layout containers.** `gen-container > code-container` with inline `flex: 1` on the inner. Smelly but contained — flagged for a future page-layout pass.
- **Fallback download extensions are hardcoded** in `image/page.tsx` / `music/page.tsx` / `video/page.tsx` (`'generated-image.png'`, `'generated-track.mp3'`, `'generated-video.mp4'`). Only matters for the legacy/guest fallback branch — the primary R2 path is correct via `extensionForMime`. Intentionally left to the download-flow owner; touches code outside this milestone's scope.

## AI VALIDATION PLAN (how will the Executor of this plan know when it is done?)

The plan was implemented over multiple sessions on `arpita-explore`; this section reflects what would prove the implementation correct.

1. **Static analysis**: `npx tsc --noEmit` passes; no untyped JSON imports, no `any` in `GuidePanel.tsx` or `CoachmarkTour.tsx`. The guide content JSON files are typed via the `GuideContent` interface and used through `as GuideContent` casts.
2. **Build**: `npm run build` succeeds with no Next.js client/server boundary errors. The most fragile boundary is `GuidePanel`'s static JSON imports — they must not pull `'server-only'` modules transitively.
3. **`/api/guide` smoke test**: posting `{ question: "what is a prompt?", tool: "image", tier: 1 }` with a valid bearer token returns a 200 with a non-empty `response` field whose content is at a Tier-1 reading level. Posting without auth returns 401. Posting with `tool: "weather"` returns 400 before a quota slot or model call is attempted.
4. **Fuzzy match unit checks** (manual at the moment, should be automated in a follow-up):
   - `"I don't know what a JPEG is"` returns the `What is a JPEG file?` FAQ in the image guide.
   - `"JPEG means?"` returns the same.
   - `"Is PNG the same as JPEG?"` returns `null` (orphan token `png`) and routes to the live model.
   - `"How do I download my image?"` returns the download FAQ (token-overlap with the "Can I download or save my generated image?" question).
5. **Coachmark tour**: clearing `localStorage` and reloading any generation page shows the tour. Clicking through to "Got it!" persists `cm_<user>_<tool>=true`. Clicking "↺ Restart page tour" inside the Learning Guide replays the tour without a reload.
6. **Download**: clicking Download on an UPLOADED image/video/music session results in a file download (not a new browser tab) with a sensible filename (`generated-image.avif`, `generated-video.mp4`, `generated-music.mp3` etc.). Confirm via DevTools Network that the request is to `/api/media-sessions/<id>/url?download=true` and the redirected R2 response includes `Content-Disposition: attachment`.
7. **Theme toggle in header**: switching themes from the toggle in the header persists across page navigations and reloads. No theme flash on cold reloads (the inline `<script>` in `<head>` still wins).
8. **Header `actions`**: removing the actions prop from any generation page (e.g. by reverting just one page) cleanly drops the Learning Guide button without breaking layout. The `actions` slot is otherwise unused on the dashboard and admin pages.
9. **Video history resilience**: simulate a video session whose R2 upload failed — its sidebar entry should still play via the provider URL until that URL expires. After expiration, clicking it should set the `"This video is no longer available."` error rather than silently doing nothing.

## AI VALIDATION RESULTS (how did the Executor show that it was done?)

Filled retrospectively from the live state of `arpita-explore`.

- **TypeScript / build**: no boundary or type errors observed in the live dev server during the work. (Re-running `npx prisma generate` was needed once after pulling main due to a stale generated client; documented in the previous session.)
- **Fuzzy match bugs (specific cases reported by user)**:
  - "I don't know what a JPEG is" → was returning the file-format FAQ, then was fixed by the question-text-priority pass; now returns the *What is a JPEG file?* FAQ.
  - "JPEG means?" → same fix.
  - "Is PNG the same as JPEG?" → was matching the JPEG FAQ via "same" as an incidental token; fixed by orphan-token detection (`png` is not in the image guide corpus); now routes to the live model.
- **Three-dot menu vs. button**: confirmed by the user that both work for music and video (initial fix incorrectly removed the three-dot menu reference from the FAQ; restored to the verbatim PDF copy).
- **Theme toggle**: visually verified inside the header on all generation pages; floating fixed-position version is gone from `layout.tsx`.
- **Download button**: end-to-end download produces a file (not a tab) on an UPLOADED image session.
- **Coachmark tour**: per-user-per-tool persistence verified manually; restart link in Learning Guide replays the tour.
- **Login**: separately fixed during this session — the "Unknown argument `lastLoginAt`" error was due to a stale generated Prisma client; resolved by `npx prisma generate`. Not a code change in this milestone.
- **Merge with main**: the merge brought in `CreditBadge` (renewal-tooltip wrapper) from `main`. Header was reconciled to keep both `CreditBadge` and the milestone's `actions` + `ThemeToggle` additions. No conflict markers remain in the tree (`grep -R '<<<<<<< '` clean).
- **Filename escaping**: `buildAttachmentDisposition` strips control chars, quotes, backslashes from the ASCII fallback and adds RFC 5987 `filename*=UTF-8''...`. Exercised today only with safe inputs (DB enum + parsed mime fragment), but the helper means future user-influenced filenames can't break the header.
- **Guide guardrails**: word counter visible in the UI; 26-word inputs hard-block the submit button; 6th live exchange in a session short-circuits with the librarian-redirect message and `limitReached: true` in the JSON response (no model call, no UsageLog row). Confirmed via DevTools that the 6th attempt does not hit the NanoGPT endpoint.
- **System prompt scope rewrite**: "JPEG vs PNG" on the image guide at Tier 3 (which previously deflected) now answers the question. The off-topic deflection still fires for unambiguously out-of-scope questions (verified with weather / taxes prompts).
- **Use-case match hits ≥ 2**: "what is image resolution" no longer hits the custom-artwork use case (a single-token "image" overlap is rejected). Falls through to FAQ orphan check → live model. "I want a flyer for my food truck" still matches marketing-materials (multi-token overlap intact).
- **Download proxy**: patron + UPLOADED row downloads directly from R2 with no kiosk bytes in the path (verified via Network tab — the only kiosk request is the JSON URL fetch, then the browser navigates to R2). Patron + FAILED row falls through to `/api/media-sessions/<id>/download` and streams via the kiosk. Guest image (Nano Banana, CORS-blocked) now auto-downloads via the proxy POST instead of opening in a new tab. Guest music (ElevenLabs, CORS-permissive) still uses the direct blob path — no proxy call in the Network tab.
- **R2 retry**: a synthetic 503 from R2 (or a one-shot network blip) now logs a `[r2.putObject] transient failure on attempt 1/3, retrying in ~Nms` line and the upload still completes on attempt 2 or 3. Permanent failures (4xx, SSRF refusals) skip the retry entirely.
- **Guide JSON code-split**: Network tab on the Image page shows a single `image*.json` chunk fetched on first guide open, no chat/code/music/video JSON. Switching tools (e.g. opening Music page) loads `music*.json` on first open there.
- **Handler dedup**: `handleFreeInputSubmit` is now 14 lines instead of 60+. `renderUseCase` and `renderFaqAnswer` are reused by `handleUseCaseSelect` / `handleFaqSelect`. Behavior identical (each path verified by clicking through).

All five guide JSON files are now verbatim-aligned against the user-supplied PDFs. `guideLinks.ts` extended to detect bare domains (`.com`, `.org`, `.net`, `.edu`, `.gov`) as clickable links in addition to full `https?://` URLs — bare domains get `https://` prepended to their `href` at render time. `guideMatch.ts` updated with a `stem()` function (strip trailing plural `s`), an orphan-token check in `fuzzyMatchUseCase` (matching the FAQ guard), and additional stop words. `guidePrompt.ts` updated with a unified intent-detecting system prompt and separate `useCaseWordLimit` / `faqWordLimit` fields in `TIER_CAPS`.

## USER VALIDATION SUGGESTIONS

A walkthrough you can follow to see what's been built.

### A. Learning Guide — first-time user (Tier 1)

1. Open an Incognito window (so localStorage is fresh) and log in or continue as guest.
2. Open any tool, e.g. **Images**.
3. The page tour starts after ~500ms — click **Next** through each step until **Got it!**.
4. Click the **Learning Guide** button in the header. A side panel slides in with "Hi! Before we start…".
5. Pick **"I'm new to technology and AI tools"**. Notice the orange chip pulse in the panel header — that's the affordance to change tier later.
6. Click **What is this tool?** — the answer should be jargon-free and short.
7. Click **What can I do with this tool?** — pick a use case. You should see an intro, an example prompt with a copy button, tips, and a "Keep in mind" cautions block.
8. Click the **copy** button — it should briefly say "✓ Copied!" and the prompt is in your clipboard.
9. Type any of the FAQ questions roughly (e.g. "what does art style mean?") into the input — it should fuzzy-match to the corresponding FAQ.
10. Type a clearly novel question that mentions a word not in the corpus (e.g. "how do I print my image on a postcard?"). The thinking dots should appear and then a multi-bubble live-model answer at Tier-1 complexity.

### B. Tier change

1. Inside the Learning Guide, click the **New to tech ✎** chip in the panel header. The wizard should reset.
2. Pick **"I've tried AI tools and want to learn how to use them more effectively"**.
3. Re-ask the same novel question — the answer should now use AI/prompting terminology more freely.

### C. Coachmark restart

1. Inside the Learning Guide, click **↺ Restart page tour** at the top.
2. The tour should replay from step 1 without a page reload.

### D. Download

1. Generate an image (or open an existing one from history).
2. Click **Download Image**. A file with a `.avif` (or whatever the underlying mime is) extension should land in your downloads folder.
3. DevTools Network tab should show a request to `/api/media-sessions/<id>/url?download=true` followed by a navigation to a long R2 presigned URL.
4. Repeat for video (Download Video → mp4) and music (Download Audio → mp3).
5. Confirm the **three-dot menu** in the audio/video player still also offers Download — both paths are first-class.

### E. Theme toggle

1. Click the small theme icon in the page header (between the credit badge and Sign Out).
2. The whole UI should switch themes immediately, no flash on subsequent navigations.

### F. Fuzzy match regression

1. In the Image learning guide, type **"Is PNG the same as JPEG?"** — you should see thinking dots and a live-model response, **not** the JPEG FAQ.
2. Type **"I don't know what a JPEG is"** — you should see the static "What is a JPEG file?" FAQ answer, **not** the file-format one.

### G. Video history resilience

1. Open a video that successfully uploaded. It should play.
2. Click an older history item that failed mid-upload. Either it plays from the provider URL fallback, or you see the **"This video is no longer available."** error — never a silent black box.

### H. Live guide word counter

1. Open the Learning Guide on any tool.
2. Type a question that approaches 20 words — a small orange counter appears: "X / 25 words — keep it short".
3. Cross 25 words — the counter turns red ("Too long (X words). Please shorten — 25 word limit.") and the submit button is disabled.
4. Trim back to 25 words — submit re-enables.

### I. Live guide session limit

1. Inside the Learning Guide, ask 5 free-form questions that each go to the live model (avoid wording that matches an FAQ or use case — try short novel questions). The thinking dots should appear and you should get a real answer each time.
2. Ask a 6th. The response should be the "ask a librarian" message. The Network tab should show the request to `/api/guide` returning quickly (no model call), and a banner should appear above the input ("You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian.").
3. Subsequent free-form questions that would have gone to the live model are intercepted client-side — same librarian message, no network call.
4. Static FAQ matches still work even after the limit.

### J. Guest auto-download

1. Continue as guest, generate an image (Nano Banana). Click Download Image.
2. The file should download automatically (no new tab). Network tab should show a `POST /api/media-sessions/download/proxy`.
3. Switch to Music, generate a track, Download Audio. Should download via direct blob fetch (no proxy POST in Network tab — ElevenLabs allows CORS).
4. Switch to Video, generate a clip, Download Video. Should download via the proxy POST.

### K. R2 retry logs

1. Generate any image or video.
2. In Vercel logs (or terminal if running locally), look for `[r2.putObject]` or `[fetch <host>]` lines.
3. Normal generations don't produce them. If you see them firing occasionally, that's a transient blip being recovered. If you see the same retry happening on every generation back-to-back, that's a real upstream problem worth investigating.

If any of A–K doesn't behave as described, that's a regression worth filing.
