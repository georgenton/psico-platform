-- Native reader identity for reading sessions and completion.
--
-- A chapter that Content Studio created has no legacy Chapter row, so the two
-- tables that record what a reader has done need somewhere else to point. Both
-- changes are additive: no column is dropped and no row is rewritten.
--
-- `chapterId` becomes nullable rather than being replaced. Every existing row
-- keeps it, keeps its unique index, and keeps resolving exactly as before —
-- legacy continuity is the whole reason this is a widening rather than a
-- migration of identity.

ALTER TABLE "ReadingSession" ALTER COLUMN "chapterId" DROP NOT NULL;
ALTER TABLE "ReadingSession" ADD COLUMN "contentUnitId" TEXT;

ALTER TABLE "UserProgress" ALTER COLUMN "chapterId" DROP NOT NULL;
ALTER TABLE "UserProgress" ADD COLUMN "contentUnitId" TEXT;

-- One session and one completion per user per native unit. Postgres treats
-- NULLs as distinct in a unique index, so these constrain only the rows that
-- actually carry a native identity — legacy rows are unaffected.
CREATE UNIQUE INDEX "ReadingSession_userId_contentUnitId_key"
  ON "ReadingSession"("userId", "contentUnitId");
CREATE UNIQUE INDEX "UserProgress_userId_contentUnitId_key"
  ON "UserProgress"("userId", "contentUnitId");

ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_contentUnitId_fkey"
  FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_contentUnitId_fkey"
  FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one identity, never both and never neither. Without this a row could
-- claim to be two chapters at once, and the reader would have no way to say
-- which progress is real.
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_one_identity"
  CHECK (("chapterId" IS NOT NULL) <> ("contentUnitId" IS NOT NULL));
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_one_identity"
  CHECK (("chapterId" IS NOT NULL) <> ("contentUnitId" IS NOT NULL));
