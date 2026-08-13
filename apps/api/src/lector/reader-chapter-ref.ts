import { NotFoundException } from "@nestjs/common";
import type { ReaderChapterRef } from "@psico/types";
import type { PrismaClient } from "@prisma/client";

import {
  resolveNativeChapter,
  resolveReaderChapter,
  resolveNativeUnitById,
} from "./reader-chapter-resolver";
import {
  isOutsidePublishedStructure,
  resolveLegacyPlacement,
} from "./legacy-placement";

/**
 * Resolving a chapter by its STABLE identity, and finding that identity from a
 * position (Phase B.A).
 *
 * ── What this does and does not change ────────────────────────────────────
 *
 * Routing identity only. Which store serves a chapter is decided exactly as it
 * was: a `Chapter` row still wins, still serves `ChapterBlock`, still writes
 * progress by `Chapter.id`. A native unit still serves `BlockVersion` and still
 * writes `contentUnitId`. This file chooses nothing about content; it only
 * turns a URL into the same target the positional path would have produced.
 *
 * ── Ownership is verified, never assumed ──────────────────────────────────
 *
 * Both ids arrive in a path segment a caller types. Finding the row is not the
 * same as being allowed to read it through THIS book's URL, so each branch
 * proves the row belongs to the book the URL names before anything else looks
 * at it. Without that, `/libro-a/lector/c/<chapter-of-libro-b>` would read
 * across books for anyone who knew an id.
 */

type Db = Pick<
  PrismaClient,
  "chapter" | "edition" | "revisionUnit" | "contentUnit"
>;

/** A legacy chapter, proven to belong to this book. */
export interface LegacyRefTarget {
  kind: "chapter";
  chapterId: string;
  order: number;
}

export type ReaderRefTarget =
  | LegacyRefTarget
  | { kind: "unit"; contentUnitId: string; order: number };

/**
 * The chapter a stable URL names, or null.
 *
 * Null for every reason a reader should not see: no such row, a row belonging
 * to another book, a unit that is not in the current published revision. One
 * answer for all of them, because distinguishing them out loud tells a caller
 * which guesses were closer.
 */
export async function resolveChapterByRef(
  db: Db,
  input: { bookId: string; bookSlug: string; ref: ReaderChapterRef },
): Promise<ReaderRefTarget | null> {
  if (input.ref.kind === "chapter") {
    // Scoped by bookId in the WHERE clause rather than fetched and then
    // checked: there is no moment where a foreign row is in hand.
    const chapter = await db.chapter.findFirst({
      where: { id: input.ref.id, bookId: input.bookId },
      select: { id: true, order: true },
    });
    if (!chapter) return null;

    // The CURRENT position, from the published placement. Returning
    // `chapter.order` here would put a stale number in this resolver's own
    // contract even though a later caller happens to correct it — and a
    // contract that is only right by accident downstream is not a contract.
    const placement = await resolveLegacyPlacement(db as never, {
      bookSlug: input.bookSlug,
      chapter,
    });
    // Removed from the published structure: not a chapter a reader can reach.
    if (isOutsidePublishedStructure(placement)) return null;
    return {
      kind: "chapter",
      chapterId: chapter.id,
      order: placement.order,
    };
  }

  // `resolveNativeUnitById` (#649) already proves the unit belongs to this
  // book's edition AND sits in its published revision — which is what keeps a
  // draft-only unit unreachable. Reused rather than re-implemented so the two
  // cannot drift apart.
  const native = await resolveNativeUnitById(db as never, {
    bookSlug: input.bookSlug,
    contentUnitId: input.ref.id,
  });
  if (!native) return null;
  return {
    kind: "unit",
    contentUnitId: native.contentUnitId,
    order: native.order,
  };
}

/**
 * Which chapter currently sits at a position, as a stable identity.
 *
 * READ-ONLY on purpose. The full reader read upserts a `ReadingSession`, so
 * using it merely to discover where to redirect would record that somebody
 * started reading a chapter they were only passing through.
 *
 * Manifest-first, exactly like `resolveReaderChapter`: the published placement
 * position answers for it, and only then is Content Core consulted. Getting
 * that order wrong here would send a reader to a different chapter than the
 * positional route serves today.
 */
export async function resolveLocatorRef(
  db: Db,
  input: { bookId: string; bookSlug: string; order: number },
): Promise<ReaderChapterRef | null> {
  // Same authority as the reader itself: the published manifest says who
  // occupies a position. Asking `Chapter` first would let a stale order answer
  // for a chapter the structure has moved — and a locator that disagrees with
  // the reader is worse than no locator, because the redirect would land
  // somewhere the reader then serves differently.
  // Only the expected "nothing is there" becomes null. A database or
  // programming failure must not be reported as an empty position — that would
  // turn an outage into a 404 and hide it.
  const target = await resolveReaderChapter(db as never, input).catch(
    (err: unknown) => {
      if (err instanceof NotFoundException) return null;
      throw err;
    },
  );
  if (!target) return null;
  return target.source === "legacy"
    ? { kind: "chapter", id: target.chapterId }
    : { kind: "unit", id: target.contentUnitId };
}
