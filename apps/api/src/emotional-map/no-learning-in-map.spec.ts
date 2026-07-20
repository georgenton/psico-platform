import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.2 — ratchet `no-learning-in-map` (ADR 0017 §6, "aprendizaje ≠ mapa").
 *
 * The Emotional Map RUNTIME must never import or query the educational log:
 * no `LearningEvent` model access, no `LearningEventRepository`, no
 * `GuideSession`, no import from the learning module. Resonance remains the
 * ONLY content-side signal, exclusively under ADR 0018 — that boundary has
 * its own ratchet (`arc-exception-scope.spec.ts`).
 *
 * Comments are stripped before matching: a doc comment may legitimately cite
 * the doctrine (`learning-vs-emotional-map.md`) — an import or a delegate
 * access may not. Tests and the research benchmark are not runtime and are
 * excluded.
 */

const MAP_ROOT = __dirname;

const FORBIDDEN: Array<[name: string, re: RegExp]> = [
  ["LearningEvent identifier", /\bLearningEvent\b/],
  ["learningEvent delegate", /\blearningEvent\b/],
  ["LearningEventRepository", /\bLearningEventRepository\b/],
  ["GuideSession identifier", /\bGuideSession\b|\bguideSession\b/],
  // No \b prefix: camelCase like `buildLearningReadModel` must also trip it.
  ["learning read-model naming", /learning[-_]?(event|progress|read)/i],
  ["import from the learning module", /from\s+"[^"]*\/learning[/"]/],
];

/** Strip block comments and line comments (keeping `https://…` intact). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

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
      // benchmark/ is the offline research persona bank, not runtime.
      if (entry === "benchmark") continue;
      walk(full, out);
    } else if (isRuntimeFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function findViolations(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([name]) => name);
}

describe("ratchet · no-learning-in-map", () => {
  const files = walk(MAP_ROOT);

  it("scans the map runtime (walker sanity)", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("emotional-map.service.ts"))).toBe(
      true,
    );
    expect(files.some((f) => f.endsWith("emotional-map.scoring.ts"))).toBe(
      true,
    );
  });

  it("no map runtime file references the learning system", () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const name of findViolations(readFileSync(file, "utf8"))) {
        violations.push(`${relative(MAP_ROOT, file)} → ${name}`);
      }
    }
    expect(violations).toEqual([]);
  });

  // ── Self-test: the matcher catches real offenses… ────────────────────────
  it("detects imports and queries in synthetic sources (self-test)", () => {
    const offenders = [
      'import { LearningEventRepository } from "../learning/learning-event.repository";',
      "const events = await prisma.learningEvent.findMany({ where });",
      "const s: GuideSession = await load(id);",
      'import { readLearningProgress } from "../learning/progress";',
      "const model = buildLearningReadModel(rows);",
    ];
    for (const src of offenders) {
      expect(findViolations(src).length, src).toBeGreaterThan(0);
    }
  });

  // ── …and does NOT punish a doctrine citation in a comment ────────────────
  it("ignores comment-only mentions (self-test)", () => {
    const innocent = [
      "// under EMOTIONAL_MAP_V2 the scoring omits them (learning-vs-emotional-map.md)",
      "/* LearningEvent must never feed axes — see ADR 0017 */ const x = 1;",
      // A doctrine-doc slug in live code (e.g. a docs URL): "vs" keeps it off
      // the read-model naming rule, and it carries no identifier or import.
      'const url = "https://example.com/learning-vs-emotional-map";',
    ];
    for (const src of innocent) {
      expect(findViolations(src), src).toEqual([]);
    }
  });
});
