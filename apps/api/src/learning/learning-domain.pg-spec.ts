import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HttpException } from "@nestjs/common";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../content-core/backfill";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import type { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../auth";
import { LearningCatalogResolver } from "./learning-catalog.resolver";
import { LearningCommandService } from "./learning-command.service";
import { LearningEventRepository } from "./learning-event.repository";
import { LearningProgressService } from "./learning-progress.service";

/**
 * CC-7.3 — domain commands against REAL PostgreSQL: catalog resolution
 * (unknown/ambiguous/unpublished/incomplete), the SAME entitlement gate as
 * every content surface (FREE/PRO fixtures with zero-write assertions), the
 * unit-completion transition (requires open, single completion, advisory-lock
 * concurrency), server-graded recall with the selectedOptionKey semantics,
 * and progress derived exclusively from V1 events.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc73_domain_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const key = (n: number) =>
  `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;

const FREE_USER: AuthenticatedUser = {
  userId: "u-cc73-free",
  email: "cc73-free@test.local",
  role: "USER",
  plan: "FREE",
};
const PRO_USER: AuthenticatedUser = {
  userId: "u-cc73-pro",
  email: "cc73-pro@test.local",
  role: "USER",
  plan: "PRO",
};

async function expectLearning(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  const err = await promise.then(
    () => {
      throw new Error(`expected ${status} ${code}, but the call succeeded`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpException);
  const http = err as HttpException;
  expect(http.getStatus()).toBe(status);
  expect((http.getResponse() as { code?: string }).code).toBe(code);
}

suite("CC-7.3 · learning domain commands (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let commands: LearningCommandService;
  let progress: LearningProgressService;

  // FREE book (2 chapters) — everything allowed to FREE.
  let freeUnit1Key: string;
  let freeUnit2Key: string;
  // PRO book (3 chapters) — ch1 free preview; ch2+ denied to FREE.
  let proUnit1Key: string;
  let proUnit2Key: string;
  // Catalog fixtures.
  let practiceExerciseId: string;
  let objectiveItemId: string;
  let selfAssessedItemId: string;
  let malformedQuizId: string;
  let proCh2QuizId: string;

  async function eventCount(userId: string): Promise<number> {
    return prisma.learningEvent.count({ where: { userId } });
  }

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

    const access = new ContentAccessService(prisma as unknown as PrismaService);
    const resolver = new LearningCatalogResolver(
      prisma as unknown as PrismaService,
    );
    const repository = new LearningEventRepository(prisma);
    commands = new LearningCommandService(
      prisma as unknown as PrismaService,
      resolver,
      access,
      repository,
    );
    progress = new LearningProgressService(
      prisma as unknown as PrismaService,
      access,
    );

    await prisma.user.createMany({
      data: [
        { id: FREE_USER.userId, email: FREE_USER.email, name: "Free" },
        { id: PRO_USER.userId, email: PRO_USER.email, name: "Pro" },
      ],
    });

    // Real Content Core: books + chapters + blocks, then the REAL backfill
    // (Work/Edition/Revision/units + PUBLISH) — the same pipeline production
    // content went through.
    const freeBook = await prisma.book.create({
      data: { slug: "cc73-libro-free", title: "CC73 Free", plan: "FREE" },
    });
    const proBook = await prisma.book.create({
      data: { slug: "cc73-libro-pro", title: "CC73 Pro", plan: "PRO" },
    });
    const mkChapter = async (bookId: string, order: number) => {
      const ch = await prisma.chapter.create({
        data: { bookId, order, title: `Cap ${order}` },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "texto",
        },
      });
      return ch;
    };
    const freeCh1 = await mkChapter(freeBook.id, 1);
    const freeCh2 = await mkChapter(freeBook.id, 2);
    const proCh1 = await mkChapter(proBook.id, 1);
    const proCh2 = await mkChapter(proBook.id, 2);
    await mkChapter(proBook.id, 3);

    await backfillContentCore(prisma);

    freeUnit1Key = unitKeyFromLegacyChapterId(freeCh1.id);
    freeUnit2Key = unitKeyFromLegacyChapterId(freeCh2.id);
    proUnit1Key = unitKeyFromLegacyChapterId(proCh1.id);
    proUnit2Key = unitKeyFromLegacyChapterId(proCh2.id);

    // ── Concept catalog fixtures ─────────────────────────────────────────
    const freeEdition = await prisma.edition.findUniqueOrThrow({
      where: { slug: "cc73-libro-free" },
      select: { id: true },
    });
    const freeUnit1 = await prisma.contentUnit.findUniqueOrThrow({
      where: {
        editionId_unitKey: { editionId: freeEdition.id, unitKey: freeUnit1Key },
      },
      select: { id: true },
    });
    const freeUnit2 = await prisma.contentUnit.findUniqueOrThrow({
      where: {
        editionId_unitKey: { editionId: freeEdition.id, unitKey: freeUnit2Key },
      },
      select: { id: true },
    });
    const conceptOk = await prisma.concept.create({
      data: { conceptKey: "cc73-concepto", label: "Concepto CC73" },
    });
    await prisma.conceptLink.create({
      data: { conceptId: conceptOk.id, unitId: freeUnit1.id, role: "PRIMARY" },
    });
    const conceptAmbiguous = await prisma.concept.create({
      data: { conceptKey: "cc73-concepto-ambiguo", label: "Ambiguo" },
    });
    await prisma.conceptLink.createMany({
      data: [
        {
          conceptId: conceptAmbiguous.id,
          unitId: freeUnit1.id,
          role: "PRIMARY",
        },
        {
          conceptId: conceptAmbiguous.id,
          unitId: freeUnit2.id,
          role: "SUPPORTING",
        },
      ],
    });

    // ── Exercise / recall-item catalog fixtures (Exercise table) ─────────
    practiceExerciseId = (
      await prisma.exercise.create({
        data: {
          chapterId: freeCh1.id,
          order: 1,
          title: "Respiración",
          type: "BREATHING",
          content: {},
        },
      })
    ).id;
    objectiveItemId = (
      await prisma.exercise.create({
        data: {
          chapterId: freeCh1.id,
          order: 2,
          title: "Quiz objetivo",
          type: "QUIZ",
          content: {
            recallMode: "objective",
            options: [{ key: "opt-a" }, { key: "opt-b" }, { key: "opt-c" }],
            correctOptionKey: "opt-b",
            conceptKey: "cc73-concepto",
          },
        },
      })
    ).id;
    selfAssessedItemId = (
      await prisma.exercise.create({
        data: {
          chapterId: freeCh1.id,
          order: 3,
          title: "Recuerdo libre",
          type: "QUIZ",
          content: { recallMode: "self_assessed" },
        },
      })
    ).id;
    malformedQuizId = (
      await prisma.exercise.create({
        data: {
          chapterId: freeCh1.id,
          order: 4,
          title: "Quiz sin contrato",
          type: "QUIZ",
          content: { question: "¿?", answers: ["a", "b"] },
        },
      })
    ).id;
    proCh2QuizId = (
      await prisma.exercise.create({
        data: {
          chapterId: proCh2.id,
          order: 1,
          title: "Quiz PRO",
          type: "QUIZ",
          content: {
            recallMode: "objective",
            options: [{ key: "x" }, { key: "y" }],
            correctOptionKey: "x",
          },
        },
      })
    ).id;

    // A unit OUTSIDE the published revision's manifest (exists, not servable).
    await prisma.contentUnit.create({
      data: { editionId: freeEdition.id, unitKey: "cc73-unpublished-unit" },
    });
    // The SAME unitKey duplicated across editions → ambiguous.
    const dupBook = await prisma.book.create({
      data: { slug: "cc73-libro-dup", title: "Dup", plan: "FREE" },
    });
    await mkChapter(dupBook.id, 1);
    await backfillContentCore(prisma);
    const dupEdition = await prisma.edition.findUniqueOrThrow({
      where: { slug: "cc73-libro-dup" },
      select: { id: true },
    });
    await prisma.contentUnit.create({
      data: { editionId: dupEdition.id, unitKey: freeUnit2Key },
    });
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Catalog resolution
  // ─────────────────────────────────────────────────────────────────────────

  it("resolves a valid unit and creates unit_opened with server context", async () => {
    const res = await commands.openUnit(FREE_USER, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(1),
    });
    expect(res.created).toBe(true);
    expect(res.event.type).toBe("unit_opened");
    expect(res.event.payload).toEqual({
      editionKey: "cc73-libro-free-1e",
      unitKey: freeUnit1Key,
    });
    expect(JSON.stringify(res)).not.toContain("userId");
  });

  it("unknown unit → 404 UNKNOWN_UNIT, zero events", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.openUnit(FREE_USER, {
        unitKey: "no-existe",
        idempotencyKey: key(2),
      }),
      404,
      "LEARNING_EVENT_UNKNOWN_UNIT",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("a unit outside the published manifest → 422, zero events", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.openUnit(FREE_USER, {
        unitKey: "cc73-unpublished-unit",
        idempotencyKey: key(3),
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("a unitKey duplicated across editions → 422 (no first-match fallback)", async () => {
    await expectLearning(
      commands.openUnit(FREE_USER, {
        unitKey: freeUnit2Key,
        idempotencyKey: key(4),
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
  });

  it("resolves a valid concept: explore persists conceptId + server unitKey", async () => {
    const res = await commands.exploreConcept(FREE_USER, {
      conceptKey: "cc73-concepto",
      idempotencyKey: key(5),
    });
    expect(res.created).toBe(true);
    expect(res.event.type).toBe("concept_explored");
    expect(res.event.payload).toEqual({
      conceptKey: "cc73-concepto",
      unitKey: freeUnit1Key,
    });
    expect(res.event.conceptId).not.toBeNull();
  });

  it("unknown concept → 404; ambiguous concept (2 units) → 422; both zero-write", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.exploreConcept(FREE_USER, {
        conceptKey: "no-existe",
        idempotencyKey: key(6),
      }),
      404,
      "LEARNING_EVENT_UNKNOWN_CONCEPT",
    );
    await expectLearning(
      commands.exploreConcept(FREE_USER, {
        conceptKey: "cc73-concepto-ambiguo",
        idempotencyKey: key(7),
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("unresolvable exercise (unknown id, and a QUIZ id) → 422, zero events", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.completePractice(FREE_USER, {
        exerciseKey: "no-existe",
        idempotencyKey: key(8),
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    await expectLearning(
      commands.completePractice(FREE_USER, {
        exerciseKey: objectiveItemId,
        idempotencyKey: key(9),
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("completes a valid practice with server-resolved unit", async () => {
    const res = await commands.completePractice(FREE_USER, {
      exerciseKey: practiceExerciseId,
      idempotencyKey: key(10),
    });
    expect(res.created).toBe(true);
    expect(res.event.payload).toEqual({
      exerciseKey: practiceExerciseId,
      unitKey: freeUnit1Key,
    });
  });

  it("a QUIZ row without the declared recall contract → 422, zero events", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: malformedQuizId,
        idempotencyKey: key(11),
        kind: "objective",
        selectedOptionKey: "a",
      }),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("unknown recall item (and a non-QUIZ id) → 404 UNKNOWN_ITEM", async () => {
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: "no-existe",
        idempotencyKey: key(12),
        kind: "objective",
        selectedOptionKey: "a",
      }),
      404,
      "LEARNING_EVENT_UNKNOWN_ITEM",
    );
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: practiceExerciseId,
        idempotencyKey: key(13),
        kind: "self_assessed",
        selfResult: "correct",
      }),
      404,
      "LEARNING_EVENT_UNKNOWN_ITEM",
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Entitlement — the same gate as every content surface
  // ─────────────────────────────────────────────────────────────────────────

  it("FREE allowed on a FREE book; FREE allowed on PRO chapter 1 (preview)", async () => {
    const res = await commands.openUnit(FREE_USER, {
      unitKey: proUnit1Key,
      idempotencyKey: key(20),
    });
    expect(res.created).toBe(true);
  });

  it("FREE denied on PRO ch2 → 403 code-only, zero events, zero transitions", async () => {
    const before = await eventCount(FREE_USER.userId);
    const err = await commands
      .openUnit(FREE_USER, { unitKey: proUnit2Key, idempotencyKey: key(21) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(403);
    const body = (err as HttpException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.code).toBe("LEARNING_EVENT_FORBIDDEN");
    // No inaccessible content shape leaks through the denial:
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("cc73-libro-pro");
    expect(serialized).not.toContain(proUnit2Key);
    expect(serialized).not.toContain("PRO_REQUIRED");
    expect(await eventCount(FREE_USER.userId)).toBe(before);

    // The recall path is gated identically:
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: proCh2QuizId,
        idempotencyKey: key(22),
        kind: "objective",
        selectedOptionKey: "x",
      }),
      403,
      "LEARNING_EVENT_FORBIDDEN",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("PRO allowed on PRO ch2", async () => {
    const res = await commands.openUnit(PRO_USER, {
      unitKey: proUnit2Key,
      idempotencyKey: key(23),
    });
    expect(res.created).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Unit completion — the server-side transition
  // ─────────────────────────────────────────────────────────────────────────

  it("completion without a prior open → 409 INVALID_TRANSITION, zero completion", async () => {
    await expectLearning(
      commands.completeUnit(PRO_USER, {
        unitKey: freeUnit1Key,
        idempotencyKey: key(30),
      }),
      409,
      "LEARNING_EVENT_INVALID_TRANSITION",
    );
    expect(
      await prisma.learningEvent.count({
        where: { userId: PRO_USER.userId, kind: "UNIT_COMPLETED" },
      }),
    ).toBe(0);
  });

  it("open → complete succeeds with the published revisionNumber; exact replay skips the transition; a second key → 409", async () => {
    await commands.openUnit(PRO_USER, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(31),
    });
    const done = await commands.completeUnit(PRO_USER, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(32),
    });
    expect(done.created).toBe(true);
    expect(done.event.type).toBe("unit_completed");
    expect(done.event.payload).toMatchObject({ revisionNumber: 1 });

    // Exact replay: same key → the ORIGINAL event, no second transition.
    const replay = await commands.completeUnit(PRO_USER, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(32),
    });
    expect(replay.created).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(done.event.id);

    // A DIFFERENT key against an already-completed unit → invalid transition.
    await expectLearning(
      commands.completeUnit(PRO_USER, {
        unitKey: freeUnit1Key,
        idempotencyKey: key(33),
      }),
      409,
      "LEARNING_EVENT_INVALID_TRANSITION",
    );
    expect(
      await prisma.learningEvent.count({
        where: {
          userId: PRO_USER.userId,
          kind: "UNIT_COMPLETED",
          unitId: done.event.unitId,
        },
      }),
    ).toBe(1);
  });

  it("two CONCURRENT completions with different keys: one succeeds, one 409, ONE row", async () => {
    // Fresh unit for a clean race: PRO book ch2 (already opened by PRO above).
    const results = await Promise.allSettled([
      commands.completeUnit(PRO_USER, {
        unitKey: proUnit2Key,
        idempotencyKey: key(34),
      }),
      commands.completeUnit(PRO_USER, {
        unitKey: proUnit2Key,
        idempotencyKey: key(35),
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult)
      .reason as HttpException;
    expect(reason.getStatus()).toBe(409);
    expect((reason.getResponse() as { code?: string }).code).toBe(
      "LEARNING_EVENT_INVALID_TRANSITION",
    );
    const unitId = (
      fulfilled[0] as PromiseFulfilledResult<{
        event: { unitId: string | null };
      }>
    ).value.event.unitId;
    expect(
      await prisma.learningEvent.count({
        where: {
          userId: PRO_USER.userId,
          kind: "UNIT_COMPLETED",
          unitId,
        },
      }),
    ).toBe(1);
  });

  it("a key reused from a DIFFERENT event inside the completion tx → 409 conflict, tx reverted", async () => {
    const before = await eventCount(PRO_USER.userId);
    // key(23) already holds PRO's unit_opened on proUnit2 — reusing it for a
    // completion is a semantic conflict detected BEFORE any transition runs.
    await expectLearning(
      commands.completeUnit(PRO_USER, {
        unitKey: freeUnit1Key,
        idempotencyKey: key(23),
      }),
      409,
      "LEARNING_EVENT_IDEMPOTENCY_CONFLICT",
    );
    expect(await eventCount(PRO_USER.userId)).toBe(before);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Recall — server-graded, catalog-gated
  // ─────────────────────────────────────────────────────────────────────────

  it("objective: the SERVER grades; the chosen option persists", async () => {
    const correct = await commands.submitRecallAttempt(FREE_USER, {
      itemKey: objectiveItemId,
      idempotencyKey: key(40),
      kind: "objective",
      selectedOptionKey: "opt-b",
    });
    expect(correct.event.payload).toEqual({
      unitKey: freeUnit1Key,
      itemKey: objectiveItemId,
      conceptKey: "cc73-concepto",
      evaluationSource: "server",
      selectedOptionKey: "opt-b",
      result: "correct",
    });

    const incorrect = await commands.submitRecallAttempt(FREE_USER, {
      itemKey: objectiveItemId,
      idempotencyKey: key(41),
      kind: "objective",
      selectedOptionKey: "opt-a",
    });
    expect(incorrect.event.payload).toMatchObject({
      evaluationSource: "server",
      selectedOptionKey: "opt-a",
      result: "incorrect",
    });
    // The catalog's correct option never leaks through the response:
    expect(JSON.stringify(incorrect)).not.toContain("correctOptionKey");
  });

  it("an option that does not belong to the item → 400, zero events", async () => {
    const before = await eventCount(FREE_USER.userId);
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: objectiveItemId,
        idempotencyKey: key(42),
        kind: "objective",
        selectedOptionKey: "opt-z",
      }),
      400,
      "LEARNING_EVENT_INVALID_PAYLOAD",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("self-assessed allowed ONLY where the catalog declares it", async () => {
    const res = await commands.submitRecallAttempt(FREE_USER, {
      itemKey: selfAssessedItemId,
      idempotencyKey: key(43),
      kind: "self_assessed",
      selfResult: "skipped",
    });
    expect(res.event.payload).toEqual({
      unitKey: freeUnit1Key,
      itemKey: selfAssessedItemId,
      conceptKey: null,
      evaluationSource: "self_assessed",
      selectedOptionKey: null,
      result: "skipped",
    });

    const before = await eventCount(FREE_USER.userId);
    // selfResult against an OBJECTIVE item:
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: objectiveItemId,
        idempotencyKey: key(44),
        kind: "self_assessed",
        selfResult: "correct",
      }),
      400,
      "LEARNING_EVENT_INVALID_PAYLOAD",
    );
    // selectedOptionKey against a SELF-ASSESSED item:
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: selfAssessedItemId,
        idempotencyKey: key(45),
        kind: "objective",
        selectedOptionKey: "opt-a",
      }),
      400,
      "LEARNING_EVENT_INVALID_PAYLOAD",
    );
    expect(await eventCount(FREE_USER.userId)).toBe(before);
  });

  it("MANDATORY: same key + different options with the SAME derived result → conflict", async () => {
    const first = await commands.submitRecallAttempt(FREE_USER, {
      itemKey: objectiveItemId,
      idempotencyKey: key(46),
      kind: "objective",
      selectedOptionKey: "opt-a", // incorrect
    });
    expect(first.event.payload).toMatchObject({ result: "incorrect" });

    // opt-c is ALSO incorrect — the derived result matches, but the CHOSEN
    // option differs: the persisted union keeps that distinction, so reusing
    // the key is a conflict, not a replay.
    await expectLearning(
      commands.submitRecallAttempt(FREE_USER, {
        itemKey: objectiveItemId,
        idempotencyKey: key(46),
        kind: "objective",
        selectedOptionKey: "opt-c",
      }),
      409,
      "LEARNING_EVENT_IDEMPOTENCY_CONFLICT",
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Progress — derived from V1 events only
  // ─────────────────────────────────────────────────────────────────────────

  it("derives states in revision order; multiple opens collapse; completed dominates", async () => {
    // Fresh actor to keep the derivation readable end-to-end.
    const walker: AuthenticatedUser = {
      userId: "u-cc73-walker",
      email: "cc73-walker@test.local",
      role: "USER",
      plan: "PRO",
    };
    await prisma.user.create({
      data: { id: walker.userId, email: walker.email, name: "Walker" },
    });

    // Unit1: open twice (collapses), then complete. Unit2: untouched…
    await commands.openUnit(walker, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(50),
    });
    await commands.openUnit(walker, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(51),
    });
    await commands.completeUnit(walker, {
      unitKey: freeUnit1Key,
      idempotencyKey: key(52),
    });
    // …plus a NON-V1 legacy row on unit2 that must be invisible to progress:
    const freeEdition = await prisma.edition.findUniqueOrThrow({
      where: { slug: "cc73-libro-free" },
      select: { id: true },
    });
    const unit2 = await prisma.contentUnit.findFirstOrThrow({
      where: { editionId: freeEdition.id, unitKey: freeUnit2Key },
      select: { id: true },
    });
    await pool.query(
      `INSERT INTO "LearningEvent"(id, "userId", kind, "unitId", payload, "createdAt")
       VALUES ('cc73-legacy-open', $1, 'UNIT_OPENED', $2, '{}', now())`,
      [walker.userId, unit2.id],
    );

    const res = await progress.getProgress(walker, "cc73-libro-free");
    expect(res.bookSlug).toBe("cc73-libro-free");
    expect(res.editionKey).toBe("cc73-libro-free-1e");
    expect(res.revisionNumber).toBe(1);
    expect(res.units.map((u) => u.unitKey)).toEqual([
      freeUnit1Key,
      freeUnit2Key,
    ]);
    const [u1, u2] = res.units;
    // Completed dominates opened; timestamps server-owned; revision recorded:
    expect(u1.state).toBe("completed");
    expect(u1.openedAt).not.toBeNull();
    expect(u1.completedAt).not.toBeNull();
    expect(u1.completedRevisionNumber).toBe(1);
    // The legacy (schemaVersion NULL) open does NOT surface:
    expect(u2.state).toBe("not_started");
    expect(u2.openedAt).toBeNull();
    expect(res.openedCount).toBe(0);
    expect(res.completedCount).toBe(1);
    expect(res.totalCount).toBe(2);
    expect(JSON.stringify(res)).not.toContain("userId");
  });

  it("FREE on a PRO book: inaccessible units are ABSENT from list and counts", async () => {
    const res = await progress.getProgress(FREE_USER, "cc73-libro-pro");
    expect(res.units.map((u) => u.unitKey)).toEqual([proUnit1Key]);
    expect(res.totalCount).toBe(1);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(proUnit2Key);
  });

  it("PRO sees the full PRO book, with its own states only (cross-user isolation)", async () => {
    const res = await progress.getProgress(PRO_USER, "cc73-libro-pro");
    expect(res.totalCount).toBe(3);
    const u1 = res.units.find((u) => u.unitKey === proUnit1Key);
    // FREE opened proUnit1 (key 20) — that open must NOT leak into PRO's view:
    expect(u1?.state).toBe("not_started");
    const u2 = res.units.find((u) => u.unitKey === proUnit2Key);
    expect(u2?.state).toBe("completed");
  });

  it("unresolvable book → 422", async () => {
    await expectLearning(
      progress.getProgress(FREE_USER, "no-existe"),
      422,
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
  });
});
