-- CreateTable
CREATE TABLE "GuideExchange" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideExchange_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "GuideExchange_userId_idx" ON "GuideExchange"("userId");

-- CreateIndex
CREATE INDEX "GuideExchange_updatedAt_idx" ON "GuideExchange"("updatedAt");

-- AddForeignKey
ALTER TABLE "GuideExchange" ADD CONSTRAINT "GuideExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
