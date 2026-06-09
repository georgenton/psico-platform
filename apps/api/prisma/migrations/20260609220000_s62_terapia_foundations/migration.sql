-- CreateEnum
CREATE TYPE "TherapyModality" AS ENUM ('INDIVIDUAL', 'COUPLE', 'FAMILY');

-- CreateEnum
CREATE TYPE "TherapySessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'MISSED');

-- CreateEnum
CREATE TYPE "TherapyPrescriptionKind" AS ENUM ('BOOK', 'AUDIO', 'EXERCISE', 'CARTA');

-- CreateEnum
CREATE TYPE "TherapyNotificationKind" AS ENUM ('SESSION_REMINDER_24H', 'SESSION_REMINDER_1H', 'SESSION_STARTED', 'SESSION_RESCHEDULED', 'SESSION_CANCELLED', 'PRESCRIPTION_NEW', 'PRESCRIPTION_DUE_SOON', 'CRISIS_FOLLOWUP');

-- CreateEnum
CREATE TYPE "CrisisTrigger" AS ENUM ('ECO_SAFETY_LAYER', 'HOME_BUTTON', 'PROFILE_LINK', 'THERAPIST_SUGGESTION');

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "coverToken" TEXT NOT NULL DEFAULT 'warm',
    "bioShort" TEXT NOT NULL,
    "bioLong" TEXT,
    "approach" TEXT,
    "specialties" TEXT[],
    "modalities" "TherapyModality"[],
    "languages" TEXT[],
    "genderId" TEXT,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "acceptsInsurance" BOOLEAN NOT NULL DEFAULT false,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "firstSessionPolicy" TEXT,
    "cancellationPolicy" TEXT,
    "videoPresentationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistAvailability" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "TherapistAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistReview" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 50,
    "modality" "TherapyModality" NOT NULL,
    "status" "TherapySessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "firstReasonId" TEXT,
    "roomUrl" TEXT,
    "roomCreatedAt" TIMESTAMP(3),
    "intentionCiphertext" TEXT,
    "intentionNonce" TEXT,
    "checkInMood" TEXT,
    "sharedEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedbackRating" INTEGER,
    "feedbackTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedbackNoteCiphertext" TEXT,
    "feedbackNoteNonce" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "rescheduledFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyPrescription" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "kind" "TherapyPrescriptionKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "dosage" TEXT,
    "note" TEXT,
    "dueBy" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapyPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "TherapyNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "TherapyNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrisisLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "trigger" "CrisisTrigger" NOT NULL,
    "contactedLineId" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrisisLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_userId_key" ON "Therapist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_licenseNumber_key" ON "Therapist"("licenseNumber");

-- CreateIndex
CREATE INDEX "Therapist_isActive_idx" ON "Therapist"("isActive");

-- CreateIndex
CREATE INDEX "Therapist_popularity_idx" ON "Therapist"("popularity");

-- CreateIndex
CREATE INDEX "TherapistAvailability_therapistId_dayOfWeek_idx" ON "TherapistAvailability"("therapistId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistFavorite_userId_therapistId_key" ON "TherapistFavorite"("userId", "therapistId");

-- CreateIndex
CREATE INDEX "TherapistFavorite_userId_idx" ON "TherapistFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistReview_therapistId_userId_key" ON "TherapistReview"("therapistId", "userId");

-- CreateIndex
CREATE INDEX "TherapistReview_therapistId_idx" ON "TherapistReview"("therapistId");

-- CreateIndex
CREATE INDEX "TherapySession_userId_scheduledAt_idx" ON "TherapySession"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TherapySession_therapistId_scheduledAt_idx" ON "TherapySession"("therapistId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TherapySession_status_scheduledAt_idx" ON "TherapySession"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "TherapyPrescription_userId_idx" ON "TherapyPrescription"("userId");

-- CreateIndex
CREATE INDEX "TherapyPrescription_userId_completedAt_idx" ON "TherapyPrescription"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "TherapyNotification_userId_readAt_idx" ON "TherapyNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "TherapyNotification_userId_createdAt_idx" ON "TherapyNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CrisisLog_createdAt_idx" ON "CrisisLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistAvailability" ADD CONSTRAINT "TherapistAvailability_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistFavorite" ADD CONSTRAINT "TherapistFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistFavorite" ADD CONSTRAINT "TherapistFavorite_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistReview" ADD CONSTRAINT "TherapistReview_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistReview" ADD CONSTRAINT "TherapistReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPrescription" ADD CONSTRAINT "TherapyPrescription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPrescription" ADD CONSTRAINT "TherapyPrescription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TherapySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyNotification" ADD CONSTRAINT "TherapyNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyNotification" ADD CONSTRAINT "TherapyNotification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TherapySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrisisLog" ADD CONSTRAINT "CrisisLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
