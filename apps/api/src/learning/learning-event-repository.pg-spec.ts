import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LearningEventTypeV1 } from "@psico/types";
import {
  LearningEventIdempotencyConflictError,
  LearningEventRepository,
  LearningEventStorageError,
} from "./learning-event.repository";
import { TYPE_TO_KIND } from "./learning-event-semantics";
import type { ValidatedLearningEvent } from "./validated-learning-event";

/**
 * CC-7.2 — the single writer against REAL PostgreSQL: creation of all seven
 * V1 types, enum mapping, exact payloads, server-owned columns, idempotent
 * replay, semantic conflicts, genuine concurrency on the unique constraint,
 * cross-user key reuse, legacy-row coexistence, transaction rollback, and
 * error sanitization. Idempotency and constraints CANNOT be trusted to a
 * Prisma mock — this suite runs under `test:locks` (TEST_DATABASE_URL set)
 * and is skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc72_repo_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Zero-entropy, valid-shape UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

const U1 = "u-cc72-one";
const U2 = "u-cc72-two";

/** A full validated input per V1 type, parameterized by user + key. */
function inputs(
  userId: string,
  base: number,
): { [K in LearningEventTypeV1]: ValidatedLearningEvent<K> } {
  return {
    unit_opened: {
      userId,
      idempotencyKey: key(base + 1),
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-a" },
      editionId: "ed-1",
      unitId: "cu-1",
    },
    unit_completed: {
      userId,
      idempotencyKey: key(base + 2),
      type: "unit_completed",
      payload: { editionKey: "libro-1e", unitKey: "unit-a", revisionNumber: 2 },
      editionId: "ed-1",
      unitId: "cu-1",
    },
    concept_explored: {
      userId,
      idempotencyKey: key(base + 3),
      type: "concept_explored",
      payload: { conceptKey: "familia-ensamblada", unitKey: "unit-a" },
      conceptId: "co-1",
      unitId: "cu-1",
    },
    guide_session_started: {
      userId,
      idempotencyKey: key(base + 4),
      type: "guide_session_started",
      payload: { guideSessionId: "gs-1" },
      guideSessionId: "gs-1",
    },
    guide_session_completed: {
      userId,
      idempotencyKey: key(base + 5),
      type: "guide_session_completed",
      payload: { guideSessionId: "gs-1", stepsCompleted: 3 },
      guideSessionId: "gs-1",
    },
    active_recall_attempted: {
      userId,
      idempotencyKey: key(base + 6),
      type: "active_recall_attempted",
      payload: {
        unitKey: "unit-a",
        itemKey: "item-1",
        result: "correct",
        evaluationSource: "server",
        conceptKey: "familia-ensamblada",
      },
      unitId: "cu-1",
      conceptId: "co-1",
    },
    practice_completed: {
      userId,
      idempotencyKey: key(base + 7),
      type: "practice_completed",
      payload: { exerciseKey: "respiracion-1", unitKey: "unit-a" },
      unitId: "cu-1",
    },
  };
}

