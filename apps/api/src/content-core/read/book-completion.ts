import type { PrismaClient } from "@prisma/client";

/**
 * Is a book finished, when some of its chapters are legacy and some are not?
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Chapter authoring produces a book that is BOTH: a legacy `Book` row, chapters
 * that still have `Chapter` rows, and new chapters that only exist in Content
 * Core. Every completed-book calculation in the codebase was written when only
 * the first two were possible, so each one asks the same two stale questions:
 *
 *   how many chapters?   →  Book.totalChapters
 *   how many completed?  →  UserProgress rows with a Chapter
 *
 * On a mixed book that is not merely incomplete, it is WRONG in the direction
 * that matters. A book with 2 legacy chapters and 1 native one reports 2/2 and
 * calls itself finished while the reader has a whole chapter left.
 *
 * ── The two halves ────────────────────────────────────────────────────────
 *
 * Denominator: the CURRENT published manifest, when the edition has one.
 * `Book.totalChapters` counts legacy rows and goes stale the moment a native
 * chapter is published.
 *
 * Numerator: the union of both identities, because that is genuinely how
 * progress is stored — a chapter that still has a `Chapter` row records legacy
 * progress, and a native-only one records `contentUnitId` progress. One logical
 * chapter never produces both, since which identity gets written is decided by
 * whether the `Chapter` row exists at all.
 *
 * ── History is not the same question ──────────────────────────────────────
 *
 * A completion for a unit that has since been unpublished stays in the reader's
 * history and their data export. It just does not count toward finishing the
 * book AS IT IS NOW, because that chapter is not one of the chapters they can
 * currently read. Those are two different questions and this answers only the
 * second.
 */

type Db = Pick<
  PrismaClient,
  "edition" | "revisionUnit" | "userProgress" | "chapter"
>;

export interface BookCompletion {
  /** Chapters a reader can currently open. */
  requiredChapters: number;
  /** Of those, how many this user has finished. */
  completedChapters: number;
  completed: boolean;
}

/**
 * How many chapters this book currently has, from whichever source owns its
 * structure.
 */
export async function currentChapterCount(
  db: Db,
  input: { bookId: string; bookSlug: string; legacyTotal?: number },
): Promise<number> {
  const edition = await publishedRevisionOf(db, input.bookSlug);
  if (edition?.publishedRevisionId) {
    const placed = await db.revisionUnit.count({
      where: { revisionId: edition.publishedRevisionId },
    });
    if (placed > 0) return placed;
  }
  // No published edition: the legacy column is still the only answer there is.
  if (input.legacyTotal !== undefined) return input.legacyTotal;
  return db.chapter.count({
    where: { bookId: input.bookId, isPublished: true },
  });
}

/**
 * Completion for one book, counting both identities against the current
 * structure.
 *
 * `completedWithin` narrows to completions that happened in a window, which is
 * what the billing-period metrics need. The DENOMINATOR is never windowed — the
 * book has as many chapters as it has, regardless of when somebody read them.
 */
export async function bookCompletion(
  db: Db,
  input: {
    userId: string;
    bookId: string;
    bookSlug: string;
    legacyTotal?: number;
    completedWithin?: { gte: Date; lt: Date };
  },
): Promise<BookCompletion> {
  const [requiredChapters, edition] = await Promise.all([
    currentChapterCount(db, input),
    publishedRevisionOf(db, input.bookSlug),
  ]);
  const publishedRevisionId = edition?.publishedRevisionId ?? null;

  const completedAt = input.completedWithin;
  const [legacyDone, nativeDone] = await Promise.all([
    db.userProgress.count({
      where: {
        userId: input.userId,
        chapter: { bookId: input.bookId },
        ...(completedAt ? { completedAt } : {}),
      },
    }),
    // Only units still placed in the CURRENT published manifest count toward
    // finishing the book as it stands. Matching "any revision" would count a
    // draft-only or since-unpublished chapter, which is history rather than a
    // step toward the book a reader can open today.
    publishedRevisionId
      ? db.userProgress.count({
          where: {
            userId: input.userId,
            contentUnit: {
              edition: { slug: input.bookSlug },
              manifestEntries: { some: { revisionId: publishedRevisionId } },
            },
            ...(completedAt ? { completedAt } : {}),
          },
        })
      : Promise.resolve(0),
  ]);

  const completedChapters = legacyDone + nativeDone;
  return {
    requiredChapters,
    completedChapters,
    completed: requiredChapters > 0 && completedChapters >= requiredChapters,
  };
}

/**
 * The books a user finished, across a set of candidate books.
 *
 * Shared by the billing-period usage metric and the nightly rollup so the two
 * cannot drift into disagreeing about what "completed" means.
 */
export async function completedBookCount(
  db: Db,
  input: {
    userId: string;
    books: Array<{ id: string; slug: string; legacyTotal?: number }>;
    completedWithin?: { gte: Date; lt: Date };
  },
): Promise<number> {
  const results = await Promise.all(
    input.books.map((b) =>
      bookCompletion(db, {
        userId: input.userId,
        bookId: b.id,
        bookSlug: b.slug,
        legacyTotal: b.legacyTotal,
        completedWithin: input.completedWithin,
      }),
    ),
  );
  return results.filter((r) => r.completed).length;
}

/** The edition serving this book, and the revision readers currently get. */
async function publishedRevisionOf(db: Db, bookSlug: string) {
  return db.edition.findFirst({
    where: { slug: bookSlug },
    select: { publishedRevisionId: true },
  });
}
