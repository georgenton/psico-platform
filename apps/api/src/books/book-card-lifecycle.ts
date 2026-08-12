import type { PrismaClient } from "@prisma/client";
import {
  mergeEffectiveChapters,
  type EffectiveChapter,
  type LegacyChapterRow,
  type NativePlacement,
} from "./effective-chapters";

/**
 * What a book card should say, for a whole page at once.
 *
 * A card carries two claims: how many chapters the book has, and how far the
 * reader has got. Both came from legacy rows — `Book.totalChapters` for the
 * count, `Chapter[].progress` for the progress — which meant a book authored
 * in Content Studio could report a stale count and show 0% however much of it
 * somebody had finished. On a mixed book the numerator and denominator
 * described different sets, so the percentage was wrong in a quieter way.
 *
 * The fix is the structure Book Detail and the review gate already use. What is
 * new here is only the SHAPE of the fetch: a catalogue page holds ~24 books, so
 * asking per book would be two dozen round trips. Everything is batched across
 * the page, and the merge rule itself is imported rather than re-implemented —
 * a second reading of "which chapter answers for this position" is exactly the
 * kind of divergence this whole line of work has been closing.
 *
 * ── Which table answers what ──────────────────────────────────────────────
 *
 *   ReadingSession   opened  — written by Start and by the reader scrolling
 *   UserProgress     finished — its `completedAt` is non-null, so a row is a
 *                    completion and nothing else
 *
 * Timestamps come from those rows. `new Date()` at read time would make every
 * card claim the reader started, or finished, just now.
 */

/** The lifecycle facts for one card. */
export interface BookCardLifecycle {
  /** How many chapters the book currently offers a reader. */
  effectiveTotal: number;
  /** Null when the reader has never opened it. */
  userProgress: {
    startedAt: Date;
    lastChapterRead: number;
    progressPct: number;
    completedAt: Date | null;
  } | null;
}

type Db = Pick<
  PrismaClient,
  "edition" | "revisionUnit" | "chapter" | "userProgress" | "readingSession"
>;

/** A book row as the card query already loaded it. */
export interface BookCardRow {
  id: string;
  slug: string;
  chapters?: LegacyChapterRow[];
}