suite("CC-7.2 · LearningEventRepository (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let repo: LearningEventRepository;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    // §13.3 — the REAL migration chain, from scratch, including CC-7.2's.
    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    repo = new LearningEventRepository(prisma);

    await prisma.user.createMany({
      data: [
        { id: U1, email: "cc72-one@test.local", name: "CC72 One" },
        { id: U2, email: "cc72-two@test.local", name: "CC72 Two" },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── (1)(2)(3)(4)(5)(6)(14)(15) creation of the seven types ───────────────
  it("creates all seven V1 types with exact payloads and server-owned columns", async () => {
    const before = new Date();
    const all = inputs(U1, 100);
    for (const input of Object.values(all)) {
      const res = await repo.appendValidated(input);
      expect(res.created).toBe(true);
      expect(res.replayed).toBe(false);

      // (2) enum ↔ type mapping against the REAL stored kind:
      const row = await prisma.learningEvent.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: U1,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      expect(row).not.toBeNull();
      expect(row?.kind).toBe(TYPE_TO_KIND[input.type]);
      // (3) exact payload, byte-for-byte semantics:
      expect(row?.payload).toEqual(input.payload);
      // (4) server-owned schemaVersion:
      expect(row?.schemaVersion).toBe(1);
      // (5) server-owned clock:
      expect(row?.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1000,
      );
      expect(res.record.occurredAt).toBe(row?.createdAt.toISOString());
      // record coupling:
      expect(res.record.type).toBe(input.type);
      expect(res.record.payload).toEqual(input.payload);
      // (6) the public record never carries the actor:
      const serialized = JSON.stringify(res.record);
      expect(serialized).not.toContain("userId");
      expect(serialized).not.toContain(U1);
    }
    // (14)(15) resolved references persisted:
    const concept = await prisma.learningEvent.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: U1,
          idempotencyKey: all.concept_explored.idempotencyKey,
        },
      },
    });
    expect(concept?.conceptId).toBe("co-1");
    const guide = await prisma.learningEvent.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: U1,
          idempotencyKey: all.guide_session_completed.idempotencyKey,
        },
      },
    });
    expect(guide?.guideSessionId).toBe("gs-1");
  });

  // ── (7) exact replay ─────────────────────────────────────────────────────
  it("replays an exact duplicate: same row, no second insert, createdAt intact", async () => {
    const input = inputs(U1, 200).unit_opened;
    const first = await repo.appendValidated(input);
    const again = await repo.appendValidated(input);
    expect(again.created).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.record.id).toBe(first.record.id);
    expect(again.record.occurredAt).toBe(first.record.occurredAt);
    const count = await prisma.learningEvent.count({
      where: { userId: U1, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (8) conflict by type ─────────────────────────────────────────────────
  it("conflicts when the same key arrives with a different type", async () => {
    const base = inputs(U1, 300);
    await repo.appendValidated(base.unit_opened);
    const drifted: ValidatedLearningEvent = {
      ...base.unit_completed,
      idempotencyKey: base.unit_opened.idempotencyKey,
    };
    await expect(repo.appendValidated(drifted)).rejects.toBeInstanceOf(
      LearningEventIdempotencyConflictError,
    );
    const count = await prisma.learningEvent.count({
      where: { userId: U1, idempotencyKey: base.unit_opened.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (9) conflict by payload ──────────────────────────────────────────────
  it("conflicts when the same key arrives with a drifted payload", async () => {
    const input = inputs(U1, 400).unit_completed;
    await repo.appendValidated(input);
    const drifted: ValidatedLearningEvent<"unit_completed"> = {
      ...input,
      payload: { ...input.payload, revisionNumber: 9 },
    };
    await expect(repo.appendValidated(drifted)).rejects.toBeInstanceOf(
      LearningEventIdempotencyConflictError,
    );
  });

  // ── (10) conflict by EVERY reference ─────────────────────────────────────
  it("conflicts on drift of editionId, unitId, conceptId, guideSessionId and blockKey", async () => {
    const all = inputs(U1, 500);
    const cases: Array<[ValidatedLearningEvent, ValidatedLearningEvent]> = [
      [all.unit_opened, { ...all.unit_opened, editionId: "ed-other" }],
      [all.unit_completed, { ...all.unit_completed, unitId: "cu-other" }],
      [
        all.concept_explored,
        { ...all.concept_explored, conceptId: "co-other" },
      ],
      [
        all.guide_session_started,
        { ...all.guide_session_started, guideSessionId: "gs-other" },
      ],
      [
        all.practice_completed,
        { ...all.practice_completed, blockKey: "bk-other" },
      ],
    ];
    for (const [original, drifted] of cases) {
      await repo.appendValidated(original);
      await expect(
        repo.appendValidated(drifted),
        drifted.type,
      ).rejects.toBeInstanceOf(LearningEventIdempotencyConflictError);
    }
  });

  // ── (11) concurrent identical writes ─────────────────────────────────────
  it("two identical concurrent writes leave one row: one create, one replay", async () => {
    const input = inputs(U1, 600).concept_explored;
    const [a, b] = await Promise.all([
      repo.appendValidated(input),
      repo.appendValidated(input),
    ]);
    const flags = [a, b].map((r) => r.created).sort();
    expect(flags).toEqual([false, true]);
    expect([a, b].map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(a.record.id).toBe(b.record.id);
    const count = await prisma.learningEvent.count({
      where: { userId: U1, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (12) concurrent conflicting writes ───────────────────────────────────
  it("two conflicting concurrent writes: one row, the loser gets a typed conflict", async () => {
    const input = inputs(U1, 700).practice_completed;
    const drifted: ValidatedLearningEvent<"practice_completed"> = {
      ...input,
      payload: { ...input.payload, exerciseKey: "otra" },
    };
    const results = await Promise.allSettled([
      repo.appendValidated(input),
      repo.appendValidated(drifted),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      LearningEventIdempotencyConflictError,
    );
    const count = await prisma.learningEvent.count({
      where: { userId: U1, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (13) cross-user key reuse ────────────────────────────────────────────
  it("two different users can reuse the same idempotency key", async () => {
    const k = key(800);
    const forU1: ValidatedLearningEvent<"unit_opened"> = {
      userId: U1,
      idempotencyKey: k,
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-x" },
    };
    const forU2: ValidatedLearningEvent<"unit_opened"> = {
      ...forU1,
      userId: U2,
    };
    const r1 = await repo.appendValidated(forU1);
    const r2 = await repo.appendValidated(forU2);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r1.record.id).not.toBe(r2.record.id);
  });

  // ── (16) legacy nullable rows coexist untouched ──────────────────────────
  it("pre-V1 rows (NULL key/schemaVersion) coexist and survive V1 writes byte-identical", async () => {
    // Two NULL-key rows for the SAME user — PostgreSQL distinct-NULL unique
    // semantics must admit both (that is what preserves legacy data).
    await pool.query(
      `INSERT INTO "LearningEvent"(id, "userId", kind, payload, "createdAt")
       VALUES ('legacy-1', $1, 'BLOCK_DWELL', '{"legacy": true, "ms": 1200}', '2026-07-01T00:00:00Z'),
              ('legacy-2', $1, 'HIGHLIGHT_CREATED', '{"legacy": true}', '2026-07-02T00:00:00Z')`,
      [U1],
    );

    await repo.appendValidated(inputs(U1, 900).unit_opened);

    const rows = await pool.query(
      `SELECT id, kind, payload, "idempotencyKey", "schemaVersion", "conceptId", "guideSessionId",
              to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS wall
         FROM "LearningEvent" WHERE id IN ('legacy-1','legacy-2') ORDER BY id`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].payload).toEqual({ legacy: true, ms: 1200 });
    expect(rows.rows[0].kind).toBe("BLOCK_DWELL");
    expect(rows.rows[0].idempotencyKey).toBeNull();
    expect(rows.rows[0].schemaVersion).toBeNull();
    expect(rows.rows[0].conceptId).toBeNull();
    expect(rows.rows[0].guideSessionId).toBeNull();
    // TIMESTAMP(3) is timezone-naive — compare the stored wall time via SQL
    // so the driver's local-timezone parsing cannot skew the assertion.
    expect(rows.rows[0].wall).toBe("2026-07-01T00:00:00");
    expect(rows.rows[1].idempotencyKey).toBeNull();
  });

  // ── (17) no mutation of other tables ─────────────────────────────────────
  it("appending events mutates ONLY LearningEvent", async () => {
    const countsBefore = await Promise.all([
      prisma.user.count(),
      prisma.highlight.count(),
      prisma.resonance.count(),
      prisma.readingSession.count(),
    ]);
    await repo.appendValidated(inputs(U2, 1000).guide_session_started);
    const countsAfter = await Promise.all([
      prisma.user.count(),
      prisma.highlight.count(),
      prisma.resonance.count(),
      prisma.readingSession.count(),
    ]);
    expect(countsAfter).toEqual(countsBefore);
  });

  // ── (18) sanitized errors ────────────────────────────────────────────────
  it("errors carry codes only — never payload fields or input values", async () => {
    const input = inputs(U1, 1100).active_recall_attempted;
    await repo.appendValidated(input);
    const drifted: ValidatedLearningEvent<"active_recall_attempted"> = {
      ...input,
      payload: { ...input.payload, result: "incorrect" },
    };
    const err = await repo.appendValidated(drifted).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LearningEventIdempotencyConflictError);
    const msg = (err as Error).message;
    expect(msg).toBe("LEARNING_EVENT_IDEMPOTENCY_CONFLICT");
    for (const leak of [
      "familia-ensamblada",
      "item-1",
      "incorrect",
      input.idempotencyKey,
      U1,
    ]) {
      expect(msg).not.toContain(leak);
    }
  });

  // ── (19) transaction rollback ────────────────────────────────────────────
  it("rolls back completely when the surrounding transaction fails", async () => {
    const input = inputs(U2, 1200).unit_completed;
    await expect(
      prisma.$transaction(async (tx) => {
        const res = await repo.appendValidated(input, tx);
        expect(res.created).toBe(true);
        throw new Error("boom — the domain transition failed");
      }),
    ).rejects.toThrow("boom");
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(0);
  });

  // ── (19b) transaction commit — event + companion write land together ─────
  it("persists inside a successful transaction alongside the caller's write", async () => {
    const input = inputs(U2, 1300).unit_opened;
    await prisma.$transaction(async (tx) => {
      await repo.appendValidated(input, tx);
    });
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (20) non-V1 kinds cannot enter the typed repository ──────────────────
  it("a smuggled non-V1 type never inserts a row", async () => {
    const smuggled = {
      ...inputs(U2, 1400).unit_opened,
      type: "resonance_confirmed",
    } as unknown as ValidatedLearningEvent;
    await expect(repo.appendValidated(smuggled)).rejects.toBeInstanceOf(
      LearningEventStorageError,
    );
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: smuggled.idempotencyKey },
    });
    expect(count).toBe(0);
  });
});
