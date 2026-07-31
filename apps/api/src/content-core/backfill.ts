import { BlockKind, type Prisma, type PrismaClient } from "@prisma/client";
import {
  blockVersionDrifts,
  contentBlockDrifts,
  expectedBlockVersionFields,
  expectedRevisionUnitFields,
  expectedUnitVersionFields,
  revisionUnitDrifts,
  unitVersionDrifts,
} from "./backfill-inspect";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import { contentHash } from "./lib/content-hash";
import { ingestBookConcepts } from "./concept-ingestion";
import { ingestUnitExercises } from "./exercise-ingestion";

/**
 * Content Core — CC-3 backfill (atomic per Book, idempotent, zero-DELETE).
 *
 * Populates the CC-2 tables FROM the legacy Book/Chapter/ChapterBlock model.
 * Reads stay legacy; nothing here changes a read path.
 *
 * Each Book is processed inside ONE transaction. Order: Work/Edition →
 * Revision #1 as DRAFT → units/versions/blocks/manifest/concepts → verify counts
 * → ONLY THEN publish (Revision PUBLISHED + publishedAt, Edition.publishedRevisionId).
 * Any error rolls the whole Book back — never a partial or half-published revision.
 *
 * ContentUnitVersion / BlockVersion / RevisionUnit are create-or-verify: identical
 * → no-op, different → throw BACKFILL_DRIFT_DETECTED. A published version is never
 * silently rewritten.
 *
 * ContentUnit identity is uuidv5(Chapter.id) — NOT derived from Chapter.order.
 * Order lives only on RevisionUnit.
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
  /** Catalogued chapters this Book has no unit for — surfaced, not swallowed. */
  conceptsSkippedMissingUnit: number;
}

/** Test-only hook: throw after N units within a Book's transaction (to exercise
 *  rollback). Never set in production. */
export interface BackfillOptions {
  throwAfterUnits?: number;
}

const DRIFT = "BACKFILL_DRIFT_DETECTED";

