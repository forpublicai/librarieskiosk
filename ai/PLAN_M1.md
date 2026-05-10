# M1 plan: OpenRouter provider migration

## Summary

Move all generation modes (chat, code, image, video, music) off direct NanoGPT route imports and onto a provider-neutral server-side generation layer. OpenRouter becomes the production provider for every mode. The public API contracts used by the kiosk pages stay stable: chat/code still stream SSE, image still returns `url`/`b64_json` or R2 session fields, video still submits then polls with a `runId`, and music still returns `audioUrl` or R2 session fields.

This milestone also creates the seam needed for a future provider such as Hugging Face, but it does not ship a Hugging Face runtime adapter. Hugging Face's OpenAI-compatible endpoint is chat-only; other tasks require different client/task APIs, so enabling it before we have an adapter would create a fake switch. The provider interface must make a later Hugging Face adapter possible without changing route handlers.

Important provider research, checked on May 7, 2026:

- OpenRouter Chat Completions uses `POST https://openrouter.ai/api/v1/chat/completions`, supports streaming, and accepts `modalities` including text, image, and audio: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- OpenRouter image generation uses Chat Completions/Responses with `modalities` and returns images in `choices[0].message.images[].image_url.url` as base64 data URLs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- OpenRouter video generation uses async `POST /api/v1/videos`, `GET /api/v1/videos/{jobId}`, and optional `GET /api/v1/videos/{jobId}/content`: https://openrouter.ai/docs/api/api-reference/video-generation/create-videos and https://openrouter.ai/docs/api/api-reference/video-generation/get-videos
- OpenRouter music-capable audio output models include Lyria 3 Clip/Pro (`text+image -> text+audio`), discovered via `GET /api/v1/models?output_modalities=audio`; model pages describe fixed 30-second clips for Clip and full songs for Pro: https://openrouter.ai/google/lyria-3-clip-preview/api and https://openrouter.ai/google/lyria-3-pro-preview/api
- OpenRouter TTS is a separate `/api/v1/audio/speech` endpoint for speech, not music: https://openrouter.ai/docs/api/api-reference/tts/create-audio-speech
- Hugging Face Inference Providers can support multiple task types through their JS/Python inference clients, but their OpenAI-compatible HTTP endpoint is chat-completions only: https://huggingface.co/docs/inference-providers/main/en/index

## HOW TO EXECUTE A MILESTONE

[Please include what follows verbatim when you write a PLAN_M{n}.md file. It will be used to guide anyone who executes on your plan.]

If the user asks you to execute on a plan, these are the steps to take.

1. Implement the plan
   - You should check your work with AI autonomous validation and testing.
   - The hope is that implementation can be done with a minimum of user interaction, preferably none at all.
   - Once it is complete, fill in the "Validation" section to the bottom of the plan showing how you have validated it and what were the results.
   - You might have discovered better engineering
2. Perform your testing and validation
   - Update the "AI VALIDATION RESULTS" section of your PLAN_M{n}.md file
3. Review your own code. Also, ask Claude to review your work
   - You will need to provide it contect: your plan document PLAN_M{n}.md, and tell it which files or functions you've worked on. Ask it also to review your validation steps.
   - If Claude found no blockers or problems with your work, you may proceed. Do static checking (formatting, eslint, typechecking). If you need any fixes, static check again to make sure it's clean.
   - If you couldn't get Claude to run for whatever reason, the user wants you to abort and report what's wrong.
   - Keep iterating with Claude until you no longer make changes (either because you've taken on Claude's feedback from past rounds, or because your plan no successfully defends its positions so Claude accepts them). However, if you take more than 10 rounds, then somethig is wrong, so stop and let the user know.
   - We aren't looking for "blocker vs non-blocker" decisions. Instead for every suggestion from Claude you must evaluate "will this improve my code? if so then modify your code, and if not then pre-emptively defend (in code comments) why not". And if you made modifications or comments, then circle back with Claude again.
   - Do NOT reference previous rounds when you invoke it: Claude does best if starting from scratch each round, so it can re-examine the whole ask from fundamentals. Note that each time you invoke Claude it has no memory of previous invocations, which is good and will help this goal! Also, avoid asking it something like "please review the updated files" since (1) you should not reference previous rounds implicitly or explicitly, (2) it has no understanding of what the updates were; it only knows about the current state of files+repo on disk.
