import type { PrismaClient } from "@prisma/client";

/**
 * Which books the user has actually opened.
 *
 * "Mis libros" and the recommendation exclusion both used to ask this of
 * `UserProgress`, which worked only because starting a book wrote a row there.
 * That was the bug: `UserProgress.completedAt` is non-null, so those rows mean
 * *finished*, and Start was announcing a completion nobody had earned.
 *
 * Now Start writes a `ReadingSession`, so this asks both tables — a book counts
 * as the reader's if they have opened any of its chapters or finished any of
 * them — and it asks for native chapters too, which had no answer at all
 * before.
 *
 * ── Why a set of ids rather than a `where` clause ──────────────────────────
 *
 * A native chapter reaches its book through `ContentUnit → Edition.slug`, and
 * `Edition` has no foreign key to `Book`; they are joined by a matching slug.
 * Prisma cannot express that as a nested filter, so the ids are resolved first
 * and handed to the caller's query as an `id: { in: … }`.
 *
 * Bounded and never N+1: four identity queries, plus at most one book lookup
 * when native sessions are present.
 */
export async function readerBookIds(
  db: Pick<PrismaClient, "readingSession" | "userProgress" | "book">,
  userId: string,
): Promise<string[]> {
  const [legacySessions, legacyProgress, nativeSessions, nativeProgress] =
    await Promise.all([
      db.readingSession.findMany({
        where: { userId, chapterId: { not: null } },
        select: { chapter: { select: { bookId: true } } },
      }),
      db.userProgress.findMany({
        where: { userId, chapterId: { not: null } },
        select: { chapter: { select: { bookId: true } } },
      }),
      db.readingSession.findMany({
        where: { userId, contentUnitId: { not: null } },
        select: {
          contentUnit: { select: { edition: { select: { slug: true } } } },
        },
      }),
      db.userProgress.findMany({
        where: { userId, contentUnitId: { not: null } },
        select: {
          contentUnit: { select: { edition: { select: { slug: true } } } },
        },
      }),
    ]);

  const ids = new Set<string>();
  for (const row of [...legacySessions, ...legacyProgress]) {
    if (row.chapter?.bookId) ids.add(row.chapter.bookId);
  }

  const slugs = new Set<string>();
  for (const row of [...nativeSessions, ...nativeProgress]) {
    const slug = row.contentUnit?.edition.slug;
    if (slug) slugs.add(slug);
  }
  if (slugs.size > 0) {
    // The edition's slug IS the book's slug — the same join the reader and
    // Content Core have always used. Resolved to ids here so the caller's
    // filter stays a plain `id: { in: … }`.
    const books = await db.book.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true },
    });
    for (const b of books) ids.add(b.id);
  }

  return [...ids];
}

/** When a book was first opened, for the cards on one page of results. */
export interface BookSession {
  startedAt: Date;
  /** How many distinct chapters of this book the reader has touched. */
  touchedChapters: number;
}

/**
 * The reading sessions behind a page of book cards.
 *
 * A card says "Seguir leyendo" or "Empezar", and that answer comes from
 * `BookListItem.userProgress`. Which used to be derived from completions
 * alone — fine while Start wrote a completion, and wrong the moment it
 * stopped: a freshly started book appeared in "Mis libros" while its own card
 * claimed the reader had never opened it.
 *
 * Scoped to the books actually being returned rather than the whole library,
 * because this runs on every authenticated list. Two queries for a page,
 * whatever its length — never one per card.
 *
 * `startedAt` is the session's real timestamp. Substituting `new Date()` would
 * make every card claim the reader started just now.
 */
export async function sessionsForBookCards(
  db: Pick<PrismaClient, "readingSession">,
  input: { userId: string; books: { id: string; slug: string }[] },
): Promise<Map<string, BookSession>> {
  const byBook = new Map<string, BookSession>();
  if (input.books.length === 0) return byBook;

  const bookIds = input.books.map((b) => b.id);
  const slugs = input.books.map((b) => b.slug);
  // Slug → id, because a native session reaches its book through the edition
  // slug and the caller wants an answer keyed by book id.
  const idBySlug = new Map(input.books.map((b) => [b.slug, b.id]));

  const [legacy, native] = await Promise.all([
    db.readingSession.findMany({
      where: { userId: input.userId, chapter: { bookId: { in: bookIds } } },
      select: {
        startedAt: true,
        chapterId: true,
        chapter: { select: { bookId: true } },
      },
    }),
    db.readingSession.findMany({
      where: {
        userId: input.userId,
        contentUnit: { edition: { slug: { in: slugs } } },
      },
      select: {
        startedAt: true,
        contentUnitId: true,
        contentUnit: { select: { edition: { select: { slug: true } } } },
      },
    }),
  ]);

  /** Earliest session wins: that is when the book was started. */
  const note = (bookId: string | undefined, startedAt: Date) => {
    if (!bookId) return;
    const seen = byBook.get(bookId);
    if (!seen) byBook.set(bookId, { startedAt, touchedChapters: 1 });
    else {
      seen.touchedChapters += 1;
      if (startedAt < seen.startedAt) seen.startedAt = startedAt;
    }
  };

  for (const s of legacy) note(s.chapter?.bookId, s.startedAt);
  for (const s of native) {
    note(idBySlug.get(s.contentUnit?.edition.slug ?? ""), s.startedAt);
  }
  return byBook;
}
