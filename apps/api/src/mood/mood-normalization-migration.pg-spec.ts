import { execSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dropWhenIdle } from "../test/pg-drop";

/**
 * PR-2A · the REAL migration, exercised end-to-end.
 *
 * Unlike a hand-copied CHECK on a throwaway table, this spec runs the actual
 * `prisma migrate deploy` against an ephemeral PostgreSQL schema and then asserts
 * the constraints/columns/enums/indexes the migration file produced. If someone
 * weakens the migration, THIS test — not a mirror of it — fails.
 *
 * Isolation: a dedicated DATABASE, not a schema of the shared one. It used to
 * be a `pr2a_migrate` schema, and that raced. The AI-RAG migration does
 * `CREATE EXTENSION IF NOT EXISTS vector`, and an extension is visible across
 * the whole DATABASE even though it belongs to a schema — so for as long as
 * this spec was running, the suite's base database really did carry `vector`.
 * `privacy-barrier.pg-spec.ts` asserts that same base database is clean, and
 * the two run as concurrent worker threads (`pool: "threads"`), so it failed
 * or passed depending on whether the windows happened to overlap.
 *
 * Transient, not a leak: `DROP SCHEMA ... CASCADE` does take the extension
 * with it (`NOTICE: drop cascades to extension vector`), which is precisely
 * why this was a flake and not a permanent breakage.
 * `content-core-constraints.pg-spec.ts` had already written the hazard down
 * and taken its own database for it.
 *
 * In its own database `public` is ours, so the schema-pinned `search_path` is
 * gone too. We seed one parent `User` (for the FK) and drive raw inserts so
 * the ONLY thing that can reject an "eligible" row is the INV-1 CHECK.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `postgres:18` via
 * `pnpm --filter @psico/api test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const DB = "pr2a_migrate_db";
/** Our own database, so the catalog queries below read `public` — ours. */
const SCHEMA = "public";
// `pnpm --filter @psico/api test:locks` runs with cwd = apps/api, so
// `prisma migrate deploy` (default execSync cwd) resolves the schema + config.
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const NORM_COLUMNS = [
  "moodNormalized",
  "moodProvenance",
  "moodExplicitlySelected",
  "moodVocabularyVersion",
  "moodNormalizerVersion",
  "moodClientVersion",
  "moodEligibleForDynamics",
  "moodExclusionReason",
];

