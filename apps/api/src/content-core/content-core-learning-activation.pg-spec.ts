import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { bootstrapBook, type BootstrapInput } from "./bootstrap-book";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { conceptLinkId } from "./concept-ingestion";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import {
  activateBookLearningCatalog,
  planBookLearningActivation,
} from "./learning-activation";

/**
 * The learning activation against REAL PostgreSQL.
 *
 * The fixture is the PRODUCTION path, not a hand-built one: every case starts
 * from `bootstrapBook` — the same library that put Parejas into production —
 * so what these tests exercise is exactly the state a bootstrapped book is in
 * (reading surface complete, learning targets absent).
 *
 * Covers: read-only dry-run, first-run creation, unit coherence, idempotent
 * replay down to byte stability, every fail-closed branch with its rollback,
 * and the invariant that no unauthorized table is ever touched.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc_learning_activation_db";
const API_DIR = process.cwd();

const SLUG = "parejas-que-perduran";
const PAIR = EXERCISE_INGESTION_CATALOG[SLUG][0];
const CONCEPT = CHAPTER_CONCEPTS[SLUG][2];
/** The book's chapter 1 — platform order 2, because order 1 is the preface. */
const CHAPTER_ORDER = 2;
const ENV = { ALLOW_CONTENT_CORE_BOOK_INGEST: "on" };

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/**
 * A Parejas-shaped bootstrap input: a preface at order 1 and the book's
 * chapter 1 at order 2, the latter carrying the approved practice heading.
 * Prose is filler — the manuscript never enters the repository.
 */
function parejasInput(
  opts: { heading?: string | null; duplicate?: boolean } = {},
) {
  const heading =
    opts.heading === undefined ? PAIR.practice.sourceHeading : opts.heading;
  const chapterBlocks: BootstrapInput["chapters"][number]["blocks"] = [
    { kind: "PARAGRAPH" as const, content: "Párrafo de apertura." },
  ];
  if (heading !== null) {
    chapterBlocks.push({ kind: "HEADING" as const, content: heading });
    chapterBlocks.push({ kind: "PARAGRAPH" as const, content: "Consigna." });
    if (opts.duplicate) {
      chapterBlocks.push({ kind: "HEADING" as const, content: heading });
      chapterBlocks.push({ kind: "PARAGRAPH" as const, content: "Repetido." });
    }
  }
  chapterBlocks.push({ kind: "PARAGRAPH" as const, content: "Cierre." });

  return {
    manifest: {
      slug: SLUG,
      title: "Parejas que perduran",
      author: "David Jaramillo",
      authorSlug: "david-jaramillo",
      categorySlug: "vinculos",
      editionLabel: "Edición de prueba OCR",
      sourceQuality: "OCR_UNFINALIZED",
      chapters: [
        { order: 1, title: "Prefacio", file: "01.md" },
        { order: 2, title: "Capítulo uno", file: "02.md" },
      ],
    },
    chapters: [
      {
        order: 1,
        title: "Prefacio",
        blocks: [{ kind: "PARAGRAPH" as const, content: "Prefacio." }],
      },
      { order: 2, title: "Capítulo uno", blocks: chapterBlocks },
    ],
  } satisfies BootstrapInput;
}

/** Row counts of every table the activation must NEVER touch. */
async function contentCensus(prisma: PrismaClient) {
  const [
    books,
    chapters,
    chapterBlocks,
    works,
    editions,
    revisions,
    units,
    unitVersions,
    contentBlocks,
    blockVersions,
    revisionUnits,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.chapter.count(),
    prisma.chapterBlock.count(),
    prisma.work.count(),
    prisma.edition.count(),
    prisma.revision.count(),
    prisma.contentUnit.count(),
    prisma.contentUnitVersion.count(),
    prisma.contentBlock.count(),
    prisma.blockVersion.count(),
    prisma.revisionUnit.count(),
  ]);
  return {
    books,
    chapters,
    chapterBlocks,
    works,
    editions,
    revisions,
    units,
    unitVersions,
    contentBlocks,
    blockVersions,
    revisionUnits,
  };
}

/** Row counts of the tables the activation owns. */
async function learningCensus(prisma: PrismaClient) {
  const [concepts, links, exercises] = await Promise.all([
    prisma.concept.count(),
    prisma.conceptLink.count(),
    prisma.exercise.count(),
  ]);
  return { concepts, links, exercises };
}

