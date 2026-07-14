-- PR-0.1 — version the emotional-map snapshots.
--
-- A snapshot produced by a different wire schema / scoring version / facts
-- config describes a different model. The API must not serve it as this
-- model's history. Existing rows keep NULL: they are of unknown provenance,
-- so from now on they are simply not served (they are not deleted — no data
-- is destroyed by this migration).
--
-- Additive only. Safe to re-run.

ALTER TABLE "EmotionalMapSnapshot"
  ADD COLUMN IF NOT EXISTS "wireSchemaVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "scoringVersion"    INTEGER,
  ADD COLUMN IF NOT EXISTS "configFingerprint" TEXT;
