-- Content Core (CC-2) — additive schema only. New tables coexist with the legacy
-- Book/Chapter/ChapterBlock model; nothing reads them yet, no backfill here.
-- Generated DDL below (Prisma diff), followed by constraints Prisma cannot express:
-- the ConceptLink XOR CHECK, its two partial-unique indexes, and cross-edition
-- integrity (enforced by triggers — a Postgres CHECK cannot reference another
-- table). All apply cleanly on empty tables. See ADR 0016.

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('PARAGRAPH', 'HEADING', 'QUOTE', 'EXERCISE', 'AUDIO', 'IMAGE', 'PAUSE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ConceptRole" AS ENUM ('PRIMARY', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "LearningEventKind" AS ENUM ('UNIT_OPENED', 'UNIT_COMPLETED', 'BLOCK_DWELL', 'GUIDE_SESSION_STARTED', 'GUIDE_SESSION_COMPLETED', 'HIGHLIGHT_CREATED', 'ANNOTATION_CREATED', 'RESONANCE_CONFIRMED');

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "editionKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es-419',
    "publishedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionUnit" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "partNumber" INTEGER,
    "partTitle" TEXT,

    CONSTRAINT "RevisionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentUnit" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentUnitVersion" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentUnitVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "legacyBlockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockVersion" (
    "id" TEXT NOT NULL,
    "contentBlockId" TEXT NOT NULL,
    "unitVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "BlockKind" NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptLink" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "unitId" TEXT,
    "contentBlockId" TEXT,
    "role" "ConceptRole" NOT NULL DEFAULT 'PRIMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LearningEventKind" NOT NULL,
    "editionId" TEXT,
    "unitId" TEXT,
    "blockKey" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Work_workKey_key" ON "Work"("workKey");

-- CreateIndex
CREATE UNIQUE INDEX "Edition_editionKey_key" ON "Edition"("editionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Edition_slug_key" ON "Edition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Edition_publishedRevisionId_key" ON "Edition"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "Edition_workId_idx" ON "Edition"("workId");

-- CreateIndex
CREATE INDEX "Revision_editionId_status_idx" ON "Revision"("editionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_editionId_number_key" ON "Revision"("editionId", "number");

-- CreateIndex
CREATE INDEX "RevisionUnit_unitVersionId_idx" ON "RevisionUnit"("unitVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionUnit_revisionId_unitId_key" ON "RevisionUnit"("revisionId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionUnit_revisionId_order_key" ON "RevisionUnit"("revisionId", "order");

-- CreateIndex
CREATE INDEX "ContentUnit_editionId_idx" ON "ContentUnit"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentUnit_editionId_unitKey_key" ON "ContentUnit"("editionId", "unitKey");

-- CreateIndex
CREATE INDEX "ContentUnitVersion_unitId_idx" ON "ContentUnitVersion"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_blockKey_key" ON "ContentBlock"("blockKey");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_legacyBlockId_key" ON "ContentBlock"("legacyBlockId");

-- CreateIndex
CREATE INDEX "ContentBlock_unitId_idx" ON "ContentBlock"("unitId");

-- CreateIndex
CREATE INDEX "BlockVersion_contentBlockId_idx" ON "BlockVersion"("contentBlockId");

-- CreateIndex
CREATE INDEX "BlockVersion_contentHash_idx" ON "BlockVersion"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "BlockVersion_unitVersionId_contentBlockId_key" ON "BlockVersion"("unitVersionId", "contentBlockId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockVersion_unitVersionId_order_key" ON "BlockVersion"("unitVersionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_conceptKey_key" ON "Concept"("conceptKey");

-- CreateIndex
CREATE INDEX "ConceptLink_conceptId_idx" ON "ConceptLink"("conceptId");

-- CreateIndex
CREATE INDEX "ConceptLink_unitId_idx" ON "ConceptLink"("unitId");

-- CreateIndex
CREATE INDEX "ConceptLink_contentBlockId_idx" ON "ConceptLink"("contentBlockId");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_createdAt_idx" ON "LearningEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LearningEvent_userId_kind_idx" ON "LearningEvent"("userId", "kind");

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionUnit" ADD CONSTRAINT "RevisionUnit_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionUnit" ADD CONSTRAINT "RevisionUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ContentUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionUnit" ADD CONSTRAINT "RevisionUnit_unitVersionId_fkey" FOREIGN KEY ("unitVersionId") REFERENCES "ContentUnitVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentUnit" ADD CONSTRAINT "ContentUnit_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentUnitVersion" ADD CONSTRAINT "ContentUnitVersion_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ContentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ContentUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockVersion" ADD CONSTRAINT "BlockVersion_contentBlockId_fkey" FOREIGN KEY ("contentBlockId") REFERENCES "ContentBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockVersion" ADD CONSTRAINT "BlockVersion_unitVersionId_fkey" FOREIGN KEY ("unitVersionId") REFERENCES "ContentUnitVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ContentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_contentBlockId_fkey" FOREIGN KEY ("contentBlockId") REFERENCES "ContentBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── ConceptLink: XOR target (exactly one of unitId / contentBlockId) ──────────
ALTER TABLE "ConceptLink"
  ADD CONSTRAINT "ConceptLink_target_xor"
  CHECK (("unitId" IS NULL) <> ("contentBlockId" IS NULL));

-- Partial-unique: one link per (concept, unit) and per (concept, block).
CREATE UNIQUE INDEX "ConceptLink_concept_unit_key"
  ON "ConceptLink" ("conceptId", "unitId")
  WHERE "contentBlockId" IS NULL;
CREATE UNIQUE INDEX "ConceptLink_concept_block_key"
  ON "ConceptLink" ("conceptId", "contentBlockId")
  WHERE "unitId" IS NULL;

-- ── Cross-edition integrity (triggers; CHECK cannot span tables) ─────────────
-- A RevisionUnit's unit must belong to the revision's edition, and its version
-- must be a version of that unit.
CREATE OR REPLACE FUNCTION "content_core_revision_unit_same_edition"()
RETURNS TRIGGER AS $$
DECLARE
  rev_edition TEXT;
  unit_edition TEXT;
  ver_unit TEXT;
BEGIN
  SELECT "editionId" INTO rev_edition FROM "Revision" WHERE "id" = NEW."revisionId";
  SELECT "editionId" INTO unit_edition FROM "ContentUnit" WHERE "id" = NEW."unitId";
  SELECT "unitId" INTO ver_unit FROM "ContentUnitVersion" WHERE "id" = NEW."unitVersionId";
  IF unit_edition IS DISTINCT FROM rev_edition THEN
    RAISE EXCEPTION 'REVISION_UNIT_CROSS_EDITION: unit % is not in revision edition %', NEW."unitId", rev_edition;
  END IF;
  IF ver_unit IS DISTINCT FROM NEW."unitId" THEN
    RAISE EXCEPTION 'REVISION_UNIT_VERSION_MISMATCH: version % is not a version of unit %', NEW."unitVersionId", NEW."unitId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "content_core_revision_unit_same_edition_trg"
  BEFORE INSERT OR UPDATE ON "RevisionUnit"
  FOR EACH ROW EXECUTE FUNCTION "content_core_revision_unit_same_edition"();

-- An Edition's publishedRevision must belong to that same edition.
CREATE OR REPLACE FUNCTION "content_core_edition_published_same_edition"()
RETURNS TRIGGER AS $$
DECLARE
  rev_edition TEXT;
BEGIN
  IF NEW."publishedRevisionId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "editionId" INTO rev_edition FROM "Revision" WHERE "id" = NEW."publishedRevisionId";
  IF rev_edition IS DISTINCT FROM NEW."id" THEN
    RAISE EXCEPTION 'EDITION_PUBLISHED_CROSS_EDITION: revision % is not in edition %', NEW."publishedRevisionId", NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "content_core_edition_published_same_edition_trg"
  BEFORE INSERT OR UPDATE ON "Edition"
  FOR EACH ROW EXECUTE FUNCTION "content_core_edition_published_same_edition"();

-- ── BlockVersion must belong to a single unit ────────────────────────────────
-- A BlockVersion's ContentBlock and its ContentUnitVersion must share the same unit.
CREATE OR REPLACE FUNCTION "content_core_block_version_same_unit"()
RETURNS TRIGGER AS $$
DECLARE
  block_unit TEXT;
  ver_unit TEXT;
BEGIN
  SELECT "unitId" INTO block_unit FROM "ContentBlock" WHERE "id" = NEW."contentBlockId";
  SELECT "unitId" INTO ver_unit FROM "ContentUnitVersion" WHERE "id" = NEW."unitVersionId";
  IF block_unit IS DISTINCT FROM ver_unit THEN
    RAISE EXCEPTION 'BLOCK_VERSION_UNIT_MISMATCH: block % (unit %) vs version % (unit %)',
      NEW."contentBlockId", block_unit, NEW."unitVersionId", ver_unit;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "content_core_block_version_same_unit_trg"
  BEFORE INSERT OR UPDATE ON "BlockVersion"
  FOR EACH ROW EXECUTE FUNCTION "content_core_block_version_same_unit"();

-- ── Immutable editorial identities ───────────────────────────────────────────
-- The initial-write triggers above guarantee cross-edition consistency at insert;
-- these BEFORE UPDATE guards stop a later UPDATE from silently invalidating the
-- relationships that RevisionUnit / BlockVersion already depend on.
CREATE OR REPLACE FUNCTION "content_core_revision_edition_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."editionId" IS DISTINCT FROM OLD."editionId" THEN
    RAISE EXCEPTION 'CONTENT_CORE_IDENTITY_IMMUTABLE: Revision.editionId cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "content_core_revision_edition_immutable_trg"
  BEFORE UPDATE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION "content_core_revision_edition_immutable"();

CREATE OR REPLACE FUNCTION "content_core_unit_edition_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."editionId" IS DISTINCT FROM OLD."editionId" THEN
    RAISE EXCEPTION 'CONTENT_CORE_IDENTITY_IMMUTABLE: ContentUnit.editionId cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "content_core_unit_edition_immutable_trg"
  BEFORE UPDATE ON "ContentUnit"
  FOR EACH ROW EXECUTE FUNCTION "content_core_unit_edition_immutable"();

CREATE OR REPLACE FUNCTION "content_core_version_unit_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."unitId" IS DISTINCT FROM OLD."unitId" THEN
    RAISE EXCEPTION 'CONTENT_CORE_IDENTITY_IMMUTABLE: ContentUnitVersion.unitId cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "content_core_version_unit_immutable_trg"
  BEFORE UPDATE ON "ContentUnitVersion"
  FOR EACH ROW EXECUTE FUNCTION "content_core_version_unit_immutable"();

CREATE OR REPLACE FUNCTION "content_core_block_unit_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."unitId" IS DISTINCT FROM OLD."unitId" THEN
    RAISE EXCEPTION 'CONTENT_CORE_IDENTITY_IMMUTABLE: ContentBlock.unitId cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "content_core_block_unit_immutable_trg"
  BEFORE UPDATE ON "ContentBlock"
  FOR EACH ROW EXECUTE FUNCTION "content_core_block_unit_immutable"();