4. After implementation, do a "better engineering" phase
   - Clean up LEARNINGS.md and ARCHITECTURE.md. If any information there is just restating information from other files then delete it. If it would belong better elsewhere, move it. Please be careful to follow the "learnings decision tree" -- LEARNINGS.md for durable engineering wisdom, ARCHITECTURE.md for things that will apply to CodexAgent.ts in its finished state, PLAN_M{n}.md for milestone-specific notes
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

- Move chat, code, image, video, and music away from NanoGPT to OpenRouter.
- Build the migration in a modular way so another provider can be swapped in later if feasible.
- Do not break existing kiosk behavior while doing this migration.

## PLAN

### 1. Non-negotiable behavior to preserve

Preserve these existing contracts exactly unless this plan names an intentional change:

- Authentication/status/credit flow stays in the route handlers: `requireActiveSession`, `requireApproved`, `calculateCredits`, `deductCredits`, and `logUsage`.
- Guest media generation remains ephemeral. Guests must never write R2 objects or `MediaSession` rows.
- R2 media persistence remains provider-agnostic. Images/music/video still flow through `mediaPersistence` and `storage` so AVIF encoding, dedup, signed URLs, and SSRF protections remain centralized.
- Existing client endpoints stay the same:
  - `POST /api/chat` returns an SSE response.
  - `POST /api/code` returns an SSE response.
  - `POST /api/image` returns raw provider data when R2 is off, or R2 session data when R2 is on.
  - `POST /api/music` returns `audioUrl` when R2 is off/guest, or R2 session data when R2 is on.
  - `POST /api/video` returns `{ runId, status, creditsUsed?, mediaSessionId? }`.
  - `GET /api/video/status?runId=...` returns status and, when completed, `videoUrl`.
- Existing history pages and media refresh endpoints keep working.
- Build/import must not require provider keys. Provider env validation is lazy and happens only when a generation call needs that provider.

### 2. Intentional user-visible change

Music duration must become provider-capability aware.

OpenRouter's music-capable Lyria models are not a drop-in replacement for NanoGPT's current variable-duration music path. The default OpenRouter music model for this milestone is `google/lyria-3-clip-preview`, which produces 30-second clips. Therefore:

- For OpenRouter music, the effective duration is fixed at 30 seconds.
- The server must charge credits using `calculateCredits('music', 30)`.
- The music page must not show the old 10s-5m slider when the active provider/model has `fixedDurationSec: 30`. It should show a fixed "Duration: 30s" value and the correct credit cost.
- Lyrics and instrumental inputs stay. The provider prompt builder includes lyrics only when supplied and asks for instrumental output when `instrumental` is true.
- A future provider may restore variable duration by declaring a `durationRange`.

This avoids silently charging for a requested 10-300 seconds while returning a fixed-length OpenRouter result.

### 3. Provider abstraction

Create a server-only provider layer under `src/lib/ai/`.

Files:

- `src/lib/ai/types.ts`
- `src/lib/ai/errors.ts`
- `src/lib/ai/env.ts`
- `src/lib/ai/modelConfig.ts`
- `src/lib/ai/providers/openrouter.ts`
- `src/lib/ai/providers/nanogpt.ts` (temporary rollback adapter)
- `src/lib/ai/provider.ts`

All files that read env vars or make provider requests must start with `import 'server-only';`.

Provider interface:

