-- Video player in the reader. Adds a dedicated VIDEO block kind so chapter
-- videos are a first-class block (like AUDIO/IMAGE) instead of an EXERCISE mock.
-- Additive + backward-compatible: existing "🎬" EXERCISE blocks still render as
-- videos via the client-side videoBlockInfo() detector.

ALTER TYPE "ChapterBlockKind" ADD VALUE 'VIDEO';
