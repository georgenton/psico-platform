import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dropWhenIdle } from "./pg-drop";

/**
 * The teardown contract of the PostgreSQL suites, kept by a test rather than
 * by memory.
 *
 * `pg-drop.ts` explains the defect in full. The short version: closing a pool
 * and then force-dropping its database in the next statement terminates
 * connections that were already leaving, and the resulting `FATAL 57P01` can
 * reach a client mid-close, where `pg.Pool` turns it into an uncaught
 * exception. The run then reports every test as passing and exits 1.
 *
 * It is a race, so it does not fail the same way twice: on 2026-10-25 the same
 * commit passed under `pull_request` and failed under `push`. That is exactly
 * the kind of defect that comes back the moment somebody writes the next
 * pg-spec by copying an older one — hence a static check, not a note.
 */

const SRC = join(__dirname, "..");

/** Both suffixes: the locks config runs `*.pg-spec.ts` AND four named E2E. */
const SUITE_FILE = /\.(pg-spec|e2e-spec)\.ts$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (SUITE_FILE.test(entry.name)) out.push(path);
  }
  return out;
}

const files = walk(SRC).map((path) => ({
  path,
  rel: path.slice(SRC.length + 1),
  body: readFileSync(path, "utf8"),
}));

/**
 * A `DROP DATABASE` sent straight down a pool, which is what `dropWhenIdle`
 * replaced. Deliberately narrow: it matches a CALL, so the prose in a comment
 * and the `'x"; DROP DATABASE postgres; --'` fixture that
 * `circles-account-deletion.pg-spec.ts` feeds to its identifier guard both
 * stay legal — that fixture is the point of that test.
 */
const RAW_DROP = /\.query\(\s*`?[^`)]*DROP DATABASE/g;

/** `const DB = "name"` / `const BASELINE_DB = "name"`, literals only. */
const NAMED_DB = /const\s+([A-Z_0-9]*DB[A-Z_0-9]*)\s*=\s*"([a-z][a-z0-9_]*)"/g;

describe("the PostgreSQL suites drop their databases through one helper", () => {
  it("scans the suite files it claims to scan", () => {
    // Guard the guard: a walk that finds nothing passes every assertion below
    // while protecting nothing at all.
    expect(files.length).toBeGreaterThan(60);
    expect(
      files.filter((f) => f.body.includes("dropWhenIdle(")).length,
    ).toBeGreaterThan(60);
  });

  it("no suite sends DROP DATABASE down a pool itself", () => {
    const culpables = files.flatMap((f) => {
      const hits = f.body.match(RAW_DROP) ?? [];
      return hits.length ? [`${f.rel} (${hits.length})`] : [];
    });
    // `dropWhenIdle` waits for our own backends to go before it forces. A
    // suite that drops on its own skips that wait, and brings the flake back.
    expect(culpables).toEqual([]);
  });

  it("no two suites claim the same throwaway database name", () => {
    const porNombre = new Map<string, string[]>();
    for (const f of files) {
      for (const [, , name] of f.body.matchAll(NAMED_DB)) {
        porNombre.set(name!, [...(porNombre.get(name!) ?? []), f.rel]);
      }
    }
    const repetidos = [...porNombre.entries()]
      .filter(([, owners]) => new Set(owners).size > 1)
      .map(([name, owners]) => `${name}: ${[...new Set(owners)].join(", ")}`);
    // Two files sharing a name means one drops the other's database mid-run,
    // which is the OTHER way to produce the same terminated connection — and
    // this time with a test failure, not just a dirty exit.
    expect(repetidos).toEqual([]);
    expect(porNombre.size).toBeGreaterThan(50);
  });
});

describe("dropWhenIdle guards the identifier", () => {
  /** Never reached: the guard throws before any query is attempted. */
  const unusedPool = {
    query: () => {
      throw new Error("the guard let an unsafe identifier through");
    },
  } as never;

  it("refuses a name it would have to escape to make safe", async () => {
    for (const bad of [
      'x"; DROP DATABASE postgres; --',
      "Mixed_Case",
      "1leading_digit",
      "with-hyphen",
      "",
      `a${"x".repeat(70)}`,
    ]) {
      await expect(dropWhenIdle(unusedPool, bad)).rejects.toThrow(
        /unsafe database identifier/,
      );
    }
  });

  it("accepts the shapes the suites actually generate", () => {
    // Not executed against a server here — this asserts the rule, which is
    // what the suites' own names have to satisfy.
    const rule = /^[a-z][a-z0-9_]{0,62}$/;
    for (const good of [
      "b4_pre_archive_db",
      "cc6f_runner_db",
      "pg_locks_12345",
      "circles_del_ab12cd",
      "psico_test_billing_123_abc_xyz",
      "authorship_repair_4821_m2k9x1",
    ]) {
      expect(rule.test(good), good).toBe(true);
    }
  });
});
