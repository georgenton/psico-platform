import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LearningEventTypeV1 } from "@psico/types";
import {
  LearningEventIdempotencyConflictError,
  LearningEventInvalidInputError,
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

  // ── §3.A — creation inside a real transaction, tx stays usable ───────────
  it("creates inside a $transaction and the tx remains usable afterwards", async () => {
    const input = inputs(U2, 1300).unit_opened;
    await prisma.$transaction(async (tx) => {
      const result = await repo.appendValidated(input, tx);
      expect(result.created).toBe(true);
      // A subsequent query on the SAME tx must work (the tx is not poisoned):
      const user = await tx.user.findUnique({ where: { id: U2 } });
      expect(user?.id).toBe(U2);
    });
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── §3.B — exact REPLAY inside a real transaction (the P2002→25P02 trap) ─
  it("replays inside a $transaction without aborting it (no P2028/25P02)", async () => {
    const input = inputs(U2, 1350).concept_explored;
    // The row exists BEFORE the transaction:
    const first = await repo.appendValidated(input);
    expect(first.created).toBe(true);

    // Inside a tx, the duplicate insert must NOT raise a unique violation:
    // with the old create→catch(P2002) strategy this aborted the whole tx
    // (every later statement failed with 25P02). The non-aborting insert
    // keeps the tx alive.
    await prisma.$transaction(async (tx) => {
      const replay = await repo.appendValidated(input, tx);
      expect(replay.replayed).toBe(true);
      expect(replay.record.id).toBe(first.record.id);
      // The tx is still usable after the replay:
      const user = await tx.user.findUnique({ where: { id: U2 } });
      expect(user?.id).toBe(U2);
    });
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── §3.C — conflict inside a tx reverts the WHOLE transaction ────────────
  it("a conflict inside a $transaction reverts the sentinel and keeps the original", async () => {
    const input = inputs(U2, 1400).practice_completed;
    await repo.appendValidated(input);
    const originalName = (await prisma.user.findUnique({ where: { id: U2 } }))
      ?.name;

    const drifted: ValidatedLearningEvent<"practice_completed"> = {
      ...input,
      payload: { ...input.payload, exerciseKey: "otra" },
    };
    await expect(
      prisma.$transaction(async (tx) => {
        // Sentinel mutation on ANOTHER table, before the conflicting append:
        await tx.user.update({
          where: { id: U2 },
          data: { name: "CC72-TX-SENTINEL" },
        });
        await repo.appendValidated(drifted, tx);
      }),
    ).rejects.toBeInstanceOf(LearningEventIdempotencyConflictError);

    // Full revert: sentinel absent…
    const after = await prisma.user.findUnique({ where: { id: U2 } });
    expect(after?.name).toBe(originalName);
    expect(after?.name).not.toBe("CC72-TX-SENTINEL");
    // …original event intact, zero second row:
    const rows = await prisma.learningEvent.findMany({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual(input.payload);
  });

  // ── §3.D — transactional concurrency ─────────────────────────────────────
  it("two concurrent $transactions with the SAME event: one creates, one replays, one row", async () => {
    const input = inputs(U2, 1450).unit_completed;
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => repo.appendValidated(input, tx)),
      prisma.$transaction((tx) => repo.appendValidated(input, tx)),
    ]);
    expect([a, b].map((r) => r.created).sort()).toEqual([false, true]);
    expect([a, b].map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(a.record.id).toBe(b.record.id);
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it("two concurrent $transactions with CONFLICTING payloads: one creates, one typed conflict, one row", async () => {
    const input = inputs(U2, 1500).guide_session_completed;
    const drifted: ValidatedLearningEvent<"guide_session_completed"> = {
      ...input,
      payload: { ...input.payload, stepsCompleted: 9 },
    };
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => repo.appendValidated(input, tx)),
      prisma.$transaction((tx) => repo.appendValidated(drifted, tx)),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      LearningEventIdempotencyConflictError,
    );
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: input.idempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ── (20) non-V1 kinds cannot enter the typed repository ──────────────────
  it("a smuggled non-V1 type never inserts a row", async () => {
    const smuggled = {
      ...inputs(U2, 1550).unit_opened,
      type: "resonance_confirmed",
    } as unknown as ValidatedLearningEvent;
    await expect(repo.appendValidated(smuggled)).rejects.toBeInstanceOf(
      LearningEventInvalidInputError,
    );
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: smuggled.idempotencyKey },
    });
    expect(count).toBe(0);
  });

  // ── §4 — fail-closed idempotency-key canonicalization ────────────────────
  it("an uppercase key creates a LOWERCASE row (canonical storage)", async () => {
    const canonical = key(1600);
    const input: ValidatedLearningEvent<"unit_opened"> = {
      userId: U2,
      idempotencyKey: canonical.toUpperCase(),
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-c" },
    };
    const res = await repo.appendValidated(input);
    expect(res.created).toBe(true);
    const row = await prisma.learningEvent.findUnique({
      where: {
        userId_idempotencyKey: { userId: U2, idempotencyKey: canonical },
      },
    });
    expect(row?.idempotencyKey).toBe(canonical);
    // The caller's object is never mutated:
    expect(input.idempotencyKey).toBe(canonical.toUpperCase());
  });

  it("lowercase replay after an uppercase create returns the SAME row", async () => {
    const canonical = key(1650);
    const base: ValidatedLearningEvent<"unit_opened"> = {
      userId: U2,
      idempotencyKey: canonical.toUpperCase(),
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-d" },
    };
    const first = await repo.appendValidated(base);
    const replay = await repo.appendValidated({
      ...base,
      idempotencyKey: canonical,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.record.id).toBe(first.record.id);
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: canonical },
    });
    expect(count).toBe(1);
  });

  it("uppercase replay after a lowercase create returns the SAME row (no case bypass)", async () => {
    const canonical = key(1700);
    const base: ValidatedLearningEvent<"unit_opened"> = {
      userId: U2,
      idempotencyKey: canonical,
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-e" },
    };
    const first = await repo.appendValidated(base);
    const replay = await repo.appendValidated({
      ...base,
      idempotencyKey: canonical.toUpperCase(),
    });
    expect(replay.replayed).toBe(true);
    expect(replay.record.id).toBe(first.record.id);
    const count = await prisma.learningEvent.count({
      where: { userId: U2, idempotencyKey: canonical },
    });
    expect(count).toBe(1);
  });

  it("invalid keys fail closed with ZERO rows created", async () => {
    const before = await prisma.learningEvent.count({ where: { userId: U2 } });
    for (const bad of ["not-a-uuid", `${key(1750)} `, `un valor arbitrario`]) {
      const input: ValidatedLearningEvent<"unit_opened"> = {
        userId: U2,
        idempotencyKey: bad,
        type: "unit_opened",
        payload: { editionKey: "libro-1e", unitKey: "unit-f" },
      };
      await expect(repo.appendValidated(input), bad).rejects.toBeInstanceOf(
        LearningEventInvalidInputError,
      );
    }
    const after = await prisma.learningEvent.count({ where: { userId: U2 } });
    expect(after).toBe(before);
  });

  // ── §5 — a real failed constraint surfaces ONLY the sanitized error ──────
  it("a real FK violation surfaces only LearningEventStorageError, value-free", async () => {
    const input: ValidatedLearningEvent<"unit_opened"> = {
      userId: "u-cc72-does-not-exist",
      idempotencyKey: key(1800),
      type: "unit_opened",
      payload: { editionKey: "libro-1e", unitKey: "unit-g" },
    };
    const err = await repo.appendValidated(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LearningEventStorageError);
    for (const surface of [
      (err as Error).message,
      JSON.stringify(err),
      String(err),
    ]) {
      expect(surface).not.toContain("u-cc72-does-not-exist");
      expect(surface).not.toContain("libro-1e");
      expect(surface).not.toContain(input.idempotencyKey);
      expect(surface).not.toContain("Prisma");
      expect(surface).not.toContain("postgres");
    }
    expect((err as Error & { cause?: unknown }).cause).toBeUndefined();
    const count = await prisma.learningEvent.count({
      where: { userId: input.userId },
    });
    expect(count).toBe(0);
  });
});
