import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Privacy regression test (ADR 0007 §verification + Sprint S10 §3 decision 1).
 *
 * The EcoModule promises the backend never persists OR logs the ephemeral
 * `textPlaintext` field (only the ciphertext gets persisted). This spec
 * walks every file under apps/api/src/eco/ and fails the build if any
 * source line passes `textPlaintext`, `textCiphertext`, or `textNonce`
 * into a logger/console call.
 *
 * Mirror of diario.privacy.spec.ts — keep them in sync if you tweak the
 * regex.
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
  /(?:console\.(?:log|debug|info|warn|error)|logger\.(?:log|debug|info|warn|error)|this\.logger\.(?:log|debug|info|warn|error))\s*\([^)]*\b(textPlaintext|textCiphertext|textNonce|titleCiphertext|titleNonce)\b/;

describe("Eco privacy invariant — no plaintext or ciphertext logging", () => {
  const roots = [join(__dirname)];

  for (const root of roots) {
    it(`no log/console call references private fields under ${root}`, () => {
      const offenders: string[] = [];
      for (const file of walk(root)) {
        const content = readFileSync(file, "utf-8");
        if (PATTERN.test(content)) {
          offenders.push(file);
        }
      }
      expect(
        offenders,
        `Found logger/console calls referencing sensitive Eco fields:\n${offenders.join(
          "\n",
        )}`,
      ).toHaveLength(0);
    });
  }
});
