-- AlterTable · PR-2B — versioned client attestation of explicit selection.
-- Additive nullable column on both mood-bearing tables. NOT added to the INV-1
-- CHECK: PR-2A eligible rows still carry it null; PR-2C backfills + hardens.
ALTER TABLE "MoodLog" ADD COLUMN "moodSelectionVersion" TEXT;
ALTER TABLE "DiaryEntry" ADD COLUMN "moodSelectionVersion" TEXT;
