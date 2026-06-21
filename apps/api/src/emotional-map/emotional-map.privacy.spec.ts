import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Privacy invariant (ADR 0007): the EmotionalMap module must NEVER pass
 * ciphertext to the LLM, log it, or include it in error messages. Same
 * guardrail as the diario.privacy.spec.ts and eco.privacy.spec.ts that
 * predate this module.
 *
 * The check is grep-based — if you legitimately need to reference one of
 * these tokens, add an inline `// privacy-allow: <why>` comment on the
 * same line and the check skips it.
 */
const ROOT = __dirname;
const FORBIDDEN = [
  "textCiphertext",
  "textNonce",
  "excerptCiphertext",
  "excerptNonce",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".spec.ts") &&
      !entry.endsWith(".test.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("EmotionalMap privacy invariant", () => {
  it("never references ciphertext or nonce fields in source files", () => {
    const files = walk(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        for (const token of FORBIDDEN) {
          if (line.includes(token) && !line.includes("privacy-allow:")) {
            offenders.push(`${file}:${i + 1} ${token}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
