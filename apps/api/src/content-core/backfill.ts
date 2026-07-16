import { BlockKind, type Prisma, type PrismaClient } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { blockKeyFromLegacyId } from "./lib/block-key";
import { contentHash } from "./lib/content-hash";

/**
 * Content Core — CC-3 backfill (idempotent, zero-DELETE).
 *
 * Populates the CC-2 tables FROM the legacy Book/Chapter/ChapterBlock model.
 * Reads stay legacy; nothing here changes a read path. Safe to run repeatedly:
 * every write is an upsert keyed by a natural/deterministic key, so a second run
 * is a no-op. It never deletes anything.
 *
 * Mapping (ADR 0016 §C):
 *   Book                → Work + Edition + Revision #1 (PUBLISHED) manifest
 *   Chapter             → ContentUnit + ContentUnitVersion + RevisionUnit
 *   ChapterBlock        → ContentBlock (blockKey = uuidv5(ns, legacy id)) + BlockVersion
 *   CHAPTER_CONCEPTS    → Concept + ConceptLink(unit, PRIMARY)
 */

export interface BackfillStats {
  works: number;
  editions: number;
  revisions: number;
  units: number;
  versions: number;
  blocks: number;
  blockVersions: number;
  concepts: number;
  conceptLinks: number;
}

export async function backfillContentCore(
  prisma: PrismaClient,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    works: 0,
    editions: 0,
    revisions: 0,
    units: 0,
    versions: 0,
    blocks: 0,
    blockVersions: 0,
    concepts: 0,
    conceptLinks: 0,
  };

  const books = await prisma.book.findMany({ orderBy: { slug: "asc" } });

  for (const book of books) {
    const author = book.authorId
      ? await prisma.bookAuthor.findUnique({ where: { id: book.authorId } })
      : null;

    const workKey = book.slug;
    const editionKey = `${book.slug}-1e`;

    const work = await prisma.work.upsert({
      where: { workKey },
      create: { workKey, title: book.title, authorName: author?.name ?? "" },
      update: { title: book.title, authorName: author?.name ?? "" },
    });
    stats.works += 1;

    const edition = await prisma.edition.upsert({
      where: { editionKey },
      create: {
        workId: work.id,
        editionKey,
        slug: book.slug,
        label: "Primera edición",
        language: "es-419",
      },
      update: { slug: book.slug },
    });
    stats.editions += 1;

    const revision = await prisma.revision.upsert({
      where: { editionId_number: { editionId: edition.id, number: 1 } },
      create: {
        editionId: edition.id,
        number: 1,
        status: "PUBLISHED",
        note: "cc3-backfill",
      },
      update: { status: "PUBLISHED", note: "cc3-backfill" },
    });
    stats.revisions += 1;

    // Publish the revision on the edition (same-edition — passes the trigger).
    await prisma.edition.update({
      where: { id: edition.id },
      data: { publishedRevisionId: revision.id },
    });

    const chapters = await prisma.chapter.findMany({
      where: { bookId: book.id },
      orderBy: { order: "asc" },
    });

    for (const ch of chapters) {
      const unitKey = `u-${ch.order}`;

      const unit = await prisma.contentUnit.upsert({
        where: { editionId_unitKey: { editionId: edition.id, unitKey } },
        create: { editionId: edition.id, unitKey },
        update: {},
      });
      stats.units += 1;

      // Deterministic id → idempotent (ContentUnitVersion has no natural key).
      const versionId = `cuv-${editionKey}-${unitKey}`;
      const version = await prisma.contentUnitVersion.upsert({
        where: { id: versionId },
        create: {
          id: versionId,
          unitId: unit.id,
          title: ch.title,
          summary: ch.description ?? null,
          durationMinutes: ch.durationMinutes ?? null,
        },
        update: {
          title: ch.title,
          summary: ch.description ?? null,
          durationMinutes: ch.durationMinutes ?? null,
        },
      });
      stats.versions += 1;

      const blocks = await prisma.chapterBlock.findMany({
        where: { chapterId: ch.id },
        orderBy: { order: "asc" },
      });

      for (const b of blocks) {
        const blockKey = blockKeyFromLegacyId(b.id);
        const kind = BlockKind[b.kind as keyof typeof BlockKind];
        const metaInput =
          b.meta == null ? {} : { meta: b.meta as Prisma.InputJsonValue };

        const contentBlock = await prisma.contentBlock.upsert({
          where: { blockKey },
          create: { blockKey, unitId: unit.id, legacyBlockId: b.id },
          update: { legacyBlockId: b.id },
        });
        stats.blocks += 1;

        await prisma.blockVersion.upsert({
          where: {
            unitVersionId_contentBlockId: {
              unitVersionId: version.id,
              contentBlockId: contentBlock.id,
            },
          },
          create: {
            contentBlockId: contentBlock.id,
            unitVersionId: version.id,
            order: b.order,
            kind,
            content: b.content,
            contentHash: contentHash(b.content),
            ...metaInput,
          },
          update: {
            order: b.order,
            kind,
            content: b.content,
            contentHash: contentHash(b.content),
            ...metaInput,
          },
        });
        stats.blockVersions += 1;
      }

      await prisma.revisionUnit.upsert({
        where: {
          revisionId_unitId: { revisionId: revision.id, unitId: unit.id },
        },
        create: {
          revisionId: revision.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order: ch.order,
          partNumber: ch.partNumber ?? null,
          partTitle: ch.partTitle ?? null,
        },
        update: {
          unitVersionId: version.id,
          order: ch.order,
          partNumber: ch.partNumber ?? null,
          partTitle: ch.partTitle ?? null,
        },
      });
    }

    // Concepts from the shared catalog (one PRIMARY link per chapter's unit).
    const bookConcepts = CHAPTER_CONCEPTS[book.slug];
    if (bookConcepts) {
      for (const [orderStr, concept] of Object.entries(bookConcepts)) {
        const unitKey = `u-${Number(orderStr)}`;
        const unit = await prisma.contentUnit.findUnique({
          where: { editionId_unitKey: { editionId: edition.id, unitKey } },
        });
        if (!unit) continue; // catalog references a chapter that isn't present

        const c = await prisma.concept.upsert({
          where: { conceptKey: concept.key },
          create: { conceptKey: concept.key, label: concept.label },
          update: { label: concept.label },
        });
        stats.concepts += 1;

        const linkId = `cl-${concept.key}`;
        await prisma.conceptLink.upsert({
          where: { id: linkId },
          create: {
            id: linkId,
            conceptId: c.id,
            unitId: unit.id,
            role: "PRIMARY",
          },
          update: {},
        });
        stats.conceptLinks += 1;
      }
    }
  }

  return stats;
}
