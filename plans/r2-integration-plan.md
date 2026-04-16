# Cloudflare R2 Integration Plan for Multimodal Persistence

## Objective
Build durable, server-side storage for generated image, audio, and video assets using Cloudflare R2 so content survives kiosk resets, provider URL expiry, and browser state loss.

This plan is written for a coding agent to implement incrementally.

## Current State Summary
- Chat and code conversations are already persisted in Postgres through the Conversation model.
- Media metadata is partially persisted through MediaSession records.
- Generated media currently depends on provider-returned URLs or data URLs and is not guaranteed durable.
- Browser local state is not reliable for kiosk environments.

## Target Architecture
1. Store all generated binaries in R2 buckets.
2. Store only metadata and object references in Postgres.
3. Never trust provider URLs for long-term retention.
4. Serve private media via short-lived signed URLs or via authenticated proxy endpoint.
5. Apply lifecycle rules by media type to manage storage costs.

## Implementation Phases

## Phase 0: Prerequisites and Setup
### Tasks
1. Create Cloudflare R2 bucket.
2. Create R2 API token with least privilege.
3. Decide one region and bucket naming convention.
4. Add environment variables:
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BUCKET
   - R2_PUBLIC_BASE_URL (optional if using custom domain)
   - R2_SIGNED_URL_TTL_SECONDS
5. Install AWS SDK v3 packages for S3-compatible API.

### Deliverable
- Environment configured in local and production.

## Phase 1: Storage Abstraction Layer
### Tasks
1. Create src/lib/storage.ts with:
   - createR2Client
   - uploadBuffer
   - uploadFromUrl
   - uploadFromDataUrl
   - generateSignedGetUrl
   - deleteObject
2. Add deterministic object key builder, e.g.:
   libraries/{library}/users/{userId}/{mode}/{yyyy}/{mm}/{uuid}.{ext}
3. Infer file extension and content type robustly.
4. Add retry logic for transient upload failures.
5. Add structured logs for upload success/failure.

### Deliverable
- Reusable storage utilities with unit-testable functions.

## Phase 2: Database Schema Upgrade
### Tasks
1. Extend MediaSession model with durable storage fields:
   - storageProvider String default R2
   - objectKey String?
   - mimeType String?
   - byteSize Int?
   - checksum String?
   - sourceProviderUrl String? (audit/debug only)
   - storageStatus String default PENDING
2. Keep resultUrl for backward compatibility during migration window.
3. Add indexes for userId, mode, createdAt, and storageStatus.
4. Create and apply Prisma migration.

### Deliverable
- Schema supports durable object references and migration safety.

## Phase 3: Write Path Integration
### Tasks
1. Update image generation API route:
   - If provider returns URL, download server-side then upload to R2.
   - If provider returns base64, decode server-side then upload to R2.
   - Save object metadata in MediaSession in same request flow.
2. Update music generation API route:
   - Handle both direct URLs and binary responses.
   - Upload to R2 and persist metadata.
3. Update video flow:
   - On status completed, fetch provider video URL, upload to R2, persist metadata.
   - Ensure idempotency if status polling runs multiple times.
4. Remove or minimize storing giant data URLs in Postgres.

### Deliverable
- New generations are durable and independently retrievable from R2.

## Phase 4: Read Path and Access Control
### Tasks
1. Add endpoint to fetch playable URL by media session id.
2. Option A: Return short-lived signed URL.
3. Option B: Stream via authenticated proxy route.
4. Enforce ownership checks on every read.
5. Update image, music, and video pages to use stable backend-managed URLs.

### Deliverable
- Users can reliably access history while access remains scoped and secure.

## Phase 5: Backfill Existing MediaSession Data
### Tasks
1. Build one-time script in scripts/backfill-media-to-r2.ts.
2. Scan MediaSession rows with missing objectKey.
3. For each row:
   - If resultUrl is external provider URL, download and upload.
   - If resultUrl is data URL, decode and upload.
4. Write migration report with success and failed records.
5. Mark failures with storageStatus FAILED and reason.

### Deliverable
- Legacy media is migrated where possible.

## Phase 6: Observability, Retention, and Cost Controls
### Tasks
1. Add metrics:
   - upload latency
   - upload failure rate
   - object size by mode
   - signed URL requests
2. Add retention policy:
   - images: long retention
   - music: medium retention
   - videos: shorter default unless pinned
3. Add optional pinned or keepForever flag in DB for exemptions.
4. Add periodic cleanup job for orphaned objects.

### Deliverable
- Operable storage lifecycle with predictable spend.

## Security Requirements
1. Keep R2 credentials server-only.
2. Validate and sanitize source URLs before server-side fetch.
3. Enforce maximum file size by media type.
4. Verify content type and reject unexpected binaries.
5. Protect against SSRF when downloading provider URLs.
6. Never expose raw bucket credentials to client.

## Idempotency and Consistency Rules
1. Every generation should produce at most one durable object per completed output.
2. Polling endpoints must not create duplicate uploads.
3. Use object checksum or runId based dedupe keys where available.
4. On partial failure, save storageStatus and recover with retry job.

## Testing Plan
### Unit Tests
1. content-type inference
2. object key generation
3. upload helpers and error translation

### Integration Tests
1. image route uploads and stores metadata
2. music route uploads and stores metadata
3. video completion uploads once and returns stable URL
4. ownership checks on media retrieval

### Manual QA
1. Generate image/music/video and verify historical playback after browser restart.
2. Verify history still works after provider URL expiration.
3. Verify content remains available after kiosk machine reboot.

## Rollout Plan
1. Deploy schema changes and storage library first.
2. Deploy write-path changes behind feature flag USE_R2_PERSISTENCE.
3. Run backfill script.
4. Switch read paths to signed/proxy URLs.
5. Remove fallback dependence on provider URLs after validation window.

## Definition of Done
1. New media is always uploaded to R2 and indexed in Postgres.
2. Historical media remains accessible independent of provider URL lifetime.
3. No large base64 blobs are persisted in Postgres.
4. Access control prevents cross-user media access.
5. Monitoring and retention policies are active.

## Suggested Agent Task Breakdown
1. Task 1: Add storage library and env validation.
2. Task 2: Add Prisma migration for MediaSession fields.
3. Task 3: Integrate image route write path.
4. Task 4: Integrate music route write path.
5. Task 5: Integrate video completion write path.
6. Task 6: Implement signed URL read endpoint + frontend wiring.
7. Task 7: Add backfill script.
8. Task 8: Add tests and finalize docs.