suite("Content Core · learning activation (real PostgreSQL)", () => {
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

  /** Every case starts from a clean database bootstrapped the production way. */
  async function reset(
    opts: { heading?: string | null; duplicate?: boolean } = {},
  ): Promise<void> {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "Exercise", "ConceptLink", "Concept", "RevisionUnit",
        "BlockVersion", "ContentBlock", "ContentUnitVersion", "ContentUnit",
        "Revision", "Edition", "Work", "ChapterBlock", "Chapter", "Book",
        "BookAuthor", "BookCategory" RESTART IDENTITY CASCADE
    `);
    await prisma.bookCategory.create({
      data: { slug: "vinculos", label: "Vínculos", order: 2 },
    });
    await bootstrapBook(prisma, parejasInput(opts), { env: ENV });
  }

  beforeEach(async () => {
    await reset();
  }, 60_000);

  // ── Dry-run ───────────────────────────────────────────────────────────────

  it("1 · dry-run writes nothing", async () => {
    const before = await learningCensus(prisma);
    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.writes).toBe(0);
    expect(await learningCensus(prisma)).toEqual(before);
    expect(before).toEqual({ concepts: 0, links: 0, exercises: 0 });
  });

  it("2 · dry-run identifies the chapter at platform order 2", async () => {
    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.catalog_chapter_orders).toBe(String(CHAPTER_ORDER));
    expect(plan.chapter_missing_count).toBe(0);
    expect(plan.unit_missing_count).toBe(0);
    expect(plan.unit_not_in_revision_count).toBe(0);
    expect(plan.book_exists).toBe(true);
    expect(plan.edition_exists).toBe(true);
    expect(plan.published_revision_exists).toBe(true);
  });

  it("3 · dry-run resolves exactly one practice source heading", async () => {
    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.source_pair_count).toBe(1);
    expect(plan.source_exact_match_pair_count).toBe(1);
    expect(plan.source_missing_pair_count).toBe(0);
    expect(plan.source_ambiguous_pair_count).toBe(0);
    expect(plan.catalog_valid).toBe(true);
    expect(plan.catalog_concept_count).toBe(1);
    expect(plan.catalog_exercise_count).toBe(2);
    expect(plan.concept_create_count).toBe(1);
    expect(plan.concept_link_create_count).toBe(1);
    expect(plan.practice_create_count).toBe(1);
    expect(plan.recall_create_count).toBe(1);
    expect(plan.activation_safe).toBe(true);
  });

  // ── Apply ─────────────────────────────────────────────────────────────────

  it("4 · apply creates the Concept", async () => {
    const stats = await activateBookLearningCatalog(prisma, SLUG);
    expect(stats.conceptsCreated).toBe(1);
    const row = await prisma.concept.findUnique({
      where: { conceptKey: CONCEPT.key },
    });
    expect(row?.label).toBe(CONCEPT.label);
  });

  it("5 · apply creates the ConceptLink as PRIMARY on the unit", async () => {
    const stats = await activateBookLearningCatalog(prisma, SLUG);
    expect(stats.conceptLinksCreated).toBe(1);
    const link = await prisma.conceptLink.findUnique({
      where: { id: conceptLinkId(CONCEPT.key) },
    });
    expect(link?.role).toBe("PRIMARY");
    expect(link?.unitId).not.toBeNull();
    expect(link?.contentBlockId).toBeNull();
  });

  it("6 · apply creates the practice anchored to the editorial block", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    const practice = await prisma.exercise.findUnique({
      where: { id: PAIR.practice.exerciseKey },
    });
    expect(practice?.type).toBe("REFLECTION");
    expect(practice?.order).toBe(PAIR.practice.order);
    const content = practice?.content as Record<string, unknown>;
    expect(content.practiceKind).toBe(PAIR.practice.practiceKind);
    expect(typeof content.sourceBlockKey).toBe("string");
  });

  it("7 · apply creates the recall with its options and server-side answer", async () => {
    const stats = await activateBookLearningCatalog(prisma, SLUG);
    expect(stats.exercisesCreated).toBe(2);
    const recall = await prisma.exercise.findUnique({
      where: { id: PAIR.recall.exerciseKey },
    });
    expect(recall?.type).toBe("QUIZ");
    const content = recall?.content as Record<string, unknown>;
    expect(content.recallMode).toBe("objective");
    expect(content.conceptKey).toBe(CONCEPT.key);
    expect((content.options as unknown[]).length).toBe(3);
    expect(content.correctOptionKey).toBe(PAIR.recall.content.correctOptionKey);
  });

  it("8 · concept and exercises land on the SAME unit", async () => {
    await activateBookLearningCatalog(prisma, SLUG);

    const link = await prisma.conceptLink.findUnique({
      where: { id: conceptLinkId(CONCEPT.key) },
      select: { unitId: true },
    });
    const practice = await prisma.exercise.findUnique({
      where: { id: PAIR.practice.exerciseKey },
      select: { chapterId: true, content: true },
    });
    const recall = await prisma.exercise.findUnique({
      where: { id: PAIR.recall.exerciseKey },
      select: { chapterId: true },
    });
    expect(practice?.chapterId).toBe(recall?.chapterId);

    // The practice's anchor block must live in the very unit the concept links.
    const key = (practice?.content as Record<string, unknown>)
      .sourceBlockKey as string;
    const anchor = await prisma.contentBlock.findUnique({
      where: { blockKey: key },
      select: { unitId: true },
    });
    expect(anchor?.unitId).toBe(link?.unitId);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it("9 · a second apply creates zero rows", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    const after = await learningCensus(prisma);

    const stats = await activateBookLearningCatalog(prisma, SLUG);
    expect(stats.conceptsCreated).toBe(0);
    expect(stats.conceptLinksCreated).toBe(0);
    expect(stats.exercisesCreated).toBe(0);
    expect(stats.conceptsVerified).toBe(1);
    expect(stats.conceptLinksVerified).toBe(1);
    expect(stats.exercisesVerified).toBe(2);
    expect(await learningCensus(prisma)).toEqual(after);
  });

  it("10 · a second apply leaves semantic bytes stable", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    const snapshot = async () =>
      JSON.stringify({
        concepts: await prisma.concept.findMany({
          select: { conceptKey: true, label: true },
          orderBy: { conceptKey: "asc" },
        }),
        links: await prisma.conceptLink.findMany({
          select: { id: true, unitId: true, role: true },
          orderBy: { id: "asc" },
        }),
        exercises: await prisma.exercise.findMany({
          select: {
            id: true,
            chapterId: true,
            order: true,
            title: true,
            type: true,
            content: true,
          },
          orderBy: { id: "asc" },
        }),
      });

    const before = await snapshot();
    await activateBookLearningCatalog(prisma, SLUG);
    expect(await snapshot()).toBe(before);
  });

  // ── Fail-closed ───────────────────────────────────────────────────────────

  it("11 · concept drift rolls the whole transaction back", async () => {
    await prisma.concept.create({
      data: { conceptKey: CONCEPT.key, label: "Otro significado" },
    });
    const before = await learningCensus(prisma);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /CONCEPT_INGEST_DRIFT_DETECTED/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
    expect(before.exercises).toBe(0); // no partial activation
  });

  it("12 · concept-link drift rolls the whole transaction back", async () => {
    const concept = await prisma.concept.create({
      data: { conceptKey: CONCEPT.key, label: CONCEPT.label },
    });
    // Point the link at the PREFACE's unit — deterministically not the one the
    // catalog declares, which is the unit of chapter order 2.
    const preface = await prisma.chapter.findFirstOrThrow({
      where: { order: 1 },
      select: { id: true },
    });
    const wrongUnit = await prisma.contentUnit.findFirstOrThrow({
      where: { unitKey: unitKeyFromLegacyChapterId(preface.id) },
      select: { id: true },
    });
    await prisma.conceptLink.create({
      data: {
        id: conceptLinkId(CONCEPT.key),
        conceptId: concept.id,
        unitId: wrongUnit.id,
        role: "PRIMARY",
      },
    });
    const before = await learningCensus(prisma);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /CONCEPT_INGEST_DRIFT_DETECTED/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
    expect(before.exercises).toBe(0);
  });

  it("13 · exercise drift rolls the whole transaction back", async () => {
    const chapter = await prisma.chapter.findFirst({
      where: { order: CHAPTER_ORDER },
      select: { id: true },
    });
    await prisma.exercise.create({
      data: {
        id: PAIR.recall.exerciseKey,
        chapterId: chapter?.id as string,
        order: 99, // drift: not the approved order
        title: PAIR.recall.title,
        type: "QUIZ",
        content: {},
      },
    });
    const before = await learningCensus(prisma);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
    // The concept ran BEFORE the exercises — it must be gone too.
    expect(await learningCensus(prisma)).toEqual(before);
    expect(before.concepts).toBe(0);
  });

  it("14 · a missing source heading rolls back", async () => {
    await reset({ heading: null });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.source_missing_pair_count).toBe(1);
    expect(plan.source_exact_match_pair_count).toBe(0);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_SOURCE_MISSING/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  }, 60_000);

  it("15 · an ambiguous source heading rolls back", async () => {
    await reset({ duplicate: true });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.source_ambiguous_pair_count).toBe(1);
    expect(plan.source_exact_match_pair_count).toBe(0);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_SOURCE_AMBIGUOUS/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  }, 60_000);

  it("16 · a missing chapter 2 fails closed", async () => {
    await prisma.chapter.deleteMany({ where: { order: CHAPTER_ORDER } });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.chapter_missing_count).toBe(1);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow();
    expect(await learningCensus(prisma)).toEqual(before);
  });

  it("17 · a missing unit fails closed", async () => {
    // Drop the Content Core unit while leaving the legacy chapter in place.
    await prisma.revisionUnit.deleteMany({});
    await prisma.blockVersion.deleteMany({});
    await prisma.contentBlock.deleteMany({});
    await prisma.contentUnitVersion.deleteMany({});
    await prisma.contentUnit.deleteMany({});
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.unit_missing_count).toBe(1);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_UNIT_NOT_FOUND/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  });

  it("18 · an unpublished revision fails closed", async () => {
    await prisma.edition.updateMany({ data: { publishedRevisionId: null } });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.published_revision_exists).toBe(false);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_REVISION_NOT_PUBLISHED/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  });

  it("19 · a book absent from the catalog is a no-op", async () => {
    // Bootstrap a second book that no catalog mentions.
    const other = parejasInput();
    other.manifest.slug = "libro-sin-catalogo";
    other.manifest.title = "Libro sin catálogo";
    await bootstrapBook(prisma, other, { env: ENV });

    const before = await learningCensus(prisma);
    const plan = await planBookLearningActivation(prisma, "libro-sin-catalogo");
    expect(plan.catalog_concept_count).toBe(0);
    expect(plan.catalog_exercise_count).toBe(0);
    expect(plan.activation_safe).toBe(false); // nothing to activate

    const stats = await activateBookLearningCatalog(
      prisma,
      "libro-sin-catalogo",
    );
    expect(stats).toEqual({
      conceptsCreated: 0,
      conceptLinksCreated: 0,
      exercisesCreated: 0,
      conceptsVerified: 0,
      conceptLinksVerified: 0,
      exercisesVerified: 0,
    });
    expect(await learningCensus(prisma)).toEqual(before);
  }, 60_000);

  it("20 · no unauthorized table changes across a full apply", async () => {
    const before = await contentCensus(prisma);
    await activateBookLearningCatalog(prisma, SLUG);
    expect(await contentCensus(prisma)).toEqual(before);

    // …and the reading surface is byte-identical, not merely equal in count.
    const blocks = await prisma.chapterBlock.findMany({
      select: { id: true, kind: true, content: true, order: true },
      orderBy: { id: "asc" },
    });
    await activateBookLearningCatalog(prisma, SLUG);
    expect(
      await prisma.chapterBlock.findMany({
        select: { id: true, kind: true, content: true, order: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(blocks);
  });

  it("21 · a missing book fails closed before any read of content", async () => {
    await expect(
      activateBookLearningCatalog(prisma, "no-existe"),
    ).rejects.toThrow(/ACTIVATION_BOOK_NOT_FOUND/);
    const plan = await planBookLearningActivation(prisma, "no-existe");
    expect(plan.book_exists).toBe(false);
    expect(plan.activation_safe).toBe(false);
    expect(plan.writes).toBe(0);
  });
  // ── Review §4: planner sees the SAME drift the apply would throw ──────────

  /** Seed the practice row with one field deliberately off. */
  async function seedPractice(overrides: {
    order?: number;
    title?: string;
    content?: Record<string, unknown>;
  }): Promise<void> {
    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { order: CHAPTER_ORDER },
      select: { id: true },
    });
    const heading = await prisma.chapterBlock.findFirstOrThrow({
      where: { kind: "HEADING", content: PAIR.practice.sourceHeading },
      select: { id: true },
    });
    await prisma.exercise.create({
      data: {
        id: PAIR.practice.exerciseKey,
        chapterId: chapter.id,
        order: overrides.order ?? PAIR.practice.order,
        title: overrides.title ?? PAIR.practice.title,
        type: "REFLECTION",
        content: (overrides.content ?? {
          practiceKind: PAIR.practice.practiceKind,
          sourceBlockKey: blockKeyFromLegacyId(heading.id),
        }) as object,
      },
    });
  }

  async function seedRecall(content: Record<string, unknown>): Promise<void> {
    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { order: CHAPTER_ORDER },
      select: { id: true },
    });
    await prisma.exercise.create({
      data: {
        id: PAIR.recall.exerciseKey,
        chapterId: chapter.id,
        order: PAIR.recall.order,
        title: PAIR.recall.title,
        type: "QUIZ",
        content: content as object,
      },
    });
  }

  function approvedRecallContent(): Record<string, unknown> {
    return {
      recallMode: PAIR.recall.content.recallMode,
      conceptKey: PAIR.recall.content.conceptKey,
      options: PAIR.recall.content.options.map((o) => ({
        key: o.key,
        label: o.label,
      })),
      correctOptionKey: PAIR.recall.content.correctOptionKey,
    };
  }

  it("22 · a practice whose practiceKind drifted is a planner conflict", async () => {
    const heading = await prisma.chapterBlock.findFirstOrThrow({
      where: { kind: "HEADING", content: PAIR.practice.sourceHeading },
      select: { id: true },
    });
    await seedPractice({
      content: {
        practiceKind: "otro_tipo",
        sourceBlockKey: blockKeyFromLegacyId(heading.id),
      },
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.practice_conflict_count).toBe(1);
    expect(plan.activation_safe).toBe(false);
    // Parity: the apply throws exactly where the plan said CONFLICT.
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
  });

  it("23 · a practice anchored to another block is a planner conflict", async () => {
    await seedPractice({
      content: {
        practiceKind: PAIR.practice.practiceKind,
        sourceBlockKey: "00000000-0000-0000-0000-000000000000",
      },
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.practice_conflict_count).toBe(1);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
  });

  it("24 · a recall pointing at another concept is a planner conflict", async () => {
    await seedRecall({
      ...approvedRecallContent(),
      conceptKey: "otro-concepto",
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.recall_conflict_count).toBe(1);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
  });

  it("25 · a recall with different options is a planner conflict", async () => {
    const c = approvedRecallContent();
    const opts = c.options as { key: string; label: string }[];
    await seedRecall({
      ...c,
      options: [
        ...opts.slice(0, 2),
        { key: opts[2].key, label: "Otra opción." },
      ],
    });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.recall_conflict_count).toBe(1);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
  });

  it("26 · a recall with a different correct answer is a planner conflict", async () => {
    const c = approvedRecallContent();
    const opts = c.options as { key: string }[];
    const other = opts.find((o) => o.key !== c.correctOptionKey);
    await seedRecall({ ...c, correctOptionKey: other?.key });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.recall_conflict_count).toBe(1);
    expect(plan.activation_safe).toBe(false);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /EXERCISE_INGEST_DRIFT_DETECTED/,
    );
  });

  it("27 · an identical practice + recall read as VERIFY, not CONFLICT", async () => {
    await activateBookLearningCatalog(prisma, SLUG);
    const plan = await planBookLearningActivation(prisma, SLUG);

    expect(plan.practice_verify_count).toBe(1);
    expect(plan.recall_verify_count).toBe(1);
    expect(plan.concept_verify_count).toBe(1);
    expect(plan.concept_link_verify_count).toBe(1);
    expect(plan.practice_conflict_count).toBe(0);
    expect(plan.recall_conflict_count).toBe(0);
    expect(plan.activation_safe).toBe(true);
  });

  // ── Review §7: the published revision is verified, not assumed ────────────

  it("28 · a publishedRevisionId pointing at a DRAFT fails closed", async () => {
    const edition = await prisma.edition.findFirstOrThrow({
      select: { id: true, publishedRevisionId: true },
    });
    await prisma.revision.update({
      where: { id: edition.publishedRevisionId as string },
      data: { status: "DRAFT" },
    });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.published_revision_exists).toBe(false);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_REVISION_NOT_PUBLISHED/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  });

  it("29 · a cross-edition publishedRevisionId is impossible to create", async () => {
    // The application checks `revision.editionId === edition.id` as defense in
    // depth, but the DATABASE refuses the state outright
    // (EDITION_PUBLISHED_CROSS_EDITION). Pin the stronger guarantee: the row
    // this activator would have to reject can never exist in the first place.
    const other = parejasInput();
    other.manifest.slug = "otro-libro-publicado";
    other.manifest.title = "Otro libro";
    await bootstrapBook(prisma, other, { env: ENV });

    const foreign = await prisma.edition.findFirstOrThrow({
      where: { slug: "otro-libro-publicado" },
      select: { publishedRevisionId: true },
    });
    await prisma.edition.updateMany({
      where: { slug: SLUG },
      data: { publishedRevisionId: null },
    });

    await expect(
      prisma.edition.updateMany({
        where: { slug: SLUG },
        data: { publishedRevisionId: foreign.publishedRevisionId },
      }),
    ).rejects.toThrow(/EDITION_PUBLISHED_CROSS_EDITION/);

    // And with the pointer cleared, the activation refuses as it should.
    const before = await learningCensus(prisma);
    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_REVISION_NOT_PUBLISHED/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  }, 60_000);

  // ── Review §8: planner and apply share the same context scope ────────────

  it("30 · a legacy chapter nobody catalogued cannot block the activation", async () => {
    // The preface (order 1) is outside both catalogs. Drop it from the
    // published revision entirely: the activator has no business with it.
    const preface = await prisma.chapter.findFirstOrThrow({
      where: { order: 1 },
      select: { id: true },
    });
    const unit = await prisma.contentUnit.findFirstOrThrow({
      where: { unitKey: unitKeyFromLegacyChapterId(preface.id) },
      select: { id: true },
    });
    await prisma.revisionUnit.deleteMany({ where: { unitId: unit.id } });

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.unit_not_in_revision_count).toBe(0);
    expect(plan.activation_safe).toBe(true);

    const stats = await activateBookLearningCatalog(prisma, SLUG);
    expect(stats.conceptsCreated).toBe(1);
    expect(stats.exercisesCreated).toBe(2);
  });

  it("31 · a CATALOGUED chapter outside the published revision blocks it", async () => {
    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { order: CHAPTER_ORDER },
      select: { id: true },
    });
    const unit = await prisma.contentUnit.findFirstOrThrow({
      where: { unitKey: unitKeyFromLegacyChapterId(chapter.id) },
      select: { id: true },
    });
    await prisma.revisionUnit.deleteMany({ where: { unitId: unit.id } });
    const before = await learningCensus(prisma);

    const plan = await planBookLearningActivation(prisma, SLUG);
    expect(plan.unit_not_in_revision_count).toBe(1);
    expect(plan.activation_safe).toBe(false);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_UNIT_NOT_IN_REVISION/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  });

  // ── Review §11: the MissingUnitPolicy decision stays as decided ───────────

  it("32 · the activation THROWS on a catalogued chapter with no unit", async () => {
    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { order: CHAPTER_ORDER },
      select: { id: true },
    });
    await prisma.revisionUnit.deleteMany({});
    await prisma.blockVersion.deleteMany({});
    await prisma.contentBlock.deleteMany({});
    await prisma.contentUnitVersion.deleteMany({});
    await prisma.contentUnit.deleteMany({
      where: { unitKey: unitKeyFromLegacyChapterId(chapter.id) },
    });
    const before = await learningCensus(prisma);

    await expect(activateBookLearningCatalog(prisma, SLUG)).rejects.toThrow(
      /ACTIVATION_UNIT_NOT_FOUND/,
    );
    expect(await learningCensus(prisma)).toEqual(before);
  });
});