export async function backfillContentCore(
  prisma: PrismaClient,
  opts: BackfillOptions = {},
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
    conceptsSkippedMissingUnit: 0,
  };

  const books = await prisma.book.findMany({ orderBy: { slug: "asc" } });

  for (const book of books) {
    const author = book.authorId
      ? await prisma.bookAuthor.findUnique({ where: { id: book.authorId } })
      : null;

    const chapters = await prisma.chapter.findMany({
      where: { bookId: book.id },
      orderBy: { order: "asc" },
    });

    await prisma.$transaction(
      async (tx) => {
        const workKey = book.slug;
        const editionKey = `${book.slug}-1e`;

        // 1. Upsert Work / Edition (mutable catalog metadata — safe to update).
        const work = await tx.work.upsert({
          where: { workKey },
          create: {
            workKey,
            title: book.title,
            authorName: author?.name ?? "",
          },
          update: { title: book.title, authorName: author?.name ?? "" },
        });
        stats.works += 1;

        const edition = await tx.edition.upsert({
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

        // 2. Revision #1 as DRAFT (create if missing; keep an existing one as-is).
        let revision = await tx.revision.findUnique({
          where: { editionId_number: { editionId: edition.id, number: 1 } },
        });
        if (!revision) {
          revision = await tx.revision.create({
            data: {
              editionId: edition.id,
              number: 1,
              status: "DRAFT",
              note: "cc3-backfill",
            },
          });
        }
        stats.revisions += 1;

        const unitIdByOrder = new Map<number, string>();
        const chapterIdByOrder = new Map<number, string>();
        let unitsThisBook = 0;

        for (const ch of chapters) {
          const unitKey = unitKeyFromLegacyChapterId(ch.id);
          chapterIdByOrder.set(ch.order, ch.id);

          // 3. ContentUnit — identity only (editionId + unitKey), no drift possible.
          let unit = await tx.contentUnit.findUnique({
            where: { editionId_unitKey: { editionId: edition.id, unitKey } },
          });
          if (!unit) {
            unit = await tx.contentUnit.create({
              data: { editionId: edition.id, unitKey },
            });
          }
          unitIdByOrder.set(ch.order, unit.id);
          stats.units += 1;

          // 4. ContentUnitVersion — create-or-verify (drift → throw).
          const versionId = `cuv-${unitKey}`;
          const verFields = expectedUnitVersionFields(ch, unit.id);
          const existingVer = await tx.contentUnitVersion.findUnique({
            where: { id: versionId },
          });
          let versionRowId: string;
          if (!existingVer) {
            const created = await tx.contentUnitVersion.create({
              data: { id: versionId, ...verFields },
            });
            versionRowId = created.id;
          } else {
            if (unitVersionDrifts(existingVer, verFields)) {
              throw new Error(DRIFT);
            }
            versionRowId = existingVer.id;
          }
          stats.versions += 1;

          // 5/6. Blocks — ContentBlock (identity) + BlockVersion (create-or-verify).
          const blocks = await tx.chapterBlock.findMany({
            where: { chapterId: ch.id },
            orderBy: { order: "asc" },
          });
          for (const b of blocks) {
            const blockKey = blockKeyFromLegacyId(b.id);
            const bvExpected = expectedBlockVersionFields(b);
            const metaInput =
              b.meta == null ? {} : { meta: b.meta as Prisma.InputJsonValue };

            let cb = await tx.contentBlock.findUnique({ where: { blockKey } });
            if (!cb) {
              cb = await tx.contentBlock.create({
                data: { blockKey, unitId: unit.id, legacyBlockId: b.id },
              });
            } else if (
              contentBlockDrifts(cb, { unitId: unit.id, legacyBlockId: b.id })
            ) {
              throw new Error(DRIFT);
            }
            stats.blocks += 1;

            const existingBv = await tx.blockVersion.findUnique({
              where: {
                unitVersionId_contentBlockId: {
                  unitVersionId: versionRowId,
                  contentBlockId: cb.id,
                },
              },
            });
            if (!existingBv) {
              await tx.blockVersion.create({
                data: {
                  contentBlockId: cb.id,
                  unitVersionId: versionRowId,
                  order: bvExpected.order,
                  kind: bvExpected.kind,
                  content: bvExpected.content,
                  contentHash: bvExpected.contentHash,
                  ...metaInput,
                },
              });
            } else if (blockVersionDrifts(existingBv, bvExpected)) {
              throw new Error(DRIFT);
            }
            stats.blockVersions += 1;
          }

          // 7. RevisionUnit — create-or-verify (order lives here, drift → throw).
          const ruFields = expectedRevisionUnitFields(ch, versionRowId);
          const existingRu = await tx.revisionUnit.findUnique({
            where: {
              revisionId_unitId: { revisionId: revision.id, unitId: unit.id },
            },
          });
          if (!existingRu) {
            await tx.revisionUnit.create({
              data: { revisionId: revision.id, unitId: unit.id, ...ruFields },
            });
          } else if (revisionUnitDrifts(existingRu, ruFields)) {
            throw new Error(DRIFT);
          }

          unitsThisBook += 1;
          if (
            opts.throwAfterUnits != null &&
            unitsThisBook >= opts.throwAfterUnits
          ) {
            throw new Error("INJECTED_TEST_FAILURE");
          }
        }

        // 8. Concepts from the catalog (mapped by chapter order → unit).
        // Shared with the learning activation so an already-bootstrapped Book
        // materializes the SAME rows the same way. Fails closed on drift or on
        // a catalogued chapter without a unit — see `concept-ingestion.ts`.
        // `skip`: the backfill walks EVERY book to build the reading surface
        // and cannot know whether a book is fully ingested yet. A catalogued
        // chapter with no unit is a forward-looking catalog, not a broken
        // database — refusing here would block reading over a teaching row.
        // The skip is counted, never silent. The learning ACTIVATION, which is
        // told a specific book and expects its whole catalog, uses `throw`.
        const conceptStats = await ingestBookConcepts(
          tx,
          book.slug,
          unitIdByOrder,
          "skip",
        );
        stats.concepts +=
          conceptStats.conceptsCreated + conceptStats.conceptsVerified;
        stats.conceptLinks +=
          conceptStats.conceptLinksCreated + conceptStats.conceptLinksVerified;
        stats.conceptsSkippedMissingUnit +=
          conceptStats.conceptsSkippedMissingUnit;

        // 8.5 CC-7.4B.2 — editorially-approved Exercise rows (practice + recall)
        // for the first Guide V1 unit. Inside this Book's transaction so any
        // failure rolls the whole Book back; inert only for books absent from
        // the catalog. For catalog-listed books, missing chapter/unit/source
        // fails closed and rolls the Book transaction back.
        await ingestUnitExercises(
          tx,
          book.slug,
          chapterIdByOrder,
          unitIdByOrder,
        );

        // 9. Verify expected counts before publishing.
        const ruCount = await tx.revisionUnit.count({
          where: { revisionId: revision.id },
        });
        if (ruCount !== chapters.length) {
          throw new Error("BACKFILL_COUNT_MISMATCH");
        }

        // 10. Publish LAST — transition DRAFT → PUBLISHED once; idempotent thereafter.
        if (revision.status !== "PUBLISHED") {
          await tx.revision.update({
            where: { id: revision.id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
        }
        if (edition.publishedRevisionId !== revision.id) {
          await tx.edition.update({
            where: { id: edition.id },
            data: { publishedRevisionId: revision.id },
          });
        }
      },
      { timeout: 30_000 },
    );
  }

  return stats;
}
