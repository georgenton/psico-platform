-- PR-0.1 — version the emotional-map snapshots by the identity of the FACTS.
--
-- A snapshot produced by a different facts schema, scoring version, facts
-- config or facts epoch describes a different model. The API must not serve it
-- as this model's history.
--
-- Deliberately NOT the wire schema: reshaping the API response does not move a
-- single number, so it must not discard a year of history. Same reasoning for
-- the epoch — the cache epoch and the facts epoch are separate knobs.
--
-- Existing rows keep NULL: unknown provenance, therefore never served. Nothing
-- is deleted by this migration.
--
-- Additive only. Safe to re-run.

ALTER TABLE "EmotionalMapSnapshot"
  ADD COLUMN IF NOT EXISTS "factsSchemaVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "scoringVersion"     INTEGER,
  ADD COLUMN IF NOT EXISTS "configFingerprint"  TEXT,
  ADD COLUMN IF NOT EXISTS "factsEpoch"         INTEGER;