export async function resolveBookCardLifecycle(
  db: Db,
  input: { userId: string | null; books: BookCardRow[] },
): Promise<Map<string, BookCardLifecycle>> {
  const out = new Map<string, BookCardLifecycle>();
  if (input.books.length === 0) return out;

  const structure = await resolveStructure(db, input.books);

  // Unauthenticated: the count is content metadata and still has to be true,
  // but there is no reader state to fetch. No lifecycle queries at all.
  if (!input.userId) {
    for (const [bookId, chapters] of structure) {
      out.set(bookId, { effectiveTotal: chapters.length, userProgress: null });
    }
    return out;
  }

  // Every effective identity on the page, in two buckets. Two completion
  // queries and two session queries cover the whole page however long it is.
  const chapterIds: string[] = [];
  const unitIds: string[] = [];
  for (const chapters of structure.values()) {
    for (const c of chapters) {
      if (c.readerRef.kind === "chapter") chapterIds.push(c.readerRef.id);
      else unitIds.push(c.readerRef.id);
    }
  }

  const [legacyDone, nativeDone, legacyOpen, nativeOpen] = await Promise.all([
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
    chapterIds.length
      ? db.readingSession.findMany({
          where: { userId: input.userId, chapterId: { in: chapterIds } },
          select: { chapterId: true, startedAt: true },
        })
      : Promise.resolve([]),
    unitIds.length
      ? db.readingSession.findMany({
          where: { userId: input.userId, contentUnitId: { in: unitIds } },
          select: { contentUnitId: true, startedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Keyed by the identity the chapter itself carries, so a native chapter can
  // never inherit the state of the legacy chapter whose position it took.
  const completedAt = new Map<string, Date>();
  for (const r of legacyDone) {
    if (r.chapterId) completedAt.set(r.chapterId, r.completedAt);
  }
  for (const r of nativeDone) {
    if (r.contentUnitId) completedAt.set(r.contentUnitId, r.completedAt);
  }
  const startedAt = new Map<string, Date>();
  for (const r of legacyOpen) {
    if (r.chapterId) startedAt.set(r.chapterId, r.startedAt);
  }
  for (const r of nativeOpen) {
    if (r.contentUnitId) startedAt.set(r.contentUnitId, r.startedAt);
  }

  for (const [bookId, chapters] of structure) {
    out.set(bookId, {
      effectiveTotal: chapters.length,
      userProgress: summarise(chapters, completedAt, startedAt),
    });
  }
  return out;
}

/** The effective chapters of every book on the page, keyed by book id. */
async function resolveStructure(
  db: Pick<Db, "edition" | "revisionUnit" | "chapter">,
  books: BookCardRow[],
): Promise<Map<string, EffectiveChapter[]>> {
  const bookIds = books.map((b) => b.id);
  const slugs = books.map((b) => b.slug);

  // An edition is joined to its book by slug, and only its PUBLISHED revision
  // is structure — a draft is editorial work, not something a catalogue counts.
  const [editions, occupancy] = await Promise.all([
    db.edition.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, publishedRevisionId: true },
    }),
    db.chapter.findMany({
      where: { bookId: { in: bookIds } },
      select: { bookId: true, order: true },
    }),
  ]);

  const revisionBySlug = new Map<string, string>();
  for (const e of editions) {
    if (e.publishedRevisionId)
      revisionBySlug.set(e.slug, e.publishedRevisionId);
  }

  const placementsByRevision = new Map<string, NativePlacement[]>();
  const revisionIds = [...new Set(revisionBySlug.values())];
  if (revisionIds.length > 0) {
    const rows = await db.revisionUnit.findMany({
      where: { revisionId: { in: revisionIds } },
      orderBy: { order: "asc" },
      select: {
        revisionId: true,
        order: true,
        partNumber: true,
        partTitle: true,
        unit: { select: { id: true } },
        unitVersion: { select: { title: true, durationMinutes: true } },
      },
    });
    for (const r of rows) {
      const list = placementsByRevision.get(r.revisionId) ?? [];
      list.push(r);
      placementsByRevision.set(r.revisionId, list);
    }
  }

  const occupiedByBook = new Map<string, number[]>();
  for (const c of occupancy) {
    const list = occupiedByBook.get(c.bookId) ?? [];
    list.push(c.order);
    occupiedByBook.set(c.bookId, list);
  }

  const structure = new Map<string, EffectiveChapter[]>();
  for (const book of books) {
    const revisionId = revisionBySlug.get(book.slug);
    structure.set(
      book.id,
      mergeEffectiveChapters({
        nativePlacements: revisionId
          ? (placementsByRevision.get(revisionId) ?? [])
          : [],
        occupiedLegacyOrders: occupiedByBook.get(book.id) ?? [],
        // The rows the card query already loaded — published only, which is
        // what a reader can see.
        publishedLegacyRows: book.chapters ?? [],
      }),
    );
  }
  return structure;
}

/** One book's card summary, from its own chapters' own identities. */
function summarise(
  chapters: EffectiveChapter[],
  completedAt: Map<string, Date>,
  startedAt: Map<string, Date>,
): BookCardLifecycle["userProgress"] {
  const done: Date[] = [];
  const opened: Date[] = [];
  let touched = 0;

  for (const c of chapters) {
    const finished = completedAt.get(c.readerRef.id);
    const open = startedAt.get(c.readerRef.id);
    if (finished) done.push(finished);
    if (open) opened.push(open);
    // A chapter counts once however many rows describe it — finishing a
    // chapter implies having opened it.
    if (finished || open) touched += 1;
  }

  if (touched === 0) return null;

  const total = chapters.length;
  const progressPct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  // The earliest session is when the book was started. A book finished long
  // ago may have no session at all — history predating this model — so its
  // first completion stands in rather than a fabricated "now".
  const earliest = [...opened, ...done].sort(
    (a, b) => a.getTime() - b.getTime(),
  )[0];

  return {
    startedAt: earliest,
    // Touched chapters, matching what the previous mapper counted. Never a
    // position: a chapter's order is not who it is.
    lastChapterRead: touched,
    progressPct,
    // The moment the last required chapter was finished — stored, not read-time.
    completedAt:
      total > 0 && done.length === total
        ? done.sort((a, b) => b.getTime() - a.getTime())[0]
        : null,
  };
}
