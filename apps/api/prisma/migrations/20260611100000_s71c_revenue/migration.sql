-- Sprint S71.C-revenue — earnings + payout settings.

CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "AuthorEarning" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "bookId" TEXT,
    "month" TIMESTAMP(3) NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthorEarning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthorEarning_authorUserId_month_idx" ON "AuthorEarning"("authorUserId", "month");
CREATE INDEX "AuthorEarning_status_month_idx" ON "AuthorEarning"("status", "month");

CREATE TABLE "AuthorPayoutSetting" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'manual',
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "taxId" TEXT,
    "legalName" TEXT,
    "legalAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthorPayoutSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorPayoutSetting_authorUserId_key" ON "AuthorPayoutSetting"("authorUserId");
