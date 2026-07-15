import { execSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PR-2A · the REAL migration, exercised end-to-end.
 *
 * Unlike a hand-copied CHECK on a throwaway table, this spec runs the actual
 * `prisma migrate deploy` against an ephemeral PostgreSQL schema and then asserts
 * the constraints/columns/enums/indexes the migration file produced. If someone
 * weakens the migration, THIS test — not a mirror of it — fails.
 *
 * Isolation: everything is created inside a fresh `pr2a_migrate` schema so we do
 * not collide with the lock suite's `public."User"`. We seed one parent `User`
 * (for the FK) and drive raw inserts so the ONLY thing that can reject an
 * "eligible" row is the INV-1 CHECK.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `postgres:18` via
 * `pnpm --filter @psico/api test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const SCHEMA = "pr2a_migrate";
// `pnpm --filter @psico/api test:locks` runs with cwd = apps/api, so
// `prisma migrate deploy` (default execSync cwd) resolves the schema + config.
const API_DIR = process.cwd();

function withSchema(url: string, schema: string): string {
  return url.includes("?")
    ? `${url}&schema=${schema}`
    : `${url}?schema=${schema}`;
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
    // Fresh isolated schema.
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
    await admin.end();

    // Apply the real migrations. PRISMA_SKIP_SEED short-circuits the seed that
    // Prisma 7's `migrate deploy` chains — we only need the schema here.
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: withSchema(base as string, SCHEMA),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });

    // Connect with search_path pinned to the isolated schema so unqualified
    // table + enum names resolve there (and never to public."User").
    pool = new Pool({
      connectionString: base,
      options: `-c search_path=${SCHEMA}`,
    });
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
    await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
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
});
