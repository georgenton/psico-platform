import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HttpException } from "@nestjs/common";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GuideStepDefinition } from "@psico/types";
import type { PrismaService } from "../prisma";
import {
  LearningCatalogResolver,
  type ResolvedUnitContext,
} from "../learning/learning-catalog.resolver";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import {
  GuideCatalogError,
  PRODUCTION_GUIDE_DEFINITIONS,
  productionGuideRegistry,
} from "./guide-catalog";

/**
 * CC-7.4B.3 — the FIRST production GuideDefinition, cross-checked against REAL
 * PostgreSQL: the published registry, the exact approved shape, and the fact
 * that its three targets resolve — through the real `LearningCatalogResolver`,
 * over content ingested by the real `backfillContentCore` — to ONE editorial
 * context (same book, edition, published revision and unit).
 *
 * This suite fixes GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS: the
 * definition carries NO editorial context and NO database ids; the server
 * derives them from the targets. CC-7.4C must apply this same convergence
 * check BEFORE creating a session. No lifecycle, no endpoints, no session
 * persistence is exercised here.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "cc74b3_guide_db";

const BOOK_SLUG = "emociones-en-construccion";
const GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente";
const PRACTICE_HEADING =
  EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0].practice.sourceHeading;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** The editorial identity every target must agree on (no ids in the guide). */
function contextOf(ctx: ResolvedUnitContext) {
  return {
    bookId: ctx.bookId,
    editionId: ctx.editionId,
    revisionId: ctx.revisionId,
    unitId: ctx.unitId,
  };
}

