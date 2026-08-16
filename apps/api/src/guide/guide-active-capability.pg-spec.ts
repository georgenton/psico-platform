import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGuideActiveCapability } from "./guide-active-capability";

/**
 * C.0A — the capability detector against REAL PostgreSQL, and the uniqueness
 * semantics of the index it is detecting.
 *
 * A unit test can only prove the classification of shapes we hand it. What it
 * cannot prove is that those shapes are what `pg_index` actually returns for
 * the migration we ship — and that gap is not academic. The predicate renders
 * as `'ACTIVE'::"GuideSessionStatus"` because the column is an enum, so a
 * check written against a `text` column passes every unit test and classifies
 * production as unknown, taking START down for everyone.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "c0a_capability_db";
const API_DIR = process.cwd();

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

const GLOBAL_IX = "GuideSession_one_active_per_user";
/** The C.0B1 shape. ADR 0022 §2 — no `guideVersion`. */
const LINEAGE_DDL = `CREATE UNIQUE INDEX "c0a_lineage" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`;
/** The shape that must NEVER be accepted as lineage authority. */
const TRIPLE_DDL = `CREATE UNIQUE INDEX "c0a_triple" ON "GuideSession"("userId","guideKey","guideVersion") WHERE "status" = 'ACTIVE'`;

const U = "u-c0a";

