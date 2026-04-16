-- AlterTable
ALTER TABLE "MediaSession" ADD COLUMN "thumbnailKey" TEXT;

-- CreateIndex (composite index for checksum-based dedup lookups per user)
CREATE INDEX "MediaSession_userId_checksum_idx" ON "MediaSession"("userId", "checksum");
