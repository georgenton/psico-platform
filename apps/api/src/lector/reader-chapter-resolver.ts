import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

/**
 * Turning "chapter 3 of this book" into something the reader can open.
 *
 * Until now that meant one query: `Chapter` by `(bookId, order)`. A chapter
 * Content Studio creates has no `Chapter` row, so the reader would 404 on
 * content it is fully entitled to read — which is why entitlement (#580) was
 * necessary but not sufficient.
 *
 * ── Two identities, one locator ───────────────────────────────────────────
 *
 * The public route still addresses a chapter by POSITION, and that is fine for
 * navigation. What must never be positional is IDENTITY: a reader's progress
 * and completion belong to the unit itself, so that reordering a book moves the
 * chapter without moving somebody's 47% onto a different one.
 *
 *   ROUTE_LOCATOR   = position   (unchanged, public)
 *   SESSION_IDENTITY = the unit   (legacy Chapter.id, or ContentUnit.id)
 *
 * ── Which source wins ─────────────────────────────────────────────────────
 *
 * Legacy first, deliberately. Every chapter in production today has a `Chapter`
 * row, and preserving their exact behaviour matters more than elegance: the
 * legacy branch is byte-for-byte what it was. The native branch is reached only
 * when there is genuinely no `Chapter` at that position — which today can only
 * be true of a unit nothing has created yet.
 *
 * Resolution always runs against the PUBLISHED revision. A structural draft is
 * not a chapter a reader can find.
 */

export interface LegacyChapterTarget {
  source: "legacy";
  chapterId: string;
  contentUnitId: null;
  order: number;
}

export interface NativeChapterTarget {
  source: "content-core";
  chapterId: null;
  contentUnitId: string;
  order: number;
  unitKey: string;
  editionKey: string;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  partNumber: number | null;
  partTitle: string | null;
}

export type ReaderChapterTarget = LegacyChapterTarget | NativeChapterTarget;

/** The narrow Prisma surface this needs — satisfied by a transaction client. */
type Db = Pick<
  PrismaClient,
  "chapter" | "edition" | "revisionUnit" | "contentUnit"
>;

/**
 * Resolve one position within a book, preferring the legacy chapter.
 *
 * `bookSlug` is the edition's slug, which the backfill sets to the book slug —
 * so this does not parse an edition key or assume its shape (#580).
 */
export async function resolveReaderChapter(
  db: Db,
  input: { bookId: string; bookSlug: string; order: number },
): Promise<ReaderChapterTarget> {
  const legacy = await db.chapter.findUnique({
    where: { bookId_order: { bookId: input.bookId, order: input.order } },
    select: { id: true, order: true },
  });
  if (legacy) {
    return {
      source: "legacy",
      chapterId: legacy.id,
      contentUnitId: null,
      order: legacy.order,
    };
  }

  const native = await resolveNativeChapter(db, input.bookSlug, input.order);
  if (!native) throw new NotFoundException("CHAPTER_NOT_FOUND");
  return native;
}

/**
 * The position, read out of the edition's published manifest.
 *
 * Everything the reader needs about the chapter — its title, its part, how long
 * it takes — comes from the Content Core snapshot the reader is actually being
 * served, not from a legacy row that may not exist. That is what will later make
 * editing a chapter's title honest rather than a write to two places.
 */
export async function resolveNativeChapter(
  db: Db,
  bookSlug: string,
  order: number,
): Promise<NativeChapterTarget | null> {
  const edition = await db.edition.findFirst({
    where: { slug: bookSlug },
    select: { editionKey: true, publishedRevisionId: true },
  });
  // No edition, or nothing published yet: there is no native chapter to find.
  // A DRAFT revision is deliberately not consulted — structural work in
  // progress is not something a reader can discover.
  if (!edition?.publishedRevisionId) return null;

  const entry = await db.revisionUnit.findFirst({
    where: { revisionId: edition.publishedRevisionId, order },
    select: {
      order: true,
      partNumber: true,
      partTitle: true,
      unit: { select: { id: true, unitKey: true } },
      unitVersion: {
        select: { title: true, summary: true, durationMinutes: true },
      },
    },
  });
  if (!entry) return null;

  return {
    source: "content-core",
    chapterId: null,
    contentUnitId: entry.unit.id,
    order: entry.order,
    unitKey: entry.unit.unitKey,
    editionKey: edition.editionKey,
    title: entry.unitVersion.title,
    summary: entry.unitVersion.summary,
    durationMinutes: entry.unitVersion.durationMinutes,
    partNumber: entry.partNumber,
    partTitle: entry.partTitle,
  };
}

/**
 * How many chapters the reader can actually navigate.
 *
 * `Book.totalChapters` counts legacy rows, so it goes stale the moment a native
 * chapter exists. Deriving it from the published manifest keeps the number
 * honest without writing to the legacy column — which would be inventing a
 * legacy fact about content that has none.
 *
 * Falls back to the legacy count for books that have no published edition yet,
 * so nothing changes for them.
 */
export async function readerTotalChapters(
  db: Db,
  input: { bookSlug: string; legacyTotal: number },
): Promise<number> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) return input.legacyTotal;

  const count = await db.revisionUnit.count({
    where: { revisionId: edition.publishedRevisionId },
  });
  return count > 0 ? count : input.legacyTotal;
}

/**
 * Confirm a unit the CLIENT named really is this book's chapter at this
 * position, in the published manifest.
 *
 * The heartbeat carries an identity so a reorder mid-session cannot redirect
 * somebody's progress. That identity is never trusted as given: a caller who
 * guessed another edition's unit id would otherwise write progress into a book
 * they cannot even read.
 */
export async function assertUnitInBook(
  db: Db,
  input: { bookSlug: string; contentUnitId: string },
): Promise<boolean> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) return false;

  const entry = await db.revisionUnit.findFirst({
    where: {
      revisionId: edition.publishedRevisionId,
      unitId: input.contentUnitId,
      unit: { editionId: edition.id },
    },
    select: { id: true },
  });
  return entry !== null;
}
