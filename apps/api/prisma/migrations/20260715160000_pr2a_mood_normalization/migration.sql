-- CreateEnum
CREATE TYPE "MoodCanonical" AS ENUM ('hard', 'low', 'ok', 'good', 'great');

-- CreateEnum
CREATE TYPE "MoodProvenance" AS ENUM ('MOOD_LOG', 'DIARY', 'READER_REFLECTION', 'ONBOARDING', 'IMPORT', 'SEED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MoodExclusionReason" AS ENUM ('not_selected', 'ambiguous_default', 'pre_normalizer_review', 'legacy_vocabulary', 'unknown_token', 'stale_normalizer');

-- AlterTable · MoodLog — additive server-owned normalization columns (PR-2A).
ALTER TABLE "MoodLog"
  ADD COLUMN "moodNormalized" "MoodCanonical",
  ADD COLUMN "moodProvenance" "MoodProvenance",
  ADD COLUMN "moodExplicitlySelected" BOOLEAN,
  ADD COLUMN "moodVocabularyVersion" TEXT,
  ADD COLUMN "moodNormalizerVersion" TEXT,
  ADD COLUMN "moodClientVersion" TEXT,
  ADD COLUMN "moodEligibleForDynamics" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moodExclusionReason" "MoodExclusionReason";

-- AlterTable · DiaryEntry — same additive columns + make the raw mood nullable.
ALTER TABLE "DiaryEntry"
  ADD COLUMN "moodNormalized" "MoodCanonical",
  ADD COLUMN "moodProvenance" "MoodProvenance",
  ADD COLUMN "moodExplicitlySelected" BOOLEAN,
  ADD COLUMN "moodVocabularyVersion" TEXT,
  ADD COLUMN "moodNormalizerVersion" TEXT,
  ADD COLUMN "moodClientVersion" TEXT,
  ADD COLUMN "moodEligibleForDynamics" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moodExclusionReason" "MoodExclusionReason";

ALTER TABLE "DiaryEntry" ALTER COLUMN "mood" DROP NOT NULL;

-- INV-1 (frozen contract): an observation may be eligible ONLY when it resolved
-- to a canonical category AND was explicitly selected AND has no exclusion
-- reason. Prisma cannot express CHECK constraints in the schema, so it lives
-- here as raw SQL; a future `migrate dev` may report it as drift — that is
-- expected and documented (docs/architecture/emotional-map-mood-normalization.md).
ALTER TABLE "MoodLog"
  ADD CONSTRAINT "MoodLog_eligible_requires_normalized_explicit_chk"
  CHECK (
    "moodEligibleForDynamics" = false
    OR (
      "moodNormalized" IS NOT NULL
      AND "moodExplicitlySelected" = true
      AND "moodExclusionReason" IS NULL
    )
  );

ALTER TABLE "DiaryEntry"
  ADD CONSTRAINT "DiaryEntry_eligible_requires_normalized_explicit_chk"
  CHECK (
    "moodEligibleForDynamics" = false
    OR (
      "moodNormalized" IS NOT NULL
      AND "moodExplicitlySelected" = true
      AND "moodExclusionReason" IS NULL
    )
  );

-- CreateIndex · eligible-only fast scan for the future OU fetch (OU stays off).
CREATE INDEX "MoodLog_userId_moodEligibleForDynamics_createdAt_idx" ON "MoodLog"("userId", "moodEligibleForDynamics", "createdAt" DESC);
CREATE INDEX "DiaryEntry_userId_moodEligibleForDynamics_createdAt_idx" ON "DiaryEntry"("userId", "moodEligibleForDynamics", "createdAt" DESC);
