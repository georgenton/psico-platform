import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import type { LearningEventKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../auth";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";
import { GuideSessionRepository } from "./guide-session.repository";
import {
  GuideSessionStepRepository,
  GuideStepConflictError,
} from "./guide-session-step.repository";
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
  let resolver: LearningCatalogResolver;
  let sessionRepo: GuideSessionRepository;
  let accessSvc: ContentAccessService;
  let stepRepo: GuideSessionStepRepository;
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
    resolver = new LearningCatalogResolver(svc);
    sessionRepo = new GuideSessionRepository(prisma);
    accessSvc = new ContentAccessService(svc);
    stepRepo = new GuideSessionStepRepository(prisma);
    service = new GuideLifecycleService(
      svc,
      resolver,
      accessSvc,
      new GuideTargetContextService(resolver),
      sessionRepo,
      stepRepo,
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
    vi.restoreAllMocks();
    await prisma.book.update({
      where: { slug: BOOK_SLUG },
      data: { plan: "FREE" },
    });
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

    // Poison the practice command: an event already holds ITS OWN key with
    // different content, so the append conflicts AFTER the ledger row was
    // staged in the transaction (the projection write comes later, so it never
    // runs here) — and the whole command still rolls back.
    const practiceKey = nextKey();
    const before = await counts();
    await prisma.learningEvent.create({
      data: {
        userId: userA.userId,
        idempotencyKey: practiceKey,
        kind: "UNIT_OPENED",
        payload: { editionKey: "x", unitKey: "y" },
        schemaVersion: 1,
      },
    });

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: practiceKey,
        sessionId: started.sessionId,
        stepKey: STEP_PRACTICE,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );

    // Everything the command staged is gone: no ledger row, no receipt, and
    // the projection is untouched — the cursor still points at the practice
    // step it never got to accept.
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
  // ── Idempotency-key policy (§1) ──────────────────────────────────────────

  it("every emitted event carries the COMMAND's own key, same as its receipt", async () => {
    const startKey = nextKey();
    const started = await service.start(userA, {
      idempotencyKey: startKey,
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const conceptKey = nextKey();
    await service.completeStep(userA, {
      idempotencyKey: conceptKey,
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });
    const practiceKey = nextKey();
    await service.completeStep(userA, {
      idempotencyKey: practiceKey,
      sessionId: started.sessionId,
      stepKey: STEP_PRACTICE,
    });
    const recallKey = nextKey();
    await service.completeRecallStep(userA, {
      idempotencyKey: recallKey,
      sessionId: started.sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });
    const completeKey = nextKey();
    await service.completeSession(userA, {
      idempotencyKey: completeKey,
      sessionId: started.sessionId,
    });

    // EVENT_IDEMPOTENCY_KEY_EQUALS_COMMAND_KEY
    const byKind = async (kind: LearningEventKind) =>
      (await prisma.learningEvent.findFirstOrThrow({ where: { kind } }))
        .idempotencyKey;
    expect(await byKind("GUIDE_SESSION_STARTED")).toBe(startKey);
    expect(await byKind("PRACTICE_COMPLETED")).toBe(practiceKey);
    expect(await byKind("ACTIVE_RECALL_ATTEMPTED")).toBe(recallKey);
    expect(await byKind("GUIDE_SESSION_COMPLETED")).toBe(completeKey);

    // EVENT_IDEMPOTENCY_KEY_EQUALS_RECEIPT_KEY — the same canonical UUID lives
    // in both tables; they are different write domains, not a namespace clash.
    const receiptKeys = (
      await prisma.guideCommandReceipt.findMany({
        select: { idempotencyKey: true },
      })
    ).map((r) => r.idempotencyKey);
    for (const k of [
      startKey,
      conceptKey,
      practiceKey,
      recallKey,
      completeKey,
    ]) {
      expect(receiptKeys).toContain(k);
    }
    // The concept step emits NO event, so its key exists only as a receipt.
    expect(
      await prisma.learningEvent.count({
        where: { idempotencyKey: conceptKey },
      }),
    ).toBe(0);
  });

  // ── Context + entitlement inside the transaction (§3 · §5) ───────────────

  it("START resolves the catalog on its OWN transaction client", async () => {
    const spy = vi.spyOn(resolver, "resolveConcept");
    await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    expect(spy).toHaveBeenCalled();
    const db = spy.mock.calls[0]?.[1];
    // A client WAS threaded, and it is the transaction's, not the base one.
    expect(db).toBeDefined();
    expect(db).not.toBe(prisma);
  });

  it("a step re-runs the entitlement gate on ITS transaction", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const spy = vi.spyOn(accessSvc, "assertCanReadUnit");

    await service.completeStep(userA, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });

    // The gate ran for the STEP (not only at START) and got a client.
    expect(spy).toHaveBeenCalledTimes(1);
    const db = spy.mock.calls[0]?.[1];
    expect(db).toBeDefined();
    expect(db).not.toBe(prisma);
  });

  it("a denied step is GUIDE_FORBIDDEN and writes nothing", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const before = await counts();
    // Access is revoked between START and the step. (The real FREE/PRO rule
    // grants chapter 1 as a preview, so the denial is injected at the gate
    // rather than faked by editing the fixture's plan.)
    vi.spyOn(accessSvc, "assertCanReadUnit").mockRejectedValue(
      new ForbiddenException("PRO_REQUIRED"),
    );

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_FORBIDDEN",
    );
    expect(await counts()).toEqual(before);
  });

  it("a CONCEPT step revalidates its own target", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const before = await counts();
    // Break the concept→unit link: the concept can no longer be resolved to
    // exactly one owning unit, so the step must refuse.
    const links = await prisma.conceptLink.findMany({
      where: { concept: { conceptKey: "eec-cuerpo-antes-que-mente" } },
      select: { id: true },
    });
    expect(links.length).toBeGreaterThan(0);
    await prisma.conceptLink.deleteMany({
      where: { id: { in: links.map((l) => l.id) } },
    });

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_CONTEXT_UNRESOLVED",
    );
    expect(await counts()).toEqual(before);
    // Restore for the rest of the suite (the fixture is shared).
    await backfillContentCore(prisma);
  });

  // ── Error classification (§6) ────────────────────────────────────────────

  it("an infrastructure failure is a storage failure, not an editorial verdict", async () => {
    vi.spyOn(resolver, "resolveConcept").mockRejectedValue(
      new Error("connection terminated unexpectedly"),
    );
    await expectCode(
      service.start(userA, {
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 1,
      }),
      "GUIDE_STORAGE_FAILURE",
    );
    expect(await prisma.guideSession.count()).toBe(0);
  });

  // ── ADR concurrency matrix (§8) — M1..M6, real connections ───────────────

  it("M1 · two STARTs, different keys → 2 sessions, 1 ACTIVE, 1 CANCELLED", async () => {
    await Promise.all([
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
    expect(await prisma.guideSession.count()).toBe(2);
    expect(
      await prisma.guideSession.count({ where: { status: "ACTIVE" } }),
    ).toBe(1);
    const cancelled = await prisma.guideSession.findMany({
      where: { status: "CANCELLED" },
    });
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.cancelledAt).not.toBeNull();
  });

  it("M2 · two accepts of the SAME step, different keys → 1 ledger row, 1 receipt", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const receiptsBefore = await prisma.guideCommandReceipt.count();

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
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.guideSessionStep.count()).toBe(1);
    // The loser persisted NO receipt.
    expect(await prisma.guideCommandReceipt.count()).toBe(receiptsBefore + 1);
  });

  it("M3 · out-of-order steps → only the cursor's transition persists", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const receiptsBefore = await prisma.guideCommandReceipt.count();

    const results = await Promise.allSettled([
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      // Not the current step under ANY interleaving of the two.
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_PRACTICE,
      }),
    ]);

    const accepted = await prisma.guideSessionStep.findMany();
    // Whatever the order, only steps the cursor allowed are in the ledger and
    // every rejection left nothing behind.
    expect(accepted.length).toBe(
      results.filter((r) => r.status === "fulfilled").length,
    );
    expect(accepted[0]?.stepKey).toBe(STEP_CONCEPT);
    expect(await prisma.guideCommandReceipt.count()).toBe(
      receiptsBefore + accepted.length,
    );
  });

  it("M4a · premature SESSION_COMPLETE leaves no receipt and can be retried", async () => {
    const sessionId = await startAndAdvance(userA);
    const completeKey = nextKey();

    // Complete BEFORE the last step: refused, and it writes no receipt…
    await expectCode(
      service.completeSession(userA, {
        idempotencyKey: completeKey,
        sessionId,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );
    expect(
      await prisma.guideCommandReceipt.count({
        where: { idempotencyKey: completeKey },
      }),
    ).toBe(0);

    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });

    // …so retrying with the SAME key can now legitimately accept.
    const done = await service.completeSession(userA, {
      idempotencyKey: completeKey,
      sessionId,
    });
    expect(done.created).toBe(true);
    expect(done.status).toBe("COMPLETED");
  });

  it("M4b · last step racing SESSION_COMPLETE is serialized by the session lock", async () => {
    const sessionId = await startAndAdvance(userA);
    const recallKey = nextKey();
    const completeKey = nextKey();

    const results = await Promise.allSettled([
      service.completeRecallStep(userA, {
        idempotencyKey: recallKey,
        sessionId,
        stepKey: STEP_RECALL,
        selectedOptionKey: CORRECT_OPTION,
      }),
      service.completeSession(userA, {
        idempotencyKey: completeKey,
        sessionId,
      }),
    ]);

    const [recall, complete] = results;
    // The recall is always accepted: it is the current step whichever order
    // the two transactions acquired the lock in.
    expect(recall.status).toBe("fulfilled");

    // The ledger is complete exactly once, whoever went first.
    expect(await prisma.guideSessionStep.count({ where: { sessionId } })).toBe(
      3,
    );
    expect(
      await prisma.learningEvent.count({
        where: { kind: "ACTIVE_RECALL_ATTEMPTED" },
      }),
    ).toBe(1);
    expect(
      await prisma.guideCommandReceipt.count({
        where: { idempotencyKey: recallKey },
      }),
    ).toBe(1);

    const stored = await prisma.guideSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (complete.status === "fulfilled") {
      // Order A — the recall took the lock first, so the completion that
      // followed saw a full ledger and closed the session.
      expect(stored.status).toBe("COMPLETED");
      expect(stored.stepsCompleted).toBe(3);
      expect(stored.currentStepKey).toBeNull();
      expect(
        await prisma.guideCommandReceipt.count({
          where: { idempotencyKey: completeKey },
        }),
      ).toBe(1);
      expect(
        await prisma.learningEvent.count({
          where: { kind: "GUIDE_SESSION_COMPLETED" },
        }),
      ).toBe(1);
    } else {
      // Order B — the completion took the lock first, found an incomplete
      // ledger and rolled back whole: no receipt, no event.
      await expectCode(
        Promise.reject(complete.reason),
        "GUIDE_SESSION_INVALID_TRANSITION",
      );
      expect(stored.status).toBe("ACTIVE");
      expect(stored.stepsCompleted).toBe(3);
      expect(stored.currentStepKey).toBeNull();
      expect(
        await prisma.guideCommandReceipt.count({
          where: { idempotencyKey: completeKey },
        }),
      ).toBe(0);
      expect(
        await prisma.learningEvent.count({
          where: { kind: "GUIDE_SESSION_COMPLETED" },
        }),
      ).toBe(0);

      // Because the rejection persisted nothing, retrying with the SAME key
      // is a fresh command and legitimately accepts.
      const retry = await service.completeSession(userA, {
        idempotencyKey: completeKey,
        sessionId,
      });
      expect(retry.created).toBe(true);
      expect(retry.status).toBe("COMPLETED");
      expect(
        await prisma.learningEvent.count({
          where: { kind: "GUIDE_SESSION_COMPLETED" },
        }),
      ).toBe(1);
    }
  });

  it("M5 · CANCEL vs step → the history stays honest either way", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    const results = await Promise.allSettled([
      service.cancel(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
      }),
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
    ]);

    const stored = await prisma.guideSession.findUniqueOrThrow({
      where: { id: started.sessionId },
    });
    expect(stored.status).toBe("CANCELLED");
    const ledger = await prisma.guideSessionStep.count();
    const stepOk = results[1].status === "fulfilled";
    // Either the step ran first and stays in history, or cancel ran first and
    // the step left nothing. Never a ledger row accepted AFTER cancellation.
    expect(ledger).toBe(stepOk ? 1 : 0);
    expect(stored.stepsCompleted).toBe(ledger);
  });

  it("M6a · COMPLETE vs COMPLETE with different keys → one completion", async () => {
    const sessionId = await startAndAdvance(userA);
    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });
    const winner = nextKey();
    const loser = nextKey();

    const results = await Promise.allSettled([
      service.completeSession(userA, { idempotencyKey: winner, sessionId }),
      service.completeSession(userA, { idempotencyKey: loser, sessionId }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).status,
    ).toBe("COMPLETED");
    // Exactly one receipt and one event; the loser left nothing at all.
    expect(
      await prisma.guideCommandReceipt.count({
        where: { commandType: "SESSION_COMPLETE" },
      }),
    ).toBe(1);
    expect(
      await prisma.learningEvent.count({
        where: { kind: "GUIDE_SESSION_COMPLETED" },
      }),
    ).toBe(1);
    const loserWon = results[1].status === "fulfilled";
    const loserKey = loserWon ? winner : loser;
    expect(
      await prisma.guideCommandReceipt.count({
        where: { idempotencyKey: loserKey },
      }),
    ).toBe(0);
    expect(
      await prisma.learningEvent.count({
        where: { idempotencyKey: loserKey },
      }),
    ).toBe(0);
  });

  it("M6b · COMPLETE vs COMPLETE with the SAME key → one creates, one replays", async () => {
    // A FRESH session that has never been completed: the key under test is
    // used for the first time by this race, so it really exercises
    // create-vs-replay and not replay-vs-replay.
    const sessionId = await startAndAdvance(userA);
    await service.completeRecallStep(userA, {
      idempotencyKey: nextKey(),
      sessionId,
      stepKey: STEP_RECALL,
      selectedOptionKey: CORRECT_OPTION,
    });
    const sameKey = nextKey();

    const [a, b] = await Promise.all([
      service.completeSession(userA, { idempotencyKey: sameKey, sessionId }),
      service.completeSession(userA, { idempotencyKey: sameKey, sessionId }),
    ]);

    expect([a, b].filter((r) => r.created)).toHaveLength(1);
    expect([a, b].filter((r) => r.replayed)).toHaveLength(1);
    expect(a.sessionId).toBe(sessionId);
    expect(b.sessionId).toBe(sessionId);
    expect(a.status).toBe("COMPLETED");
    expect(b.status).toBe("COMPLETED");
    // One receipt, one event — the replay applied no second transition.
    expect(
      await prisma.guideCommandReceipt.count({
        where: { idempotencyKey: sameKey },
      }),
    ).toBe(1);
    expect(
      await prisma.learningEvent.count({
        where: { kind: "GUIDE_SESSION_COMPLETED" },
      }),
    ).toBe(1);
  });

  // ── START autocancel vs a step on the previous session (§7) ──────────────

  it("START's autocancel and a step on the previous session serialize", async () => {
    const first = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });

    const results = await Promise.allSettled([
      service.start(userA, {
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 1,
      }),
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: first.sessionId,
        stepKey: STEP_CONCEPT,
      }),
    ]);

    // The START always succeeds (it holds both locks in order).
    expect(results[0].status).toBe("fulfilled");
    const old = await prisma.guideSession.findUniqueOrThrow({
      where: { id: first.sessionId },
    });
    expect(old.status).toBe("CANCELLED");

    const acceptedOnOld = await prisma.guideSessionStep.count({
      where: { sessionId: first.sessionId },
    });
    // No ledger row may be accepted after the cancellation, and the retained
    // counter is exactly what the ledger justifies — never stale.
    if (results[1].status === "rejected") {
      expect(acceptedOnOld).toBe(0);
    }
    expect(old.stepsCompleted).toBe(acceptedOnOld);
    expect(old.currentStepKey).toBeNull();
  });

  // ── Atomicity — the other two failure points (§9) ────────────────────────

  it("a ledger conflict rolls the whole command back", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const before = await counts();
    vi.spyOn(stepRepo, "appendAccepted").mockRejectedValue(
      new GuideStepConflictError(),
    );

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );
    expect(await counts()).toEqual(before);
  });

  it("a failed session update rolls the whole command back", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const before = await counts();
    // The projection write matches zero rows (the session moved under us).
    vi.spyOn(sessionRepo, "applyProjection").mockResolvedValue(0);

    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey: STEP_CONCEPT,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );
    // The ledger row it had already staged is gone with the transaction.
    expect(await counts()).toEqual(before);
  });

  it("a receipt conflict writes nothing", async () => {
    const started = await service.start(userA, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
    const reused = nextKey();
    await service.completeStep(userA, {
      idempotencyKey: reused,
      sessionId: started.sessionId,
      stepKey: STEP_CONCEPT,
    });
    const before = await counts();

    // The same key now means something else (a different step).
    await expectCode(
      service.completeStep(userA, {
        idempotencyKey: reused,
        sessionId: started.sessionId,
        stepKey: STEP_PRACTICE,
      }),
      "GUIDE_SESSION_INVALID_TRANSITION",
    );
    expect(await counts()).toEqual(before);
  });
});
