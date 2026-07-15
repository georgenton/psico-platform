import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PR-2A · INV-1 as a real PostgreSQL CHECK constraint.
 *
 * The migration adds a CHECK on MoodLog and DiaryEntry:
 *   eligible ⇒ normalized IS NOT NULL AND explicitlySelected = true AND reason IS NULL.
 * The service + normalizer already guarantee this, but the constraint is the
 * database-level backstop — a future writer that forgets the invariant is
 * rejected by Postgres, not silently trusted. This spec proves the CHECK logic
 * against a real database, on a throwaway table that mirrors the constraint.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `postgres:18` service, via
 * `pnpm --filter @psico/api test:locks`); skipped otherwise.
 */

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("PR-2A · INV-1 CHECK constraint (real PostgreSQL)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(`DROP TABLE IF EXISTS "mood_norm_probe"`);
    await pool.query(
      `DO $$ BEGIN
         CREATE TYPE "mood_probe_canonical" AS ENUM ('hard','low','ok','good','great');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    // Mirror of the eligibility columns + the migration's CHECK.
    await pool.query(`
      CREATE TABLE "mood_norm_probe" (
        id serial PRIMARY KEY,
        "moodNormalized" "mood_probe_canonical",
        "moodExplicitlySelected" boolean,
        "moodExclusionReason" text,
        "moodEligibleForDynamics" boolean NOT NULL DEFAULT false,
        CONSTRAINT "probe_inv1_chk" CHECK (
          "moodEligibleForDynamics" = false
          OR (
            "moodNormalized" IS NOT NULL
            AND "moodExplicitlySelected" = true
            AND "moodExclusionReason" IS NULL
          )
        )
      )`);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS "mood_norm_probe"`);
    await pool.query(`DROP TYPE IF EXISTS "mood_probe_canonical"`);
    await pool.end();
  });

  it("rejects an eligible row with NULL normalized", async () => {
    await expect(
      pool.query(
        `INSERT INTO "mood_norm_probe" ("moodNormalized","moodExplicitlySelected","moodEligibleForDynamics")
         VALUES (NULL, true, true)`,
      ),
    ).rejects.toThrow();
  });

  it("rejects an eligible row that was not explicitly selected", async () => {
    await expect(
      pool.query(
        `INSERT INTO "mood_norm_probe" ("moodNormalized","moodExplicitlySelected","moodEligibleForDynamics")
         VALUES ('good', false, true)`,
      ),
    ).rejects.toThrow();
  });

  it("rejects an eligible row that still carries an exclusion reason", async () => {
    await expect(
      pool.query(
        `INSERT INTO "mood_norm_probe" ("moodNormalized","moodExplicitlySelected","moodExclusionReason","moodEligibleForDynamics")
         VALUES ('good', true, 'ambiguous_default', true)`,
      ),
    ).rejects.toThrow();
  });

  it("accepts a properly eligible row (canonical + explicit + no reason)", async () => {
    const r = await pool.query(
      `INSERT INTO "mood_norm_probe" ("moodNormalized","moodExplicitlySelected","moodEligibleForDynamics")
       VALUES ('good', true, true) RETURNING id`,
    );
    expect(r.rows.length).toBe(1);
  });

  it("accepts an ineligible row with null normalized (an excluded observation)", async () => {
    const r = await pool.query(
      `INSERT INTO "mood_norm_probe" ("moodNormalized","moodExclusionReason","moodEligibleForDynamics")
       VALUES (NULL, 'not_selected', false) RETURNING id`,
    );
    expect(r.rows.length).toBe(1);
  });
});
