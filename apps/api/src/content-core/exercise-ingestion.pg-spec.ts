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
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";

/**
 * CC-7.4B.2 — the editorial Exercise ingestion (practice + objective recall)
 * against REAL PostgreSQL, through the SAME `backfillContentCore` pipeline
 * production content runs. Covers: first-run creation, idempotent re-run,
 * fail-closed drift with atomic rollback, skip-when-target-absent (never
 * first-match / never fabricate), and resolution via the real
 * LearningCatalogResolver.
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
      // A control book NOT in the catalog: it must receive zero exercise rows.
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
          content: PRACTICE.sourceHeading, // same heading, but book not in catalog
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

      const practice = rows.find((r) => r.type === "REFLECTION");
      const recall = rows.find((r) => r.type === "QUIZ");
      expect(practice).toBeDefined();
      expect(recall).toBeDefined();

      // No exercises for the catalog-absent control book.
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
      // Two rows total across the whole DB.
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

      // The sourceBlockKey is the canonical blockKey of the ONE editorial block,
      // and that ContentBlock lives in chapter 1's unit.
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
      // Content, order and correctOptionKey/sourceBlockKey survive byte-identical.
      expect(after).toEqual(before);
    });

    it("resolveExercise resolves the practice and rejects the QUIZ", async () => {
      const ctx = await resolver.resolveExercise(PRACTICE.exerciseKey);
      expect(ctx.exerciseKey).toBe(PRACTICE.exerciseKey);
      expect(ctx.bookSlug).toBe(BOOK_SLUG);
      expect(ctx.revisionNumber).toBe(1);

      // A QUIZ is a recall item, not a completable practice → unresolved (422).
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

      // The bound concept lives in the SAME unit as the item.
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

    // The conflicting recall row is untouched (not overwritten).
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
    // No third row; exactly the one pre-existing conflicting row remains.
    expect(await prisma.exercise.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite(
  "CC-7.4B.2 · exercise ingestion — skips when the editorial block is absent",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;

    beforeAll(async () => {
      ({ prisma, pool } = await freshDb("cc74b2_skip_db"));
      // The catalog book, chapter 1, but WITHOUT the practice heading block.
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
      await backfillContentCore(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma.$disconnect();
      await pool.end();
    });

    it("creates zero exercise rows and does not throw (never fabricates)", async () => {
      expect(await prisma.exercise.count()).toBe(0);
    });
  },
);
