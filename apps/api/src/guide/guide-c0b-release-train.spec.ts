import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GUIDE_START_LOCK_PROTOCOL,
  c0aStartLockKeys,
  globalStartLockKey,
  guideStartLockKeys,
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
const C0B2 = "20260818010000_c0b2_retire_global_active_index";

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

describe("C.0B1 and C.0B2 · schema-only phases", () => {
  // Both phases ship SQL and nothing else. Once C.0B3 lands in the same tree
  // the protocol constant reads `lineage-v2`, so "this phase does not move the
  // runtime" can no longer be asserted from a global value — it is asserted
  // where it is actually decidable: in the migration artifacts.
  for (const phase of [C0B1, C0B2]) {
    it(`${phase} touches no TypeScript`, () => {
      const files = readdirSync(join(MIGRATIONS_DIR, phase));
      expect(files).toEqual(["migration.sql"]);
    });
  }

  it("V1's own lock derivation survives for the mixed fleet", () => {
    // C.0B3 stops TAKING the global lock; it must not stop being able to
    // DERIVE V1's sequence, or the mixed-fleet spec would hand-copy the keys
    // of the binary it claims to serialise against.
    expect([...c0aStartLockKeys("u-1", "guia-a")]).toEqual([
      globalStartLockKey("u-1"),
      lineageStartLockKey("u-1", "guia-a"),
    ]);
  });
});

describe("C.0B2 · the migration retires the global index and only that", () => {
  it("exists, and orders AFTER C.0B1", () => {
    expect(existsSync(join(MIGRATIONS_DIR, C0B2, "migration.sql"))).toBe(true);
    // Lexicographic order is what Prisma applies, so this is the ordering
    // guarantee itself, not a naming preference: retiring the global index
    // before creating the lineage one would leave the table with no ACTIVE
    // invariant at all, and the detector would fail closed for everyone.
    expect(C0B2 > C0B1).toBe(true);
  });

  it("drops CONCURRENTLY, without IF EXISTS", () => {
    const ddl = statements(migrationSql(C0B2));
    expect(ddl).toMatch(/DROP INDEX CONCURRENTLY/);
    // A missing index means something we did not author ran. That deserves a
    // loud failure, not a silent success.
    expect(ddl).not.toMatch(/IF EXISTS/i);
    expect(ddl.split(";").filter((s) => s.trim().length > 0)).toHaveLength(1);
  });

  it("names the global index and spares the lineage one", () => {
    const ddl = statements(migrationSql(C0B2));
    expect(ddl).toContain('"GuideSession_one_active_per_user"');
    expect(ddl).not.toContain("one_active_per_lineage");
  });

  it("creates nothing and alters nothing", () => {
    const ddl = statements(migrationSql(C0B2));
    expect(ddl).not.toMatch(/CREATE\s+/i);
    expect(ddl).not.toMatch(/ALTER\s+/i);
    // No data touched: reconciling multi-ACTIVE sessions is a product
    // decision, and a migration that cancelled sessions would make it silently.
    expect(ddl).not.toMatch(/UPDATE\s+|DELETE\s+FROM/i);
  });
});

