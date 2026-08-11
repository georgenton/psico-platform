import type { PrismaClient } from "@prisma/client";
import type { ReaderChapterRef } from "@psico/types";

/**
 * The chapters a book CURRENTLY offers a reader.
 *
 * Book detail listed legacy `Chapter` rows, so a chapter created in Content
 * Studio — which has no `Chapter` row at all — was simply absent: unreachable
 * from the one screen whose job is to list what there is to read.
 *
 * ── Legacy-first, exactly like the reader ─────────────────────────────────
 *
 * The rule is not "prefer the manifest". `resolveReaderChapter` and
 * `resolveLocatorRef` both try a `Chapter` row at that position FIRST and only
 * then consult Content Core, so a position answered by a legacy row is a legacy
 * chapter — even when the backfill also minted a unit for it. Listing that
 * position as `u/…` would hand out a link the reader does not honour.
 *
 * So: published native placements, overwritten at any conflicting position by a
 * published legacy chapter. One row per position, never two.
 *
 * ── The unpublished legacy chapter ────────────────────────────────────────
 *
 * A subtlety the parity proof in `reader-locator.pg-spec.ts` caught: detail
 * loads legacy chapters with `isPublished: true`, but `resolveReaderChapter`
 * and `resolveLocatorRef` filter on nothing — ANY `Chapter` row at that
 * position answers for it. `Chapter.isPublished` defaults to false, so this is
 * not a corner case.
 *
 * Listing the native twin at such a position would be the exact failure this
 * repair exists to prevent: a row labelled `u/…` whose link the reader answers
 * with the legacy chapter's content. So a position any legacy row occupies is
 * never native — if the row is unpublished it is not listed at all, which is
 * what a catalogue should say about an unpublished chapter anyway.
 *
 * Making the reader honour `isPublished` instead would be the other way to
 * close the gap, and it is not this change's to make: it would withdraw a
 * chapter somebody may be mid-way through.
 *
 * ── Published only ────────────────────────────────────────────────────────
 *
 * Native rows come from `Edition.publishedRevisionId` and nothing else. A draft
 * revision is editorial work in progress; a chapter that appears in a catalogue
 * before anyone published it is a leak, not a preview.
 */

type Db = Pick<PrismaClient, "edition" | "revisionUnit" | "chapter">;

/** A legacy chapter as the detail query already fetched it. */
export interface LegacyChapterRow {
  id: string;
  order: number;
  title: string;
  durationMinutes: number | null;
  partNumber?: number | null;
  partTitle?: string | null;
}

export interface EffectiveChapter {
  order: number;
  readerRef: ReaderChapterRef;
  title: string;
  durationMinutes: number | null;
  partNumber: number | null;
  partTitle: string | null;
}

/**
 * The effective list, ordered.
 *
 * `legacyChapters` are passed in rather than re-queried: the detail request has
 * already loaded them with the user's progress attached, and fetching them twice
 * would risk the two copies disagreeing about what counts as published.
 */
export async function resolveEffectiveChapters(
  db: Db,
  input: {
    bookId: string;
    bookSlug: string;
    legacyChapters: LegacyChapterRow[];
  },
): Promise<EffectiveChapter[]> {
  const byOrder = new Map<number, EffectiveChapter>();

  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { publishedRevisionId: true },
  });

  if (edition?.publishedRevisionId) {
    const placements = await db.revisionUnit.findMany({
      where: { revisionId: edition.publishedRevisionId },
      orderBy: { order: "asc" },
      select: {
        order: true,
        partNumber: true,
        partTitle: true,
        unit: { select: { id: true } },
        unitVersion: { select: { title: true, durationMinutes: true } },
      },
    });
    // Every position a `Chapter` row occupies, published or not — the reader
    // does not distinguish, so neither can this. One indexed query.
    const occupied = new Set(
      (
        await db.chapter.findMany({
          where: { bookId: input.bookId },
          select: { order: true },
        })
      ).map((c) => c.order),
    );

    for (const p of placements) {
      if (occupied.has(p.order)) continue;
      byOrder.set(p.order, {
        order: p.order,
        readerRef: { kind: "unit", id: p.unit.id },
        // The published version's own metadata — a native chapter has no
        // `Chapter` row to borrow a title from, and inventing one would mean
        // two places could disagree about what it is called.
        title: p.unitVersion.title,
        durationMinutes: p.unitVersion.durationMinutes,
        partNumber: p.partNumber,
        partTitle: p.partTitle,
      });
    }
  }

  // Legacy last, so it overwrites at any position both claim — which is what
  // the reader does when it serves that position.
  for (const c of input.legacyChapters) {
    byOrder.set(c.order, {
      order: c.order,
      readerRef: { kind: "chapter", id: c.id },
      title: c.title,
      durationMinutes: c.durationMinutes,
      partNumber: c.partNumber ?? null,
      partTitle: c.partTitle ?? null,
    });
  }

  return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

/**
 * The user's progress for an effective list, by each row's OWN identity.
 *
 * Two batched queries, not one per chapter. Legacy progress is keyed by
 * `chapterId` and native by `contentUnitId`; they are never converted into one
 * another, so a native chapter cannot inherit the status of the legacy chapter
 * that used to occupy its position.
 */
export async function progressForEffectiveChapters(
  db: Pick<PrismaClient, "userProgress">,
  input: { userId: string; chapters: EffectiveChapter[] },
): Promise<Map<string, { completedAt: Date | null }>> {
  const chapterIds = input.chapters
    .filter((c) => c.readerRef.kind === "chapter")
    .map((c) => c.readerRef.id);
  const unitIds = input.chapters
    .filter((c) => c.readerRef.kind === "unit")
    .map((c) => c.readerRef.id);

  const [legacy, native] = await Promise.all([
    chapterIds.length
      ? db.userProgress.findMany({
          where: { userId: input.userId, chapterId: { in: chapterIds } },
          select: { chapterId: true, completedAt: true },
        })
      : Promise.resolve([]),
    unitIds.length
      ? db.userProgress.findMany({
          where: { userId: input.userId, contentUnitId: { in: unitIds } },
          select: { contentUnitId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Keyed by the row's own id — the same id its `readerRef` carries, so a
  // lookup cannot land on the wrong chapter.
  const byId = new Map<string, { completedAt: Date | null }>();
  for (const p of legacy) {
    if (p.chapterId) byId.set(p.chapterId, { completedAt: p.completedAt });
  }
  for (const p of native) {
    if (p.contentUnitId) {
      byId.set(p.contentUnitId, { completedAt: p.completedAt });
    }
  }
  return byId;
}
