-- Exercise ownership: legacy Chapter XOR native ContentUnit.
--
-- `Exercise.chapterId` was NOT NULL, which asserted that every chapter a
-- practice could belong to had come from the legacy table. Content Studio
-- publishes chapters natively, and such a unit has no `Chapter` row — nor any
-- way to acquire one, since adoption is `uuidv5(chapter.id)` and a hash cannot
-- be inverted to produce a natively-minted key.
--
-- Additive and non-destructive: every existing row keeps its `chapterId` and
-- receives `contentUnitId = NULL`, so it already satisfies the CHECK below.
-- No backfill, no ownership migration, no content touched.

ALTER TABLE "Exercise" ALTER COLUMN "chapterId" DROP NOT NULL;
ALTER TABLE "Exercise" ADD COLUMN "contentUnitId" TEXT;

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_contentUnitId_fkey"
  FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Exercise_contentUnitId_idx" ON "Exercise"("contentUnitId");

-- Exactly one owner. Not "at least one": two owners would let the same
-- exercise resolve to two different units depending on which column a caller
-- happened to read, which is precisely the ambiguity this change removes.
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_one_owner"
  CHECK (num_nonnulls("chapterId", "contentUnitId") = 1);