```ts
export type GenerationProviderId = 'openrouter' | 'nanogpt';
export type GenerationMode = 'chat' | 'code' | 'image' | 'video' | 'music';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ImageGenerationResult {
    url?: string;
    b64_json?: string;
    dataUrl?: string;
    providerGenerationId?: string;
}

export interface MusicGenerationResult {
    audioUrl?: string;
    audioBuffer?: ArrayBuffer;
    contentType?: string;
    providerGenerationId?: string;
    effectiveDurationSec?: number;
}

export interface VideoSubmitResult {
    runId: string;
    status: string;
    providerGenerationId?: string;
    pollingUrl?: string;
    cost?: number;
}

export interface VideoStatusResult {
    status: string;
    videoUrl?: string;
    videoBuffer?: ArrayBuffer;
    contentType?: string;
    providerGenerationId?: string;
    cost?: number;
    error?: string;
    details?: string;
}

export interface ModeModelSettings {
    model: string;
    label: string;
    fallbackModels?: string[];
    systemPrompt?: string;
    image?: {
        modalities: Array<'image' | 'text'>;
        aspectRatio?: string;
        imageSize?: string;
    };
    video?: {
        aspectRatio: string;
        resolution: string;
        generateAudio: boolean;
    };
    music?: {
        modalities: Array<'text' | 'audio'>;
        format: 'mp3' | 'wav';
        fixedDurationSec?: number;
        durationRange?: { min: number; max: number; step: number };
    };
}

export interface GenerationProvider {
    id: GenerationProviderId;
    chatStream(input: {
        messages: ChatMessage[];
        settings: ModeModelSettings;
        apiKey: string;
        userId: string;
        library: string | null | undefined;
    }): Promise<ReadableStream>;
    generateImage(input: {
        prompt: string;
        settings: ModeModelSettings;
        apiKey: string;
        userId: string;
        library: string | null | undefined;
    }): Promise<ImageGenerationResult>;
    generateMusic(input: {
        prompt: string;
        lyrics: string;
        instrumental: boolean;
        durationSec: number;
        settings: ModeModelSettings;
        apiKey: string;
        userId: string;
        library: string | null | undefined;
    }): Promise<MusicGenerationResult>;
    submitVideo(input: {
        prompt: string;
        durationSec: number;
        settings: ModeModelSettings;
        apiKey: string;
        userId: string;
        library: string | null | undefined;
    }): Promise<VideoSubmitResult>;
    pollVideoStatus(input: {
        runId: string;
        settings: ModeModelSettings;
        apiKey: string;
        userId: string;
        library: string | null | undefined;
    }): Promise<VideoStatusResult>;
}
```

`src/lib/ai/provider.ts` exports:

```ts
export function getActiveProviderId(): GenerationProviderId;
export function getGenerationProvider(): GenerationProvider;
export function getProviderApiKey(providerId: GenerationProviderId, library: string | null | undefined): string;
export function getModeSettings(mode: GenerationMode, providerId?: GenerationProviderId): ModeModelSettings;
export function getClientCapabilities(providerId?: GenerationProviderId): ClientGenerationCapabilities;
```

Rules:

- `getActiveProviderId()` reads `AI_PROVIDER`. Allowed values: `openrouter`, `nanogpt`.
- During this migration, `.env.example` documents `AI_PROVIDER="openrouter"`. Local dev may set `AI_PROVIDER="nanogpt"` only as a temporary rollback.
- `getProviderApiKey('openrouter', library)` checks `OPENROUTER_API_KEY_<SLUG>` first, then `OPENROUTER_API_KEY`. Use `libraryNameToSlug` from `src/lib/library.ts`; do not hand-roll the regex.
- `getProviderApiKey('nanogpt', library)` checks existing NanoGPT vars for rollback only.
- Missing key throws `ProviderConfigError` with the provider and expected env names.
- Route handlers must import only from `@/lib/ai/provider`, never from provider-specific modules.

### 4. Model config

Replace `config/models.json` with provider-aware entries while keeping the current labels/descriptions.

Use this shape:

