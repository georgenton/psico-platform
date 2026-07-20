-- CC-7.2 · LearningEvent V1 persistence (ADR 0017, ADR 0018).
--
-- Strictly additive. Pre-V1 rows (if any) survive untouched: every new column
-- is nullable with no default backfill, no payload is rewritten, no other
-- table is touched, and the unique index treats NULL idempotencyKey values as
-- distinct (PostgreSQL semantics), so legacy rows never collide with each
-- other or with V1 rows.

-- AlterEnum — three V1 kinds. Existing values are neither removed nor renamed.
ALTER TYPE "LearningEventKind" ADD VALUE 'CONCEPT_EXPLORED';
ALTER TYPE "LearningEventKind" ADD VALUE 'ACTIVE_RECALL_ATTEMPTED';
ALTER TYPE "LearningEventKind" ADD VALUE 'PRACTICE_COMPLETED';

-- AlterTable — V1 storage columns, all nullable for legacy compatibility.
ALTER TABLE "LearningEvent" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "LearningEvent" ADD COLUMN "schemaVersion" INTEGER;
ALTER TABLE "LearningEvent" ADD COLUMN "conceptId" TEXT;
ALTER TABLE "LearningEvent" ADD COLUMN "guideSessionId" TEXT;

-- CreateIndex — storage idempotency: one row per (user, key). NULL keys
-- (legacy rows) are exempt by PostgreSQL's distinct-NULLs unique semantics.
CREATE UNIQUE INDEX "LearningEvent_userId_idempotencyKey_key" ON "LearningEvent"("userId", "idempotencyKey");
