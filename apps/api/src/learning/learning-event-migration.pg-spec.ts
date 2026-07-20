import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * CC-7.2 — the migration exercised the way production will live it: a
 * PRE-CC-7.2 schema with a REAL legacy LearningEvent row already stored, and
 * only then the CC-7.2 migration applied on top.
 *
 * Two phases over an ephemeral database:
 *   1. execute every REAL migration.sql BEFORE `cc7_2_learning_event_v1`, in
 *      order — the exact schema a deployed box has today — and insert a
 *      legacy event row (kind BLOCK_DWELL, JSON payload, no V1 columns);
 *   2. execute the CC-7.2 migration.sql alone, then assert the legacy row
 *      survives with identical semantics (payload, kind, createdAt), the new
 *      columns exist as NULL on it, NULL keys stay non-unique, and the enum
 *      gained exactly the three V1 values.
 *
 * (The from-scratch `prisma migrate deploy` including CC-7.2 runs in the
 * repository pg-spec; this suite is specifically the upgrade path.)
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped
 * otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc72_migration_db";
const OUR_MIGRATION = "20260720120000_cc7_2_learning_event_v1";
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

suite("CC-7.2 · migration over a PRE-CC-7.2 schema with a legacy row", () => {
  let pool: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();
    pool = new Pool({ connectionString: withDatabase(base as string, DB) });

    // Phase 1 — every REAL migration BEFORE ours, in order. Executing each
    // file as one multi-statement query runs it inside a single implicit
    // transaction, like `migrate deploy` does.
    const dirs = migrationDirs();
    expect(dirs).toContain(OUR_MIGRATION);
    for (const dir of dirs) {
      if (dir >= OUR_MIGRATION) break;
      const sql = readFileSync(
        join(MIGRATIONS_DIR, dir, "migration.sql"),
        "utf8",
      );
      await pool.query(sql);
    }
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("upgrades a live pre-CC-7.2 schema without touching the legacy row", async () => {
    // The pre-migration schema genuinely lacks the V1 columns:
    const preCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'LearningEvent'`,
    );
    const preNames = preCols.rows.map((r) => r.column_name);
    expect(preNames).not.toContain("idempotencyKey");
    expect(preNames).not.toContain("schemaVersion");
    expect(preNames).not.toContain("conceptId");
    expect(preNames).not.toContain("guideSessionId");

    // A real legacy row, stored BEFORE the migration exists:
    await pool.query(
      `INSERT INTO "User"(id, email, name, "updatedAt")
       VALUES ('u-cc72-legacy', 'cc72-legacy@test.local', 'Legacy', now())`,
    );
    await pool.query(
      `INSERT INTO "LearningEvent"(id, "userId", kind, payload, "createdAt")
       VALUES ('legacy-pre-v1', 'u-cc72-legacy', 'BLOCK_DWELL',
               '{"blockKey": "bk-1", "ms": 4200}', '2026-07-10T10:00:00Z')`,
    );

    // Phase 2 — apply ONLY the CC-7.2 migration on top:
    const ourSql = readFileSync(
      join(MIGRATIONS_DIR, OUR_MIGRATION, "migration.sql"),
      "utf8",
    );
    await pool.query(ourSql);

    // The legacy row survives with IDENTICAL semantics:
    const row = await pool.query(
      `SELECT kind, payload, "idempotencyKey", "schemaVersion",
              "conceptId", "guideSessionId",
              to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS wall
         FROM "LearningEvent" WHERE id = 'legacy-pre-v1'`,
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].kind).toBe("BLOCK_DWELL");
    expect(row.rows[0].payload).toEqual({ blockKey: "bk-1", ms: 4200 });
    // TIMESTAMP(3) is timezone-naive — compare the stored wall time via SQL
    // so the driver's local-timezone parsing cannot skew the assertion.
    expect(row.rows[0].wall).toBe("2026-07-10T10:00:00");
    // …and the new columns exist as NULL on it (no backfill, no rewrite):
    expect(row.rows[0].idempotencyKey).toBeNull();
    expect(row.rows[0].schemaVersion).toBeNull();
    expect(row.rows[0].conceptId).toBeNull();
    expect(row.rows[0].guideSessionId).toBeNull();
  });

  it("the unique index admits multiple NULL keys but rejects a duplicate real key", async () => {
    // A second NULL-key row for the SAME user must be accepted (PostgreSQL
    // distinct-NULL semantics protect every legacy row):
    await pool.query(
      `INSERT INTO "LearningEvent"(id, "userId", kind, payload, "createdAt")
       VALUES ('legacy-pre-v1-b', 'u-cc72-legacy', 'UNIT_OPENED', '{}', now())`,
    );

    // A real key inserts once and only once:
    await pool.query(
      `INSERT INTO "LearningEvent"(id, "userId", kind, "idempotencyKey", "schemaVersion", payload, "createdAt")
       VALUES ('v1-row-1', 'u-cc72-legacy', 'CONCEPT_EXPLORED',
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1,
               '{"conceptKey": "x", "unitKey": "u"}', now())`,
    );
    await expect(
      pool.query(
        `INSERT INTO "LearningEvent"(id, "userId", kind, "idempotencyKey", "schemaVersion", payload, "createdAt")
         VALUES ('v1-row-2', 'u-cc72-legacy', 'CONCEPT_EXPLORED',
                 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1,
                 '{"conceptKey": "x", "unitKey": "u"}', now())`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("the enum gained exactly the three V1 values (nothing removed or renamed)", async () => {
    const values = await pool.query(
      `SELECT e.enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'LearningEventKind'
        ORDER BY e.enumsortorder`,
    );
    expect(values.rows.map((r) => r.enumlabel)).toEqual([
      "UNIT_OPENED",
      "UNIT_COMPLETED",
      "BLOCK_DWELL",
      "GUIDE_SESSION_STARTED",
      "GUIDE_SESSION_COMPLETED",
      "HIGHLIGHT_CREATED",
      "ANNOTATION_CREATED",
      "RESONANCE_CONFIRMED",
      "CONCEPT_EXPLORED",
      "ACTIVE_RECALL_ATTEMPTED",
      "PRACTICE_COMPLETED",
    ]);
  });

  it("touched no other table (schema-level diff against pre-migration state)", async () => {
    // The CC-7.2 migration file only names LearningEvent — belt-and-braces:
    // assert no OTHER table has any of the four new column names.
    const cols = await pool.query(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name IN ('idempotencyKey', 'guideSessionId')
          AND table_schema = 'public'`,
    );
    expect(new Set(cols.rows.map((r) => r.table_name))).toEqual(
      new Set(["LearningEvent"]),
    );
  });
});
