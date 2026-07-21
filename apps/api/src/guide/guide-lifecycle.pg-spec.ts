import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../auth";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";
import { GuideSessionRepository } from "./guide-session.repository";
import { GuideSessionStepRepository } from "./guide-session-step.repository";
import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideLifecycleService } from "./guide-lifecycle.service";
import { GuideLifecycleError } from "./guide-errors";

/**
 * CC-7.4C — the Guide V1 lifecycle against REAL PostgreSQL.
 *
 * Three things cannot be proven against a mock and are the reason this file
 * exists:
 *
 *   1. ATOMICITY — receipt, ledger row, session projection and LearningEvent
 *      commit or roll back TOGETHER;
 *   2. CONCURRENCY — the advisory locks actually serialize racing commands on
 *      REAL concurrent connections (two racing STARTs, racing steps, a CANCEL
 *      racing a COMPLETE);
 *   3. IDEMPOTENCY — a replay applies ZERO effects, verified by counting rows
 *      before and after, not by trusting a return flag.
 *
 * The editorial fixture is the REAL approved one: chapter 1 of *Emociones en
 * Construcción* with its editorial heading, ingested by the real backfill, so
 * the production `eec-c1-cuerpo-antes-que-mente@1` definition resolves against
 * genuine rows.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "cc74c_lifecycle_db";

const BOOK_SLUG = "emociones-en-construccion";
const GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente";
const PRACTICE_HEADING =
  EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0].practice.sourceHeading;

const STEP_CONCEPT = "explorar-cuerpo-antes-que-mente";
const STEP_PRACTICE = "practicar-escucharte-por-dentro";
const STEP_RECALL = "recordar-cuerpo-antes-que-mente";
const CORRECT_OPTION = "opcion-cuerpo-primero";
const WRONG_OPTION = "opcion-mente-primero";

/** Zero-entropy canonical UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Assert a rejection is exactly the expected value-free lifecycle code. */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => {
      throw new Error(`expected ${code}`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GuideLifecycleError);
  expect((err as GuideLifecycleError).code).toBe(code);
  // message === code: no id, key, SQL or driver text ever rides along.
  expect((err as GuideLifecycleError).message).toBe(code);
}

