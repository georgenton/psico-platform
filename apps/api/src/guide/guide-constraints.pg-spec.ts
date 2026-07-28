import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GuideSessionStepRepository,
  GuideStepConflictError,
} from "./guide-session-step.repository";

/**
 * CC-7.4B — the SQL invariants against REAL PostgreSQL (instruction §12
 * "GuideSession" + "Ledger" + account-close cascade). CHECK constraints,
 * partial uniques and cascades CANNOT be trusted to a mock: every rejection
 * here is the DATABASE saying no via raw INSERTs that bypass all TypeScript.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc74b_constraints_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Zero-entropy canonical UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

const U1 = "u-cc74b-one";
const U2 = "u-cc74b-two";
const U3 = "u-cc74b-cascade";

interface SessionCols {
  id: string;
  userId: string;
  status?: string;
  editionId?: string | null;
  unitId?: string | null;
  stepsCompleted?: number;
  totalSteps?: number;
  currentStepKey?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  guideVersion?: number;
}

suite("CC-7.4B · Guide SQL invariants (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let stepRepo: GuideSessionStepRepository;

  /** Raw INSERT so nothing but the DATABASE validates the row. */
  async function insertSession(cols: SessionCols): Promise<void> {
    await pool.query(
      `INSERT INTO "GuideSession"
        ("id","userId","guideKey","guideVersion","status","editionId","unitId",
         "stepsCompleted","totalSteps","currentStepKey","completedAt","cancelledAt")
       VALUES ($1,$2,'guia-prueba',$3,$4::"GuideSessionStatus",$5,$6,$7,$8,$9,$10,$11)`,
      [
        cols.id,
        cols.userId,
        cols.guideVersion ?? 1,
        cols.status ?? "ACTIVE",
        cols.editionId ?? null,
        cols.unitId ?? null,
        cols.stepsCompleted ?? 0,
        cols.totalSteps ?? 4,
        cols.currentStepKey === undefined ? "paso-1" : cols.currentStepKey,
        cols.completedAt ?? null,
        cols.cancelledAt ?? null,
      ],
    );
  }

  async function insertStep(cols: {
    id: string;
    sessionId: string;
    stepKey: string;
    order: number;
    kind: string;
    policy: string;
    conceptKey?: string | null;
    itemKey?: string | null;
    exerciseKey?: string | null;
    confirmationKey?: string | null;
    selectedOptionKey?: string | null;
    recallResult?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO "GuideSessionStep"
        ("id","sessionId","stepKey","order","kind","completionPolicy",
         "conceptKey","itemKey","exerciseKey","confirmationKey",
         "selectedOptionKey","recallResult")
       VALUES ($1,$2,$3,$4,$5::"GuideStepKind",$6::"GuideStepCompletionPolicy",
               $7,$8,$9,$10,$11,$12::"GuideStepRecallResult")`,
      [
        cols.id,
        cols.sessionId,
        cols.stepKey,
        cols.order,
        cols.kind,
        cols.policy,
        cols.conceptKey ?? null,
        cols.itemKey ?? null,
        cols.exerciseKey ?? null,
        cols.confirmationKey ?? null,
        cols.selectedOptionKey ?? null,
        cols.recallResult ?? null,
      ],
    );
  }

  async function insertReceipt(cols: {
    id: string;
    userId: string;
    idempotencyKey: string;
    commandType: string;
    sessionId: string;
    stepKey?: string | null;
    guideKey?: string | null;
    guideVersion?: number | null;
    editionId?: string | null;
    unitId?: string | null;
    conceptKey?: string | null;
    itemKey?: string | null;
    exerciseKey?: string | null;
    confirmationKey?: string | null;
    selectedOptionKey?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO "GuideCommandReceipt"
        ("id","userId","idempotencyKey","commandType","sessionId","stepKey",
         "guideKey","guideVersion","editionId","unitId","conceptKey","itemKey",
         "exerciseKey","confirmationKey","selectedOptionKey","semanticFingerprint")
       VALUES ($1,$2,$3,$4::"GuideCommandType",$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'v1|test')`,
      [
        cols.id,
        cols.userId,
        cols.idempotencyKey,
        cols.commandType,
        cols.sessionId,
        cols.stepKey ?? null,
        cols.guideKey ?? null,
        cols.guideVersion ?? null,
        cols.editionId ?? null,
        cols.unitId ?? null,
        cols.conceptKey ?? null,
        cols.itemKey ?? null,
        cols.exerciseKey ?? null,
        cols.confirmationKey ?? null,
        cols.selectedOptionKey ?? null,
      ],
    );
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    // The REAL migration chain from scratch, including CC-7.4B's.
    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    stepRepo = new GuideSessionStepRepository(prisma);

    await prisma.user.createMany({
      data: [
        { id: U1, email: "cc74b-one@test.local", name: "CC74B One" },
        { id: U2, email: "cc74b-two@test.local", name: "CC74B Two" },
        { id: U3, email: "cc74b-cascade@test.local", name: "CC74B Cascade" },
      ],
    });
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── GuideSession state machine ───────────────────────────────────────────

  it("accepts valid ACTIVE (unanchored), COMPLETED and CANCELLED rows", async () => {
    await insertSession({ id: "gs-active", userId: U1 });
    await insertSession({
      id: "gs-done",
      userId: U1,
      status: "COMPLETED",
      stepsCompleted: 4,
      totalSteps: 4,
      currentStepKey: null,
      completedAt: new Date().toISOString(),
    });
    await insertSession({
      id: "gs-cancelled",
      userId: U1,
      status: "CANCELLED",
      currentStepKey: null,
      cancelledAt: new Date().toISOString(),
    });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "GuideSession" WHERE "userId" = $1`,
      [U1],
    );
    expect(rows[0].n).toBe(3);
  });

  it("accepts a fully-anchored ACTIVE and rejects a PARTIAL editorial anchor", async () => {
    await insertSession({
      id: "gs-anchored",
      userId: U2,
      editionId: "ed-1",
      unitId: "cu-1",
    });
    await expect(
      insertSession({ id: "gs-partial-a", userId: U3, editionId: "ed-1" }),
    ).rejects.toThrow(/GuideSession_context_all_or_nothing/);
    await expect(
      insertSession({ id: "gs-partial-b", userId: U3, unitId: "cu-1" }),
    ).rejects.toThrow(/GuideSession_context_all_or_nothing/);
  });

  it("rejects every per-state violation of the machine", async () => {
    const cases: Array<[string, SessionCols]> = [
      [
        "completedAt on ACTIVE",
        { id: "x1", userId: U3, completedAt: new Date().toISOString() },
      ],
      [
        "cancelledAt on ACTIVE",
        { id: "x2", userId: U3, cancelledAt: new Date().toISOString() },
      ],
      [
        "COMPLETED without completedAt",
        {
          id: "x3",
          userId: U3,
          status: "COMPLETED",
          stepsCompleted: 4,
          currentStepKey: null,
        },
      ],
      [
        "COMPLETED with cancelledAt",
        {
          id: "x4",
          userId: U3,
          status: "COMPLETED",
          stepsCompleted: 4,
          currentStepKey: null,
          completedAt: new Date().toISOString(),
          cancelledAt: new Date().toISOString(),
        },
      ],
      [
        "COMPLETED with an incomplete counter",
        {
          id: "x5",
          userId: U3,
          status: "COMPLETED",
          stepsCompleted: 2,
          currentStepKey: null,
          completedAt: new Date().toISOString(),
        },
      ],
      [
        "CANCELLED without cancelledAt",
        { id: "x6", userId: U3, status: "CANCELLED", currentStepKey: null },
      ],
      [
        "ACTIVE with remaining steps but NULL cursor",
        { id: "x7", userId: U3, stepsCompleted: 1, currentStepKey: null },
      ],
      [
        "ACTIVE with full counter but a cursor still set",
        {
          id: "x8",
          userId: U3,
          stepsCompleted: 4,
          totalSteps: 4,
          currentStepKey: "paso-4",
        },
      ],
    ];
    for (const [label, cols] of cases) {
      await expect(insertSession(cols), label).rejects.toThrow(
        /GuideSession_state_machine/,
      );
    }
  });

  it("rejects totalSteps=0, out-of-range counters and non-positive versions", async () => {
    // currentStepKey null so the STATE machine passes (0 = 0 with no cursor)
    // and the ONLY violated constraint is the totalSteps floor:
    await expect(
      insertSession({
        id: "x9",
        userId: U3,
        totalSteps: 0,
        currentStepKey: null,
      }),
    ).rejects.toThrow(/GuideSession_total_steps_positive/);
    await expect(
      insertSession({
        id: "x10",
        userId: U3,
        stepsCompleted: 9,
        totalSteps: 4,
      }),
    ).rejects.toThrow(/GuideSession_counter_range/);
    await expect(
      insertSession({ id: "x11", userId: U3, stepsCompleted: -1 }),
    ).rejects.toThrow(/GuideSession_counter_range/);
    await expect(
      insertSession({ id: "x12", userId: U3, guideVersion: 0 }),
    ).rejects.toThrow(/GuideSession_version_positive/);
  });

  it("one ACTIVE per user (partial unique) — a second ACTIVE is rejected; other users unaffected", async () => {
    // U1 already holds "gs-active"; a second ACTIVE for U1 must hit the
    // partial unique. U2's ACTIVE ("gs-anchored") proves per-user scoping.
    await expect(
      insertSession({ id: "gs-active-2", userId: U1 }),
    ).rejects.toThrow(/GuideSession_one_active_per_user/);
    // COMPLETED/CANCELLED rows do NOT count against the partial index:
    await insertSession({
      id: "gs-done-2",
      userId: U1,
      status: "CANCELLED",
      currentStepKey: null,
      cancelledAt: new Date().toISOString(),
    });
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'GuideSession'
          AND indexname = 'GuideSession_one_active_per_user'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/WHERE.*ACTIVE/);
  });

  // ── GuideSessionStep ledger shape ────────────────────────────────────────

  it("accepts one valid row per V1 variant", async () => {
    const s = "gs-active";
    await insertStep({
      id: "st-1",
      sessionId: s,
      stepKey: "explora",
      order: 1,
      kind: "CONCEPT_EXPLORATION",
      policy: "EXPLICIT_CONFIRMATION",
      conceptKey: "familia-ensamblada",
    });
    await insertStep({
      id: "st-2",
      sessionId: s,
      stepKey: "recall",
      order: 2,
      kind: "ACTIVE_RECALL",
      policy: "OBJECTIVE_RECALL",
      itemKey: "quiz-1",
      selectedOptionKey: "opt-b",
      recallResult: "CORRECT",
    });
    await insertStep({
      id: "st-3",
      sessionId: s,
      stepKey: "practica",
      order: 3,
      kind: "CATALOG_PRACTICE",
      policy: "CATALOG_PRACTICE_CONFIRMATION",
      exerciseKey: "respiracion-1",
    });
    await insertStep({
      id: "st-4",
      sessionId: s,
      stepKey: "confirma",
      order: 4,
      kind: "EXPLICIT_CONFIRMATION",
      policy: "EXPLICIT_CONFIRMATION",
      confirmationKey: "pausa-hecha",
    });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "GuideSessionStep" WHERE "sessionId" = $1`,
      [s],
    );
    expect(rows[0].n).toBe(4);
  });

  it("rejects wrong kind/policy coupling, wrong/extra targets, and misplaced recall fields", async () => {
    const s = "gs-anchored";
    const bad: Array<[string, Parameters<typeof insertStep>[0]]> = [
      [
        "concept with recall policy",
        {
          id: "sx1",
          sessionId: s,
          stepKey: "b1",
          order: 1,
          kind: "CONCEPT_EXPLORATION",
          policy: "OBJECTIVE_RECALL",
          conceptKey: "c",
        },
      ],
      [
        "concept with the WRONG target",
        {
          id: "sx2",
          sessionId: s,
          stepKey: "b2",
          order: 2,
          kind: "CONCEPT_EXPLORATION",
          policy: "EXPLICIT_CONFIRMATION",
          itemKey: "quiz-1",
        },
      ],
      [
        "practice with an ADDITIONAL target",
        {
          id: "sx3",
          sessionId: s,
          stepKey: "b3",
          order: 3,
          kind: "CATALOG_PRACTICE",
          policy: "CATALOG_PRACTICE_CONFIRMATION",
          exerciseKey: "e",
          conceptKey: "extra",
        },
      ],
      [
        "recall WITHOUT option/result",
        {
          id: "sx4",
          sessionId: s,
          stepKey: "b4",
          order: 4,
          kind: "ACTIVE_RECALL",
          policy: "OBJECTIVE_RECALL",
          itemKey: "quiz-1",
        },
      ],
      [
        "recall result on a NON-recall step",
        {
          id: "sx5",
          sessionId: s,
          stepKey: "b5",
          order: 5,
          kind: "EXPLICIT_CONFIRMATION",
          policy: "EXPLICIT_CONFIRMATION",
          confirmationKey: "k",
          recallResult: "CORRECT",
        },
      ],
    ];
    for (const [label, cols] of bad) {
      await expect(insertStep(cols), label).rejects.toThrow(
        /GuideSessionStep_variant_shape/,
      );
    }
  });

  it("rejects order<=0, duplicate stepKey, duplicate order — and allows key reuse ACROSS sessions", async () => {
    await expect(
      insertStep({
        id: "sx6",
        sessionId: "gs-anchored",
        stepKey: "cero",
        order: 0,
        kind: "EXPLICIT_CONFIRMATION",
        policy: "EXPLICIT_CONFIRMATION",
        confirmationKey: "k",
      }),
    ).rejects.toThrow(/GuideSessionStep_order_positive/);
    await expect(
      insertStep({
        id: "sx7",
        sessionId: "gs-active",
        stepKey: "explora",
        order: 9,
        kind: "EXPLICIT_CONFIRMATION",
        policy: "EXPLICIT_CONFIRMATION",
        confirmationKey: "k",
      }),
    ).rejects.toThrow(/GuideSessionStep_sessionId_stepKey_key/);
    await expect(
      insertStep({
        id: "sx8",
        sessionId: "gs-active",
        stepKey: "otro",
        order: 1,
        kind: "EXPLICIT_CONFIRMATION",
        policy: "EXPLICIT_CONFIRMATION",
        confirmationKey: "k",
      }),
    ).rejects.toThrow(/GuideSessionStep_sessionId_order_key/);
    // The SAME stepKey under a DIFFERENT session is a fresh row:
    await insertStep({
      id: "sx9",
      sessionId: "gs-anchored",
      stepKey: "explora",
      order: 1,
      kind: "CONCEPT_EXPLORATION",
      policy: "EXPLICIT_CONFIRMATION",
      conceptKey: "familia-ensamblada",
    });
  });

  it("step repository: exact-duplicate append returns THE row; drifted duplicate conflicts; never a second row", async () => {
    const input = {
      sessionId: "gs-done",
      stepKey: "repo-step",
      order: 1,
      kind: "EXPLICIT_CONFIRMATION" as const,
      confirmationKey: "pausa-hecha",
    };
    const first = await stepRepo.appendAccepted(input);
    const replay = await stepRepo.appendAccepted(input);
    expect(replay.id).toBe(first.id);
    await expect(
      stepRepo.appendAccepted({ ...input, confirmationKey: "otra-cosa" }),
    ).rejects.toThrow(GuideStepConflictError);
    // A DIFFERENT step claiming the SAME order is a conflict, not storage:
    await expect(
      stepRepo.appendAccepted({ ...input, stepKey: "otro-step" }),
    ).rejects.toThrow(GuideStepConflictError);
    const rows = await stepRepo.listAccepted("gs-done");
    expect(rows).toHaveLength(1);
  });

  // ── GuideCommandReceipt shapes ───────────────────────────────────────────

  it("accepts one valid receipt per command type", async () => {
    const s = "gs-active";
    await insertReceipt({
      id: "rc-1",
      userId: U1,
      idempotencyKey: key(1),
      commandType: "START",
      sessionId: s,
      guideKey: "guia-prueba",
      guideVersion: 1,
    });
    await insertReceipt({
      id: "rc-2",
      userId: U1,
      idempotencyKey: key(2),
      commandType: "STEP_COMPLETE",
      sessionId: s,
      stepKey: "explora",
      conceptKey: "familia-ensamblada",
    });
    await insertReceipt({
      id: "rc-3",
      userId: U1,
      idempotencyKey: key(3),
      commandType: "STEP_RECALL",
      sessionId: s,
      stepKey: "recall",
      itemKey: "quiz-1",
      selectedOptionKey: "opt-b",
    });
    await insertReceipt({
      id: "rc-4",
      userId: U1,
      idempotencyKey: key(4),
      commandType: "CANCEL",
      sessionId: s,
    });
    await insertReceipt({
      id: "rc-5",
      userId: U1,
      idempotencyKey: key(5),
      commandType: "SESSION_COMPLETE",
      sessionId: s,
    });
  });

  it("rejects an invalid shape for EVERY command type", async () => {
    const s = "gs-active";
    const bad: Array<[string, Parameters<typeof insertReceipt>[0]]> = [
      [
        "START without guideKey/guideVersion",
        {
          id: "rx1",
          userId: U2,
          idempotencyKey: key(11),
          commandType: "START",
          sessionId: s,
        },
      ],
      [
        "START with a step target",
        {
          id: "rx2",
          userId: U2,
          idempotencyKey: key(12),
          commandType: "START",
          sessionId: s,
          guideKey: "g",
          guideVersion: 1,
          conceptKey: "leak",
        },
      ],
      [
        "STEP_COMPLETE with ZERO targets",
        {
          id: "rx3",
          userId: U2,
          idempotencyKey: key(13),
          commandType: "STEP_COMPLETE",
          sessionId: s,
          stepKey: "x",
        },
      ],
      [
        "STEP_COMPLETE with TWO targets",
        {
          id: "rx4",
          userId: U2,
          idempotencyKey: key(14),
          commandType: "STEP_COMPLETE",
          sessionId: s,
          stepKey: "x",
          conceptKey: "a",
          exerciseKey: "b",
        },
      ],
      [
        "STEP_RECALL without selectedOptionKey",
        {
          id: "rx5",
          userId: U2,
          idempotencyKey: key(15),
          commandType: "STEP_RECALL",
          sessionId: s,
          stepKey: "x",
          itemKey: "quiz-1",
        },
      ],
      [
        "CANCEL carrying a stepKey",
        {
          id: "rx6",
          userId: U2,
          idempotencyKey: key(16),
          commandType: "CANCEL",
          sessionId: s,
          stepKey: "x",
        },
      ],
      [
        "SESSION_COMPLETE carrying start fields",
        {
          id: "rx7",
          userId: U2,
          idempotencyKey: key(17),
          commandType: "SESSION_COMPLETE",
          sessionId: s,
          guideKey: "g",
          guideVersion: 1,
        },
      ],
    ];
    for (const [label, cols] of bad) {
      await expect(insertReceipt(cols), label).rejects.toThrow(
        /GuideCommandReceipt_command_shape/,
      );
    }
  });

  it("rejects a NON-canonical idempotencyKey at the SQL layer (uppercase / non-UUID)", async () => {
    await expect(
      insertReceipt({
        id: "rx8",
        userId: U2,
        idempotencyKey: key(18).toUpperCase(),
        commandType: "CANCEL",
        sessionId: "gs-active",
      }),
    ).rejects.toThrow(/GuideCommandReceipt_key_canonical/);
    await expect(
      insertReceipt({
        id: "rx9",
        userId: U2,
        idempotencyKey: "not-a-uuid",
        commandType: "CANCEL",
        sessionId: "gs-active",
      }),
    ).rejects.toThrow(/GuideCommandReceipt_key_canonical/);
  });

  // ── Receipt → session OWNERSHIP (composite FK, PR #590 closure §1) ──────

  it("a receipt for the actor's OWN session is accepted; another user's session is REJECTED by the DB", async () => {
    // U1 receipt → U1 session (rc-1..rc-5 above already prove acceptance).
    // U2 receipt (valid shape, valid key) → U1's session: the composite FK
    // (sessionId, userId) → GuideSession(id, userId) rejects it.
    await expect(
      insertReceipt({
        id: "rown-1",
        userId: U2,
        idempotencyKey: key(40),
        commandType: "CANCEL",
        sessionId: "gs-active",
      }),
    ).rejects.toThrow(/GuideCommandReceipt_sessionId_userId_fkey/);
    // Symmetric: U1 cannot link U2's session either — the sessionId cannot
    // be relinked through another actor.
    await expect(
      insertReceipt({
        id: "rown-2",
        userId: U1,
        idempotencyKey: key(41),
        commandType: "SESSION_COMPLETE",
        sessionId: "gs-anchored",
      }),
    ).rejects.toThrow(/GuideCommandReceipt_sessionId_userId_fkey/);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "GuideCommandReceipt"
        WHERE id IN ('rown-1','rown-2')`,
    );
    expect(rows[0].n).toBe(0);
  });

  // ── Account close: full cascade ──────────────────────────────────────────

  it("deleting the User cascades sessions, ledger and receipts", async () => {
    await insertSession({ id: "gs-cascade", userId: U3 });
    await insertStep({
      id: "st-cascade",
      sessionId: "gs-cascade",
      stepKey: "explora",
      order: 1,
      kind: "CONCEPT_EXPLORATION",
      policy: "EXPLICIT_CONFIRMATION",
      conceptKey: "familia-ensamblada",
    });
    await insertReceipt({
      id: "rc-cascade",
      userId: U3,
      idempotencyKey: key(30),
      commandType: "START",
      sessionId: "gs-cascade",
      guideKey: "guia-prueba",
      guideVersion: 1,
    });

    await prisma.user.delete({ where: { id: U3 } });

    for (const [table, where, param] of [
      ["GuideSession", `"userId" = $1`, U3],
      ["GuideSessionStep", `"sessionId" = $1`, "gs-cascade"],
      ["GuideCommandReceipt", `"userId" = $1`, U3],
    ] as const) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`,
        [param],
      );
      expect(rows[0].n, table).toBe(0);
    }
  });
});
