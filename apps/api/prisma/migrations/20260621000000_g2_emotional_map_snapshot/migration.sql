-- CreateTable
CREATE TABLE "EmotionalMapSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "pct" INTEGER NOT NULL,
    "values" DOUBLE PRECISION[],
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmotionalMapSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmotionalMapSnapshot_userId_month_key" ON "EmotionalMapSnapshot"("userId", "month");

-- CreateIndex
CREATE INDEX "EmotionalMapSnapshot_userId_month_idx" ON "EmotionalMapSnapshot"("userId", "month");

-- AddForeignKey
ALTER TABLE "EmotionalMapSnapshot" ADD CONSTRAINT "EmotionalMapSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