```json
{
  "chat": {
    "label": "GLM-5 Chat",
    "description": "Conversational AI assistant",
    "endpoint": "chat",
    "providers": {
      "openrouter": {
        "model": "z-ai/glm-5.1",
        "fallbackModels": ["z-ai/glm-5"]
      },
      "nanogpt": {
        "model": "zai-org/glm-5"
      }
    }
  },
  "coding": {
    "label": "Qwen3 Coder",
    "description": "AI coding assistant with tools",
    "endpoint": "chat",
    "systemPrompt": "You are an expert coding assistant. When the user asks you to write code, always respond with well-structured, commented code. Explain your approach briefly before writing code. If the user asks you to fix or debug code, analyze the issue and provide the corrected version.",
    "providers": {
      "openrouter": {
        "model": "qwen/qwen3-coder-next",
        "fallbackModels": ["qwen/qwen3-coder", "mistralai/devstral-2512"]
      },
      "nanogpt": {
        "model": "zai-org/glm-5"
      }
    }
  },
  "image": {
    "label": "Nano Banana 2",
    "description": "AI image generation",
    "endpoint": "image",
    "providers": {
      "openrouter": {
        "model": "google/gemini-3.1-flash-image-preview",
        "fallbackModels": ["black-forest-labs/flux.2-pro"],
        "image": {
          "modalities": ["image", "text"],
          "aspectRatio": "1:1",
          "imageSize": "1K"
        }
      },
      "nanogpt": {
        "model": "nano-banana"
      }
    }
  },
  "video": {
    "label": "Kling 3.0 Standard",
    "description": "AI video generation",
    "endpoint": "video",
    "providers": {
      "openrouter": {
        "model": "kwaivgi/kling-v3.0-std",
        "video": {
          "aspectRatio": "16:9",
          "resolution": "720p",
          "generateAudio": false
        }
      },
      "nanogpt": {
        "model": "kling-v30-std"
      }
    }
  },
  "music": {
    "label": "Lyria 3 Clip",
    "description": "AI music generation",
    "endpoint": "music",
    "providers": {
      "openrouter": {
        "model": "google/lyria-3-clip-preview",
        "music": {
          "modalities": ["text", "audio"],
          "format": "mp3",
          "fixedDurationSec": 30
        }
      },
      "nanogpt": {
        "model": "Elevenlabs-Music-V1",
        "music": {
          "durationRange": { "min": 10, "max": 300, "step": 1 }
        }
      }
    }
  }
}
```

`src/lib/ai/modelConfig.ts` validates this JSON at runtime with small hand-written type guards. Do not add a schema validation dependency for this.

`getModeSettings(mode, providerId)` returns the provider-specific model settings plus inherited label/description/systemPrompt. It throws a clear error when the active provider does not support the requested mode.

### 5. OpenRouter adapter details

Use native `fetch`; do not add `@openrouter/sdk`.

Shared fetch behavior:

- Base URL: `https://openrouter.ai/api/v1`.
- Headers:
  - `Authorization: Bearer ${apiKey}`
  - `Content-Type: application/json` for JSON requests
  - `Accept: text/event-stream` for streaming chat/code/audio output
  - Optional app attribution headers are allowed but must come from non-secret env vars if added later; do not hardcode deployment URLs.
- Retry policy matches existing NanoGPT behavior: retry network errors and 5xx/429 up to 3 attempts with exponential backoff; do not retry other 4xx errors.
- Parse OpenRouter error JSON shape `{ error: { code, message, metadata? } }` and include the provider, mode, status, and message in thrown `ProviderRequestError`.

Chat/code:

- Call `POST /chat/completions` with:
  - `model` when no fallback models are configured.
  - `models: [primary, ...fallbackModels]` when fallback models exist.
  - `messages`.
  - `stream: true`.
  - `user: userId`.
  - `session_id` can be omitted unless the route later has a conversation id.
- Return `response.body` unchanged so existing client streaming remains intact.

Image:

- Call `POST /chat/completions` with:
  - `model` or `models`.
  - `messages: [{ role: 'user', content: prompt }]`.
  - `modalities` from config.
  - `image_config.aspect_ratio` and `image_config.image_size` from config when present.
  - `stream: false`.
  - `user: userId`.
- Extract the first image from `choices[0].message.images`.
- If `image_url.url` starts with `data:image/`, return both:
  - `dataUrl` as the original data URL.
  - `b64_json` as the base64 payload stripped from the data URL.
- If OpenRouter ever returns an HTTPS URL, return `url`.
- If no image exists, throw `ProviderRequestError` with a concise message that the model did not return image data.

Music:

- Build one prompt string from style prompt, lyrics, and instrumental flag:
  - Start with the user's style/mood prompt.
  - If `instrumental` is true, append `Instrumental only. Do not include vocals.`
  - If lyrics are present, append `Use these lyrics:` followed by the lyrics.
- For OpenRouter Lyria, ignore requested duration and use `fixedDurationSec: 30` from config.
- Call `POST /chat/completions` with:
  - `model`.
  - `messages: [{ role: 'user', content: promptText }]`.
  - `modalities: ['text', 'audio']`.
  - `audio: { format: 'mp3' }`.
  - `stream: true`.
  - `user: userId`.
