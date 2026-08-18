import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GUIDE_START_LOCK_PROTOCOL,
  readGuideActiveCapability,
} from "./guide-active-capability";

/**
 * C.0B2 — the semantic cutover, and the rollback asymmetry it creates.
 *
 * This is the phase where the product actually changes: retiring the global
 * index means a user may hold several ACTIVE sessions at once, one per
 * `guideKey`. Everything before this was preparation.
 *
 * The suite runs the FULL chain through `prisma migrate deploy`, which is also
 * what proves Prisma tolerates both concurrent forms — `CREATE INDEX
 * CONCURRENTLY` in C.0B1 and `DROP INDEX CONCURRENTLY` here. Neither may run
 * inside an explicit transaction, so if Prisma wrapped migrations the boot
 * would fail with 25001 and this file would never reach its first assertion.
 *
 * The rollback tests are the reason this phase is not symmetric with C.0B1.
 * They demonstrate, rather than assert in prose, that recreating the global
 * index is possible while no user has two ACTIVE lineages and impossible the
 * moment one does.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "c0b2_retire_global_db";
const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
const C0B2 = "20260818010000_c0b2_retire_global_active_index";
const GLOBAL_IX = "GuideSession_one_active_per_user";
const LINEAGE_IX = "GuideSession_one_active_per_lineage";

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

const c0b2Sql = (): string =>
  readFileSync(join(MIGRATIONS_DIR, C0B2, "migration.sql"), "utf8");

const statements = (sql: string): string =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

suite("C.0B2 · retiring the global index is the cutover", () => {
  let pool: Pool;
  let prisma: PrismaClient;

  const capability = () =>
    prisma.$transaction((tx) => readGuideActiveCapability(tx));

  const indexNames = async (): Promise<string[]> => {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT ic.relname FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE i.indrelid = 'public."GuideSession"'::regclass
          AND i.indpred IS NOT NULL
        ORDER BY ic.relname`,
    );
    return rows.map((r) => r.relname);
  };

  const insertSession = (
    id: string,
    userId: string,
    guideKey: string,
    guideVersion = 1,
    status = "ACTIVE",
  ) =>
    pool.query(
      `INSERT INTO "GuideSession"
         ("id","userId","guideKey","guideVersion","status","stepsCompleted","totalSteps","currentStepKey")
       VALUES ($1,$2,$3,$4,$5::"GuideSessionStatus",0,3,'paso-1')`,
      [id, userId, guideKey, guideVersion, status],
    );

  const clearSessions = () => pool.query(`DELETE FROM "GuideSession"`);

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    // The FULL chain, through Prisma. Both concurrent statements run here.
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.user.createMany({
      data: [
        { id: "u-b2", email: "b2@test.local", name: "B2" },
        { id: "u-b2-roll", email: "b2roll@test.local", name: "B2 Roll" },
      ],
    });
  }, 240_000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* the database drop below is what matters */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 240_000);

  // ── The shipped statement ────────────────────────────────────────────────

  it("drops CONCURRENTLY, names only the global index, and adds nothing", () => {
    const ddl = statements(c0b2Sql());
    expect(ddl).toMatch(/DROP INDEX CONCURRENTLY/);
    expect(ddl).toContain(`"${GLOBAL_IX}"`);
    // The lineage index must survive: dropping both would leave the table with
    // NO ACTIVE invariant, and the detector would fail closed for everyone.
    expect(ddl).not.toContain(LINEAGE_IX);
    expect(ddl).not.toMatch(/CREATE\s+/i);
    expect(ddl).not.toMatch(/ALTER\s+TABLE/i);
    // No IF EXISTS — a missing index means something we did not author ran.
    expect(ddl).not.toMatch(/IF EXISTS/i);
    expect(ddl.split(";").filter((s) => s.trim().length > 0)).toHaveLength(1);
  });

  it("changes no runtime lock — that is C.0B3", () => {
    expect(GUIDE_START_LOCK_PROTOCOL).toBe("dual-v1");
  });

  // ── The state after the full chain ───────────────────────────────────────

  it("leaves exactly the lineage index on the table", async () => {
    expect(await indexNames()).toEqual([LINEAGE_IX]);
  });

  it("moves the authority to LINEAGE without degrading", async () => {
    const cap = await capability();
    expect(cap.effectiveMode).toBe("LINEAGE");
    expect(cap.globalHealth).toBe("ABSENT");
    expect(cap.lineageHealth).toBe("HEALTHY");
    expect(cap.degraded).toBe(false);
  });

  // ── What the product may now do, and may still not ───────────────────────

  it("allows several ACTIVE sessions for DIFFERENT guideKeys", async () => {
    await clearSessions();
    await insertSession("gs-b2-a", "u-b2", "guia-a");
    await expect(
      insertSession("gs-b2-b", "u-b2", "guia-b"),
    ).resolves.toBeDefined();
    await expect(
      insertSession("gs-b2-c", "u-b2", "guia-c"),
    ).resolves.toBeDefined();
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "GuideSession"
        WHERE "userId" = 'u-b2' AND "status" = 'ACTIVE'`,
    );
    expect(rows[0]?.n).toBe("3");
  });

  it("still refuses a second ACTIVE session of the SAME guideKey", async () => {
    await clearSessions();
    await insertSession("gs-b2-same", "u-b2", "guia-a");
    await expect(
      insertSession("gs-b2-same2", "u-b2", "guia-a"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("still refuses X@v2 while X@v1 is ACTIVE", async () => {
    // The version bump is not an escape hatch: the lineage index keys on
    // `guideKey`, so one curated intervention has one live session.
    await clearSessions();
    await insertSession("gs-b2-v1", "u-b2", "guia-x", 1);
    await expect(
      insertSession("gs-b2-v2", "u-b2", "guia-x", 2),
    ).rejects.toMatchObject({ code: "23505" });
  });

  // ── The rollback asymmetry, demonstrated ─────────────────────────────────

  it("can be undone while nobody holds two ACTIVE lineages", async () => {
    await clearSessions();
    await insertSession("gs-b2-r1", "u-b2-roll", "guia-a");
    await expect(
      pool.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "${GLOBAL_IX}" ON "GuideSession"("userId") WHERE "status" = 'ACTIVE'`,
      ),
    ).resolves.toBeDefined();
    const cap = await capability();
    expect(cap.effectiveMode).toBe("GLOBAL");
    await pool.query(`DROP INDEX CONCURRENTLY "${GLOBAL_IX}"`);
  });

  it("cannot be undone once legitimate multi-ACTIVE rows exist", async () => {
    // The heart of the asymmetry. These two rows are not corruption — after
    // C.0B2 they are exactly what the product promises — and the index that
    // would roll the migration back is the one they violate. Undoing this
    // means CLOSING somebody's session, which is a product decision, so the
    // recovery path is human reconciliation, never an automatic cancel.
    await clearSessions();
    await insertSession("gs-b2-m1", "u-b2-roll", "guia-a");
    await insertSession("gs-b2-m2", "u-b2-roll", "guia-b");

    await expect(
      pool.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "${GLOBAL_IX}" ON "GuideSession"("userId") WHERE "status" = 'ACTIVE'`,
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // And the failed build leaves an INVALID index behind — a real state an
    // operator will find, not a transient. The authority must not move because
    // of it, and the capability must say so out loud.
    const { rows } = await pool.query<{ indisvalid: boolean }>(
      `SELECT i.indisvalid FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE ic.relname = '${GLOBAL_IX}'`,
    );
    expect(rows[0]?.indisvalid).toBe(false);

    const cap = await capability();
    expect(cap.effectiveMode).toBe("LINEAGE");
    expect(cap.globalHealth).toBe("INVALID_OR_NOT_READY");
    expect(cap.lineageHealth).toBe("HEALTHY");
    expect(cap.degraded).toBe(true);

    // Cleanup is the documented recovery: drop the invalid leftover.
    await pool.query(`DROP INDEX CONCURRENTLY "${GLOBAL_IX}"`);
    expect(await indexNames()).toEqual([LINEAGE_IX]);
  });

  it("fails closed when the lineage index is ABSENT", async () => {
    // With no global index left there is no stricter rule to fall back on, so
    // a missing lineage index leaves no authority at all. This is the ABSENT
    // case — named as such, because the INVALID one below behaves differently
    // and conflating them overstates what either proves.
    await clearSessions();
    await pool.query(`DROP INDEX CONCURRENTLY "${LINEAGE_IX}"`);
    const cap = await capability();
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    expect(cap.globalHealth).toBe("ABSENT");
    expect(cap.lineageHealth).toBe("ABSENT");

    // Restore the world for any later test in this file.
    await pool.query(
      `CREATE UNIQUE INDEX CONCURRENTLY "${LINEAGE_IX}" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`,
    );
    expect((await capability()).effectiveMode).toBe("LINEAGE");
  });

  it("fails closed on an INVALID lineage index — really invalid, not absent", async () => {
    // A failed `CREATE UNIQUE INDEX CONCURRENTLY` leaves the half-built index
    // BEHIND, valid=false and ready=false. That is a state an operator finds
    // in production, and it is NOT the same as the index being gone: the row
    // exists, `pg_indexes` lists it, and anything deciding by name would call
    // the world healthy.
    //
    // Reaching it takes real conflicting data, which is why this test builds
    // the duplicate rows rather than describing them.
    await clearSessions();
    await pool.query(`DROP INDEX CONCURRENTLY "${LINEAGE_IX}"`);
    await insertSession("gs-b2-dup1", "u-b2-roll", "guia-dup", 1);
    await insertSession("gs-b2-dup2", "u-b2-roll", "guia-dup", 2);

    await expect(
      pool.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "${LINEAGE_IX}" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`,
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const { rows } = await pool.query<{
      indisvalid: boolean;
      indisready: boolean;
      indislive: boolean;
    }>(
      `SELECT i.indisvalid, i.indisready, i.indislive FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE ic.relname = '${LINEAGE_IX}'`,
    );
    // Present, and unusable. Both halves matter.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indisvalid).toBe(false);

    const cap = await capability();
    expect(cap.globalHealth).toBe("ABSENT");
    expect(cap.lineageHealth).toBe("INVALID_OR_NOT_READY");
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    // Deliberate: `degraded` means service CONTINUES under a healthy
    // authority. Nothing continues here, so flagging it degraded would
    // describe a running system that is not running.
    expect(cap.degraded).toBe(false);

    // Documented recovery: clear the conflict, drop the leftover, rebuild.
    await clearSessions();
    await pool.query(`DROP INDEX CONCURRENTLY "${LINEAGE_IX}"`);
    await pool.query(
      `CREATE UNIQUE INDEX CONCURRENTLY "${LINEAGE_IX}" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`,
    );
    const back = await capability();
    expect(back.effectiveMode).toBe("LINEAGE");
    expect(back.lineageHealth).toBe("HEALTHY");
    expect(back.degraded).toBe(false);
  });
});
