import { ingestUnitExercises } from "../exercise-ingestion";
import {
  EXERCISE_INGESTION_CATALOG,
  materializableExercisePairs,
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
  // Materializable only. Seeding a retired pair's chapter would rebuild the very
  // ground whose absence this fixture is supposed to reproduce.
  const pairs = materializableExercisePairs(bookSlug);
  return [...new Set(pairs.map((p) => p.practice.chapterOrder))].sort(
    (a, b) => a - b,
  );
}

/** The headings the practices of ONE chapter anchor to. */
function headingsForChapter(bookSlug: string, chapterOrder: number): string[] {
  return materializableExercisePairs(bookSlug)
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

/**
 * Rebuild the full ground a RETIRED pair had when it was ingested: the heading
 * it anchors to, and its two `Exercise` rows.
 *
 * For the suites whose SUBJECT is the history — the binding bridge, the cutover,
 * the previous binary — which assert what an already-ingested pilot still does.
 * They need the rows to exist because that is the world they describe.
 *
 * Deliberately NOT part of `seedPracticeHeadings`. That one builds a fresh,
 * canonical environment, and a fresh environment is exactly where these rows
 * must be absent; conjuring them there would hide the failure the retirement
 * exists to surface. A suite that wants the old world asks for it by name.
 *
 * Call it AFTER the backfill has published the edition: it resolves the units
 * the backfill created.
 */
type RetiredSeedDb = {
  book: { findUnique(a: unknown): Promise<{ id: string } | null> };
  chapter: { findMany(a: unknown): Promise<{ id: string; order: number }[]> };
  chapterBlock: {
    findMany(a: unknown): Promise<{ content: string }[]>;
    create(a: unknown): Promise<unknown>;
  };
  edition: {
    findUnique(
      a: unknown,
    ): Promise<{ publishedRevisionId: string | null } | null>;
  };
  revisionUnit: {
    findMany(a: unknown): Promise<{ order: number; unitId: string }[]>;
  };
};

export async function seedRetiredPairHeadings(
  prisma: RetiredSeedDb,
  bookSlug: string,
): Promise<void> {
  const retired = (EXERCISE_INGESTION_CATALOG[bookSlug] ?? []).filter(
    (p) => p.retired,
  );
  if (retired.length === 0) return;

  const book = await prisma.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true },
  });
  if (!book) return;
  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, order: true },
  });
  const chapterByOrder = new Map(chapters.map((c) => [c.order, c]));

  // 1. The heading each retired practice anchors to.
  for (const pair of retired) {
    const chapter = chapterByOrder.get(pair.practice.chapterOrder);
    if (!chapter) continue;
    const present = await prisma.chapterBlock.findMany({
      where: { chapterId: chapter.id, kind: "HEADING" },
      select: { content: true },
    });
    if (present.some((b) => b.content === pair.practice.sourceHeading))
      continue;
    await prisma.chapterBlock.create({
      data: {
        chapterId: chapter.id,
        order: 800 + pair.practice.order,
        kind: "HEADING",
        content: pair.practice.sourceHeading,
      },
    });
  }
}

/**
 * Phase two: the `Exercise` rows, once the backfill has published the edition.
 *
 * Split from the headings on purpose. A heading has to exist BEFORE the backfill
 * so the projection gives it a Content Core block key; the rows can only be
 * written AFTER, when the units exist. Doing both at one moment cannot work, and
 * the symptom when you try is `EXERCISE_INGEST_SOURCE_MISSING` — the same code a
 * genuinely absent heading raises, which is why the order is stated here rather
 * than left to be rediscovered.
 */
export async function seedRetiredPairExercises(
  prisma: RetiredSeedDb,
  bookSlug: string,
): Promise<void> {
  const retired = (EXERCISE_INGESTION_CATALOG[bookSlug] ?? []).filter(
    (p) => p.retired,
  );
  if (retired.length === 0) return;
  const book = await prisma.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true },
  });
  if (!book) return;
  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, order: true },
  });
  const edition = await prisma.edition.findUnique({
    where: { slug: bookSlug },
    select: { publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) return;
  const revisionUnits = await prisma.revisionUnit.findMany({
    where: { revisionId: edition.publishedRevisionId },
    select: { order: true, unitId: true },
  });
  const unitIdByOrder = new Map(revisionUnits.map((r) => [r.order, r.unitId]));
  const ownerByOrder = new Map(
    chapters.map(
      (c) => [c.order, { kind: "legacy" as const, chapterId: c.id }] as const,
    ),
  );
  await ingestUnitExercises(
    prisma as never,
    bookSlug,
    ownerByOrder,
    unitIdByOrder,
    retired,
  );
}
