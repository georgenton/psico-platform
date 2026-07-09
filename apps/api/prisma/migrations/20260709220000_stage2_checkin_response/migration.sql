-- CreateTable
CREATE TABLE "CheckinResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckinResponse_userId_createdAt_idx" ON "CheckinResponse"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CheckinResponse_userId_itemKey_createdAt_idx" ON "CheckinResponse"("userId", "itemKey", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CheckinResponse" ADD CONSTRAINT "CheckinResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
