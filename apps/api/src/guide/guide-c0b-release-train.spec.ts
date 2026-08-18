import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GUIDE_START_LOCK_PROTOCOL,
  c0aStartLockKeys,
  globalStartLockKey,
  lineageStartLockKey,
} from "./guide-active-capability";

/**
 * The C.0B release train, ratcheted at the artifact level.
 *
 * The behavioural proofs live in the pg-specs, where real PostgreSQL answers.
 * What those cannot see is the shape of what we SHIP: a migration that grew an
 * `IF NOT EXISTS`, a phase that quietly dropped the global index early, or a
 * `schema.prisma` edited on the assumption that Prisma models partial indexes.
 * Each of those passes every behavioural test on a database where somebody
 * already ran the right DDL by hand.
 *
 * The train is ordered and the order is the safety argument, so the phases are
 * pinned separately: C.0B1 adds, C.0B2 removes, C.0B3 narrows the lock. A file
 * that belongs to a later phase is simply absent here until that phase lands.
 */

const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
const C0B1 = "20260818000000_c0b1_lineage_active_index";

const migrationSql = (dir: string): string =>
  readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");

/** The statement text with comment lines removed — comments may discuss what
 * the DDL must not contain, and a ratchet that reads them is useless. */
const statements = (sql: string): string =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const schemaPrisma = (): string =>
  readFileSync(join(API_DIR, "prisma", "schema.prisma"), "utf8");

describe("C.0B1 · the migration adds the lineage index and nothing else", () => {
  it("exists exactly once in the migration chain", () => {
    expect(existsSync(join(MIGRATIONS_DIR, C0B1, "migration.sql"))).toBe(true);
    const matches = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /c0b1/i.test(d.name))
      .map((d) => d.name);
    expect(matches).toEqual([C0B1]);
  });

  it("creates the index CONCURRENTLY", () => {
    // A blocking CREATE UNIQUE INDEX on a live GuideSession is an outage, not
    // a slow migration: it locks out writes for the whole build.
    expect(statements(migrationSql(C0B1))).toMatch(
      /CREATE UNIQUE INDEX CONCURRENTLY/,
    );
  });

  it("keys on (userId, guideKey) in that order, and never on guideVersion", () => {
    const ddl = statements(migrationSql(C0B1));
    expect(ddl).toMatch(/"GuideSession"\("userId",\s*"guideKey"\)/);
    // ADR 0022 §2: a by-version triple would let X@v1 and X@v2 be ACTIVE at
    // once, which is the invariant this whole programme exists to preserve.
    expect(ddl).not.toMatch(/guideVersion/);
  });

  it("carries the exact partial predicate", () => {
    expect(statements(migrationSql(C0B1))).toMatch(
      /WHERE\s+"status"\s*=\s*'ACTIVE'/,
    );
  });

  it("uses no IF NOT EXISTS, no INCLUDE and no expressions", () => {
    const ddl = statements(migrationSql(C0B1));
    // IF NOT EXISTS would swallow a pre-existing index of a DIFFERENT shape
    // wearing this name — precisely what the detector refuses to trust.
    expect(ddl).not.toMatch(/IF NOT EXISTS/i);
    expect(ddl).not.toMatch(/\bINCLUDE\b/i);
    expect(ddl).not.toMatch(/\(\s*lower\s*\(|\(\s*coalesce\s*\(/i);
  });

  it("does NOT retire the global index — that is C.0B2", () => {
    // Dropping both halves in one migration removes the phase boundary that
    // makes the rollout reversible, and would flip the authority in the same
    // deploy that introduces the new index.
    const sql = migrationSql(C0B1);
    expect(sql).not.toMatch(/DROP\s+INDEX/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(statements(sql)).not.toMatch(/one_active_per_user\b/);
  });

  it("contains exactly one statement", () => {
    const ddl = statements(migrationSql(C0B1));
    expect(ddl.split(";").filter((s) => s.trim().length > 0)).toHaveLength(1);
  });
});

describe("C.0B1 · schema.prisma stays out of it", () => {
  it("declares no partial index, because Prisma cannot express one", () => {
    // Measured, not assumed: `prisma migrate diff --from-url --to-schema-
    // datamodel` proposes nothing about either partial index, because the
    // datamodel has no syntax for a WHERE clause. The global index has lived
    // outside schema.prisma since CC-7.4B for the same reason.
    const schema = schemaPrisma();
    expect(schema).not.toMatch(/one_active_per_user/);
    expect(schema).not.toMatch(/one_active_per_lineage/);
    // And no @@unique on the pair, which WOULD be expressible and would be a
    // different index: unconditional, therefore blocking a second CANCELLED
    // session of the same lineage.
    expect(schema).not.toMatch(/@@unique\(\[userId,\s*guideKey\]\)/);
  });
});

describe("C.0B1 · the runtime does not move in this phase", () => {
  it("still speaks the dual-v1 protocol", () => {
    // C.0B3 is what narrows the lock. A protocol marker that moved here would
    // make the drain gate lie about which binaries are running.
    expect(GUIDE_START_LOCK_PROTOCOL).toBe("dual-v1");
  });

  it("still takes both start locks, in the canonical order", () => {
    expect([...c0aStartLockKeys("u-1", "guia-a")]).toEqual([
      globalStartLockKey("u-1"),
      lineageStartLockKey("u-1", "guia-a"),
    ]);
  });
});
