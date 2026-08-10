-- Content Studio C2A — chapter media definitions in the database.
--
-- Additive only. The runtime keeps resolving code-owned definitions until a row
-- here is PUBLISHED for the same media key, so this migration changes nothing a
-- reader can observe. The table starts empty on purpose: code definitions are
-- adopted deliberately, one at a time, not swept in by a data migration.
--
-- `editorialStatus` is the CMS lifecycle and is NOT the definition's own status.
-- Inside `definitionJson`, `status` keeps its runtime meaning — DRAFT is a
-- public "Coming Soon", PUBLISHED is playable. A CMS draft holding a
-- runtime-PUBLISHED definition is therefore still completely private.

CREATE TYPE "ChapterMediaEditorialStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "ChapterMediaVersion" (
    "id" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "mediaVersion" INTEGER NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "editorialStatus" "ChapterMediaEditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "definitionJson" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ChapterMediaVersion_pkey" PRIMARY KEY ("id")
);

-- At most one draft and one published row per media key.
--
-- This makes an exact lookup deterministic: there is never a second PUBLISHED
-- row competing to answer for a key. It does NOT make the row's contents
-- immutable — a direct UPDATE could still rewrite `definitionJson`. Content
-- Studio refuses to edit a published row, and that guard lives in the service;
-- the constraint guards duplication, not mutation.
CREATE UNIQUE INDEX "ChapterMediaVersion_mediaKey_editorialStatus_key"
    ON "ChapterMediaVersion"("mediaKey", "editorialStatus");

CREATE INDEX "ChapterMediaVersion_bookSlug_chapterOrder_kind_editorialStatus_idx"
    ON "ChapterMediaVersion"("bookSlug", "chapterOrder", "kind", "editorialStatus");

-- SET NULL, not CASCADE: the row is an editorial artefact about a book, not
-- personal data about the admin who happened to create it. Deleting a staff
-- account must not silently delete published catalog content.
ALTER TABLE "ChapterMediaVersion"
    ADD CONSTRAINT "ChapterMediaVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
