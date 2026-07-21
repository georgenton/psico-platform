import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.4B — ratchet `no-direct-guide-step-write` (ADR 0019 §3).
 *
 * `GuideSessionStep` is the ONLY probative source of `stepsCompleted`; that
 * only holds if NOTHING outside the authorized repository can write it. This
 * spec scans every RUNTIME source file under `apps/api/src` and fails on:
 *
 *   - any Prisma write operation against the guideSessionStep delegate
 *     outside `guide-session-step.repository.ts`, which itself may contain
 *     exactly ONE `createMany` (the sanctioned non-aborting insert);
 *   - any raw SQL INSERT/UPDATE/DELETE against "GuideSessionStep" ANYWHERE,
 *     repository included.
 *
 * Reads stay free. Test files are excluded (their fixture strings would
 * self-trip the scan); what they lose is covered by the guide pg-specs.
 */

const SRC_ROOT = join(__dirname, "..");
const ALLOWED_FILE = "guide-session-step.repository.ts";

const WRITE_RE =
  /\.\s*guideSessionStep\s*\.\s*(createMany|create|updateMany|update|deleteMany|delete|upsert)\s*\(/g;

const SQL_WRITE_RE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?GuideSessionStep"?/gi;

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

describe("ratchet · no-direct-guide-step-write", () => {
  const files = walk(SRC_ROOT);

  it("scans a non-trivial runtime surface (walker sanity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(ALLOWED_FILE))).toBe(true);
  });

  it("no GuideSessionStep write exists outside the authorized repository", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith(ALLOWED_FILE)) continue;
      for (const op of findWrites(readFileSync(file, "utf8"))) {
        violations.push(`${relative(SRC_ROOT, file)} → guideSessionStep.${op}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no raw SQL write against GuideSessionStep exists ANYWHERE", () => {
    const violations: string[] = [];
    for (const file of files) {
      const hits = findSqlWrites(readFileSync(file, "utf8"));
      if (hits > 0) {
        violations.push(`${relative(SRC_ROOT, file)} → ${hits} SQL write(s)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the repository contains exactly ONE write: the sanctioned `createMany`", () => {
    const repoFile = files.find((f) => f.endsWith(ALLOWED_FILE));
    expect(repoFile).toBeDefined();
    const src = readFileSync(repoFile as string, "utf8");
    expect(findWrites(src)).toEqual(["createMany"]);
    expect(src).toContain("skipDuplicates: true");
    expect(findSqlWrites(src)).toBe(0);
  });

  // ── Self-tests: prove the scanner detects what it claims to ──────────────
  it("detects every prohibited delegate operation (self-test)", () => {
    const fixtures: Array<[string, string[]]> = [
      ["await prisma.guideSessionStep.create({ data })", ["create"]],
      ["await tx.guideSessionStep.createMany({ data: rows })", ["createMany"]],
      ["await tx.guideSessionStep.update({ where, data })", ["update"]],
      ["await db.guideSessionStep.updateMany({ where, data })", ["updateMany"]],
      ["await db.guideSessionStep.delete({ where })", ["delete"]],
      ["await db.guideSessionStep.deleteMany({ where })", ["deleteMany"]],
      ["await this.prisma.guideSessionStep.upsert({ where })", ["upsert"]],
      [
        "await prisma\n  .guideSessionStep\n  .deleteMany({ where })",
        ["deleteMany"],
      ],
    ];
    for (const [src, expected] of fixtures) {
      expect(findWrites(src), src).toEqual(expected);
    }
  });

  it("detects raw SQL writes however they are written (self-test)", () => {
    const offenders = [
      'await prisma.$executeRaw`INSERT INTO "GuideSessionStep" (id) VALUES (${id})`',
      'pool.query(\'UPDATE "GuideSessionStep" SET "order" = 2\', [])',
      "await tx.$executeRawUnsafe('delete from GuideSessionStep where true')",
      'INSERT  INTO\n  "GuideSessionStep" (id) VALUES ($1)',
    ];
    for (const src of offenders) {
      expect(findSqlWrites(src), src).toBeGreaterThan(0);
    }
    expect(findSqlWrites('INSERT INTO "Highlight"(id) VALUES ($1)')).toBe(0);
  });

  it("does not flag reads or other delegates (self-test)", () => {
    for (const src of [
      "await prisma.guideSessionStep.findUnique({ where })",
      "await prisma.guideSessionStep.findMany({ where })",
      "await prisma.guideSessionStep.count({ where })",
      "await prisma.guideCommandReceipt.create({ data })",
    ]) {
      expect(findWrites(src), src).toEqual([]);
    }
  });
});
