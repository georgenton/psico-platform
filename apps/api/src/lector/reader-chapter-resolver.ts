import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import {
  legacyChaptersByUnitKey,
  resolveLegacyPlacement,
} from "./legacy-placement";

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
 * The published MANIFEST decides which chapter sits at a position (Phase B.B,
 * Model A). It used to be `Chapter` by `(bookId, order)` first, which was safe
 * only while nothing could move a chapter: once reorder exists, a placement
 * would say one thing and a stale `Chapter.order` another, and the stale column
 * would win.
 *
 * A placement backed by a legacy chapter still resolves to that chapter's
 * identity — the manifest says WHERE, the derived unit key says WHICH row
 * serves it. Only a chapter with no `ContentUnit` at all falls back to
 * `Chapter.order`, because for those it remains the only answer there is.
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
  const native = await resolveNativeChapter(db, input.bookSlug, input.order);

  if (native) {
    // The placement owns the position. If a legacy chapter backs this unit,
    // that chapter's identity still serves it — matched by derived key, never
    // by comparing the two orders.
    const chapters = await db.chapter.findMany({
      where: { bookId: input.bookId },
      select: { id: true, order: true },
    });
    const backing = legacyChaptersByUnitKey(chapters).get(native.unitKey);
    if (backing) {
      return {
        source: "legacy",
        chapterId: backing.id,
        contentUnitId: null,
        // The manifest's order, not the row's — that column is now stale-able.
        order: native.order,
      };
    }
    return native;
  }

  // Nothing published at that position. A legacy row may still answer for it,
  // but only if it was never adopted: an adopted chapter absent from the
  // published structure was taken out of the book deliberately, and reviving
  // it from a stale number would put it back.
  const legacy = await db.chapter.findUnique({
    where: { bookId_order: { bookId: input.bookId, order: input.order } },
    select: { id: true, order: true },
  });
  if (legacy) {
    const placement = await resolveLegacyPlacement(db, {
      bookSlug: input.bookSlug,
      chapter: legacy,
    });
    if (placement.source === "unsynced-legacy") {
      return {
        source: "legacy",
        chapterId: legacy.id,
        contentUnitId: null,
        order: placement.order,
      };
    }
  }

  throw new NotFoundException("CHAPTER_NOT_FOUND");
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
 * Resolve a unit the CLIENT named, and prove it belongs here.
 *
 * A reader's open tab carries the identity of the chapter it opened, so a
 * structural publish cannot redirect their progress to whichever chapter moved
 * into that position. Deliberately does NOT check that the unit still sits at
 * the order the client sent — requiring that would recreate the very bug this
 * exists to prevent.
 *
 * The identity is never trusted as given. A caller who guessed another
 * edition's unit id, or a draft-only one, gets `null` and writes nothing.
 */
export async function resolveNativeUnitById(
  db: Db,
  input: { bookSlug: string; contentUnitId: string },
): Promise<NativeChapterTarget | null> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { id: true, editionKey: true, publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) return null;

  // Every condition matters. The unit must belong to THIS edition (not another
  // book's), and must be in the CURRENTLY published revision (not a draft, not
  // one that was unpublished). A caller who guessed an id gets nothing.
  const entry = await db.revisionUnit.findFirst({
    where: {
      revisionId: edition.publishedRevisionId,
      unitId: input.contentUnitId,
      unit: { editionId: edition.id },
    },
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
    // The unit's CURRENT position, deliberately — not whatever stale order the
    // client sent. A write lands on the unit; navigation continues from where
    // that unit actually is now.
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
 * The next chapter a reader can actually navigate to, after this one.
 *
 * Not `order + 1`, and not a comparison against a count. Both assume manifest
 * orders are dense and start at 1 — true for backfilled books today, and
 * exactly the assumption reordering breaks. Asking the manifest for the next
 * placed position is the same answer when orders are dense and the right one
 * when they are not.
 */
export async function nextPlacedOrder(
  db: Db,
  input: { bookSlug: string; after: number },
): Promise<number | null> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) return null;

  const next = await db.revisionUnit.findFirst({
    where: {
      revisionId: edition.publishedRevisionId,
      order: { gt: input.after },
    },
    orderBy: { order: "asc" },
    select: { order: true },
  });
  return next?.order ?? null;
}
