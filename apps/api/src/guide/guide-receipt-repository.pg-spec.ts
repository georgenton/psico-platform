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
import type { ValidatedGuideCommand } from "./guide-command-semantics";

/**
 * CC-7.4B — the receipt repository against REAL PostgreSQL (instruction §12
 * "Receipt"): per-actor uniqueness, cross-user reuse, cross-command key
 * conflicts, canonicalization, pre-DB rejection, fingerprint stability/drift,
 * START ignoring the server-generated sessionId, genuine concurrency on the
 * unique constraint, transaction-safe replay, and error sanitization.
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

  const start = (
    userId: string,
    k: string,
    over: Partial<{
      sessionId: string;
      guideKey: string;
      editionId: string | null;
      unitId: string | null;
    }> = {},
  ): ValidatedGuideCommand => ({
    commandType: "START",
    userId,
    idempotencyKey: k,
    sessionId: over.sessionId ?? sessionId,
    guideKey: over.guideKey ?? "guia-prueba",
    guideVersion: 1,
    editionId: over.editionId !== undefined ? over.editionId : null,
    unitId: over.unitId !== undefined ? over.unitId : null,
  });

  const cancel = (
    userId: string,
    k: string,
    sid?: string,
  ): ValidatedGuideCommand => ({
    commandType: "CANCEL",
    userId,
    idempotencyKey: k,
    sessionId: sid ?? sessionId,
  });

  const recall = (
    userId: string,
    k: string,
    option: string,
  ): ValidatedGuideCommand => ({
    commandType: "STEP_RECALL",
    userId,
    idempotencyKey: k,
    sessionId,
    stepKey: "recall",
    itemKey: "quiz-1",
    selectedOptionKey: option,
  });

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
    // Receipts FK to a session — one ACTIVE per user.
    const mk = (id: string, userId: string) =>
      pool.query(
        `INSERT INTO "GuideSession"
          ("id","userId","guideKey","guideVersion","totalSteps","currentStepKey")
         VALUES ($1,$2,'guia-prueba',1,4,'paso-1')`,
        [id, userId],
      );
    sessionId = "gsr-1";
    sessionId2 = "gsr-2";
    await mk(sessionId, U1);
    await mk(sessionId2, U2);
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("appends, replays exactly, and never writes a second row for the same key", async () => {
    const cmd = start(U1, key(1));
    const first = await repo.appendValidated(cmd);
    expect(first.created).toBe(true);
    const replay = await repo.appendValidated(cmd);
    expect(replay.created).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt.id).toBe(first.receipt.id);
    const count = await prisma.guideCommandReceipt.count({
      where: { userId: U1, idempotencyKey: key(1) },
    });
    expect(count).toBe(1);
  });

  it("the SAME key under two DIFFERENT users is two independent receipts", async () => {
    const a = await repo.appendValidated(cancel(U1, key(2)));
    const b = await repo.appendValidated(cancel(U2, key(2), sessionId2));
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.receipt.id).not.toBe(b.receipt.id);
  });

  it("cross-command key reuse is a CONFLICT (append and inspect agree)", async () => {
    await repo.appendValidated(start(U1, key(3), { sessionId }));
    await expect(repo.appendValidated(cancel(U1, key(3)))).rejects.toThrow(
      GuideCommandIdempotencyConflictError,
    );
    await expect(repo.inspectValidated(cancel(U1, key(3)))).rejects.toThrow(
      GuideCommandIdempotencyConflictError,
    );
  });

  it("canonicalizes an UPPERCASE key to lowercase storage; invalid UUIDs fail BEFORE the DB", async () => {
    const upper = key(4).toUpperCase();
    const res = await repo.appendValidated(cancel(U1, upper));
    expect(res.receipt.idempotencyKey).toBe(key(4));

    const before = await prisma.guideCommandReceipt.count();
    await expect(
      repo.appendValidated(cancel(U1, "not-a-uuid")),
    ).rejects.toThrow(GuideCommandInvalidInputError);
    await expect(repo.inspectValidated(cancel(U1, "  "))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
    expect(await prisma.guideCommandReceipt.count()).toBe(before);
  });

  it("fingerprint is STABLE (uppercase-key retry replays) and drifts on EVERY semantic change", async () => {
    // Stability: the canonicalized retry of the uppercase append is a replay.
    const replay = await repo.appendValidated(cancel(U1, key(4)));
    expect(replay.replayed).toBe(true);

    // Drift — same key, different context (START):
    await repo.appendValidated(
      start(U1, key(5), { editionId: "ed-1", unitId: "cu-1" }),
    );
    await expect(
      repo.appendValidated(
        start(U1, key(5), { editionId: null, unitId: null }),
      ),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);

    // Drift — same key, same item, DIFFERENT selected option (recall):
    await repo.appendValidated(recall(U1, key(6), "opt-a"));
    await expect(
      repo.appendValidated(recall(U1, key(6), "opt-b")),
    ).rejects.toThrow(GuideCommandIdempotencyConflictError);
  });

  it("START fingerprint ignores the server-generated sessionId — a retry that cannot know it replays", async () => {
    const original = await repo.appendValidated(
      start(U1, key(7), { sessionId }),
    );
    // The retry arrives BEFORE any session is created, so the caller passes a
    // different (placeholder) linkage — semantics are identical:
    const retry = await repo.appendValidated(
      start(U1, key(7), { sessionId: "sess-desconocida" }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt.id).toBe(original.receipt.id);
    // The STORED linkage remains the ORIGINAL session:
    expect(retry.receipt.sessionId).toBe(sessionId);
  });

  it("identical concurrency → ONE row, one created + one replayed", async () => {
    const cmd = cancel(U1, key(8));
    const results = await Promise.all([
      repo.appendValidated(cmd),
      repo.appendValidated(cmd),
    ]);
    const created = results.filter((r) => r.created).length;
    const replayed = results.filter((r) => r.replayed).length;
    expect(created).toBe(1);
    expect(replayed).toBe(1);
    expect(
      await prisma.guideCommandReceipt.count({
        where: { userId: U1, idempotencyKey: key(8) },
      }),
    ).toBe(1);
  });

  it("conflicting concurrency → ONE row + one typed conflict", async () => {
    const outcomes = await Promise.allSettled([
      repo.appendValidated(recall(U1, key(9), "opt-a")),
      repo.appendValidated(recall(U1, key(9), "opt-c")),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter(
      (o) =>
        o.status === "rejected" &&
        o.reason instanceof GuideCommandIdempotencyConflictError,
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      await prisma.guideCommandReceipt.count({
        where: { userId: U1, idempotencyKey: key(9) },
      }),
    ).toBe(1);
  });

  it("a replay INSIDE an interactive transaction does not abort it", async () => {
    await repo.appendValidated(cancel(U1, key(10)));
    const survived = await prisma.$transaction(async (tx) => {
      const replay = await repo.appendValidated(cancel(U1, key(10)), tx);
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
      await broken.appendValidated(cancel(U1, key(11)));
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
