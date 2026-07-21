import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HttpException } from "@nestjs/common";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { backfillContentCore } from "./backfill";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import {
  EXERCISE_INGESTION_CATALOG,
  type UnitExerciseDefinitions,
} from "./exercise-ingestion-catalog";
import {
  assertPairValid,
  ExerciseIngestError,
  ingestUnitExercises,
  type ExerciseIngestDb,
} from "./exercise-ingestion";

/**
 * CC-7.4B.2 — the editorial Exercise ingestion (practice + objective recall)
 * against REAL PostgreSQL, through the SAME `backfillContentCore` pipeline
 * production content runs. Covers: first-run creation, idempotent re-run,
 * atomic drift, FAIL-CLOSED behaviour (a catalog-listed book that loses its
 * editorial source aborts the Book transaction — never a silent skip), the
 * fine-grained resolution failures (missing/ambiguous/wrong-kind), the pure
 * catalog-coherence guard, and resolution via the real LearningCatalogResolver.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

const BOOK_SLUG = "emociones-en-construccion";
const PAIR = EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0];
const PRACTICE = PAIR.practice;
const RECALL = PAIR.recall;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

interface Db {
  prisma: PrismaClient;
  pool: Pool;
}

async function freshDb(dbName: string): Promise<Db> {
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const url = withDatabase(base as string, dbName);
  execSync("pnpm exec prisma migrate deploy", {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
    stdio: "inherit",
  });
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

/** Seed the FIRST Guide unit exactly: book + chapter 1 with the approved
 * practice heading block (plus filler prose). Returns chapter id. */
async function seedFirstUnit(
  prisma: PrismaClient,
  slug = BOOK_SLUG,
): Promise<{ chapterId: string; practiceBlockId: string }> {
  const book = await prisma.book.create({
    data: { slug, title: "Emociones en Construcción", plan: "FREE" },
  });
  const ch = await prisma.chapter.create({
    data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
  });
  await prisma.chapterBlock.create({
    data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "Intro." },
  });
  const practiceBlock = await prisma.chapterBlock.create({
    data: {
      chapterId: ch.id,
      order: 1,
      kind: "HEADING",
      content: PRACTICE.sourceHeading,
    },
  });
  return { chapterId: ch.id, practiceBlockId: practiceBlock.id };
}

