-- CreateEnum
CREATE TYPE "ChapterBlockKind" AS ENUM ('PARAGRAPH', 'HEADING', 'QUOTE', 'EXERCISE', 'AUDIO', 'IMAGE', 'PAUSE');

-- CreateEnum
CREATE TYPE "HighlightColor" AS ENUM ('YELLOW', 'BLUE', 'PINK');

-- CreateTable
CREATE TABLE "ChapterBlock" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "ChapterBlockKind" NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "color" "HighlightColor" NOT NULL DEFAULT 'YELLOW',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "lastBlockId" TEXT,
    "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReadingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterBlock_chapterId_idx" ON "ChapterBlock"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterBlock_chapterId_order_key" ON "ChapterBlock"("chapterId", "order");

-- CreateIndex
CREATE INDEX "Highlight_userId_blockId_idx" ON "Highlight"("userId", "blockId");

-- CreateIndex
CREATE INDEX "Highlight_userId_createdAt_idx" ON "Highlight"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Annotation_userId_blockId_idx" ON "Annotation"("userId", "blockId");

-- CreateIndex
CREATE INDEX "Annotation_userId_createdAt_idx" ON "Annotation"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingSession_userId_chapterId_key" ON "ReadingSession"("userId", "chapterId");

-- CreateIndex
CREATE INDEX "ReadingSession_userId_lastSeenAt_idx" ON "ReadingSession"("userId", "lastSeenAt" DESC);

-- AddForeignKey
ALTER TABLE "ChapterBlock" ADD CONSTRAINT "ChapterBlock_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ChapterBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ChapterBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