suite("C.0A · ACTIVE capability against real PostgreSQL", () => {
  let pool: Pool;
  let prisma: PrismaClient;

  /** Read the capability the way production does: inside a transaction. */
  const capability = () =>
    prisma.$transaction((tx) => readGuideActiveCapability(tx));

  const insertSession = (
    id: string,
    guideKey: string,
    guideVersion: number,
    status = "ACTIVE",
  ) =>
    pool.query(
      `INSERT INTO "GuideSession"
         ("id","userId","guideKey","guideVersion","status","stepsCompleted","totalSteps","currentStepKey")
       VALUES ($1,$2,$3,$4,$5::"GuideSessionStatus",0,3,'paso-1')`,
      [id, U, guideKey, guideVersion, status],
    );

  /** Drop every partial index on the table, so each test states its own world. */
  const resetIndexes = async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT ic.relname FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE i.indrelid = 'public."GuideSession"'::regclass
          AND i.indpred IS NOT NULL`,
    );
    for (const r of rows) await pool.query(`DROP INDEX "${r.relname}"`);
  };

  const createGlobal = () =>
    pool.query(
      `CREATE UNIQUE INDEX "${GLOBAL_IX}" ON "GuideSession"("userId") WHERE "status" = 'ACTIVE'`,
    );

  const clearSessions = () => pool.query(`DELETE FROM "GuideSession"`);

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
    await prisma.user.createMany({
      data: [{ id: U, email: "c0a@test.local", name: "C0A" }],
    });
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── The four schema states, walked in deployment order ───────────────────

  it("classifies the SHIPPED schema as GLOBAL", async () => {
    // The migration chain as it exists on main. If this ever fails, the
    // detector and the migration have drifted and production would fail
    // closed — which is exactly the outage this file exists to prevent.
    const cap = await capability();
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.globalHealth).toBe("HEALTHY");
    expect(cap.lineageHealth).toBe("ABSENT");
    expect(cap.degraded).toBe(false);
  });

  it("keeps GLOBAL authority once the lineage index exists (C.0B1)", async () => {
    await resetIndexes();
    await createGlobal();
    await pool.query(LINEAGE_DDL);
    const cap = await capability();
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.lineageHealth).toBe("HEALTHY");
  });

  it("becomes LINEAGE when the global index is removed (C.0B2)", async () => {
    await resetIndexes();
    await pool.query(LINEAGE_DDL);
    const cap = await capability();
    expect(cap.effectiveMode).toBe("LINEAGE");
    expect(cap.globalHealth).toBe("ABSENT");
  });

  // ── The uniqueness the lineage index actually enforces ────────────────────

  it("X@v1 blocks a second X@v1", async () => {
    await resetIndexes();
    await clearSessions();
    await pool.query(LINEAGE_DDL);
    await insertSession("gs-x1", "guia-x", 1);
    await expect(insertSession("gs-x1b", "guia-x", 1)).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("X@v1 ACTIVE blocks X@v2 from also being ACTIVE", async () => {
    // The invariant a `(userId, guideKey, guideVersion)` index would silently
    // break: two versions of ONE curated intervention would both be live, and
    // the reader would have no way to tell which one counts.
    await expect(insertSession("gs-x2", "guia-x", 2)).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("a different lineage may be ACTIVE at the same time", async () => {
    await expect(insertSession("gs-y1", "guia-y", 1)).resolves.toBeDefined();
  });

  it("X@v2 fits once X@v1 is no longer ACTIVE", async () => {
    await pool.query(
      `UPDATE "GuideSession" SET "status"='CANCELLED'::"GuideSessionStatus", "cancelledAt"=now(), "currentStepKey"=NULL WHERE "id"='gs-x1'`,
    );
    await expect(insertSession("gs-x2b", "guia-x", 2)).resolves.toBeDefined();
  });

  // ── What must never be mistaken for lineage authority ────────────────────

  it("the by-version triple is not accepted as LINEAGE", async () => {
    await resetIndexes();
    await pool.query(TRIPLE_DDL);
    const cap = await capability();
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    expect(cap.lineageHealth).not.toBe("HEALTHY");
  });

  it("an index named like ours but shaped differently is not ours", async () => {
    // Detection reads structure, never a name.
    await resetIndexes();
    await clearSessions();
    await pool.query(
      `CREATE UNIQUE INDEX "${GLOBAL_IX}" ON "GuideSession"("guideKey") WHERE "status" = 'ACTIVE'`,
    );
    const cap = await capability();
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("an INVALID lineage index leaves a healthy global serving, degraded", async () => {
    // A failed `CREATE INDEX CONCURRENTLY` leaves the invalid index BEHIND, so
    // this is not a transient. If an unhealthy index poisoned the verdict, one
    // failed build would take START down until somebody dropped it by hand.
    //
    // Reaching the state takes care: `(userId, guideKey)` is a superset of
    // `(userId)`, so no data can satisfy the global index and violate the
    // lineage one at the same time. The duplicate that fails the build has to
    // exist while the global index does NOT, and is cleared before it returns.
    await resetIndexes();
    await clearSessions();
    await insertSession("gs-bad1", "guia-x", 1);
    await insertSession("gs-bad2", "guia-x", 2);
    await expect(
      pool.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "c0a_bad" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`,
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const left = await pool.query<{ indisvalid: boolean; indisready: boolean }>(
      `SELECT i.indisvalid, i.indisready FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE ic.relname = 'c0a_bad'`,
    );
    expect(left.rows[0]?.indisvalid).toBe(false);

    // Now make the data legal for the global index and bring it back.
    await pool.query(
      `UPDATE "GuideSession" SET "status"='CANCELLED'::"GuideSessionStatus", "cancelledAt"=now(), "currentStepKey"=NULL WHERE "id"='gs-bad2'`,
    );
    await createGlobal();

    const cap = await capability();
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.globalHealth).toBe("HEALTHY");
    expect(cap.lineageHealth).toBe("INVALID_OR_NOT_READY");
    expect(cap.degraded).toBe(true);
  });

  // ── Independence from the session's search_path ──────────────────────────

  it("classifies correctly under an alternative search_path", async () => {
    // Two things depend on the session's path, and both are why this test
    // exists: an unqualified table name would resolve somewhere else
    // entirely, and `pg_get_expr` schema-qualifies the enum when `public` is
    // off the path. The detector pins the table by OID and accepts both
    // renderings, so neither can move the verdict.
    await resetIndexes();
    await clearSessions();
    await createGlobal();
    await pool.query(`CREATE SCHEMA IF NOT EXISTS c0a_otro`);

    const scoped = new Pool({
      connectionString: withDatabase(base as string, DB),
      options: "-c search_path=c0a_otro",
    });
    const scopedPrisma = new PrismaClient({ adapter: new PrismaPg(scoped) });
    try {
      const rendered = await scoped.query<{ predicate: string }>(
        `SELECT pg_get_expr(i.indpred, i.indrelid) AS predicate
           FROM pg_index i
          WHERE i.indrelid = 'public."GuideSession"'::regclass
            AND i.indpred IS NOT NULL
          LIMIT 1`,
      );
      // Proof this exercises the OTHER rendering rather than the default one.
      expect(rendered.rows[0]?.predicate).toContain(
        'public."GuideSessionStatus"',
      );

      const cap = await scopedPrisma.$transaction((tx) =>
        readGuideActiveCapability(tx),
      );
      expect(cap.effectiveMode).toBe("GLOBAL");
      expect(cap.globalHealth).toBe("HEALTHY");
    } finally {
      await scopedPrisma.$disconnect();
      await scoped.end();
    }
  });
});
