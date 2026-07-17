import { execSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Content Core (CC-2) — the REAL constraints, exercised end-to-end.
 *
 * Runs the actual `prisma migrate deploy` into an ephemeral schema and then drives
 * raw inserts/updates to prove the triggers + CHECK + partial-unique indexes
 * REJECT bad writes (not merely that they exist). If someone weakens the
 * migration, THIS test fails.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

// A DEDICATED database, not a schema-in-shared-db. The AI-RAG migration does
// `CREATE EXTENSION IF NOT EXISTS vector`; extensions are database-scoped, so two
// pg-specs migrate-deploying concurrently into different SCHEMAS of one database
// race — the loser's `IF NOT EXISTS` skips and its `vector(1024)` column can't
// find the type. Isolating in our own database sidesteps the race entirely.
const DB = "cc2_constraints_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-2 constraints (real PostgreSQL)", () => {
  let pool: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: withDatabase(base as string, DB),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });

    pool = new Pool({ connectionString: withDatabase(base as string, DB) });

    // Fixture: one Work, TWO editions (e1, e2) so cross-edition cases can fire.
    await pool.query(
      `INSERT INTO "Work"(id, "workKey", title, "authorName", "updatedAt") VALUES ('w1','w1','W','A', now())`,
    );
    await pool.query(`INSERT INTO "Edition"(id, "workId", "editionKey", slug, label, "updatedAt") VALUES
      ('e1','w1','e1','e1','E1', now()), ('e2','w1','e2','e2','E2', now())`);
    await pool.query(
      `INSERT INTO "Revision"(id, "editionId", number) VALUES ('r1','e1',1), ('r2','e2',1)`,
    );
    await pool.query(`INSERT INTO "ContentUnit"(id, "editionId", "unitKey") VALUES
      ('u1','e1','u1'), ('u2','e1','u2'), ('uX','e2','uX')`);
    await pool.query(`INSERT INTO "ContentUnitVersion"(id, "unitId", title) VALUES
      ('v1','u1','V1'), ('v2','u2','V2'), ('vX','uX','VX')`);
    await pool.query(`INSERT INTO "ContentBlock"(id, "blockKey", "unitId") VALUES
      ('b1','bk1','u1'), ('bX','bkX','uX')`);
    await pool.query(
      `INSERT INTO "Concept"(id, "conceptKey", label, "updatedAt") VALUES ('c1','c1','C1', now())`,
    );
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── PASS ───────────────────────────────────────────────────────────────────
  it("PASS · valid RevisionUnit (unit + version in the revision's edition)", async () => {
    await expect(
      pool.query(
        `INSERT INTO "RevisionUnit"(id,"revisionId","unitId","unitVersionId","order") VALUES ('ru1','r1','u1','v1',0)`,
      ),
    ).resolves.toBeTruthy();
  });

  it("PASS · valid BlockVersion (block + version share the same unit)", async () => {
    await expect(
      pool.query(
        `INSERT INTO "BlockVersion"(id,"contentBlockId","unitVersionId","order",kind,content,"contentHash") VALUES ('bv1','b1','v1',0,'PARAGRAPH','x','h')`,
      ),
    ).resolves.toBeTruthy();
  });

  it("PASS · publishedRevision in the same edition", async () => {
    await expect(
      pool.query(
        `UPDATE "Edition" SET "publishedRevisionId"='r1' WHERE id='e1'`,
      ),
    ).resolves.toBeTruthy();
  });

  it("PASS · ConceptLink with exactly one target", async () => {
    await expect(
      pool.query(
        `INSERT INTO "ConceptLink"(id,"conceptId","unitId") VALUES ('cl1','c1','u1')`,
      ),
    ).resolves.toBeTruthy();
  });

  // ── FAIL · cross-edition + version mismatch ──────────────────────────────────
  it("FAIL · RevisionUnit cross-edition", async () => {
    await expect(
      pool.query(
        `INSERT INTO "RevisionUnit"(id,"revisionId","unitId","unitVersionId","order") VALUES ('ru-x','r1','uX','vX',5)`,
      ),
    ).rejects.toThrow(/REVISION_UNIT_CROSS_EDITION/);
  });

  it("FAIL · RevisionUnit unitVersionId from another unit", async () => {
    await expect(
      pool.query(
        `INSERT INTO "RevisionUnit"(id,"revisionId","unitId","unitVersionId","order") VALUES ('ru-m','r1','u2','v1',6)`,
      ),
    ).rejects.toThrow(/REVISION_UNIT_VERSION_MISMATCH/);
  });

  it("FAIL · publishedRevision cross-edition", async () => {
    await expect(
      pool.query(
        `UPDATE "Edition" SET "publishedRevisionId"='r2' WHERE id='e1'`,
      ),
    ).rejects.toThrow(/EDITION_PUBLISHED_CROSS_EDITION/);
  });

  it("FAIL · BlockVersion cross-unit", async () => {
    await expect(
      pool.query(
        `INSERT INTO "BlockVersion"(id,"contentBlockId","unitVersionId","order",kind,content,"contentHash") VALUES ('bv-x','b1','vX',9,'PARAGRAPH','x','h2')`,
      ),
    ).rejects.toThrow(/BLOCK_VERSION_UNIT_MISMATCH/);
  });

  // ── FAIL · immutable identities ──────────────────────────────────────────────
  it("FAIL · Revision.editionId is immutable", async () => {
    await expect(
      pool.query(`UPDATE "Revision" SET "editionId"='e2' WHERE id='r1'`),
    ).rejects.toThrow(/CONTENT_CORE_IDENTITY_IMMUTABLE/);
  });

  it("FAIL · ContentUnit.editionId is immutable", async () => {
    await expect(
      pool.query(`UPDATE "ContentUnit" SET "editionId"='e2' WHERE id='u1'`),
    ).rejects.toThrow(/CONTENT_CORE_IDENTITY_IMMUTABLE/);
  });

  it("FAIL · ContentUnitVersion.unitId is immutable", async () => {
    await expect(
      pool.query(`UPDATE "ContentUnitVersion" SET "unitId"='u2' WHERE id='v1'`),
    ).rejects.toThrow(/CONTENT_CORE_IDENTITY_IMMUTABLE/);
  });

  it("FAIL · ContentBlock.unitId is immutable", async () => {
    await expect(
      pool.query(`UPDATE "ContentBlock" SET "unitId"='u2' WHERE id='b1'`),
    ).rejects.toThrow(/CONTENT_CORE_IDENTITY_IMMUTABLE/);
  });

  // ── FAIL · ConceptLink XOR ───────────────────────────────────────────────────
  it("FAIL · ConceptLink with BOTH targets", async () => {
    await expect(
      pool.query(
        `INSERT INTO "ConceptLink"(id,"conceptId","unitId","contentBlockId") VALUES ('cl-both','c1','u1','b1')`,
      ),
    ).rejects.toThrow(/ConceptLink_target_xor/);
  });

  it("FAIL · ConceptLink with NO target", async () => {
    await expect(
      pool.query(
        `INSERT INTO "ConceptLink"(id,"conceptId") VALUES ('cl-none','c1')`,
      ),
    ).rejects.toThrow(/ConceptLink_target_xor/);
  });

  // ── FAIL · partial-unique duplicates ─────────────────────────────────────────
  it("FAIL · duplicate (concept, unit) partial-unique", async () => {
    await pool.query(
      `INSERT INTO "ConceptLink"(id,"conceptId","unitId") VALUES ('cl-u2a','c1','u2')`,
    );
    await expect(
      pool.query(
        `INSERT INTO "ConceptLink"(id,"conceptId","unitId") VALUES ('cl-u2b','c1','u2')`,
      ),
    ).rejects.toThrow(/ConceptLink_concept_unit_key/);
  });

  it("FAIL · duplicate (concept, block) partial-unique", async () => {
    await pool.query(
      `INSERT INTO "ConceptLink"(id,"conceptId","contentBlockId") VALUES ('cl-b1a','c1','b1')`,
    );
    await expect(
      pool.query(
        `INSERT INTO "ConceptLink"(id,"conceptId","contentBlockId") VALUES ('cl-b1b','c1','b1')`,
      ),
    ).rejects.toThrow(/ConceptLink_concept_block_key/);
  });
});
