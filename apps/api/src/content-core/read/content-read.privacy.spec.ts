import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-6A firewall: the read adapter must NEVER reference the Emotional Map,
 * LearningEvent, or mood/scoring. It reads content only.
 */

const READ_DIR = join(process.cwd(), "src/content-core/read");

const FORBIDDEN: RegExp[] = [
  /emotional-?map/i,
  /EmotionalMap/,
  /LearningEvent/,
  /\bMapa\b/,
  /mood/i,
  /resonance/i,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    if (!name.endsWith(".ts")) return [];
    if (name.includes("spec.ts")) return []; // skip test files (incl. this one)
    return [p];
  });
}

/** Strip comments so the firewall scans CODE only (prose may name the ban). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("Content Core · CC-6A read adapter — Emotional Map firewall", () => {
  it("no read-adapter source references the Emotional Map / LearningEvent", () => {
    const files = sourceFiles(READ_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((f) => {
      const code = stripComments(readFileSync(f, "utf8"));
      return FORBIDDEN.some((re) => re.test(code));
    });
    expect(offenders).toEqual([]);
  });
});