- Aggregate SSE chunks. For every `data: ...` event that is not `[DONE]`, parse JSON and append any `choices[0].delta.audio.data` base64 chunk. Ignore transcript chunks except for debug logs.
- Decode the combined base64 to an `ArrayBuffer`.
- Return `{ audioBuffer, contentType: 'audio/mpeg', effectiveDurationSec: 30, providerGenerationId }`.
- If the response is not SSE or no audio chunks arrive, throw a provider error. Do not fall back to TTS automatically; TTS is speech, not music.

Video:

- Submit with `POST /videos`:
  - `model`.
  - `prompt`.
  - `duration` clamped to the requested value only if supported by the model config. With `kwaivgi/kling-v3.0-std`, the current UI range of 3-15 seconds is supported.
  - `aspect_ratio: '16:9'`.
  - `resolution: '720p'`.
  - `generate_audio: false`.
  - `provider` passthrough only if a future config entry needs it.
- Normalize submit response:
  - `runId = data.id`.
  - `status = mapOpenRouterVideoStatus(data.status)`.
  - Preserve `generation_id` as `providerGenerationId`.
- Poll with `GET /videos/{runId}`.
- Normalize statuses:
  - `pending`, `queued`, `running`, `processing`, `in_progress` -> `IN_PROGRESS`.
  - `completed`, `succeeded`, `success` -> `COMPLETED`.
  - `failed`, `cancelled`, `canceled`, `expired` -> `FAILED` or `CANCELED` as appropriate.
- On completion, prefer `unsigned_urls[0]` as `videoUrl`; this keeps the existing SSRF-safe `uploadFromUrl` path.
- If a completed job has no `unsigned_urls[0]`, fetch `GET /videos/{runId}/content?index=0` with the OpenRouter Authorization header, enforce a video content type and max byte size, and return `videoBuffer`/`contentType` so persistence can upload bytes without forwarding provider auth through generic URL fetchers.

### 6. Temporary NanoGPT rollback adapter

Keep the existing `src/lib/nanogpt.ts` behavior but move access behind `src/lib/ai/providers/nanogpt.ts`.

Rules:

- Route handlers stop importing `@/lib/nanogpt`.
- `src/lib/nanogpt.ts` may remain during this milestone as implementation detail, but add a module-level comment saying new code must use `@/lib/ai/provider`.
- The rollback adapter implements the same `GenerationProvider` interface.
- Do not add new features to the NanoGPT adapter.
- After OpenRouter has run in production for at least one week, create a separate cleanup milestone to remove NanoGPT env vars, scripts, docs references, and adapter code.

### 7. Route updates

Update these route handlers:

- `src/app/api/chat/route.ts`
- `src/app/api/code/route.ts`
- `src/app/api/image/route.ts`
- `src/app/api/music/route.ts`
- `src/app/api/video/route.ts`
- `src/app/api/video/status/route.ts`

Pattern for each route:

```ts
const provider = getGenerationProvider();
const providerId = provider.id;
const settings = getModeSettings(mode, providerId);
const apiKey = getProviderApiKey(providerId, authResult.user.library);
```

Usage logging:

- See the DB/logging section below. Every route must log both `generationProvider` and `model`.
- For OpenRouter model fallbacks, log the requested primary model. If a response exposes the actual selected model cheaply, record it in console logs for now; do not block this milestone on adding a full provider cost ledger.

Credit deduction:

- Chat remains 0 credits.
- Code remains 1 credit.
- Image remains 1 credit.
- Video remains `calculateCredits('video', durationSec)` using the same 3-15s UI value.
- Music uses `effectiveDurationSec` for the active provider:
  - For OpenRouter Lyria Clip, charge 15 credits (`calculateCredits('music', 30)`).
  - For NanoGPT rollback, preserve requested duration.

Video persistence:

- Extend `finalizeVideoUpload` input to accept either:
  - `providerVideoUrl`, or
  - `providerVideoBuffer` + `providerContentType`.
- If buffer is provided, upload with `uploadBuffer`.
- Keep the existing atomic `PENDING -> UPLOADING` claim exactly as-is.
- Do not use `uploadFromUrl` for authenticated OpenRouter content endpoint URLs, because the storage layer intentionally does not forward third-party auth headers.

