import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.4B — ratchet `no-direct-guide-receipt-write` (ADR 0019 §7).
 *
 * `GuideCommandReceipt` is the ONE transversal replay/conflict authority of
 * the Guide commands; a stray write would forge or destroy idempotency
 * history. Same discipline as the step-ledger ratchet: the only write
 * primitive in `apps/api/src` runtime code is the one `createMany` in
 * `guide-command-receipt.repository.ts`, and zero raw SQL writes anywhere.
 */

const SRC_ROOT = join(__dirname, "..");
const ALLOWED_FILE = "guide-command-receipt.repository.ts";

const WRITE_RE =
  /\.\s*guideCommandReceipt\s*\.\s*(createMany|create|updateMany|update|deleteMany|delete|upsert)\s*\(/g;

const SQL_WRITE_RE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?GuideCommandReceipt"?/gi;

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

describe("ratchet · no-direct-guide-receipt-write", () => {
  const files = walk(SRC_ROOT);

  it("scans a non-trivial runtime surface (walker sanity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(ALLOWED_FILE))).toBe(true);
  });

  it("no GuideCommandReceipt write exists outside the authorized repository", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith(ALLOWED_FILE)) continue;
      for (const op of findWrites(readFileSync(file, "utf8"))) {
        violations.push(
          `${relative(SRC_ROOT, file)} → guideCommandReceipt.${op}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("no raw SQL write against GuideCommandReceipt exists ANYWHERE", () => {
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

  // ── Self-tests ───────────────────────────────────────────────────────────
  it("detects every prohibited delegate operation (self-test)", () => {
    const fixtures: Array<[string, string[]]> = [
      ["await prisma.guideCommandReceipt.create({ data })", ["create"]],
      ["await tx.guideCommandReceipt.createMany({ data })", ["createMany"]],
      ["await tx.guideCommandReceipt.update({ where, data })", ["update"]],
      ["await db.guideCommandReceipt.updateMany({ where })", ["updateMany"]],
      ["await db.guideCommandReceipt.delete({ where })", ["delete"]],
      ["await db.guideCommandReceipt.deleteMany({ where })", ["deleteMany"]],
      ["await this.prisma.guideCommandReceipt.upsert({ w })", ["upsert"]],
      [
        "await prisma\n  .guideCommandReceipt\n  .update({ where })",
        ["update"],
      ],
    ];
    for (const [src, expected] of fixtures) {
      expect(findWrites(src), src).toEqual(expected);
    }
  });

  it("detects raw SQL writes however they are written (self-test)", () => {
    const offenders = [
      'await prisma.$executeRaw`INSERT INTO "GuideCommandReceipt" (id) VALUES (${id})`',
      "pool.query('DELETE FROM \"GuideCommandReceipt\" WHERE true')",
      "await tx.$executeRawUnsafe('update GuideCommandReceipt set id = 1')",
      'INSERT  INTO\n  "GuideCommandReceipt" (id) VALUES ($1)',
    ];
    for (const src of offenders) {
      expect(findSqlWrites(src), src).toBeGreaterThan(0);
    }
    expect(findSqlWrites('DELETE FROM "AuthEvent" WHERE true')).toBe(0);
  });

  it("does not flag reads or other delegates (self-test)", () => {
    for (const src of [
      "await prisma.guideCommandReceipt.findUnique({ where })",
      "await prisma.guideCommandReceipt.findMany({ where })",
      "await prisma.guideCommandReceipt.count({ where })",
      "await prisma.guideSessionStep.create({ data })",
    ]) {
      expect(findWrites(src), src).toEqual([]);
    }
  });
});