async function expectHttp(p: Promise<unknown>, status: number): Promise<void> {
  const err = await p.then(
    () => {
      throw new Error(`expected HTTP ${status}`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  expect((err as HttpException).getStatus()).toBe(status);
  // Value-free: the received key never appears in the error payload.
  expect(JSON.stringify((err as HttpException).getResponse())).not.toContain(
    GUIDE_KEY,
  );
}

suite("CC-7.4B.3 · first production GuideDefinition (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let resolver: LearningCatalogResolver;
  // Fixtures living in a DIFFERENT unit (chapter 2) — used for the negatives.
  let otherUnitPracticeId: string;
  let otherUnitSelfAssessedId: string;
  let unpublishedUnitPracticeId: string;

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
    resolver = new LearningCatalogResolver(prisma as unknown as PrismaService);

    // Chapter 1 with its REAL editorial heading → the backfill ingests the
    // approved practice + objective recall and links the concept to its unit.
    const book = await prisma.book.create({
      data: {
        slug: BOOK_SLUG,
        title: "Emociones en Construcción",
        plan: "FREE",
      },
    });
    const ch1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Intro.",
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 1,
        kind: "HEADING",
        content: PRACTICE_HEADING,
      },
    });
    // A SECOND unit in the same edition — the "other unit" of the negatives.
    const ch2 = await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "C2", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch2.id, order: 0, kind: "PARAGRAPH", content: "Dos." },
    });

    await backfillContentCore(prisma);

    // Fixtures in the OTHER unit (never reachable from the approved guide).
    otherUnitPracticeId = (
      await prisma.exercise.create({
        data: {
          chapterId: ch2.id,
          order: 1,
          title: "Práctica de otra unidad",
          type: "REFLECTION",
          content: { practiceKind: "guided_reflection", sourceBlockKey: "x" },
        },
      })
    ).id;
    otherUnitSelfAssessedId = (
      await prisma.exercise.create({
        data: {
          chapterId: ch2.id,
          order: 2,
          title: "Recuerdo libre",
          type: "QUIZ",
          content: { recallMode: "self_assessed" },
        },
      })
    ).id;

    // A chapter created AFTER the backfill → its unit is not in the published
    // revision (not servable content).
    const chLate = await prisma.chapter.create({
      data: { bookId: book.id, order: 99, title: "Tardío" },
    });
    unpublishedUnitPracticeId = (
      await prisma.exercise.create({
        data: {
          chapterId: chLate.id,
          order: 1,
          title: "Práctica no publicada",
          type: "REFLECTION",
          content: { practiceKind: "guided_reflection", sourceBlockKey: "y" },
        },
      })
    ).id;
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  // ── Registry ─────────────────────────────────────────────────────────────
  it("publishes exactly one definition, resolvable only by exact version", () => {
    expect(productionGuideRegistry.size).toBe(1);
    expect(productionGuideRegistry.latestStartableVersion(GUIDE_KEY)).toBe(1);
    expect(productionGuideRegistry.getExact(GUIDE_KEY, 1)).toEqual(
      PRODUCTION_GUIDE_DEFINITIONS[0],
    );
    // No fallback of any kind for a version/key that was never published.
    expect(() => productionGuideRegistry.getExact(GUIDE_KEY, 2)).toThrow(
      GuideCatalogError,
    );
    expect(() => productionGuideRegistry.getExact("otra-guia", 1)).toThrow(
      GuideCatalogError,
    );
    expect(
      productionGuideRegistry.latestStartableVersion("otra-guia"),
    ).toBeNull();
  });

  // ── Shape ────────────────────────────────────────────────────────────────
  it("has the exact approved three-step shape, deeply frozen, no extra fields", () => {
    const def = productionGuideRegistry.getExact(GUIDE_KEY, 1);
    expect(Object.keys(def).sort()).toEqual([
      "guideKey",
      "guideVersion",
      "steps",
    ]);
    expect(def.steps).toHaveLength(3);
    expect(def.steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(new Set(def.steps.map((s) => s.stepKey)).size).toBe(3);
    expect(def.steps.every((s) => s.required === true)).toBe(true);
    expect(def.steps.map((s) => s.kind)).toEqual([
      "CONCEPT_EXPLORATION",
      "CATALOG_PRACTICE",
      "ACTIVE_RECALL",
    ]);
    expect(def.steps.map((s) => s.completionPolicy)).toEqual([
      "explicit_confirmation",
      "catalog_practice_confirmation",
      "objective_recall",
    ]);

    const [concept, practice, recall] = def.steps;
    expect(Object.keys(concept).sort()).toEqual([
      "completionPolicy",
      "conceptKey",
      "kind",
      "order",
      "required",
      "stepKey",
    ]);
    expect(Object.keys(practice).sort()).toEqual([
      "completionPolicy",
      "exerciseKey",
      "kind",
      "order",
      "required",
      "stepKey",
    ]);
    expect(Object.keys(recall).sort()).toEqual([
      "completionPolicy",
      "itemKey",
      "kind",
      "order",
      "required",
      "stepKey",
    ]);

    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.steps)).toBe(true);
    for (const step of def.steps) expect(Object.isFrozen(step)).toBe(true);

    // No editorial context, no DB ids, and NEVER the canonical answer.
    const serialized = JSON.stringify(def);
    for (const forbidden of [
      "bookSlug",
      "editionKey",
      "unitKey",
      "correctOptionKey",
      "opcion-cuerpo-primero",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  // ── Resolution + single editorial context ────────────────────────────────
  it("resolves its three targets to ONE published editorial context", async () => {
    const def = productionGuideRegistry.getExact(GUIDE_KEY, 1);
    const [conceptStep, practiceStep, recallStep] =
      def.steps as GuideStepDefinition[];
    if (
      conceptStep.kind !== "CONCEPT_EXPLORATION" ||
      practiceStep.kind !== "CATALOG_PRACTICE" ||
      recallStep.kind !== "ACTIVE_RECALL"
    ) {
      throw new Error("unexpected step shape");
    }

    const concept = await resolver.resolveConcept(conceptStep.conceptKey);
    const practice = await resolver.resolveExercise(practiceStep.exerciseKey);
    const recall = await resolver.resolveRecallItem(recallStep.itemKey);

    expect(concept.conceptKey).toBe("eec-cuerpo-antes-que-mente");
    expect(practice.exerciseKey).toBe("eec-c1-practice-escucharte-por-dentro");
    expect(recall.itemKey).toBe("eec-c1-recall-cuerpo-antes-que-mente");

    // The recall is objective and server-graded; its options are closed.
    expect(recall.mode).toBe("objective");
    expect(recall.conceptKey).toBe("eec-cuerpo-antes-que-mente");
    expect([...recall.optionKeys].sort()).toEqual([
      "opcion-cuerpo-primero",
      "opcion-mente-primero",
      "opcion-simultanea",
    ]);
    // INTERNAL grading datum — present only in the resolution, never in the
    // GuideDefinition (asserted above).
    expect(recall.correctOptionKey).toBe("opcion-cuerpo-primero");

    // GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS — all three converge.
    expect(contextOf(practice)).toEqual(contextOf(concept));
    expect(contextOf(recall)).toEqual(contextOf(concept));
    expect(concept.bookSlug).toBe(BOOK_SLUG);
    expect(concept.revisionNumber).toBe(1);
  });

  // ── Negatives ────────────────────────────────────────────────────────────
  it("rejects a QUIZ as a practice and an unknown target", async () => {
    // A recall item is NOT a completable practice.
    await expectHttp(
      resolver.resolveExercise("eec-c1-recall-cuerpo-antes-que-mente"),
      422,
    );
    // Unknown targets: 404 for the key that does not exist, per chain.
    await expectHttp(resolver.resolveConcept("concepto-inexistente"), 404);
    await expectHttp(resolver.resolveRecallItem("item-inexistente"), 404);
    await expectHttp(resolver.resolveExercise("practica-inexistente"), 422);
  });

  it("a non-objective recall cannot satisfy an objective_recall step", async () => {
    const selfAssessed = await resolver.resolveRecallItem(
      otherUnitSelfAssessedId,
    );
    expect(selfAssessed.mode).toBe("self_assessed");
    expect(selfAssessed.correctOptionKey).toBeNull();
    expect(selfAssessed.optionKeys).toEqual([]);
    // The approved step declares `objective_recall` — this item does not match.
    expect(selfAssessed.mode).not.toBe("objective");
  });

  it("targets from another unit break the single-context invariant", async () => {
    const def = productionGuideRegistry.getExact(GUIDE_KEY, 1);
    const conceptStep = def.steps[0];
    if (conceptStep.kind !== "CONCEPT_EXPLORATION") {
      throw new Error("unexpected step shape");
    }
    const concept = await resolver.resolveConcept(conceptStep.conceptKey);

    // A practice that lives in chapter 2's unit resolves fine on its own…
    const otherPractice = await resolver.resolveExercise(otherUnitPracticeId);
    expect(otherPractice.bookId).toBe(concept.bookId);
    // …but it does NOT share the guide's unit — the convergence check fails.
    expect(otherPractice.unitId).not.toBe(concept.unitId);
    expect(contextOf(otherPractice)).not.toEqual(contextOf(concept));

    // Same for a recall item bound to the other unit.
    const otherRecall = await resolver.resolveRecallItem(
      otherUnitSelfAssessedId,
    );
    expect(otherRecall.unitId).not.toBe(concept.unitId);

    // And for a concept owned by the other unit (chapter 2's catalog concept).
    const otherConcept = await resolver.resolveConcept(
      "eec-como-aprendiste-a-sentir",
    );
    expect(otherConcept.unitId).not.toBe(concept.unitId);
    expect(otherConcept.unitId).toBe(otherPractice.unitId);
  });

  it("a target whose unit is not in the published revision is unresolved", async () => {
    await expectHttp(resolver.resolveExercise(unpublishedUnitPracticeId), 422);
  });
});
