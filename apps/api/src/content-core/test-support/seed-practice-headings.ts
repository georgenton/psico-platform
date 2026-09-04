import {
  EXERCISE_INGESTION_CATALOG,
  practiceSourceHeadings,
} from "../exercise-ingestion-catalog";

/**
 * Seed the editorial ground the exercise catalog needs for one book.
 *
 * The catalog is the authority on which chapters a book teaches in and which
 * headings each practice anchors to; a fixture that lists them by hand falls
 * behind the first time a pair is added, and the suite then reports
 * `EXERCISE_INGEST_SOURCE_MISSING` for content that is perfectly fine in
 * production.
 *
 * Two things are seeded, because the ingestion fails closed on either:
 *
 *   the CHAPTERS the catalog teaches in — an approved pair whose chapter is
 *   absent is an inconsistency, not a skip, so a book whose catalog grew a
 *   second chapter needs that chapter to exist here too;
 *
 *   the HEADINGS each chapter's practices anchor to, in the chapter that
 *   actually declares them — seeding chapter 1's headings into chapter 2 would
 *   resolve the wrong block, which is worse than not resolving at all.
 *
 * Idempotent by omission: an existing chapter or heading is skipped, so this
 * can sit next to a hand-written fixture without colliding on
 * `(chapterId, order)`, and calling it once per chapter in a loop is safe.
 */
type SeedDb = {
  chapter: {
    findUnique(args: unknown): Promise<{ bookId: string } | null>;
    findMany(args: unknown): Promise<{ id: string; order: number }[]>;
    create(args: unknown): Promise<{ id: string; order: number }>;
  };
  chapterBlock: {
    findMany(args: unknown): Promise<{ content: string }[]>;
    create(args: unknown): Promise<unknown>;
  };
};

/** The chapter orders this book's exercise catalog anchors practices in. */
function catalogChapterOrders(bookSlug: string): number[] {
  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];
  return [...new Set(pairs.map((p) => p.practice.chapterOrder))].sort(
    (a, b) => a - b,
  );
}

/** The headings the practices of ONE chapter anchor to. */
function headingsForChapter(bookSlug: string, chapterOrder: number): string[] {
  return (EXERCISE_INGESTION_CATALOG[bookSlug] ?? [])
    .filter((p) => p.practice.chapterOrder === chapterOrder)
    .map((p) => p.practice.sourceHeading);
}

export async function seedPracticeHeadings(
  db: SeedDb,
  chapterId: string,
  bookSlug: string,
  startOrder = 900,
): Promise<number> {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { bookId: true },
  });
  if (!chapter) return 0;

  const wanted = catalogChapterOrders(bookSlug);
  const existing = await db.chapter.findMany({
    where: { bookId: chapter.bookId },
    select: { id: true, order: true },
  });
  const byOrder = new Map(existing.map((c) => [c.order, c]));

  // Chapters the catalog teaches in but this fixture never created. Filler
  // prose so the backfill has something to mint a unit from.
  for (const order of wanted) {
    if (byOrder.has(order)) continue;
    const created = await db.chapter.create({
      data: {
        bookId: chapter.bookId,
        order,
        title: `C${order}`,
        isPublished: true,
      },
    });
    await db.chapterBlock.create({
      data: {
        chapterId: created.id,
        order: 1,
        kind: "PARAGRAPH",
        content: `Texto de relleno del capítulo ${order}.`,
      },
    });
    byOrder.set(order, created);
  }

  let created = 0;
  for (const order of wanted) {
    const target = byOrder.get(order);
    if (!target) continue;
    const blocks = await db.chapterBlock.findMany({
      where: { chapterId: target.id, kind: "HEADING" },
      select: { content: true },
    });
    const have = new Set(blocks.map((b) => b.content));
    let blockOrder = startOrder;
    for (const heading of headingsForChapter(bookSlug, order)) {
      if (have.has(heading)) continue;
      await db.chapterBlock.create({
        data: {
          chapterId: target.id,
          order: blockOrder,
          kind: "HEADING",
          content: heading,
        },
      });
      have.add(heading);
      blockOrder += 1;
      created += 1;
    }
  }
  return created;
}

/** Every heading the catalog anchors to, for callers that seed one chapter. */
export { practiceSourceHeadings };
