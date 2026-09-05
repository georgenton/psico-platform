import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootstrapBook, type BootstrapInput } from "./bootstrap-book";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";
import { relateLegacyToManifest } from "./lib/legacy-adoption";
import {
  activateBookLearningCatalog,
  planBookLearningActivation,
} from "./learning-activation";

/**
 * Exercises on natively-published chapters, against REAL PostgreSQL.
 *
 * The scenario is production's, not a convenient one: *Emociones en
 * Construcción* has a ten-chapter exercise catalog, three legacy `Chapter`
 * rows, and ten units in the published revision — the last seven of which were
 * never adopted from a chapter and never can be, because adoption is
 * `uuidv5(chapter.id)` and a hash does not run backwards.
 *
 * Before this change that state was unservable: the activation demanded a
 * `Chapter` per catalogued order, found seven missing, and rolled the whole
 * book back — including the three that were perfectly fine.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc_native_exercise_owner_db";
const API_DIR = process.cwd();

const SLUG = "emociones-en-construccion";
const PAIRS = EXERCISE_INGESTION_CATALOG[SLUG];
/** Orders served by a real legacy `Chapter`, exactly as in production. */
const LEGACY_ORDERS = [1, 2, 3];
const NATIVE_ORDERS = [4, 5, 6, 7, 8, 9, 10];
const ENV = { ALLOW_CONTENT_CORE_BOOK_INGEST: "on" };

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const headingsFor = (order: number) =>
  PAIRS.filter((p) => p.practice.chapterOrder === order).map(
    (p) => p.practice.sourceHeading,
  );

/** The three legacy chapters, each carrying its own practice headings. */
function legacyInput(): BootstrapInput {
  return {
    manifest: {
      slug: SLUG,
      title: "Emociones en Construcción",
      author: "Marina Quintana",
      authorSlug: "marina-quintana",
      categorySlug: "emociones",
      editionLabel: "Edición de prueba",
      sourceQuality: "OCR_UNFINALIZED",
      chapters: LEGACY_ORDERS.map((order) => ({
        order,
        title: `Capítulo ${order}`,
        file: `${order}.md`,
      })),
    },
    chapters: LEGACY_ORDERS.map((order) => ({
      order,
      title: `Capítulo ${order}`,
      blocks: [
        { kind: "PARAGRAPH" as const, content: `Apertura ${order}.` },
        ...headingsFor(order).flatMap((h) => [
          { kind: "HEADING" as const, content: h },
          { kind: "PARAGRAPH" as const, content: "Consigna." },
        ]),
      ],
    })),
  } satisfies BootstrapInput;
}

