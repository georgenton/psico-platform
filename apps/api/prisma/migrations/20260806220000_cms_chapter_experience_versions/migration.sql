-- CMS V1 (#637) — chapter experience definitions in the database.
--
-- Additive only. Nothing in Guide, Content Core, Books, Chapters, Media or the
-- Emotional Map is touched: the runtime keeps resolving code-owned definitions
-- until a row here is PUBLISHED for the same pin.

CREATE TYPE "ExperienceVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "ChapterExperienceVersion" (
    "id" TEXT NOT NULL,
    "experienceKey" TEXT NOT NULL,
    "experienceVersion" INTEGER NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "status" "ExperienceVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definitionJson" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ChapterExperienceVersion_pkey" PRIMARY KEY ("id")
);

-- The pin IS the identity: two rows may never claim the same exact version.
CREATE UNIQUE INDEX "ChapterExperienceVersion_experienceKey_experienceVersion_key"
    ON "ChapterExperienceVersion"("experienceKey", "experienceVersion");

CREATE INDEX "ChapterExperienceVersion_bookSlug_chapterOrder_status_idx"
    ON "ChapterExperienceVersion"("bookSlug", "chapterOrder", "status");

ALTER TABLE "ChapterExperienceVersion"
    ADD CONSTRAINT "ChapterExperienceVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
