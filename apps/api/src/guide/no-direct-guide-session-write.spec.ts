import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.4C — ratchet `no-direct-guide-session-write` (ADR 0019 §7).
 *
 * `GuideSession` carries the SERVER-owned progress projection
 * (GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP): a stray write could advance a
 * counter that the ledger never justified, or reopen a closed session. Same
 * discipline as the step-ledger and receipt ratchets: in `apps/api/src`
 * runtime code the only writes live in `guide-session.repository.ts` (the
 * `create` of START plus the ownership-predicated `updateMany`s), and there
 * is zero raw SQL against the table anywhere — raw SQL is reserved for
 * advisory locks, which write no row.
 */

const SRC_ROOT = join(__dirname, "..");
const ALLOWED_FILE = "guide-session.repository.ts";

const WRITE_RE =
  /\.\s*guideSession\s*\.\s*(createMany|create|updateMany|update|deleteMany|delete|upsert)\s*\(/g;

/**
 * A write statement against THIS table: either the quoted identifier as raw
 * SQL actually spells it, or a bare `GuideSession` followed by SQL syntax.
 * The bare form is deliberately anchored so English prose ("does NOT update
 * GuideSession, ...") and the sibling table `GuideSessionStep` — guarded by
 * its own ratchet — never register as violations.
 */
const SQL_WRITE_RE =
  /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"GuideSession"|GuideSession(?=\s*\(|\s+(?:SET|VALUES|WHERE|AS)\b))/gi;

function isRuntimeFile(path: string): boolean {
  if (!path.endsWith(".ts")) return false;
  if (path.endsWith(".d.ts")) return false;
  if (/\.(spec|pg-spec|e2e-spec|test)\.ts$/.test(path)) return false;
  return true;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "test") continue;
      walk(full, out);
    } else if (isRuntimeFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function findWrites(source: string): string[] {
  const ops: string[] = [];
  for (const m of source.matchAll(WRITE_RE)) {
    ops.push(m[1]);
  }
  return ops;
}

function findSqlWrites(source: string): number {
  return (source.match(SQL_WRITE_RE) ?? []).length;
}

describe("ratchet · no-direct-guide-session-write", () => {
  const files = walk(SRC_ROOT);

  it("scans a non-trivial runtime surface (walker sanity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(ALLOWED_FILE))).toBe(true);
  });

  it("no GuideSession write exists outside the authorized repository", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith(ALLOWED_FILE)) continue;
      for (const op of findWrites(readFileSync(file, "utf8"))) {
        violations.push(`${relative(SRC_ROOT, file)} → guideSession.${op}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no raw SQL write against GuideSession exists ANYWHERE", () => {
    const violations: string[] = [];
    for (const file of files) {
      const hits = findSqlWrites(readFileSync(file, "utf8"));
      if (hits > 0) {
        violations.push(`${relative(SRC_ROOT, file)} → ${hits} SQL write(s)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the repository contains ONLY the sanctioned create/updateMany writes", () => {
    const repoFile = files.find((f) => f.endsWith(ALLOWED_FILE));
    expect(repoFile).toBeDefined();
    const src = readFileSync(repoFile as string, "utf8");
    // The session writer legitimately uses `create` (START) and `updateMany`
    // (projection / cancel / complete, each with an ownership predicate).
    expect(new Set(findWrites(src))).toEqual(new Set(["create", "updateMany"]));
    expect(findSqlWrites(src)).toBe(0);
  });

  // ── Self-tests ───────────────────────────────────────────────────────────
  it("detects every prohibited delegate operation (self-test)", () => {
    const fixtures: Array<[string, string[]]> = [
      ["await prisma.guideSession.create({ data })", ["create"]],
      ["await tx.guideSession.createMany({ data })", ["createMany"]],
      ["await tx.guideSession.update({ where, data })", ["update"]],
      ["await db.guideSession.updateMany({ where })", ["updateMany"]],
      ["await db.guideSession.delete({ where })", ["delete"]],
      ["await db.guideSession.deleteMany({ where })", ["deleteMany"]],
      ["await this.prisma.guideSession.upsert({ w })", ["upsert"]],
      ["await prisma\n  .guideSession\n  .update({ where })", ["update"]],
    ];
    for (const [src, expected] of fixtures) {
      expect(findWrites(src), src).toEqual(expected);
    }
  });

  it("detects raw SQL writes however they are written (self-test)", () => {
    const offenders = [
      'await prisma.$executeRaw`INSERT INTO "GuideSession" (id) VALUES (${id})`',
      "pool.query('DELETE FROM \"GuideSession\" WHERE true')",
      "await tx.$executeRawUnsafe('update GuideSession set id = 1')",
      'INSERT  INTO\n  "GuideSession" (id) VALUES ($1)',
    ];
    for (const src of offenders) {
      expect(findSqlWrites(src), src).toBeGreaterThan(0);
    }
    expect(findSqlWrites('DELETE FROM "AuthEvent" WHERE true')).toBe(0);
  });

  it("does not flag prose or the sibling ledger table (self-test)", () => {
    for (const src of [
      // English prose in a doc comment is not a SQL statement.
      "It does NOT update GuideSession, does NOT emit LearningEvents",
      "// this repository will update GuideSession only via the projection",
      // GuideSessionStep has its own ratchet — this one must stay silent.
      'await tx.$executeRaw`INSERT INTO "GuideSessionStep" (id) VALUES (${id})`',
      "await tx.$executeRawUnsafe('update GuideSessionStep set id = 1')",
    ]) {
      expect(findSqlWrites(src), src).toBe(0);
    }
  });

  it("does not flag reads or other delegates (self-test)", () => {
    for (const src of [
      "await prisma.guideSession.findUnique({ where })",
      "await prisma.guideSession.findMany({ where })",
      "await prisma.guideSession.count({ where })",
      "await prisma.guideSessionStep.create({ data })",
    ]) {
      expect(findWrites(src), src).toEqual([]);
    }
  });
});