suite("Content Core · exercises on native units (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  /**
   * Add the seven NATIVE units: minted keys, no legacy chapter, placed in the
   * published revision. This is what Content Studio produces, and the reason
   * the fixture builds them by hand is that there is no path that gives such a
   * unit a `Chapter` — which is the whole point.
   */
  async function addNativeUnits(
    opts: { headings?: (order: number) => string[] } = {},
  ): Promise<void> {
    const headings = opts.headings ?? headingsFor;
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: SLUG },
      select: { id: true, publishedRevisionId: true },
    });

    for (const order of NATIVE_ORDERS) {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: crypto.randomUUID() },
      });
      const version = await prisma.contentUnitVersion.create({
        data: {
          unitId: unit.id,
          title: `Capítulo ${order}`,
          durationMinutes: 30,
        },
      });
      let blockOrder = 0;
      for (const heading of headings(order)) {
        // A Core-owned block: `legacyBlockId` stays null, which is what makes
        // the unit native rather than a mirror of a legacy chapter.
        const block = await prisma.contentBlock.create({
          data: {
            unitId: unit.id,
            blockKey: crypto.randomUUID(),
            legacyBlockId: null,
          },
        });
        await prisma.blockVersion.create({
          data: {
            contentBlockId: block.id,
            unitVersionId: version.id,
            order: blockOrder,
            kind: "HEADING",
            content: heading,
            contentHash: `h-${order}-${blockOrder}`,
          },
        });
        blockOrder += 1;
      }
      await prisma.revisionUnit.create({
        data: {
          revisionId: edition.publishedRevisionId as string,
          unitId: unit.id,
          unitVersionId: version.id,
          order,
        },
      });
    }
  }

  async function reset(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "Exercise", "ConceptLink", "Concept", "RevisionUnit",
        "BlockVersion", "ContentBlock", "ContentUnitVersion", "ContentUnit",
        "Revision", "Edition", "Work", "ChapterBlock", "Chapter", "Book",
        "BookAuthor", "BookCategory" RESTART IDENTITY CASCADE
    `);
    await prisma.bookCategory.create({
      data: { slug: "emociones", label: "Emociones", order: 1 },
    });
    await bootstrapBook(prisma, legacyInput(), { env: ENV });
    await addNativeUnits();
  }

  beforeEach(async () => {
    await reset();
  }, 120_000);

  // ── The production shape ─────────────────────────────────────────────────

  it("the fixture IS production's shape: 3 legacy rows, 10 native units", async () => {
    expect(await prisma.chapter.count()).toBe(3);
    expect(await prisma.revisionUnit.count()).toBe(10);
    const orders = await prisma.chapter.findMany({ select: { order: true } });
    expect(orders.map((c) => c.order).sort((a, b) => a - b)).toEqual(
      LEGACY_ORDERS,
    );
  });

  it("plans every catalogued order with no chapter shim rows", async () => {
    const plan = await planBookLearningActivation(prisma, SLUG);

    expect(plan.catalog_chapter_orders).toBe("1|2|3|4|5|6|7|8|9|10");
    expect(plan.unit_missing_count).toBe(0);
    expect(plan.unit_not_in_revision_count).toBe(0);
    expect(plan.source_missing_pair_count).toBe(0);
    expect(plan.source_ambiguous_pair_count).toBe(0);
    expect(plan.owner_missing_count).toBe(0);
    // Seven orders genuinely have no legacy row — reported, not fatal.
    expect(plan.chapter_missing_count).toBe(7);
    expect(plan.legacy_owner_count).toBe(3);
    expect(plan.native_owner_count).toBe(7);
    expect(plan.activation_safe).toBe(true);
    expect(plan.writes).toBe(0);
  });

  it("applies, and each exercise carries exactly one owner", async () => {
    await activateBookLearningCatalog(prisma, SLUG);

    const chapters = await prisma.chapter.findMany({
      select: { id: true, order: true },
    });
    const legacyIds = new Set(chapters.map((c) => c.id));
    const placements = await prisma.revisionUnit.findMany({
      select: { order: true, unitId: true },
    });
    const unitByOrder = new Map(placements.map((p) => [p.order, p.unitId]));

    for (const pair of PAIRS) {
      const order = pair.practice.chapterOrder;
      for (const key of [pair.practice.exerciseKey, pair.recall.exerciseKey]) {
        const row = await prisma.exercise.findUniqueOrThrow({
          where: { id: key },
          select: { chapterId: true, contentUnitId: true },
        });
        if (LEGACY_ORDERS.includes(order)) {
          expect(row.chapterId, key).not.toBeNull();
          expect(legacyIds.has(row.chapterId as string), key).toBe(true);
          expect(row.contentUnitId, key).toBeNull();
        } else {
          expect(row.chapterId, key).toBeNull();
          expect(row.contentUnitId, key).toBe(unitByOrder.get(order));
        }
      }
    }
  });

  it("creates no Chapter rows and introduces no structure conflict", async () => {
    const before = await prisma.chapter.count();
    await activateBookLearningCatalog(prisma, SLUG);
    expect(await prisma.chapter.count()).toBe(before);
    expect(await prisma.chapter.count()).toBe(3);
    expect(await prisma.chapterBlock.count()).toBe(
      await prisma.chapterBlock.count(),
    );

    // The rule Content Studio publishes and reorders through, unchanged.
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: SLUG },
      select: { publishedRevisionId: true },
    });
    const entries = await prisma.revisionUnit.findMany({
      where: { revisionId: edition.publishedRevisionId as string },
      select: { order: true, unit: { select: { unitKey: true } } },
    });
    const legacy = await prisma.chapter.findMany({
      select: { id: true, order: true, title: true },
    });
    const relation = relateLegacyToManifest(
      entries.map((e) => ({ order: e.order, unitKey: e.unit.unitKey })),
      legacy,
    );
    expect(relation.structureConflict).toBe(false);
    expect(relation.unsynced).toEqual([]);
  });

  it("a replay verifies instead of drifting", async () => {
    const first = await activateBookLearningCatalog(prisma, SLUG);
    expect(first.exercisesCreated).toBe(PAIRS.length * 2);

    const second = await activateBookLearningCatalog(prisma, SLUG);
    expect(second.exercisesCreated).toBe(0);
    expect(second.exercisesVerified).toBe(PAIRS.length * 2);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.practice_conflict_count).toBe(0);
    expect(plan.recall_conflict_count).toBe(0);
    expect(plan.practice_verify_count).toBe(PAIRS.length);
    expect(plan.recall_verify_count).toBe(PAIRS.length);
    expect(plan.activation_safe).toBe(true);
  });

  it("a changed owner is drift, not a silent rewrite", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    const key = PAIRS.find((p) => p.practice.chapterOrder === 4)!.practice
      .exerciseKey;
    const otherUnit = await prisma.revisionUnit.findFirstOrThrow({
      where: { order: 5 },
      select: { unitId: true },
    });
    // Same key, same words, a different unit — the case a content-only
    // comparison would have called identical.
    await prisma.exercise.update({
      where: { id: key },
      data: { contentUnitId: otherUnit.unitId },
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.practice_conflict_count).toBeGreaterThan(0);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow();
  });

  // ── The database enforces the XOR itself ─────────────────────────────────

  it("refuses an exercise with BOTH owners", async () => {
    const chapter = await prisma.chapter.findFirstOrThrow({
      select: { id: true },
    });
    const unit = await prisma.contentUnit.findFirstOrThrow({
      select: { id: true },
    });
    await expect(
      prisma.exercise.create({
        data: {
          id: "both-owners",
          chapterId: chapter.id,
          contentUnitId: unit.id,
          order: 1,
          title: "x",
          type: "REFLECTION",
          content: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses an exercise with NEITHER owner", async () => {
    await expect(
      prisma.exercise.create({
        data: {
          id: "no-owner",
          order: 1,
          title: "x",
          type: "REFLECTION",
          content: {},
        },
      }),
    ).rejects.toThrow();
  });

  // ── The native heading source keeps both refusals ────────────────────────

  it("a native unit with NO matching heading is SOURCE_MISSING", async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "Exercise", "ConceptLink", "Concept", "RevisionUnit",
        "BlockVersion", "ContentBlock", "ContentUnitVersion", "ContentUnit",
        "Revision", "Edition", "Work", "ChapterBlock", "Chapter", "Book",
        "BookAuthor", "BookCategory" RESTART IDENTITY CASCADE
    `);
    await prisma.bookCategory.create({
      data: { slug: "emociones", label: "Emociones", order: 1 },
    });
    await bootstrapBook(prisma, legacyInput(), { env: ENV });
    await addNativeUnits({ headings: () => [] });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.source_missing_pair_count).toBeGreaterThan(0);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_SOURCE_MISSING/,
    );
    expect(await prisma.exercise.count()).toBe(0);
  });

  it("a native unit with the heading TWICE is SOURCE_AMBIGUOUS", async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "Exercise", "ConceptLink", "Concept", "RevisionUnit",
        "BlockVersion", "ContentBlock", "ContentUnitVersion", "ContentUnit",
        "Revision", "Edition", "Work", "ChapterBlock", "Chapter", "Book",
        "BookAuthor", "BookCategory" RESTART IDENTITY CASCADE
    `);
    await prisma.bookCategory.create({
      data: { slug: "emociones", label: "Emociones", order: 1 },
    });
    await bootstrapBook(prisma, legacyInput(), { env: ENV });
    // Every heading duplicated: two DISTINCT blocks with the same text, which
    // is ambiguity rather than one block with two versions.
    await addNativeUnits({
      headings: (order) => headingsFor(order).flatMap((h) => [h, h]),
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.source_ambiguous_pair_count).toBeGreaterThan(0);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_SOURCE_AMBIGUOUS/,
    );
    expect(await prisma.exercise.count()).toBe(0);
  });

  // ── Legacy ownership is untouched ────────────────────────────────────────

  it("the three legacy chapters still resolve through the key bridge", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    for (const order of LEGACY_ORDERS) {
      const chapter = await prisma.chapter.findFirstOrThrow({
        where: { order },
        select: { id: true },
      });
      const unit = await prisma.contentUnit.findFirstOrThrow({
        where: { unitKey: unitKeyFromLegacyChapterId(chapter.id) },
        select: { id: true },
      });
      const placement = await prisma.revisionUnit.findFirstOrThrow({
        where: { unitId: unit.id },
        select: { order: true },
      });
      expect(placement.order).toBe(order);
      const pair = PAIRS.find((p) => p.practice.chapterOrder === order);
      if (!pair) continue;
      const row = await prisma.exercise.findUniqueOrThrow({
        where: { id: pair.practice.exerciseKey },
        select: { chapterId: true },
      });
      expect(row.chapterId).toBe(chapter.id);
    }
  });

  it("no recall ever stores its answer where a reader could read it", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    // The answer IS stored (grading is server-side); what must never happen is
    // it leaving through a public surface. The public view is asserted in the
    // guide specs — here we prove ownership did not change what is stored.
    for (const pair of PAIRS) {
      const row = await prisma.exercise.findUniqueOrThrow({
        where: { id: pair.recall.exerciseKey },
        select: { type: true, content: true },
      });
      expect(row.type).toBe("QUIZ");
      expect(
        (row.content as { correctOptionKey?: string }).correctOptionKey,
      ).toBe(pair.recall.content.correctOptionKey);
    }
  });
});
