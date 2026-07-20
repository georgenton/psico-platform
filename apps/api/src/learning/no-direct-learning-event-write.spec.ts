import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.2 — ratchet `no-direct-learning-event-write` (ADR 0017 §5).
 *
 * Append-only does NOT depend on the absence of HTTP endpoints: an internal
 * `prisma.learningEvent.update(...)` anywhere in the API would silently break
 * the contract. This spec scans every RUNTIME source file under `apps/api/src`
 * and fails on:
 *
 *   - any Prisma write operation against the LearningEvent delegate outside
 *     the single authorized writer (`learning-event.repository.ts`), which
 *     itself may contain exactly ONE `createMany` (the sanctioned
 *     non-aborting `skipDuplicates` insert) and zero `create`/update/delete/
 *     upsert of any flavor;
 *   - any raw SQL `INSERT INTO "LearningEvent"` ANYWHERE, including the
 *     repository (its sanctioned primitive is the Prisma `createMany`, not
 *     raw SQL).
 *
 * Reads (`findUnique`, `findMany`, `count`, …) are not writes and stay free.
 *
 * Test files are excluded from the scan (they exercise the writer and this
 * very ratchet, and their fixture strings would otherwise self-trip it);
 * the guarantee they lose is exactly what the repository pg-specs cover.
 */

const SRC_ROOT = join(__dirname, "..");
const ALLOWED_FILE = "learning-event.repository.ts";

/** Write operations on the delegate. Longer alternatives first for clarity. */
const WRITE_RE =
  /\.\s*learningEvent\s*\.\s*(createMany|create|updateMany|update|deleteMany|delete|upsert)\s*\(/g;

/** Raw SQL insert into the table, however quoted/spaced. */
const SQL_INSERT_RE = /INSERT\s+INTO\s+"?LearningEvent"?/gi;

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
      // `src/test` holds harnesses/mocks, not runtime code.
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

function findSqlInserts(source: string): number {
  return (source.match(SQL_INSERT_RE) ?? []).length;
}

describe("ratchet · no-direct-learning-event-write", () => {
  const files = walk(SRC_ROOT);

  it("scans a non-trivial runtime surface (walker sanity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(ALLOWED_FILE))).toBe(true);
  });

  it("no LearningEvent write exists outside the authorized repository", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith(ALLOWED_FILE)) continue;
      const ops = findWrites(readFileSync(file, "utf8"));
      for (const op of ops) {
        violations.push(`${relative(SRC_ROOT, file)} → learningEvent.${op}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no raw SQL INSERT INTO LearningEvent exists ANYWHERE (repository included)", () => {
    const violations: string[] = [];
    for (const file of files) {
      const hits = findSqlInserts(readFileSync(file, "utf8"));
      if (hits > 0) {
        violations.push(`${relative(SRC_ROOT, file)} → ${hits} SQL INSERT(s)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the repository contains exactly ONE write: the sanctioned `createMany`", () => {
    const repoFile = files.find((f) => f.endsWith(ALLOWED_FILE));
    expect(repoFile).toBeDefined();
    const src = readFileSync(repoFile as string, "utf8");
    // Exactly one createMany (the non-aborting `skipDuplicates` insert),
    // zero `create` and zero update/delete/upsert of any flavor:
    expect(findWrites(src)).toEqual(["createMany"]);
    expect(src).toContain("skipDuplicates: true");
    expect(findSqlInserts(src)).toBe(0);
  });

  // ── Self-test: prove the scanner actually detects what it claims to ──────
  it("detects every prohibited operation in a synthetic source (self-test)", () => {
    const fixtures: Array<[string, string[]]> = [
      ["await prisma.learningEvent.create({ data })", ["create"]],
      ["await prisma.learningEvent.createMany({ data: rows })", ["createMany"]],
      ["await tx.learningEvent.update({ where, data })", ["update"]],
      ["await tx.learningEvent.updateMany({ where, data })", ["updateMany"]],
      ["await db.learningEvent.delete({ where })", ["delete"]],
      ["await db.learningEvent.deleteMany({ where })", ["deleteMany"]],
      ["await this.prisma.learningEvent.upsert({ where })", ["upsert"]],
      // Whitespace/newline formatting must not evade the scan:
      [
        "await prisma\n  .learningEvent\n  .deleteMany({ where })",
        ["deleteMany"],
      ],
    ];
    for (const [src, expected] of fixtures) {
      expect(findWrites(src), src).toEqual(expected);
    }
  });

  it("detects raw SQL inserts however they are written (self-test)", () => {
    const offenders = [
      'await prisma.$executeRaw`INSERT INTO "LearningEvent" (id) VALUES (${id})`',
      "pool.query('INSERT INTO \"LearningEvent\"(id) VALUES ($1)', [id])",
      "await tx.$executeRawUnsafe('insert into LearningEvent values (...)')",
      // Whitespace/newline formatting must not evade the scan:
      'INSERT  INTO\n  "LearningEvent" (id) VALUES ($1)',
    ];
    for (const src of offenders) {
      expect(findSqlInserts(src), src).toBeGreaterThan(0);
    }
    // Other tables' inserts are not this ratchet's business:
    expect(findSqlInserts('INSERT INTO "Highlight"(id) VALUES ($1)')).toBe(0);
  });

  it("does not flag reads or other delegates (self-test)", () => {
    for (const src of [
      "await prisma.learningEvent.findUnique({ where })",
      "await prisma.learningEvent.findMany({ where })",
      "await prisma.learningEvent.count({ where })",
      "await prisma.highlight.create({ data })",
    ]) {
      expect(findWrites(src), src).toEqual([]);
    }
  });
});
