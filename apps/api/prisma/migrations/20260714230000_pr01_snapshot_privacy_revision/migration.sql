-- PR-0.1 · provenance on the snapshot.
--
-- Records WHICH privacy revision a snapshot's numbers were computed under. This
-- is not the safety mechanism -- the shared lock on the User row, re-validated
-- inside the write transaction, is. This column is what makes a row auditable
-- after the fact: given a snapshot, which consent state produced it.
--
-- Additive and nullable. Rows written before this migration keep NULL, which
-- reads as "we cannot vouch for the consent state of these numbers".
ALTER TABLE "EmotionalMapSnapshot"
  ADD COLUMN IF NOT EXISTS "privacyRevision" INTEGER;