Image/music persistence:

- Move `ImageResult` and `MusicResult` type imports in `src/lib/mediaPersistence.ts` from `@/lib/nanogpt` to `@/lib/ai/types`.
- Update `persistImageResult` to accept `dataUrl` as well as `url`/`b64_json`.
- Keep existing AVIF encode, thumbnail, dedup, failed-row, and R2 rollback behavior.

### 8. Capabilities endpoint and frontend music adjustment

Add `GET /api/generation-capabilities`.

Auth:

- Use `requireAuth`, not `requireActiveSession`, because this is a lightweight configuration read used by pages to render controls. Guests and patrons should both be able to call it after login.
- Export `dynamic = 'force-dynamic'`.

Response:

```ts
{
    provider: 'openrouter',
    modes: {
        music: {
            model: 'google/lyria-3-clip-preview',
            label: 'Lyria 3 Clip',
            fixedDurationSec: 30,
            creditCost: 15
        },
        video: {
            model: 'kwaivgi/kling-v3.0-std',
            label: 'Kling 3.0 Standard',
            durationRange: { min: 3, max: 15, step: 1 }
        }
    }
}
```

Implementation:

- `getClientCapabilities()` reads active provider settings and returns only non-secret UI-relevant information.
- Include all modes in the response, but music/video are the only modes that need dynamic controls for this milestone.

Update `src/app/music/page.tsx`:

- Fetch `/api/generation-capabilities` after auth is ready.
- If `music.fixedDurationSec` is present:
  - Set local duration to that fixed value.
  - Render a fixed duration row instead of the slider.
  - Render cost from server-provided `creditCost`.
- Otherwise, render the existing slider using `durationRange`.
- Send the duration in the request body as before; the server remains authoritative and recomputes effective duration/cost.

Do not add a capabilities fetch to video unless needed. Kling supports the existing 3-15s range, so the current video UI can stay unchanged.

### 9. DB/logging changes

Add a small Prisma migration so future audits can distinguish the model router from the storage provider.

Schema changes:

```prisma
model UsageLog {
  // existing fields...
  generationProvider String @default("nanogpt")

  @@index([generationProvider])
}

model MediaSession {
  // existing fields...
  generationProvider String @default("nanogpt")

  @@index([generationProvider])
}
```

Rationale:

- `MediaSession.storageProvider` already means R2 and must not be overloaded.
- `UsageLog.model` alone is not enough once provider switching exists, especially if a future Hugging Face adapter uses model IDs that overlap with another provider.

Update `src/lib/credits.ts`:

- Replace positional `logUsage(userId, mode, model, prompt, creditsUsed)` with an object argument:

```ts
await logUsage({
    userId,
    mode,
    generationProvider: providerId,
    model: settings.model,
    prompt,
    creditsUsed,
});
```

- Update every call site.
- Keep the legacy `guest` skip behavior exactly as-is.

Update media persistence creation calls:

- Add `generationProvider` to `persistImageResult`, `persistMusicResult`, and `createPendingVideoSession` input objects.
- Store it on every `MediaSession` row, including failed rows.

### 10. Environment and docs updates

Update `.env.example`:

- Add:

```bash
# Active generation provider. Production target after this milestone is openrouter.
# nanogpt is retained only as a temporary rollback during migration.
AI_PROVIDER="openrouter"

# OpenRouter API Key (server-side only, never exposed to browser)
# Fallback key used when a library-scoped key below is unset.
OPENROUTER_API_KEY="sk-or-your-key-here"

# Optional per-library OpenRouter API keys. Same slug rule as kiosk library URLs.
OPENROUTER_API_KEY_POTTSBORO_TX=""
OPENROUTER_API_KEY_SALEM_CITY_UT=""
OPENROUTER_API_KEY_TREMONTON_UT=""
OPENROUTER_API_KEY_SUSSEX_COUNTY_NJ=""
```

- Keep NanoGPT env vars but mark them as temporary rollback-only.

Update docs/architecture:

