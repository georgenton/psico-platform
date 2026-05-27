-- Sprint S8 — VoiceTranscription audit row.
-- Audio is NEVER stored (07-voz.md privacy contract). Only this metadata
-- per transcription so we can compute live quota + nightly rollup.

-- CreateTable
CREATE TABLE "VoiceTranscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "language" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (range scans per user — feeds /usage + nightly rollup)
CREATE INDEX "VoiceTranscription_userId_createdAt_idx" ON "VoiceTranscription"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "VoiceTranscription" ADD CONSTRAINT "VoiceTranscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