suite("PR-2A · real migration (prisma migrate deploy)", () => {
  let pool: Pool;

  beforeAll(async () => {
    // Fresh isolated database. No `assertEmptyTestDatabase` any more: that
    // guard existed because this spec migrated into the SHARED database, where
    // a `vector` extension installed by a concurrent spec broke it. Now it
    // brings its own, so the state of the base database is none of its
    // business — and asserting on it would make this spec fail for somebody
    // else's in-flight migration, which is the race read from the other side.
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    // Apply the real migrations. PRISMA_SKIP_SEED short-circuits the seed that
    // Prisma 7's `migrate deploy` chains — we only need the schema here.
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: withDatabase(base as string, DB),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });

    // Our own database: `public` is the only schema in it, so unqualified
    // names cannot resolve to somebody else's `"User"`.
    pool = new Pool({ connectionString: withDatabase(base as string, DB) });
    // One parent User for the FK, so an eligible-row rejection can only be the
    // CHECK, never a foreign-key violation.
    await pool.query(
      `INSERT INTO "User"(id, email, name, "updatedAt")
       VALUES ('u-pr2a', 'pr2a@test.local', 'PR2A', now())`,
    );
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    // The whole database goes, so nothing this spec installs is ever visible
    // to anybody else — not even while it runs, which is what the shared
    // schema could not promise.
    await dropWhenIdle(admin, DB);
    await admin.end();
  });

  it("created the three mood enums", async () => {
    const r = await pool.query(
      `SELECT t.typname
         FROM pg_type t
         JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = $1
          AND t.typname IN ('MoodCanonical','MoodProvenance','MoodExclusionReason')`,
      [SCHEMA],
    );
    expect(r.rows.map((x) => x.typname).sort()).toEqual([
      "MoodCanonical",
      "MoodExclusionReason",
      "MoodProvenance",
    ]);
  });

  it("added all 8 normalization columns to BOTH MoodLog and DiaryEntry", async () => {
    const r = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name IN ('MoodLog','DiaryEntry')
          AND column_name = ANY($2)`,
      [SCHEMA, NORM_COLUMNS],
    );
    expect(r.rows.filter((x) => x.table_name === "MoodLog").length).toBe(8);
    expect(r.rows.filter((x) => x.table_name === "DiaryEntry").length).toBe(8);
  });

  it("made DiaryEntry.mood nullable (schema-forward for PR-2B)", async () => {
    const r = await pool.query(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'DiaryEntry' AND column_name = 'mood'`,
      [SCHEMA],
    );
    expect(r.rows[0].is_nullable).toBe("YES");
  });

  it("created the composite eligible index on both tables", async () => {
    const r = await pool.query(
      `SELECT tablename, indexname
         FROM pg_indexes
        WHERE schemaname = $1 AND indexname LIKE '%moodEligibleForDynamics%'`,
      [SCHEMA],
    );
    const tables = r.rows.map((x) => x.tablename).sort();
    expect(tables).toEqual(["DiaryEntry", "MoodLog"]);
  });

  // ── The INV-1 CHECK, against the REAL tables ──────────────────────────────

  it("MoodLog accepts a fully-eligible row (canonical + explicit + provenance + versions)", async () => {
    const r = await pool.query(
      `INSERT INTO "MoodLog"
         (id, "userId", mood, "moodNormalized", "moodProvenance",
          "moodExplicitlySelected", "moodVocabularyVersion", "moodNormalizerVersion",
          "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('ml-ok', 'u-pr2a', 'good', 'good'::"MoodCanonical",
               'MOOD_LOG'::"MoodProvenance", true, 'diary-v1', 'norm-1', true, NULL)
       RETURNING id`,
    );
    expect(r.rows.length).toBe(1);
  });

  it.each([
    [
      "null normalized",
      `('ml-x1','u-pr2a','good',NULL,'MOOD_LOG'::"MoodProvenance",true,'diary-v1','norm-1',true,NULL)`,
    ],
    [
      "not explicitly selected",
      `('ml-x2','u-pr2a','good','good'::"MoodCanonical",'MOOD_LOG'::"MoodProvenance",false,'diary-v1','norm-1',true,NULL)`,
    ],
    [
      "still carries an exclusion reason",
      `('ml-x3','u-pr2a','good','good'::"MoodCanonical",'MOOD_LOG'::"MoodProvenance",true,'diary-v1','norm-1',true,'ambiguous_default'::"MoodExclusionReason")`,
    ],
    [
      "null provenance",
      `('ml-x4','u-pr2a','good','good'::"MoodCanonical",NULL,true,'diary-v1','norm-1',true,NULL)`,
    ],
    [
      "null normalizerVersion",
      `('ml-x5','u-pr2a','good','good'::"MoodCanonical",'MOOD_LOG'::"MoodProvenance",true,'diary-v1',NULL,true,NULL)`,
    ],
    [
      "null vocabularyVersion",
      `('ml-x6','u-pr2a','good','good'::"MoodCanonical",'MOOD_LOG'::"MoodProvenance",true,NULL,'norm-1',true,NULL)`,
    ],
  ])("MoodLog rejects an eligible row with %s", async (_label, values) => {
    await expect(
      pool.query(
        `INSERT INTO "MoodLog"
           (id, "userId", mood, "moodNormalized", "moodProvenance",
            "moodExplicitlySelected", "moodVocabularyVersion", "moodNormalizerVersion",
            "moodEligibleForDynamics", "moodExclusionReason")
         VALUES ${values}`,
      ),
    ).rejects.toThrow();
  });

  it("MoodLog accepts an INELIGIBLE row with null normalized (an excluded observation)", async () => {
    const r = await pool.query(
      `INSERT INTO "MoodLog"
         (id, "userId", mood, "moodNormalized", "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('ml-excl','u-pr2a','calma', NULL, false, 'legacy_vocabulary'::"MoodExclusionReason")
       RETURNING id`,
    );
    expect(r.rows.length).toBe(1);
  });

  it("DiaryEntry accepts a fully-eligible row and rejects one missing provenance", async () => {
    const ok = await pool.query(
      `INSERT INTO "DiaryEntry"
         (id, "userId", "textCiphertext", "textNonce", "updatedAt", tags, mood,
          "moodNormalized", "moodProvenance", "moodExplicitlySelected",
          "moodVocabularyVersion", "moodNormalizerVersion",
          "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('de-ok','u-pr2a','ct','nc', now(), '{}', 'good',
               'good'::"MoodCanonical", 'DIARY'::"MoodProvenance", true,
               'diary-v1', 'norm-1', true, NULL)
       RETURNING id`,
    );
    expect(ok.rows.length).toBe(1);

    await expect(
      pool.query(
        `INSERT INTO "DiaryEntry"
           (id, "userId", "textCiphertext", "textNonce", "updatedAt", tags, mood,
            "moodNormalized", "moodProvenance", "moodExplicitlySelected",
            "moodVocabularyVersion", "moodNormalizerVersion",
            "moodEligibleForDynamics", "moodExclusionReason")
         VALUES ('de-bad','u-pr2a','ct','nc', now(), '{}', 'good',
                 'good'::"MoodCanonical", NULL, true,
                 'diary-v1', 'norm-1', true, NULL)`,
      ),
    ).rejects.toThrow();
  });

  // ── PR-2B · moodSelectionVersion (migration 20260715230000) ───────────────
  // `migrate deploy` above ran the FULL history, so the PR-2B migration is
  // already applied here — these assert its columns landed AND that the PR-2A
  // INV-1 CHECK is untouched (an eligible row with the new column set inserts).

  it("PR-2B: added a nullable moodSelectionVersion column to BOTH tables", async () => {
    const r = await pool.query(
      `SELECT table_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name IN ('MoodLog','DiaryEntry')
          AND column_name = 'moodSelectionVersion'`,
      [SCHEMA],
    );
    const byTable = Object.fromEntries(
      r.rows.map((x) => [x.table_name, x.is_nullable]),
    );
    expect(byTable).toEqual({ MoodLog: "YES", DiaryEntry: "YES" });
  });

  it("PR-2B: an eligible MoodLog row carrying moodSelectionVersion still passes the INV-1 CHECK", async () => {
    const r = await pool.query(
      `INSERT INTO "MoodLog"
         (id, "userId", mood, "moodNormalized", "moodProvenance",
          "moodExplicitlySelected", "moodVocabularyVersion", "moodNormalizerVersion",
          "moodSelectionVersion", "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('ml-msv', 'u-pr2a', 'good', 'good'::"MoodCanonical",
               'MOOD_LOG'::"MoodProvenance", true, 'diary-v1', 'norm-1',
               'mood-log-v1', true, NULL)
       RETURNING "moodSelectionVersion"`,
    );
    expect(r.rows[0].moodSelectionVersion).toBe("mood-log-v1");
  });

  it("PR-2B: an eligible DiaryEntry row carrying moodSelectionVersion='explicit-v1' still passes the INV-1 CHECK", async () => {
    const r = await pool.query(
      `INSERT INTO "DiaryEntry"
         (id, "userId", "textCiphertext", "textNonce", "updatedAt", tags, mood,
          "moodNormalized", "moodProvenance", "moodExplicitlySelected",
          "moodVocabularyVersion", "moodNormalizerVersion",
          "moodSelectionVersion", "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('de-msv','u-pr2a','ct','nc', now(), '{}', 'good',
               'good'::"MoodCanonical", 'DIARY'::"MoodProvenance", true,
               'diary-v1', 'norm-1', 'explicit-v1', true, NULL)
       RETURNING "moodSelectionVersion"`,
    );
    expect(r.rows[0].moodSelectionVersion).toBe("explicit-v1");
  });

  it("PR-2B: a null-mood DiaryEntry (no pick) inserts — mood + normalized null, ineligible", async () => {
    const r = await pool.query(
      `INSERT INTO "DiaryEntry"
         (id, "userId", "textCiphertext", "textNonce", "updatedAt", tags, mood,
          "moodNormalized", "moodEligibleForDynamics", "moodExclusionReason")
       VALUES ('de-null','u-pr2a','ct','nc', now(), '{}', NULL,
               NULL, false, 'not_selected'::"MoodExclusionReason")
       RETURNING id`,
    );
    expect(r.rows.length).toBe(1);
  });
});