// ─────────────────────────────────────────────────────────────────────────────
suite(
  "CC-7.4B.2 · exercise ingestion — first run + idempotent + resolver",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;
    let resolver: LearningCatalogResolver;
    let chapterId: string;
    let practiceBlockId: string;

    beforeAll(async () => {
      ({ prisma, pool } = await freshDb("cc74b2_ingest_db"));
      resolver = new LearningCatalogResolver(
        prisma as unknown as PrismaService,
      );

      ({ chapterId, practiceBlockId } = await seedFirstUnit(prisma));
      // A control book NOT in the catalog: it must receive zero exercise rows
      // even though it carries the same heading text.
      const other = await prisma.book.create({
        data: { slug: "sin-catalogo", title: "Otro", plan: "FREE" },
      });
      const otherCh = await prisma.chapter.create({
        data: { bookId: other.id, order: 1, title: "X" },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: otherCh.id,
          order: 0,
          kind: "HEADING",
          content: PRACTICE.sourceHeading,
        },
      });

      await backfillContentCore(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma.$disconnect();
      await pool.end();
    });

    it("creates exactly one practice and one recall row for the unit", async () => {
      const rows = await prisma.exercise.findMany({
        where: { chapterId },
        orderBy: { order: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.type === "REFLECTION")).toBeDefined();
      expect(rows.find((r) => r.type === "QUIZ")).toBeDefined();

      // No exercises for the catalog-absent control book (no-op is allowed).
      const otherBook = await prisma.book.findUniqueOrThrow({
        where: { slug: "sin-catalogo" },
        select: { id: true },
      });
      const otherChapter = await prisma.chapter.findFirstOrThrow({
        where: { bookId: otherBook.id },
        select: { id: true },
      });
      expect(
        await prisma.exercise.count({ where: { chapterId: otherChapter.id } }),
      ).toBe(0);
      expect(await prisma.exercise.count()).toBe(2);
    });

    it("stores the approved practice with a server-owned sourceBlockKey in the unit", async () => {
      const practice = await prisma.exercise.findUniqueOrThrow({
        where: { id: PRACTICE.exerciseKey },
      });
      expect(practice.chapterId).toBe(chapterId);
      expect(practice.type).toBe("REFLECTION");
      expect(practice.order).toBe(1);
      expect(practice.title).toBe(PRACTICE.title);

      const content = practice.content as Record<string, unknown>;
      expect(Object.keys(content).sort()).toEqual([
        "practiceKind",
        "sourceBlockKey",
      ]);
      expect(content.practiceKind).toBe("guided_reflection");

      const expectedKey = blockKeyFromLegacyId(practiceBlockId);
      expect(content.sourceBlockKey).toBe(expectedKey);

      const unitKey = unitKeyFromLegacyChapterId(chapterId);
      const edition = await prisma.edition.findUniqueOrThrow({
        where: { slug: BOOK_SLUG },
        select: { id: true },
      });
      const unit = await prisma.contentUnit.findUniqueOrThrow({
        where: { editionId_unitKey: { editionId: edition.id, unitKey } },
        select: { id: true },
      });
      const cb = await prisma.contentBlock.findUniqueOrThrow({
        where: { blockKey: expectedKey },
        select: { unitId: true },
      });
      expect(cb.unitId).toBe(unit.id);
    });

    it("stores the approved objective recall with the exact closed contract", async () => {
      const recall = await prisma.exercise.findUniqueOrThrow({
        where: { id: RECALL.exerciseKey },
      });
      expect(recall.chapterId).toBe(chapterId);
      expect(recall.type).toBe("QUIZ");
      expect(recall.order).toBe(2);
      expect(recall.title).toBe(RECALL.title);

      const content = recall.content as Record<string, unknown>;
      expect(Object.keys(content).sort()).toEqual([
        "conceptKey",
        "correctOptionKey",
        "options",
        "recallMode",
      ]);
      expect(content.recallMode).toBe("objective");
      expect(content.conceptKey).toBe("eec-cuerpo-antes-que-mente");
      expect(content.correctOptionKey).toBe("opcion-cuerpo-primero");

      const options = content.options as Array<{ key: string; label: string }>;
      expect(options).toHaveLength(3);
      const keys = options.map((o) => o.key);
      expect(new Set(keys).size).toBe(3);
      expect(keys).toContain(content.correctOptionKey);
      for (const o of options) {
        expect(Object.keys(o).sort()).toEqual(["key", "label"]);
      }
    });

    it("is idempotent — a second backfill creates zero new rows, all stable", async () => {
      const before = await prisma.exercise.findMany({ orderBy: { id: "asc" } });
      await backfillContentCore(prisma);
      const after = await prisma.exercise.findMany({ orderBy: { id: "asc" } });

      expect(after).toHaveLength(before.length);
      expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
      expect(after).toEqual(before);
    });

    it("resolveExercise resolves the practice and rejects the QUIZ", async () => {
      const ctx = await resolver.resolveExercise(PRACTICE.exerciseKey);
      expect(ctx.exerciseKey).toBe(PRACTICE.exerciseKey);
      expect(ctx.bookSlug).toBe(BOOK_SLUG);
      expect(ctx.revisionNumber).toBe(1);

      const err = await resolver.resolveExercise(RECALL.exerciseKey).then(
        () => {
          throw new Error("expected rejection");
        },
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it("resolveRecallItem returns the objective contract in the same unit", async () => {
      const item = await resolver.resolveRecallItem(RECALL.exerciseKey);
      expect(item.itemKey).toBe(RECALL.exerciseKey);
      expect(item.mode).toBe("objective");
      expect(item.conceptKey).toBe("eec-cuerpo-antes-que-mente");
      expect([...item.optionKeys].sort()).toEqual([
        "opcion-cuerpo-primero",
        "opcion-mente-primero",
        "opcion-simultanea",
      ]);
      expect(item.correctOptionKey).toBe("opcion-cuerpo-primero");

      const practiceCtx = await resolver.resolveExercise(PRACTICE.exerciseKey);
      expect(item.unitId).toBe(practiceCtx.unitId);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
suite("CC-7.4B.2 · exercise ingestion — drift fails closed, atomically", () => {
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    ({ prisma, pool } = await freshDb("cc74b2_drift_db"));
    const { chapterId } = await seedFirstUnit(prisma);
    // Pre-insert the RECALL id with DIFFERENT semantics (a conflicting answer).
    await prisma.exercise.create({
      data: {
        id: RECALL.exerciseKey,
        chapterId,
        order: 9,
        title: "Otra pregunta",
        type: "QUIZ",
        content: {
          recallMode: "objective",
          conceptKey: "eec-cuerpo-antes-que-mente",
          options: [
            { key: "x", label: "x" },
            { key: "y", label: "y" },
          ],
          correctOptionKey: "y",
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it("throws, never overwrites, creates no extra row, leaves no partial state", async () => {
    await expect(backfillContentCore(prisma)).rejects.toThrow(
      "EXERCISE_INGEST_DRIFT_DETECTED",
    );

    const recall = await prisma.exercise.findUniqueOrThrow({
      where: { id: RECALL.exerciseKey },
    });
    expect(recall.title).toBe("Otra pregunta");
    expect((recall.content as Record<string, unknown>).correctOptionKey).toBe(
      "y",
    );

    // The practice was NOT persisted — the whole Book transaction rolled back.
    expect(
      await prisma.exercise.findUnique({ where: { id: PRACTICE.exerciseKey } }),
    ).toBeNull();
    expect(await prisma.exercise.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite(
  "CC-7.4B.2 · exercise ingestion — fails closed when the source block is absent",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;

    beforeAll(async () => {
      ({ prisma, pool } = await freshDb("cc74b2_failclosed_db"));
      // The catalog book, chapter 1 present, but WITHOUT the practice heading.
      const book = await prisma.book.create({
        data: { slug: BOOK_SLUG, title: "Emociones", plan: "FREE" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "C1" },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Solo prosa.",
        },
      });
    }, 120_000);

    afterAll(async () => {
      await prisma.$disconnect();
      await pool.end();
    });

    it("aborts the Book transaction — zero exercises, zero Content Core rows", async () => {
      await expect(backfillContentCore(prisma)).rejects.toThrow(
        "EXERCISE_INGEST_SOURCE_MISSING",
      );
      // Fail closed: never fabricates, and the whole Book rolls back.
      expect(await prisma.exercise.count()).toBe(0);
      expect(await prisma.contentUnit.count()).toBe(0);
      // Legacy rows (created outside the backfill tx) are untouched.
      expect(await prisma.chapterBlock.count()).toBe(1);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
suite(
  "CC-7.4B.2 · exercise ingestion — fine-grained resolution failures",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;
    let db: ExerciseIngestDb;

    beforeAll(async () => {
      ({ prisma, pool } = await freshDb("cc74b2_resolve_db"));
      db = prisma as unknown as ExerciseIngestDb;
    }, 120_000);

    afterAll(async () => {
      await prisma.$disconnect();
      await pool.end();
    });

    async function fixtureChapter(): Promise<string> {
      const book = await prisma.book.create({
        data: { slug: `fx-${Math.abs(hash())}`, title: "Fx", plan: "FREE" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "C" },
      });
      return ch.id;
    }
    // Deterministic per-call id suffix (no Math.random / Date in tests).
    let counter = 0;
    function hash(): number {
      counter += 1;
      return counter;
    }

    const expectCode = async (
      p: Promise<unknown>,
      code: string,
    ): Promise<void> => {
      const err = await p.then(
        () => {
          throw new Error(`expected ${code}`);
        },
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ExerciseIngestError);
      expect((err as ExerciseIngestError).code).toBe(code);
    };

    it("missing chapter/unit → SOURCE_MISSING (before any DB write)", async () => {
      await expectCode(
        ingestUnitExercises(db, BOOK_SLUG, new Map(), new Map()),
        "EXERCISE_INGEST_SOURCE_MISSING",
      );
      expect(await prisma.exercise.count()).toBe(0);
    });

    it("no heading block → SOURCE_MISSING", async () => {
      const chapterId = await fixtureChapter();
      await prisma.chapterBlock.create({
        data: { chapterId, order: 0, kind: "PARAGRAPH", content: "prosa" },
      });
      await expectCode(
        ingestUnitExercises(
          db,
          BOOK_SLUG,
          new Map([[1, chapterId]]),
          new Map([[1, "unit-x"]]),
        ),
        "EXERCISE_INGEST_SOURCE_MISSING",
      );
      expect(await prisma.exercise.count()).toBe(0);
    });

    it("the heading text in the WRONG kind is not accepted → SOURCE_MISSING", async () => {
      const chapterId = await fixtureChapter();
      // Same text, but a PARAGRAPH — must not act as the source.
      await prisma.chapterBlock.create({
        data: {
          chapterId,
          order: 0,
          kind: "PARAGRAPH",
          content: PRACTICE.sourceHeading,
        },
      });
      await expectCode(
        ingestUnitExercises(
          db,
          BOOK_SLUG,
          new Map([[1, chapterId]]),
          new Map([[1, "unit-x"]]),
        ),
        "EXERCISE_INGEST_SOURCE_MISSING",
      );
      expect(await prisma.exercise.count()).toBe(0);
    });

    it("two exact HEADING blocks → SOURCE_AMBIGUOUS (never first-match)", async () => {
      const chapterId = await fixtureChapter();
      await prisma.chapterBlock.create({
        data: {
          chapterId,
          order: 0,
          kind: "HEADING",
          content: PRACTICE.sourceHeading,
        },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId,
          order: 1,
          kind: "HEADING",
          content: PRACTICE.sourceHeading,
        },
      });
      await expectCode(
        ingestUnitExercises(
          db,
          BOOK_SLUG,
          new Map([[1, chapterId]]),
          new Map([[1, "unit-x"]]),
        ),
        "EXERCISE_INGEST_SOURCE_AMBIGUOUS",
      );
      expect(await prisma.exercise.count()).toBe(0);
    });

    it("a non-catalog book is a no-op (zero rows, no error)", async () => {
      await expect(
        ingestUnitExercises(
          db,
          "libro-fuera-de-catalogo",
          new Map(),
          new Map(),
        ),
      ).resolves.toBeUndefined();
      expect(await prisma.exercise.count()).toBe(0);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
describe("CC-7.4B.2 · exercise ingestion — pure catalog coherence", () => {
  it("accepts the real approved pair", () => {
    expect(() => assertPairValid(BOOK_SLUG, PAIR)).not.toThrow();
  });

  const mutate = (
    f: (p: {
      practice: Record<string, unknown>;
      recall: Record<string, unknown> & { content: Record<string, unknown> };
    }) => void,
  ): UnitExerciseDefinitions => {
    const clone = JSON.parse(JSON.stringify(PAIR)) as {
      practice: Record<string, unknown>;
      recall: Record<string, unknown> & { content: Record<string, unknown> };
    };
    f(clone);
    return clone as unknown as UnitExerciseDefinitions;
  };

  it("rejects a book-slug mismatch", () => {
    const bad = mutate((c) => {
      c.recall.bookSlug = "otro-libro";
    });
    expect(() => assertPairValid(BOOK_SLUG, bad)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });

  it("rejects a chapter-order mismatch between practice and recall", () => {
    const bad = mutate((c) => {
      c.recall.chapterOrder = 7;
    });
    expect(() => assertPairValid(BOOK_SLUG, bad)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });

  it("rejects a foreign correctOptionKey", () => {
    const bad = mutate((c) => {
      c.recall.content.correctOptionKey = "no-existe";
    });
    expect(() => assertPairValid(BOOK_SLUG, bad)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });

  it("rejects a duplicate option key", () => {
    const bad = mutate((c) => {
      const opts = c.recall.content.options as Array<{ key: string }>;
      opts[1].key = opts[0].key;
    });
    expect(() => assertPairValid(BOOK_SLUG, bad)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });

  it("rejects fewer than two options", () => {
    const bad = mutate((c) => {
      c.recall.content.options = [{ key: "solo", label: "solo" }];
      c.recall.content.correctOptionKey = "solo";
    });
    expect(() => assertPairValid(BOOK_SLUG, bad)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });

  it("rejects practice/recall type swap and equal orders", () => {
    const swapped = mutate((c) => {
      c.practice.type = "QUIZ";
    });
    expect(() => assertPairValid(BOOK_SLUG, swapped)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
    const equalOrder = mutate((c) => {
      c.recall.order = (c.practice.order as number) ?? 1;
    });
    expect(() => assertPairValid(BOOK_SLUG, equalOrder)).toThrow(
      "EXERCISE_INGEST_CATALOG_INVALID",
    );
  });
});