- `AGENTS.md`: replace "AI provider: nano-gpt" with "provider-neutral generation layer; OpenRouter production provider; NanoGPT rollback adapter temporarily".
- `ai/ARCHITECTURE.md`: update the high-level diagram, per-library isolation axis, generation flow, and ops notes.
- `LEARNINGS.md`: add a durable provider-abstraction learning only if implementation reveals a lesson broader than this app. Do not add milestone-specific notes there.
- The repository currently has no `docs/` directory despite references in `AGENTS.md`; do not create provider docs there in this milestone. Keep provider migration docs in this plan and architecture updates.

Update scripts:

- Rename or supplement `scripts/nanogpt-probe.ts` with `scripts/openrouter-probe.ts`.
- Add `npm run probe:openrouter` to `package.json`.
- Keep `probe:nanogpt` only while the rollback adapter exists.

OpenRouter probe behavior:

- Default mode is no-cost discovery: fetch `/api/v1/models?output_modalities=image`, `/api/v1/models?output_modalities=audio`, and `/api/v1/videos/models`, then assert configured model IDs are present.
- Costly generation probes require `RUN_COSTLY_OPENROUTER_PROBES=true`.
- Costly probes:
  - Chat: one tiny streamed response.
  - Image: one small prompt; assert data URL or URL.
  - Music: one Lyria prompt; assert audio bytes.
  - Video: submit only by default; polling/download requires `RUN_VIDEO_POLL=true`.

### 11. Tests

Add focused Vitest coverage under `src/lib/ai/`.

`src/lib/ai/env.test.ts`:

- Per-library OpenRouter key lookup uses `libraryNameToSlug`.
- Fallback key is used when scoped key is empty.
- Missing key throws `ProviderConfigError`.
- No provider key is read at import time.

`src/lib/ai/modelConfig.test.ts`:

- Every mode has an OpenRouter provider config.
- OpenRouter image config includes image modality.
- OpenRouter music config has `fixedDurationSec: 30`.
- OpenRouter video config duration is compatible with the current 3-15s UI range.
- `zai-org/glm-5` is not used for OpenRouter; use `z-ai/...`.

`src/lib/ai/providers/openrouter.test.ts`:

- Chat returns the provider response body unchanged for streaming.
- Error JSON is normalized into `ProviderRequestError`.
- Image extraction handles `message.images[].image_url.url` data URLs and returns `b64_json`.
- Music SSE aggregation decodes `delta.audio.data` chunks into bytes.
- Video submit maps `id` to `runId`.
- Video poll maps OpenRouter statuses to existing kiosk statuses.
- Video poll returns `unsigned_urls[0]` when completed.

`src/lib/mediaPersistence.test.ts` if the project has test helpers for Prisma/storage; otherwise keep this as a small pure-unit test by factoring input normalization:

- `persistImageResult` recognizes `dataUrl`.
- `finalizeVideoUpload` accepts buffer input without calling `uploadFromUrl`.

Update `scripts/smoke-test.ts`:

- Keep endpoint assertions the same.
- Add a log line showing active provider from `/api/generation-capabilities`.
- For music, do not assume requested duration is honored; assert `audioUrl` exists.

### 12. Rollout sequence

