-- CreateEnum
CREATE TYPE "LiveActivityKind" AS ENUM ('TERAPIA_SESSION', 'LECTOR_ACTIVE', 'ECO_ACTIVE');

-- CreateTable
CREATE TABLE "LiveActivityToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "kind" "LiveActivityKind" NOT NULL,
    "pushToken" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "LiveActivityToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveActivityToken_pushToken_key" ON "LiveActivityToken"("pushToken");

-- CreateIndex
CREATE INDEX "LiveActivityToken_userId_idx" ON "LiveActivityToken"("userId");

-- CreateIndex
CREATE INDEX "LiveActivityToken_dismissedAt_idx" ON "LiveActivityToken"("dismissedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveActivityToken_userId_activityId_key" ON "LiveActivityToken"("userId", "activityId");

-- AddForeignKey
ALTER TABLE "LiveActivityToken" ADD CONSTRAINT "LiveActivityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
