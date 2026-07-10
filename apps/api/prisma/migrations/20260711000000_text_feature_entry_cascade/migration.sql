-- Fase B (Emotional Map V2) — privacy fix: derived data is sensitive data.
-- DiaryTextFeature.entryId was a bare column with no FK, so deleting a diary
-- entry left its derived on-device numbers behind. Add the FK with CASCADE so
-- deleting the entry deletes its derivatives.

-- Null out orphaned entryIds first so the constraint can be created safely
-- (rows whose source entry was already deleted keep the numbers detached from
-- any entry, matching the "no entryId" shape the API already supports).
UPDATE "DiaryTextFeature" SET "entryId" = NULL
WHERE "entryId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DiaryEntry" e WHERE e."id" = "DiaryTextFeature"."entryId"
  );

ALTER TABLE "DiaryTextFeature"
  ADD CONSTRAINT "DiaryTextFeature_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "DiaryEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