1. Implement the provider layer, route migration, tests, env docs, architecture docs, and probe script.
2. Run non-costly OpenRouter discovery probe locally with `OPENROUTER_API_KEY` set.
3. Run unit tests and lint.
4. Run a local dev server against seeded DB with `AI_PROVIDER=nanogpt` to confirm rollback path still preserves current behavior.
5. Run local/staging with `AI_PROVIDER=openrouter` and `USE_R2_PERSISTENCE=false`; exercise chat, code, image, music, video submit/poll.
6. Run staging with `AI_PROVIDER=openrouter` and `USE_R2_PERSISTENCE=true`; exercise image persistence, music persistence, and video finalization.
7. Deploy production with `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and any `OPENROUTER_API_KEY_<SLUG>` vars.
8. Keep NanoGPT env vars present for one week as emergency rollback.
9. After one stable week, create a new cleanup plan to remove NanoGPT code, probe script, env vars, and docs references.

### 13. Out of scope

- Do not implement a Hugging Face adapter in this milestone.
- Do not remove NanoGPT code completely in this milestone.
- Do not add admin UI for choosing providers/models.
- Do not add dynamic per-library provider selection in the database.
- Do not add a provider cost ledger or expose OpenRouter dollar cost in admin UI.
- Do not change credit pricing beyond the OpenRouter music effective-duration correction.

## BETTER ENGINEERING INSIGHTS + BACKLOG ADDITIONS

- Backlog: remove the NanoGPT rollback adapter after OpenRouter runs in production for one week.
- Backlog: implement a Hugging Face adapter only when there is a concrete provider requirement. Hugging Face is feasible, but its non-chat tasks need task-specific APIs/client calls rather than the chat-only OpenAI-compatible endpoint.
- Backlog: add admin-facing model/provider settings only after the provider interface has proven stable. For now, config/env is safer for locked-down kiosks.
- Backlog: consider recording OpenRouter `generation_id`, selected model, provider name, and dollar cost in a separate usage-cost table. This is useful for ops, but it is not needed to preserve patron credit behavior.
- Backlog: provider capability discovery could eventually become dynamic against OpenRouter's model APIs, but this milestone should use checked-in config for deterministic kiosk UI behavior.

## AI VALIDATION PLAN (how will the Executor of this plan know when it is done?)

The executor is done when all of these pass:

1. Static checks:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
2. Unit tests:
   - Provider key resolution tests pass.
   - Provider config tests pass.
   - OpenRouter response normalization tests pass.
   - Music SSE aggregation test proves audio bytes are produced from chunks.
   - Video status tests prove completed, failed, canceled, and in-progress states map to existing route behavior.
3. No route imports `@/lib/nanogpt` directly:
   - `rg "from '@/lib/nanogpt'|from \\\"@/lib/nanogpt\\\"" src/app src/lib`
   - Expected: only the temporary NanoGPT adapter may import it.
4. No provider-specific env read is hand-rolled in routes:
   - `rg "OPENROUTER|NANOGPT" src/app`
   - Expected: no route handler reads provider env vars directly.
5. OpenRouter model discovery probe:
   - `OPENROUTER_API_KEY=... npm run probe:openrouter`
   - Expected: configured OpenRouter models are discoverable.
6. Optional costly provider probes:
   - `OPENROUTER_API_KEY=... RUN_COSTLY_OPENROUTER_PROBES=true npm run probe:openrouter`
   - Expected: chat stream, image result, and music bytes succeed.
   - Video polling/download may remain opt-in with `RUN_VIDEO_POLL=true` because it is slow and costs credits.
7. Local functional smoke with OpenRouter:
   - Start dev server with `AI_PROVIDER=openrouter`.
   - Run `BASE_URL=http://localhost:3000 SKIP_VIDEO=true npm run smoke-test`.
   - Manually test video submit/poll because full video can take minutes.
8. R2 functional smoke:
   - Repeat image/music/video tests with `USE_R2_PERSISTENCE=true`.
   - Confirm generated image thumbnails load, audio/video can be played from refreshed signed URLs, and guests still remain ephemeral.
9. Rollback smoke:
   - Start dev server with `AI_PROVIDER=nanogpt`.
   - Confirm at least chat and image still use the rollback adapter, if NanoGPT credentials are present.
10. Documentation:
   - `.env.example`, `AGENTS.md`, and `ai/ARCHITECTURE.md` describe OpenRouter and the temporary NanoGPT rollback accurately.
   - `AI VALIDATION RESULTS` below is filled with command outputs and manual test notes.

## AI VALIDATION RESULTS (how did the Executor show that it was done?)

Not executed yet. This plan is for future implementation.

## USER VALIDATION SUGGESTIONS

After implementation, validate from a seeded local or staging environment:

1. Log in as a patron and open Chat. Send a short message and confirm it streams.
2. Open Code. Ask for a tiny function and confirm it streams.
3. Open Image. Generate "a small red circle on white" and confirm the image appears and history updates.
4. Open Music. Confirm the page shows a fixed 30-second duration when OpenRouter is active. Generate a short instrumental clip and confirm audio playback works.
5. Open Video. Generate a 3-5 second prompt, wait for polling to complete, and confirm playback works.
6. Log out, continue as Guest, and repeat Image/Music once. Confirm the result appears during the guest session but does not show as persisted media after logout.
7. If R2 is enabled, reload the page and confirm image thumbnails still load and audio/video signed URLs refresh when needed.
