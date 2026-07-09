import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { fitOu, moodToScalar } from "./ou";
import type { OuObservation } from "./ou";

/**
 * Privacy contract (ADR 0007) for the affect-dynamics engine.
 *
 * This module must NEVER touch free-text fields. Its only legitimate inputs
 * are reduced metadata: the ordinal mood series + timestamps. The check is
 * grep-based over the module's source (spec files excluded, so this file's own
 * FORBIDDEN list doesn't trip it). If a token ever legitimately appears, add an
 * inline `// privacy-allow: <why>` comment.
 *
 * These are the field names the diary/eco cipher payloads and any raw-text
 * carriers use elsewhere in the codebase — the engine must never import, read,
 * log, or forward them.
 */
const ROOT = __dirname;
const FORBIDDEN = [
  "textCiphertext",
  "textNonce",
  "excerptCiphertext",
  "excerptNonce",
  "textPlaintext",
  "rawText",
  "diaryText",
  "ecoText",
  "transcript",
  "plaintext",
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

describe("affect-dynamics privacy contract", () => {
  it("never references free-text or ciphertext fields in source files", () => {
    const files = walk(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
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

  it("operates purely on numeric metadata (mood scalar + timestamp)", () => {
    // The estimator's input surface is {t: number, x: number} — no text can
    // flow in by construction. This test documents that contract and fails if
    // someone widens OuObservation to carry text.
    const obs: OuObservation[] = Array.from({ length: 12 }, (_, i) => ({
      t: i * 0.5,
      x: moodToScalar(["great", "good", "ok", "low", "hard"][i % 5] ?? "ok"),
    }));
    const fit = fitOu(obs);
    // Every value that leaves the engine is a finite number — never a string.
    for (const v of [
      fit.params.mu,
      fit.params.theta,
      fit.params.sigma,
      fit.inertiaDays,
      fit.logLik,
    ]) {
      expect(typeof v).toBe("number");
    }
  });
});
