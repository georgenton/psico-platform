-- CreateEnum
CREATE TYPE "TherapyPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterTable: add payment fields to TherapySession
ALTER TABLE "TherapySession" ADD COLUMN "paymentStatus" "TherapyPaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "TherapySession" ADD COLUMN "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE INDEX "TherapySession_paymentStatus_idx" ON "TherapySession"("paymentStatus");
