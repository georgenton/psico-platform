-- Content Core (CC-4) — anchor columns on Highlight/Annotation, additive only.
-- Adds a NULLABLE stable FK to ContentBlock (onDelete: Restrict) + a quote
-- snapshot. The legacy `blockId` FK to ChapterBlock stays; no column is dropped.
-- Backfilled + dual-read (contentBlock → legacy ChapterBlock) so reads keep
-- working through the transition. See ADR 0016 §D.

-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "contentBlockId" TEXT,
ADD COLUMN     "quote" TEXT;

-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "contentBlockId" TEXT,
ADD COLUMN     "quote" TEXT;

-- CreateIndex
CREATE INDEX "Highlight_contentBlockId_idx" ON "Highlight"("contentBlockId");

-- CreateIndex
CREATE INDEX "Annotation_contentBlockId_idx" ON "Annotation"("contentBlockId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_contentBlockId_fkey" FOREIGN KEY ("contentBlockId") REFERENCES "ContentBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_contentBlockId_fkey" FOREIGN KEY ("contentBlockId") REFERENCES "ContentBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

