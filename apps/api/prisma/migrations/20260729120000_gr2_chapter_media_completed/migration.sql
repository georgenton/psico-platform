-- AlterEnum — GR-2's single media event kind. Additive only: no existing value
-- is removed or renamed, no table, column, FK or index is added.
ALTER TYPE "LearningEventKind" ADD VALUE 'CHAPTER_MEDIA_COMPLETED';
