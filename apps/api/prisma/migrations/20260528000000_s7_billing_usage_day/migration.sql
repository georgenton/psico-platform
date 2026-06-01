-- Sprint S7 — Billing usage rollup table.
-- Populated nightly by the BullMQ `daily-usage` job; not read by the live
-- /api/subscriptions/usage endpoint. Used for Pulso admin metrics + audit.

-- CreateTable
CREATE TABLE "BillingUsageDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "booksCompleted" INTEGER NOT NULL DEFAULT 0,
    "ecoMessages" INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diaryEntries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingUsageDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique per user/day so the rollup is idempotent)
CREATE UNIQUE INDEX "BillingUsageDay_userId_day_key" ON "BillingUsageDay"("userId", "day");

-- CreateIndex (range queries over a day window — feeds Pulso dashboards)
CREATE INDEX "BillingUsageDay_day_idx" ON "BillingUsageDay"("day");

-- AddForeignKey
ALTER TABLE "BillingUsageDay" ADD CONSTRAINT "BillingUsageDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
