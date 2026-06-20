-- Sprint B1 — MoodLog time series + UserPreferences.ambient
--
-- Both changes are purely additive:
--   - UserPreferences gets `ambient` with default "calma", so existing rows
--     pick up the default at read time without a backfill.
--   - MoodLog is a brand new table; no data to migrate.
--
-- MoodLog is the source of truth for the Topbar MoodChip time series + the
-- weekly digest narrative + Patrones IA history. User.mood + User.moodUpdatedAt
-- stay as denormalized "current mood" cache so `/api/home` does not need to
-- JOIN this table on every render.

ALTER TABLE "UserPreferences"
  ADD COLUMN "ambient" TEXT NOT NULL DEFAULT 'calma';

CREATE TABLE "MoodLog" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "mood"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MoodLog_pkey" PRIMARY KEY ("id")
);

-- Range-scan-friendly index: per user, newest first. Drives the "last mood",
-- the Patrones time series, and the weekly digest aggregator.
CREATE INDEX "MoodLog_userId_createdAt_idx"
  ON "MoodLog" ("userId", "createdAt" DESC);

ALTER TABLE "MoodLog"
  ADD CONSTRAINT "MoodLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
