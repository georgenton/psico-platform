-- CreateEnum
CREATE TYPE "TherapyTechnicalIssue" AS ENUM ('AUDIO_FAILED', 'VIDEO_FAILED', 'CONNECTION_DROPPED', 'THERAPIST_NO_SHOW', 'OTHER');

-- CreateTable
CREATE TABLE "TherapyTechnicalReport" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issue" "TherapyTechnicalIssue" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapyTechnicalReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapyTechnicalReport_sessionId_idx" ON "TherapyTechnicalReport"("sessionId");

-- CreateIndex
CREATE INDEX "TherapyTechnicalReport_issue_createdAt_idx" ON "TherapyTechnicalReport"("issue", "createdAt");

-- AddForeignKey
ALTER TABLE "TherapyTechnicalReport" ADD CONSTRAINT "TherapyTechnicalReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TherapySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyTechnicalReport" ADD CONSTRAINT "TherapyTechnicalReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
