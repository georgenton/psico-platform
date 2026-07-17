-- Content Core (CC-6C) — stable mark storage, additive only.
-- Makes the legacy `blockId` NULLABLE on Highlight/Annotation (a pure Content
-- Core block has no ChapterBlock binding), records for Highlight the source text
-- version (`blockVersionId`, Restrict), enforces at least one anchor per row via
-- a CHECK, and re-points the legacy `blockId` FK from Cascade to SET NULL so a
-- ChapterBlock deletion no longer nukes a core-anchored mark (a legacy-only mark
-- is instead protected by the CHECK). `contentBlockId` is the canonical anchor
-- for new writes; both columns are kept for legacy/backfilled rows. No column is
-- dropped. ADR 0016 §D.

-- Highlight: legacy anchor nullable + source text version.
ALTER TABLE "Highlight" ALTER COLUMN "blockId" DROP NOT NULL;
ALTER TABLE "Highlight" ADD COLUMN "blockVersionId" TEXT;
CREATE INDEX "Highlight_blockVersionId_idx" ON "Highlight"("blockVersionId");
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_blockVersionId_fkey" FOREIGN KEY ("blockVersionId") REFERENCES "BlockVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Annotation: legacy anchor nullable.
ALTER TABLE "Annotation" ALTER COLUMN "blockId" DROP NOT NULL;

-- Re-point the legacy ChapterBlock FKs: Cascade → SET NULL. Deleting a legacy
-- block detaches (never deletes) a mark that still has a canonical contentBlockId;
-- a legacy-only mark (contentBlockId NULL) can't be detached because the CHECK
-- below would be violated, so the ChapterBlock delete is blocked instead.
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_blockId_fkey";
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ChapterBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_blockId_fkey";
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ChapterBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At least one anchor must always be present (Prisma can't express CHECK).
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_anchor_present" CHECK ("blockId" IS NOT NULL OR "contentBlockId" IS NOT NULL);
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_anchor_present" CHECK ("blockId" IS NOT NULL OR "contentBlockId" IS NOT NULL);
