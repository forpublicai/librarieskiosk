-- AlterTable
ALTER TABLE "MediaSession" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "objectKey" TEXT,
ADD COLUMN     "providerRunId" TEXT,
ADD COLUMN     "sourceProviderUrl" TEXT,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'R2',
ADD COLUMN     "storageStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "MediaSession_mode_idx" ON "MediaSession"("mode");

-- CreateIndex
CREATE INDEX "MediaSession_storageStatus_idx" ON "MediaSession"("storageStatus");

-- CreateIndex
CREATE INDEX "MediaSession_providerRunId_idx" ON "MediaSession"("providerRunId");