suite("CC-7.4C · Guide V1 lifecycle (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: GuideLifecycleService;
  let userA: AuthenticatedUser;
  let userB: AuthenticatedUser;
  let seq = 0;

  /** A fresh canonical key per command (no accidental cross-test replays). */
  const nextKey = () => key(++seq);

  const counts = async () => ({
    sessions: await prisma.guideSession.count(),
    steps: await prisma.guideSessionStep.count(),
    receipts: await prisma.guideCommandReceipt.count(),
    events: await prisma.learningEvent.count(),
  });

  /** Drive a session to just before the recall step. */
  async function startAndAdvance(user: AuthenticatedUser): Promise<string> {
    const started = await service.start(user, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    await service.completeStep(user, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });
    await service.completeStep(user, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_PRACTICE,
    });
    return started.sessionId;
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

    // The REAL editorial fixture: chapter 1 + its approved heading, ingested
    // by the real backfill (which creates the practice and the recall item).
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
    await backfillContentCore(prisma);

    const a = await prisma.user.create({
      data: { email: "cc74c-a@example.test", name: "A", plan: "FREE" },
    });
    const b = await prisma.user.create({
      data: { email: "cc74c-b@example.test", name: "B", plan: "FREE" },
    });
    userA = { userId: a.id, plan: "FREE" } as AuthenticatedUser;
    userB = { userId: b.id, plan: "FREE" } as AuthenticatedUser;

    const svc = prisma as unknown as PrismaService;
    const resolver = new LearningCatalogResolver(svc);
    service = new GuideLifecycleService(
      svc,
      resolver,
      new ContentAccessService(svc),
      new GuideTargetContextService(resolver),
      new GuideSessionRepository(prisma),
      new GuideSessionStepRepository(prisma),
      new GuideCommandReceiptRepository(prisma),
      new LearningEventRepository(prisma),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    // Each test starts from a clean lifecycle state; the editorial fixture and
    // the users survive (they are read-only for the lifecycle).
    await prisma.guideSessionStep.deleteMany();
    await prisma.guideCommandReceipt.deleteMany();
    await prisma.guideSession.deleteMany();
    await prisma.learningEvent.deleteMany();
  });

  // ── START ────────────────────────────────────────────────────────────────

  it("START creates an ACTIVE session anchored to the derived context", async () => {
    const result = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    expect(result.created).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.status).toBe("ACTIVE");
    // The projection is derived from an EMPTY ledger, not from the command.
    expect(result.projection).toEqual({
      stepsCompleted: 0,
      totalSteps: 3,
      currentStepKey: STEP_CONCEPT,
    });

    const row = await prisma.guideSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    // The editorial anchor is SERVER-derived — never sent by any client.
    expect(row.editionId).not.toBeNull();
    expect(row.unitId).not.toBeNull();

    const events = await prisma.learningEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("GUIDE_SESSION_STARTED");
    expect(events[0]?.payload).toEqual({ guideSessionId: result.sessionId });
  });

  it("START replay returns the ORIGINAL session and applies zero effects", async () => {
    const k = nextKey();
    const first = await service.start(userA, {
      idempotencyKey: k,
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const before = await counts();

    const replay = await service.start(userA, {
      idempotencyKey: k,
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.sessionId).toBe(first.sessionId);
    expect(await counts()).toEqual(before);
    // The replay ran BEFORE the autocancel branch: the session is untouched.
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: first.sessionId },
        })
      ).status,
    ).toBe("ACTIVE");
  });

  it("START with a NEW key autocancels the previous session, silently", async () => {
    const first = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: first.sessionId,
      stepKey: STEP_CONCEPT,
    });
    const receiptsBefore = await prisma.guideCommandReceipt.count();

    const second = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    const old = await prisma.guideSession.findUniqueOrThrow({
      where: { id: first.sessionId },
    });
    expect(old.status).toBe("CANCELLED");
    // The autocancel keeps the count its ledger justifies and drops the cursor.
    expect(old.stepsCompleted).toBe(1);
    expect(old.currentStepKey).toBeNull();
    expect(second.status).toBe("ACTIVE");

    // Exactly ONE new receipt (the new START) — the autocancel writes none…
    expect(await prisma.guideCommandReceipt.count()).toBe(receiptsBefore + 1);
    // …and emits no event: only the two STARTs are recorded.
    expect(await prisma.learningEvent.count()).toBe(2);
  });

  it("START refuses a version that was never published", async () => {
    await expectCode(
      service.start(userA, {
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 2,
      }),
      "GUIDE_CONTEXT_UNRESOLVED",
    );
    expect(await prisma.guideSession.count()).toBe(0);
  });

  // ── STEP_COMPLETE ────────────────────────────────────────────────────────

  it("concept step advances the projection and emits NO event", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const eventsBefore = await prisma.learningEvent.count();

    const result = await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });

    expect(result.projection).toEqual({
      stepsCompleted: 1,
      totalSteps: 3,
      currentStepKey: STEP_PRACTICE,
    });
    // ADR 0019: there is no `guide_step_completed`.
    expect(await prisma.learningEvent.count()).toBe(eventsBefore);

    const stored = await prisma.guideSession.findUniqueOrThrow({
      where: { id: started.sessionId },
    });
    expect(stored.stepsCompleted).toBe(1);
    expect(stored.currentStepKey).toBe(STEP_PRACTICE);
  });

  it("practice step emits practice_completed", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });
    await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_PRACTICE,
    });

    const practice = await prisma.learningEvent.findFirstOrThrow({
      where: { kind: "PRACTICE_COMPLETED" },
    });
    expect(practice.guideSessionId).toBe(started.sessionId);
    // Registration only — no duration, reflection, emotion or score.
    expect(Object.keys(practice.payload as object).sort()).toEqual([
      "exerciseKey",
      "unitKey",
    ]);
  });

  it("a step out of order is refused as not current", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_PRACTICE,
      }),
      "GUIDE_STEP_NOT_CURRENT",
    );
    expect(await prisma.guideSessionStep.count()).toBe(0);
  });

  it("STEP_COMPLETE refuses the ACTIVE_RECALL step", async () => {
    const sessionId = await startAndAdvance(userA);
    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId,
        stepKey: STEP_RECALL,
      }),
      "GUIDE_STEP_COMMAND_MISMATCH",
    );
  });

  it("a step replay applies zero effects", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const k = nextKey();
    await service.completeStep(userA, {
      idempotencyKey: k,
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });
    const before = await counts();

    const replay = await service.completeStep(userA, {
      idempotencyKey: k,
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });

    expect(replay.replayed).toBe(true);
    expect(await counts()).toEqual(before);
  });

  // ── STEP_RECALL ──────────────────────────────────────────────────────────

  it("grades a correct option on the SERVER and never stores the answer key", async () => {
    const sessionId = await startAndAdvance(userA);

    const result = await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });

    expect(result.projection.stepsCompleted).toBe(3);
    expect(result.projection.currentStepKey).toBeNull();

    const row = await prisma.guideSessionStep.findFirstOrThrow({
      where: { sessionId, stepKey: STEP_RECALL },
    });
    expect(row.selectedOptionKey).toBe(CORRECT_OPTION);
    expect(row.recallResult).toBe("CORRECT");

    const attempt = await prisma.learningEvent.findFirstOrThrow({
      where: { kind: "ACTIVE_RECALL_ATTEMPTED" },
    });
    const payload = attempt.payload as Record<string, unknown>;
    expect(payload.evaluationSource).toBe("server");
    expect(payload.result).toBe("correct");
    // The canonical answer is never exposed by the ledger, the event or the
    // command result.
    expect(Object.keys(payload)).not.toContain("correctOptionKey");
    expect(JSON.stringify(result)).not.toContain("correctOptionKey");
  });

  it("grades an incorrect option without failing the step", async () => {
    const sessionId = await startAndAdvance(userA);

    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: WRONG_OPTION,
    });

    const row = await prisma.guideSessionStep.findFirstOrThrow({
      where: { sessionId, stepKey: STEP_RECALL },
    });
    expect(row.recallResult).toBe("INCORRECT");
    const attempt = await prisma.learningEvent.findFirstOrThrow({
      where: { kind: "ACTIVE_RECALL_ATTEMPTED" },
    });
    expect((attempt.payload as Record<string, unknown>).result).toBe(
      "incorrect",
    );
  });

  it("refuses an option outside the item's closed set, writing nothing", async () => {
    const sessionId = await startAndAdvance(userA);
    const before = await counts();

    await expectCode(
      service.completeRecallStep(userA, {
        idempotencyKey: nextKey(),
        sessionId,
        stepKey: STEP_RECALL,
        selectedOptionKey: "opcion-inventada",
      }),
      "GUIDE_STEP_COMMAND_MISMATCH",
    );
    expect(await counts()).toEqual(before);
  });

  // ── SESSION_COMPLETE · CANCEL ────────────────────────────────────────────

  it("SESSION_COMPLETE requires a full ledger and counts on the server", async () => {
    const sessionId = await startAndAdvance(userA);

    await expectCode(
      service.completeSession(userA, {
        idempotencyKey: nextKey(),
        sessionId,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );

    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });
    const done = await service.completeSession(userA, {
      idempotencyKey: nextKey(),
      sessionId,
    });

    expect(done.status).toBe("COMPLETED");
    const completed = await prisma.learningEvent.findFirstOrThrow({
      where: { kind: "GUIDE_SESSION_COMPLETED" },
    });
    expect(completed.payload).toEqual({
      guideSessionId: sessionId,
      stepsCompleted: 3,
    });

    const stored = await prisma.guideSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.completedAt).not.toBeNull();
    expect(stored.currentStepKey).toBeNull();
  });

  it("CANCEL closes the session and emits nothing", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const eventsBefore = await prisma.learningEvent.count();

    const cancelled = await service.cancel(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.learningEvent.count()).toBe(eventsBefore);
    // A closed session accepts no further transition.
    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );
  });

  // ── Ownership ────────────────────────────────────────────────────────────

  it("a foreign session is indistinguishable from a nonexistent one", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    await expectCode(
      service.completeStep(userB, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_SESSION_NOT_FOUND",
    );
    await expectCode(
      service.completeStep(userB, {
        idempotencyKey: nextKey(),
        sessionId: "ses-que-no-existe",
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_SESSION_NOT_FOUND",
    );
    // Nothing of user A's moved.
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: started.sessionId },
        })
      ).stepsCompleted,
    ).toBe(0);
  });

  // ── Concurrency matrix (§15) — REAL concurrent connections ───────────────

  it("C1 · two racing STARTs with the SAME key produce one session", async () => {
    const k = nextKey();
    const cmd = { idempotencyKey: k, guideKey: GUIDE_KEY, guideVersion: 1 };
    const [a, b] = await Promise.all([
      service.start(userA, cmd),
      service.start(userA, cmd),
    ]);

    expect(a.sessionId).toBe(b.sessionId);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(await prisma.guideSession.count()).toBe(1);
    expect(await prisma.guideCommandReceipt.count()).toBe(1);
    expect(await prisma.learningEvent.count()).toBe(1);
  });

  it("C2 · two racing STARTs with DIFFERENT keys leave exactly one ACTIVE", async () => {
    const [a, b] = await Promise.all([
      service.start(userA, {
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 1,
      }),
      service.start(userA, {
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 1,
      }),
    ]);

    expect(a.sessionId).not.toBe(b.sessionId);
    expect(await prisma.guideSession.count()).toBe(2);
    // The start lock serialized them, so the loser was autocancelled.
    const active = await prisma.guideSession.findMany({
      where: { userId: userA.userId, status: "ACTIVE" },
    });
    expect(active).toHaveLength(1);
    expect(
      await prisma.guideSession.count({ where: { status: "CANCELLED" } }),
    ).toBe(1);
  });

  it("C3 · two racing STEP_COMPLETE with the same key write one ledger row", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const cmd = {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    };

    const [a, b] = await Promise.all([
      service.completeStep(userA, cmd),
      service.completeStep(userA, cmd),
    ]);

    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(await prisma.guideSessionStep.count()).toBe(1);
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: started.sessionId },
        })
      ).stepsCompleted,
    ).toBe(1);
  });

  it("C4 · two racing STEP_COMPLETE with different keys accept only one", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    const results = await Promise.allSettled([
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      GuideLifecycleError,
    );
    expect(await prisma.guideSessionStep.count()).toBe(1);
  });

  it("C5 · a CANCEL racing a SESSION_COMPLETE resolves to exactly one outcome", async () => {
    const sessionId = await startAndAdvance(userA);
    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });

    const results = await Promise.allSettled([
      service.cancel(userA, { idempotencyKey: nextKey(), sessionId }),
      service.completeSession(userA, { idempotencyKey: nextKey(), sessionId }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const stored = await prisma.guideSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(["CANCELLED", "COMPLETED"]).toContain(stored.status);
    // The completion event exists only if COMPLETED actually won.
    const completedEvents = await prisma.learningEvent.count({
      where: { kind: "GUIDE_SESSION_COMPLETED" },
    });
    expect(completedEvents).toBe(stored.status === "COMPLETED" ? 1 : 0);
  });

  it("C6 · racing recall attempts with different options accept only one", async () => {
    const sessionId = await startAndAdvance(userA);

    const results = await Promise.allSettled([
      service.completeRecallStep(userA, {
        idempotencyKey: nextKey(),
        sessionId,
        stepKey: STEP_RECALL,
        selectedOptionKey: CORRECT_OPTION,
      }),
      service.completeRecallStep(userA, {
        idempotencyKey: nextKey(),
        sessionId,
        stepKey: STEP_RECALL,
        selectedOptionKey: WRONG_OPTION,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.guideSessionStep.count({
        where: { sessionId, stepKey: STEP_RECALL },
      }),
    ).toBe(1);
    // Exactly one attempt event — never one per racing command.
    expect(
      await prisma.learningEvent.count({
        where: { kind: "ACTIVE_RECALL_ATTEMPTED" },
      }),
    ).toBe(1);
  });

  // ── Atomicity (§16) ──────────────────────────────────────────────────────

  it("a failure after the ledger append rolls the WHOLE command back", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });

    // Poison the practice command: an event with the SAME derived key but
    // different content already exists, so the append conflicts AFTER the
    // ledger row and the session update were staged in the transaction.
    const practiceKey = nextKey();
    const before = await counts();
    const derived = await prisma.learningEvent.create({
      data: {
        userId: userA.userId,
        idempotencyKey: deriveKeyForTest("practice", practiceKey),
        kind: "UNIT_OPENED",
        payload: { editionKey: "x", unitKey: "y" },
        schemaVersion: 1,
      },
    });
    expect(derived.id).toBeTruthy();

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: practiceKey,
        sessionId: started.sessionId,
        stepKey: STEP_PRACTICE,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );

    // Everything the command staged is gone: no ledger row, no receipt, and
    // the projection still points at the practice step.
    const after = await counts();
    expect(after.steps).toBe(before.steps);
    expect(after.receipts).toBe(before.receipts);
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: started.sessionId },
        })
      ).currentStepKey,
    ).toBe(STEP_PRACTICE);
  });
});

/**
 * Mirror of the service's private derivation — duplicated ON PURPOSE so the
 * test pins the contract rather than importing whatever the service happens to
 * compute (a change to the derivation must break this test loudly).
 */
function deriveKeyForTest(scope: string, commandKey: string): string {
  const h = createHash("sha256")
    .update(`guide-event:v1:${scope}:${commandKey}`)
    .digest("hex");
  const variant = ((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `8${h.slice(13, 16)}`,
    `${variant}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}