describe("C.0B3 · the runtime narrows to the lineage lock", () => {
  it("announces an unambiguous protocol", () => {
    // The drain gate reads this marker off each replica's boot line. It has to
    // name a sequence, not a release, so `dual-v1` and `lineage-v2` can never
    // be confused for one another in a mixed fleet.
    expect(GUIDE_START_LOCK_PROTOCOL).toBe("lineage-v2");
  });

  it("takes the lineage key and nothing else", () => {
    expect([...guideStartLockKeys("u-1", "guia-a")]).toEqual([
      lineageStartLockKey("u-1", "guia-a"),
    ]);
    // The global key coming back would silently re-serialise independent
    // journeys — the exact behaviour issue #639 exists to remove.
    expect([...guideStartLockKeys("u-1", "guia-a")]).not.toContain(
      globalStartLockKey("u-1"),
    );
  });

  it("START walks the authority instead of inlining keys", () => {
    const src = readFileSync(
      join(API_DIR, "src", "guide", "guide-lifecycle.service.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /guideStartLockKeys\(user\.userId, command\.guideKey\)/,
    );
    // Nothing in production may derive the global key any more.
    expect(src).not.toMatch(/globalStartLockKey/);
    expect(src).not.toMatch(/c0aStartLockKeys/);
  });

  it("leaves the session lock and the isolation level alone", () => {
    const src = readFileSync(
      join(API_DIR, "src", "guide", "guide-lifecycle.service.ts"),
      "utf8",
    );
    // `mutate()` still serialises per session, and the cross-lineage
    // idempotency contract still depends on READ COMMITTED. Neither is part of
    // this phase, and both would be easy to lose while editing the same file.
    expect(src).toMatch(/guide:session:\$\{/);
    expect(src).toMatch(/TransactionIsolationLevel\.ReadCommitted/);
  });
});

/**
 * No unscoped ACTIVE read may come back.
 *
 * The behavioural proof lives in `guide-multi-active-runtime.pg-spec.ts`, with
 * two real lineages in one database. This is the cheaper guard beside it: a
 * `findFirst` over `{ userId, status: ACTIVE }` returns an ARBITRARY lineage,
 * and once several may be ACTIVE that is a recovery answering about the wrong
 * journey. It passes every mocked test that only ever has one row.
 */
describe("C.0B2 · no path reads 'the user's ACTIVE session'", () => {
  const read = (f: string) =>
    readFileSync(join(API_DIR, "src", "guide", f), "utf8");

  it("the repository scopes its ACTIVE lookups by guideKey", () => {
    const src = read("guide-session.repository.ts");
    // `findActiveOwnForGuideKey` is the scoped read; the ONLY unscoped one is
    // `activeOwnCardinality`, which exists to PROVE the global index's promise
    // while GLOBAL is still the authority — it takes 2 rows and never returns
    // a session to act on.
    const unscoped = [
      ...src.matchAll(/where:\s*\{[^}]*status:\s*"ACTIVE"[^}]*\}/g),
    ].map((m) => m[0]);
    for (const clause of unscoped) {
      const scoped =
        clause.includes("guideKey") ||
        clause.includes("id: sessionId") ||
        clause.includes("sessionId");
      if (!scoped) {
        // The single documented exception, and it must stay bounded.
        expect(src).toMatch(/activeOwnCardinality[\s\S]{0,600}?take:\s*2/);
      }
    }
    expect(src).toMatch(
      /findActiveOwnForGuideKey[\s\S]{0,400}?where:\s*\{\s*userId,\s*guideKey,\s*status:\s*"ACTIVE"\s*\}/,
    );
  });

  it("recovery asks about the lineage it was given", () => {
    const src = read("guide-lifecycle.service.ts");
    expect(src).toMatch(
      /findRecoverableSession[\s\S]{0,1200}?findActiveOwnForGuideKey\(\s*userId,\s*pin\.guideKey,/,
    );
    // And keeps the belt-and-braces check that the row handed back is the one
    // asked for, so a repository change alone cannot reintroduce the bug.
    expect(src).toMatch(/session\.guideKey !== pin\.guideKey/);
  });

  it("the LINEAGE autocancel is scoped, and the GLOBAL one proves cardinality first", () => {
    const src = read("guide-lifecycle.service.ts");
    // LINEAGE branch: close only this lineage's ACTIVE session.
    expect(src).toMatch(
      /findActiveOwnForGuideKey\(\s*user\.userId,\s*definition\.guideKey,/,
    );
    // GLOBAL branch: never act on an arbitrary row — MULTIPLE is a refusal.
    expect(src).toMatch(/activeOwnCardinality\(/);
    expect(src).toMatch(/cardinality\.kind === "MULTIPLE"/);
  });
});
