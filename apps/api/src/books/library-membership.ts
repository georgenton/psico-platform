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
 * Four queries, whatever the size of the library.
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
