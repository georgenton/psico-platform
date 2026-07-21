import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * CC-7.4B — the migration exercised the way production will live it: a
 * PRE-CC-7.4B schema with REAL prior rows (users, a legacy LearningEvent, a
 * V1 LearningEvent, content), and only then the CC-7.4B migration applied on
 * top. Two phases over an ephemeral database:
 *
 *   1. every REAL migration.sql BEFORE `cc7_4b_guide_catalog_ledger`, in
 *      order, then the fixture rows;
 *   2. the CC-7.4B migration.sql ALONE — then assert: prior rows intact,
 *      the three tables present with exact enums, partial unique + CHECKs +
 *      uniques/indexes in place, no other table rewritten, ZERO backfill
 *      (accounts without sessions get no rows).
 *
 * (The from-scratch chain including CC-7.4B runs in the constraints and
 * receipt pg-specs via `prisma migrate deploy`.)
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc74b_migration_db";
const OUR_MIGRATION = "20260721000000_cc7_4b_guide_catalog_ledger";
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

suite("CC-7.4B · migration over a PRE-CC-7.4B schema with real rows", () => {
  let pool: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();
    pool = new Pool({ connectionString: withDatabase(base as string, DB) });

    // Phase 1 — every REAL migration BEFORE ours, in order.
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

    // Fixture: THREE users (two of them never touch Guide), one legacy
    // LearningEvent, one V1 LearningEvent, and existing content rows.
    await pool.query(
      `INSERT INTO "User" ("id","email","name","updatedAt")
       VALUES ('u-mig-1','mig1@test.local','Mig One',now()),
              ('u-mig-2','mig2@test.local','Mig Two',now()),
              ('u-mig-3','mig3@test.local','Mig Three',now())`,
    );
    await pool.query(
      `INSERT INTO "LearningEvent" ("id","userId","kind","payload")
       VALUES ('le-legacy','u-mig-1','BLOCK_DWELL','{"seconds": 12}'::jsonb)`,
    );
    await pool.query(
      `INSERT INTO "LearningEvent"
        ("id","userId","kind","payload","idempotencyKey","schemaVersion")
       VALUES ('le-v1','u-mig-1','UNIT_OPENED',
               '{"editionKey":"lib-1e","unitKey":"unit-a"}'::jsonb,
               'ffffffff-ffff-4fff-8fff-000000000001',1)`,
    );
    await pool.query(
      `INSERT INTO "Book" ("id","slug","title","updatedAt")
       VALUES ('bk-mig','libro-mig','Libro Mig',now())`,
    );

    // Phase 2 — ONLY the CC-7.4B migration.
    const ourSql = readFileSync(
      join(MIGRATIONS_DIR, OUR_MIGRATION, "migration.sql"),
      "utf8",
    );
    await pool.query(ourSql);
  }, 240_000);

  afterAll(async () => {
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("leaves every prior row byte-for-byte intact (no other table rewritten)", async () => {
    const users = await pool.query(`SELECT id FROM "User" ORDER BY id`);
    expect(users.rows.map((r) => r.id)).toEqual([
      "u-mig-1",
      "u-mig-2",
      "u-mig-3",
    ]);
    const legacy = await pool.query(
      `SELECT kind, payload, "idempotencyKey", "schemaVersion"
         FROM "LearningEvent" WHERE id = 'le-legacy'`,
    );
    expect(legacy.rows[0]).toEqual({
      kind: "BLOCK_DWELL",
      payload: { seconds: 12 },
      idempotencyKey: null,
      schemaVersion: null,
    });
    const v1 = await pool.query(
      `SELECT kind, "schemaVersion" FROM "LearningEvent" WHERE id = 'le-v1'`,
    );
    expect(v1.rows[0]).toEqual({ kind: "UNIT_OPENED", schemaVersion: 1 });
    const book = await pool.query(
      `SELECT slug FROM "Book" WHERE id = 'bk-mig'`,
    );
    expect(book.rows[0].slug).toBe("libro-mig");
    // The LearningEvent table gained no Guide columns — untouched:
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'LearningEvent' AND column_name LIKE 'guide%'`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(["guideSessionId"]);
  });

  it("creates the three tables with the EXACT enums", async () => {
    for (const table of [
      "GuideSession",
      "GuideSessionStep",
      "GuideCommandReceipt",
    ]) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_name = $1`,
        [table],
      );
      expect(rows[0].n, table).toBe(1);
    }
    const enums: Array<[string, string[]]> = [
      ["GuideSessionStatus", ["ACTIVE", "COMPLETED", "CANCELLED"]],
      [
        "GuideStepKind",
        [
          "CONCEPT_EXPLORATION",
          "ACTIVE_RECALL",
          "CATALOG_PRACTICE",
          "EXPLICIT_CONFIRMATION",
        ],
      ],
      [
        "GuideStepCompletionPolicy",
        [
          "EXPLICIT_CONFIRMATION",
          "OBJECTIVE_RECALL",
          "CATALOG_PRACTICE_CONFIRMATION",
        ],
      ],
      ["GuideStepRecallResult", ["CORRECT", "INCORRECT"]],
      [
        "GuideCommandType",
        ["START", "STEP_COMPLETE", "STEP_RECALL", "CANCEL", "SESSION_COMPLETE"],
      ],
    ];
    for (const [name, expected] of enums) {
      const { rows } = await pool.query(
        `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY e.enumsortorder`,
        [name],
      );
      expect(
        rows.map((r) => r.enumlabel),
        name,
      ).toEqual(expected);
    }
    // SERVER_ACTION never entered any enum:
    const { rows: sa } = await pool.query(
      `SELECT count(*)::int AS n FROM pg_enum WHERE enumlabel = 'SERVER_ACTION'`,
    );
    expect(sa[0].n).toBe(0);
  });

  it("installs the partial unique, the CHECK constraints and the uniques/indexes", async () => {
    const { rows: partial } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE indexname = 'GuideSession_one_active_per_user'`,
    );
    expect(partial).toHaveLength(1);
    expect(partial[0].indexdef).toContain("UNIQUE");
    expect(partial[0].indexdef).toMatch(/WHERE.*ACTIVE/);

    const { rows: checks } = await pool.query(
      `SELECT conname FROM pg_constraint WHERE contype = 'c'
          AND conname LIKE 'Guide%' ORDER BY conname`,
    );
    expect(checks.map((r) => r.conname)).toEqual([
      "GuideCommandReceipt_command_shape",
      "GuideCommandReceipt_fingerprint_version",
      "GuideCommandReceipt_key_canonical",
      "GuideCommandReceipt_version_positive",
      "GuideSessionStep_order_positive",
      "GuideSessionStep_variant_shape",
      "GuideSession_context_all_or_nothing",
      "GuideSession_counter_range",
      "GuideSession_state_machine",
      "GuideSession_total_steps_positive",
      "GuideSession_version_positive",
    ]);

    for (const index of [
      "GuideSessionStep_sessionId_stepKey_key",
      "GuideSessionStep_sessionId_order_key",
      "GuideCommandReceipt_userId_idempotencyKey_key",
      "GuideSession_userId_status_idx",
      "GuideSessionStep_sessionId_acceptedAt_idx",
      "GuideCommandReceipt_sessionId_commandType_idx",
    ]) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = $1`,
        [index],
      );
      expect(rows[0].n, index).toBe(1);
    }
  });

  it("performs ZERO backfill — accounts without sessions receive no rows", async () => {
    for (const table of [
      "GuideSession",
      "GuideSessionStep",
      "GuideCommandReceipt",
    ]) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${table}"`,
      );
      expect(rows[0].n, table).toBe(0);
    }
  });
});
