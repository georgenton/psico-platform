import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGuideActiveCapability } from "./guide-active-capability";

/**
 * C.0B1 — the lineage index, proved from the SQL we actually ship.
 *
 * Every assertion below runs against the REAL `migration.sql`, read off disk.
 * A spec that retypes the DDL proves that the retyped DDL behaves, which is
 * the one claim nobody needs: the whole risk of this phase is that the shipped
 * statement and the detector disagree, and a copy cannot see that.
 *
 * The name is never evidence. `pg_index` is asked for structure — uniqueness,
 * validity, key count, column order, the rendered predicate, the absence of
 * INCLUDE and expressions — because an index called the right thing with the
 * wrong columns is exactly the failure mode the detector was built to refuse.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "c0b1_lineage_index_db";
const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
const C0B1 = "20260818000000_c0b1_lineage_active_index";
const GLOBAL_IX = "GuideSession_one_active_per_user";
const LINEAGE_IX = "GuideSession_one_active_per_lineage";

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

const c0b1Sql = (): string =>
  readFileSync(join(MIGRATIONS_DIR, C0B1, "migration.sql"), "utf8");

interface IndexFacts {
  indisunique: boolean;
  indisvalid: boolean;
  indisready: boolean;
  indislive: boolean;
  indnatts: number;
  indnkeyatts: number;
  has_expressions: boolean;
  amname: string;
  cols: string[];
  predicate: string;
}

suite("C.0B1 · the lineage ACTIVE index, from the shipped migration", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let url: string;

  const facts = async (name: string): Promise<IndexFacts | null> => {
    const { rows } = await pool.query<IndexFacts>(
      `SELECT
         i.indisunique, i.indisvalid, i.indisready, i.indislive,
         i.indnatts, i.indnkeyatts,
         (i.indexprs IS NOT NULL) AS has_expressions,
         am.amname,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS cols,
         pg_get_expr(i.indpred, i.indrelid) AS predicate
       FROM pg_index i
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_am am ON am.oid = ic.relam
      WHERE i.indrelid = 'public."GuideSession"'::regclass
        AND ic.relname = $1`,
      [name],
    );
    return rows[0] ?? null;
  };

  const insertSession = (
    id: string,
    userId: string,
    guideKey: string,
    guideVersion: number,
    status = "ACTIVE",
  ) =>
    pool.query(
      `INSERT INTO "GuideSession"
         ("id","userId","guideKey","guideVersion","status","stepsCompleted","totalSteps","currentStepKey")
       VALUES ($1,$2,$3,$4,$5::"GuideSessionStatus",0,3,'paso-1')`,
      [id, userId, guideKey, guideVersion, status],
    );

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    url = withDatabase(base as string, DB);
    // The chain UP TO AND INCLUDING C.0B1 — not the whole thing.
    //
    // C.0B2 retires the global index, so a full `migrate deploy` would land
    // this suite in the world of a LATER phase and every assertion about the
    // C.0B1 intermediate state would quietly become untestable. The phase this
    // file describes is the one where BOTH indexes exist, so it builds exactly
    // that world by applying the real migration.sql files in order and
    // stopping.
    //
    // Prisma compatibility with `CREATE INDEX CONCURRENTLY` is proved in the
    // C.0B2 spec, which does run `prisma migrate deploy` over the full chain.
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(dirs).toContain(C0B1);
    const bootstrap = new Pool({ connectionString: url });
    try {
      for (const dir of dirs) {
        await bootstrap.query(
          readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"),
        );
        if (dir === C0B1) break;
      }
    } finally {
      await bootstrap.end();
    }

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.user.createMany({
      data: [
        { id: "u-b1", email: "b1@test.local", name: "B1" },
        { id: "u-b1-otro", email: "b1otro@test.local", name: "B1 Otro" },
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

  // ── The shipped statement itself ─────────────────────────────────────────

  it("ships CONCURRENTLY, without IF NOT EXISTS, INCLUDE or expressions", () => {
    const sql = c0b1Sql();
    const ddl = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(ddl).toMatch(/CREATE UNIQUE INDEX CONCURRENTLY/);
    expect(ddl).not.toMatch(/IF NOT EXISTS/i);
    expect(ddl).not.toMatch(/\bINCLUDE\b/i);
    // `guideVersion` must not appear in the DDL at all — a comment may discuss
    // it, the statement may not carry it.
    expect(ddl).not.toMatch(/guideVersion/);
    // Exactly one statement: a second one could smuggle anything past review.
    expect(ddl.split(";").filter((s) => s.trim().length > 0)).toHaveLength(1);
  });

  it("does not drop or alter the global index", () => {
    const sql = c0b1Sql();
    expect(sql).not.toMatch(/DROP\s+INDEX/i);
    expect(sql).not.toMatch(/ALTER\s+INDEX/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
  });

  // ── What PostgreSQL actually built ───────────────────────────────────────

  it("built a HEALTHY unique partial btree with the exact key columns", async () => {
    const f = await facts(LINEAGE_IX);
    expect(
      f,
      "the lineage index must exist after migrate deploy",
    ).not.toBeNull();
    const ix = f as IndexFacts;
    expect(ix.indisunique).toBe(true);
    expect(ix.indisvalid).toBe(true);
    expect(ix.indisready).toBe(true);
    expect(ix.indislive).toBe(true);
    expect(ix.amname).toBe("btree");
    // No INCLUDE columns: payload columns would make these two diverge.
    expect(ix.indnatts).toBe(ix.indnkeyatts);
    expect(ix.indnkeyatts).toBe(2);
    expect(ix.has_expressions).toBe(false);
    // Order matters — (guideKey, userId) is a different index.
    expect(ix.cols).toEqual(["userId", "guideKey"]);
  });

  it("renders EXACTLY the predicate the detector accepts", async () => {
    const ix = (await facts(LINEAGE_IX)) as IndexFacts;
    // Not a substring match: a partially-coinciding predicate — say one that
    // also allowed COMPLETED — would pass `toContain("ACTIVE")` while enforcing
    // something else entirely.
    const normalized = ix.predicate.replace(/^\((.*)\)$/, "$1").trim();
    expect(normalized).toBe(`status = 'ACTIVE'::"GuideSessionStatus"`);
  });

  it("leaves the global index untouched and healthy", async () => {
    const g = (await facts(GLOBAL_IX)) as IndexFacts;
    expect(g).not.toBeNull();
    expect(g.indisunique).toBe(true);
    expect(g.indisvalid).toBe(true);
    expect(g.cols).toEqual(["userId"]);
  });

  it("adds no third partial index to the table", async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT ic.relname FROM pg_index i
         JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE i.indrelid = 'public."GuideSession"'::regclass
          AND i.indpred IS NOT NULL
        ORDER BY ic.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([LINEAGE_IX, GLOBAL_IX]);
  });

  // ── The authority does NOT move in this phase ────────────────────────────

  it("keeps GLOBAL authority with both indexes healthy", async () => {
    const cap = await prisma.$transaction((tx) =>
      readGuideActiveCapability(tx),
    );
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.globalHealth).toBe("HEALTHY");
    expect(cap.lineageHealth).toBe("HEALTHY");
    expect(cap.degraded).toBe(false);
  });

  it("still refuses a second ACTIVE session for a DIFFERENT lineage", async () => {
    // The behavioural statement of "C.0B1 changes nothing visible": the global
    // index is still enforcing, so multi-ACTIVE stays impossible until C.0B2.
    await pool.query(`DELETE FROM "GuideSession" WHERE "userId" = 'u-b1'`);
    await insertSession("gs-b1-a", "u-b1", "guia-a", 1);
    await expect(
      insertSession("gs-b1-b", "u-b1", "guia-b", 1),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces the lineage rule too — X@v1 blocks X@v2", async () => {
    // Both indexes are live; this one is refused by the lineage index, and
    // would be refused by the global one as well. What matters is that the new
    // index cannot be satisfied by a version bump.
    await pool.query(`DELETE FROM "GuideSession" WHERE "userId" = 'u-b1-otro'`);
    await insertSession("gs-b1-v1", "u-b1-otro", "guia-x", 1);
    await expect(
      insertSession("gs-b1-v2", "u-b1-otro", "guia-x", 2),
    ).rejects.toMatchObject({ code: "23505" });
  });

  // ── Re-running is not silently fine ──────────────────────────────────────

  it("re-applying the statement fails loudly instead of no-opping", async () => {
    // This is what `IF NOT EXISTS` would have hidden. A rerun must collide, so
    // a half-finished migration cannot be "fixed" by running it again.
    await expect(
      pool.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "${LINEAGE_IX}" ON "GuideSession"("userId","guideKey") WHERE "status" = 'ACTIVE'`,
      ),
    ).rejects.toMatchObject({ code: "42P07" });
  });
});
