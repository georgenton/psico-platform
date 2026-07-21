import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GuideCommandIdempotencyConflictError,
  GuideCommandInvalidInputError,
  GuideCommandReceiptRepository,
  GuideCommandStorageError,
} from "./guide-command-receipt.repository";
import type {
  GuideCommandReceiptWrite,
  ValidatedGuideCancelSemantics,
  ValidatedGuideStartSemantics,
  ValidatedGuideStepRecallSemantics,
} from "./guide-command-semantics";

/**
 * CC-7.4B — the receipt repository against REAL PostgreSQL (PR #590
 * closure): per-actor uniqueness, cross-user reuse, cross-command key
 * conflicts, canonicalization, pre-DB rejection, fingerprint stability/
 * drift, START semantics WITHOUT a sessionId (inspection needs none; append
 * links the REAL created session; replay returns the ORIGINAL), genuine
 * concurrency on the unique constraint, transaction-safe replay, and error
 * sanitization.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc74b_receipt_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const key = (n: number) =>
  `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;

const U1 = "u-cc74b-rc-one";
const U2 = "u-cc74b-rc-two";

suite("CC-7.4B · GuideCommandReceiptRepository (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let repo: GuideCommandReceiptRepository;
  let sessionId: string;
  let sessionId2: string;
  let sessionIdRetry: string;

  const startSemantics = (
    userId: string,
    k: string,
    over: Partial<{
      guideKey: string;
      editionId: string | null;
      unitId: string | null;
    }> = {},
  ): ValidatedGuideStartSemantics => ({
    commandType: "START",
    userId,
    idempotencyKey: k,
    guideKey: over.guideKey ?? "guia-prueba",
    guideVersion: 1,
    editionId: over.editionId !== undefined ? over.editionId : null,
    unitId: over.unitId !== undefined ? over.unitId : null,
  });

  const startWrite = (
    semantics: ValidatedGuideStartSemantics,
    resultSessionId: string,
  ): GuideCommandReceiptWrite => ({ semantics, resultSessionId });

  const cancel = (
    userId: string,
    k: string,
    sid?: string,
  ): ValidatedGuideCancelSemantics => ({
    commandType: "CANCEL",
    userId,
    idempotencyKey: k,
    sessionId: sid ?? sessionId,
  });

  const recall = (
    userId: string,
    k: string,
    option: string,
  ): ValidatedGuideStepRecallSemantics => ({
    commandType: "STEP_RECALL",
    userId,
    idempotencyKey: k,
    sessionId,
    stepKey: "recall",
    itemKey: "quiz-1",
    selectedOptionKey: option,
  });

  /** Non-START commands persist their semantics verbatim. */
  const write = (
    semantics:
      | ValidatedGuideCancelSemantics
      | ValidatedGuideStepRecallSemantics,
  ): GuideCommandReceiptWrite => ({ semantics });

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
    repo = new GuideCommandReceiptRepository(prisma);

    await prisma.user.createMany({
      data: [
        { id: U1, email: "cc74b-rc-one@test.local", name: "RC One" },
        { id: U2, email: "cc74b-rc-two@test.local", name: "RC Two" },
      ],
    });
    // Receipts FK to a session of the SAME user (composite ownership FK).
    // A retry target lives as a CANCELLED extra session for U1.
    const mk = (id: string, userId: string, status = "ACTIVE") =>
      pool.query(
        `INSERT INTO "GuideSession"
          ("id","userId","guideKey","guideVersion","totalSteps",
           "currentStepKey","status","cancelledAt")
         VALUES ($1,$2,'guia-prueba',1,4,
                 CASE WHEN $3 = 'ACTIVE' THEN 'paso-1' END,
                 $3::"GuideSessionStatus",
                 CASE WHEN $3 = 'CANCELLED' THEN now() END)`,
        [id, userId, status],
      );
    sessionId = "gsr-1";
    sessionId2 = "gsr-2";
    sessionIdRetry = "gsr-retry";
    await mk(sessionId, U1);
    await mk(sessionId2, U2);
    await mk(sessionIdRetry, U1, "CANCELLED");
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("START: inspection needs NO sessionId; append links the REAL created session; replay returns the ORIGINAL", async () => {
    const semantics = startSemantics(U1, key(1));

    // (1) Inspect BEFORE any session exists — semantics alone:
    expect(await repo.inspectValidated(semantics)).toEqual({
      state: "absent",
    });

    // (2) Append with the session the server just created (result linkage):
    const created = await repo.appendValidated(
      startWrite(semantics, sessionId),
    );
    expect(created.created).toBe(true);
    expect(created.receipt.sessionId).toBe(sessionId);

    // (3) A later inspection of the EXACT same semantics is a replay that
    // carries the ORIGINAL session — the caller never creates a second one:
    const inspected = await repo.inspectValidated(semantics);
    expect(inspected.state).toBe("replay");
    if (inspected.state === "replay") {
      expect(inspected.receipt.id).toBe(created.receipt.id);
      expect(inspected.receipt.sessionId).toBe(sessionId);
    }

    // (4) Context drift under the same key is a CONFLICT:
    await expect(
      repo.inspectValidated(
        startSemantics(U1, key(1), { guideKey: "otra-guia" }),
      ),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);
  });

  it("START append retry (crash after session creation) replays the ORIGINAL receipt and session", async () => {
    const semantics = startSemantics(U1, key(2));
    const original = await repo.appendValidated(
      startWrite(semantics, sessionId),
    );
    // A racing retry that somehow produced ANOTHER session of the same user
    // still resolves to the ORIGINAL receipt — the linkage is server-owned
    // and the semantics (which exclude any session) are identical:
    const retry = await repo.appendValidated(
      startWrite(semantics, sessionIdRetry),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt.id).toBe(original.receipt.id);
    expect(retry.receipt.sessionId).toBe(sessionId);
  });

  it("appends, replays exactly, and never writes a second row for the same key", async () => {
    const semantics = cancel(U1, key(3));
    const first = await repo.appendValidated(write(semantics));
    expect(first.created).toBe(true);
    const replay = await repo.appendValidated(write(semantics));
    expect(replay.created).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt.id).toBe(first.receipt.id);
    const count = await prisma.guideCommandReceipt.count({
      where: { userId: U1, idempotencyKey: key(3) },
    });
    expect(count).toBe(1);
  });

  it("the SAME key under two DIFFERENT users is two independent receipts", async () => {
    const a = await repo.appendValidated(write(cancel(U1, key(4))));
    const b = await repo.appendValidated(write(cancel(U2, key(4), sessionId2)));
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.receipt.id).not.toBe(b.receipt.id);
  });

  it("cross-command key reuse is a CONFLICT (append and inspect agree)", async () => {
    await repo.appendValidated(
      startWrite(startSemantics(U1, key(5)), sessionId),
    );
    await expect(
      repo.appendValidated(write(cancel(U1, key(5)))),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);
    await expect(repo.inspectValidated(cancel(U1, key(5)))).rejects.toThrow(
      GuideCommandIdempotencyConflictError,
    );
  });

  it("canonicalizes an UPPERCASE key to lowercase storage; invalid UUIDs fail BEFORE the DB", async () => {
    const upper = key(6).toUpperCase();
    const res = await repo.appendValidated(write(cancel(U1, upper)));
    expect(res.receipt.idempotencyKey).toBe(key(6));

    const before = await prisma.guideCommandReceipt.count();
    await expect(
      repo.appendValidated(write(cancel(U1, "not-a-uuid"))),
    ).rejects.toThrow(GuideCommandInvalidInputError);
    await expect(repo.inspectValidated(cancel(U1, "  "))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
    expect(await prisma.guideCommandReceipt.count()).toBe(before);
  });

  it("fingerprint is STABLE (uppercase-key retry replays) and drifts on EVERY semantic change", async () => {
    // Stability: the canonicalized retry of the uppercase append is a replay.
    const replay = await repo.appendValidated(write(cancel(U1, key(6))));
    expect(replay.replayed).toBe(true);

    // Drift — same key, different editorial context (START):
    await repo.appendValidated(
      startWrite(
        startSemantics(U1, key(7), { editionId: "ed-1", unitId: "cu-1" }),
        sessionId,
      ),
    );
    await expect(
      repo.appendValidated(
        startWrite(
          startSemantics(U1, key(7), { editionId: null, unitId: null }),
          sessionId,
        ),
      ),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);

    // Drift — same key, same item, DIFFERENT selected option (recall):
    await repo.appendValidated(write(recall(U1, key(8), "opt-a")));
    await expect(
      repo.appendValidated(write(recall(U1, key(8), "opt-b"))),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);
  });

  it("identical concurrency → ONE row, one created + one replayed", async () => {
    const semantics = cancel(U1, key(9));
    const results = await Promise.all([
      repo.appendValidated(write(semantics)),
      repo.appendValidated(write(semantics)),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(1);
    expect(
      await prisma.guideCommandReceipt.count({
        where: { userId: U1, idempotencyKey: key(9) },
      }),
    ).toBe(1);
  });

  it("conflicting concurrency → ONE row + one typed conflict", async () => {
    const outcomes = await Promise.allSettled([
      repo.appendValidated(write(recall(U1, key(10), "opt-a"))),
      repo.appendValidated(write(recall(U1, key(10), "opt-c"))),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes.filter(
        (o) =>
          o.status === "rejected" &&
          o.reason instanceof GuideCommandIdempotencyConflictError,
      ),
    ).toHaveLength(1);
    expect(
      await prisma.guideCommandReceipt.count({
        where: { userId: U1, idempotencyKey: key(10) },
      }),
    ).toBe(1);
  });

  it("a replay INSIDE an interactive transaction does not abort it", async () => {
    await repo.appendValidated(write(cancel(U1, key(11))));
    const survived = await prisma.$transaction(async (tx) => {
      const replay = await repo.appendValidated(write(cancel(U1, key(11))), tx);
      expect(replay.replayed).toBe(true);
      // The transaction is STILL usable after the non-aborting duplicate:
      return tx.guideCommandReceipt.count({ where: { userId: U1 } });
    });
    expect(survived).toBeGreaterThan(0);
  });

  it("raw storage errors are SANITIZED — typed, value-free, no cause", async () => {
    const broken = new GuideCommandReceiptRepository({
      guideCommandReceipt: {
        createMany: () => {
          throw new Error("postgresql://user:secret@host/db exploded");
        },
        findUnique: () => {
          throw new Error("postgresql://user:secret@host/db exploded");
        },
      },
    } as never);
    let caught: unknown;
    try {
      await broken.appendValidated(write(cancel(U1, key(12))));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GuideCommandStorageError);
    const flat = JSON.stringify(
      caught,
      Object.getOwnPropertyNames(caught as object),
    );
    expect(flat).not.toContain("secret");
    expect(flat).not.toContain("postgresql://");
    expect((caught as Error & { cause?: unknown }).cause).toBeUndefined();
  });
});
