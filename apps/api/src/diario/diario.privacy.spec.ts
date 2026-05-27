import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Privacy regression test (ADR 0007 §verification).
 *
 * The DiarioModule promises the backend NEVER logs ciphertext. This spec
 * walks every file under apps/api/src/diario/ and apps/api/src/home/ (the
 * two modules that touch DiaryEntry rows) and fails the build if any
 * source line passes `textCiphertext` into a logger/console call.
 *
 * Exempts:
 *   - JSDoc / line comments (explicitly opt-out marker "// E2E:" allowed)
 *   - .spec.ts files (this file itself reads from a string literal)
 *   - schema.prisma + README files
 */

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (full.endsWith(".ts") && !full.endsWith(".spec.ts"))
      files.push(full);
  }
  return files;
}

const PATTERN =
  /(?:console\.(?:log|debug|info|warn|error)|logger\.(?:log|debug|info|warn|error)|this\.logger\.(?:log|debug|info|warn|error))\s*\([^)]*\b(textCiphertext|textNonce|excerptCiphertext|wrappedKey|ciphertextForTherapist)\b/;

describe("diary privacy invariant — no ciphertext logging", () => {
  const roots = [
    join(__dirname),
    join(__dirname, "..", "home"),
    join(__dirname, "..", "users"),
  ];

  for (const root of roots) {
    it(`no log/console call references ciphertext fields under ${root}`, () => {
      const offenders: string[] = [];
      for (const file of walk(root)) {
        const content = readFileSync(file, "utf-8");
        if (PATTERN.test(content)) {
          offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
