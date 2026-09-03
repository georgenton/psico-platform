import { practiceSourceHeadings } from "../exercise-ingestion-catalog";

/**
 * Seed the editorial headings the exercise catalog anchors its practices to.
 *
 * The catalog is the authority on which headings a book needs; a fixture that
 * lists them by hand falls behind the first time a pair is added, and the suite
 * then reports `EXERCISE_INGEST_SOURCE_MISSING` for content that is perfectly
 * fine in production. Deriving them here means adding a microguide never
 * silently breaks a test that has nothing to do with it.
 *
 * Idempotent by omission: a heading the fixture already created is skipped, so
 * this can sit next to a hand-written `PRACTICE_HEADING` without colliding on
 * `(chapterId, order)`.
 */
export async function seedPracticeHeadings(
  db: {
    chapterBlock: {
      findMany(args: unknown): Promise<{ content: string }[]>;
      create(args: unknown): Promise<unknown>;
    };
  },
  chapterId: string,
  bookSlug: string,
  startOrder = 900,
): Promise<number> {
  const existing = await db.chapterBlock.findMany({
    where: { chapterId, kind: "HEADING" },
    select: { content: true },
  });
  const have = new Set(existing.map((b) => b.content));
  let order = startOrder;
  let created = 0;
  for (const heading of practiceSourceHeadings(bookSlug)) {
    if (have.has(heading)) continue;
    await db.chapterBlock.create({
      data: { chapterId, order, kind: "HEADING", content: heading },
    });
    have.add(heading);
    order += 1;
    created += 1;
  }
  return created;
}
