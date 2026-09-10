import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  CODE_MIN_LENGTH,
  HASH_RE,
  hashSecret,
  hashesMatch,
  mintInvitationCode,
  mintInvitationToken,
  normalizeCode,
} from "./circles-secrets";

/**
 * The secret primitives (spec §E).
 *
 * The properties under test are the ones a later refactor could quietly break:
 * the alphabet has no confusable pair, the code is long enough, the hash is the
 * exact shape the SQL CHECK will accept, and the comparison is length-safe.
 */

const AMBIGUOUS = ["0", "O", "1", "I", "L", "U"];

describe("circles secrets · the human code", () => {
  it("is at least as long as the floor the spec sets", () => {
    expect(CODE_LENGTH).toBeGreaterThanOrEqual(CODE_MIN_LENGTH);
    expect(mintInvitationCode().raw).toHaveLength(CODE_LENGTH);
  });

  it("refuses to mint below the floor", () => {
    expect(() => mintInvitationCode(CODE_MIN_LENGTH - 1)).toThrow(
      "CIRCLE_CODE_LENGTH_BELOW_MINIMUM",
    );
  });

  it("never contains a confusable character", () => {
    // Read aloud over a phone or typed off a screen, `0`/`O` and `1`/`I`/`L`
    // are the same character. A code that can be transcribed wrong is a code
    // that produces support tickets indistinguishable from attacks.
    const sample = Array.from({ length: 400 }, () => mintInvitationCode().raw)
      .join("")
      .split("");
    for (const ch of AMBIGUOUS) {
      expect(sample, `contains ${ch}`).not.toContain(ch);
    }
    expect(new Set(sample).size).toBeGreaterThan(20);
  });

  it("draws from the alphabet without an obvious bias", () => {
    // Rejection sampling, not `% 30`. With modulo folding the first 16 letters
    // would be ~14% likelier than the last 14, which is the kind of thing that
    // is invisible until somebody counts.
    const counts = new Map<string, number>();
    for (const ch of Array.from(
      { length: 3000 },
      () => mintInvitationCode().raw,
    ).join("")) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // Generous: this is a smoke test for a systematic skew, not a chi-square.
    for (const [ch, n] of counts) {
      expect(Math.abs(n - mean) / mean, ch).toBeLessThan(0.25);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(
      Array.from({ length: 500 }, () => mintInvitationCode().raw),
    );
    expect(seen.size).toBe(500);
  });
});

describe("circles secrets · normalization is injective", () => {
  it("strips separators and uppercases", () => {
    expect(normalizeCode(" a2b-3c4 d5 ")).toBe("A2B3C4D5");
    expect(normalizeCode("abc.def")).toBe("ABCDEF");
  });

  it("never merges two distinct codes", () => {
    // Uppercasing is injective over an alphabet that is already uppercase, and
    // there is deliberately NO `0`→`O` style mapping: the alphabet contains
    // neither member of any confusable pair, so a mapping would have nothing
    // to reconcile and could only introduce a collision.
    const codes = Array.from({ length: 800 }, () => mintInvitationCode().raw);
    expect(new Set(codes.map(normalizeCode)).size).toBe(new Set(codes).size);
  });

  it("leaves a value outside the alphabet alone rather than repairing it", () => {
    // Repairing it would be a distinct code path for a distinct kind of wrong
    // value, and a distinct code path is something an attacker can measure.
    expect(normalizeCode("0OIL1U")).toBe("0OIL1U");
  });
});

describe("circles secrets · hashing and comparison", () => {
  it("produces exactly the shape the SQL CHECK accepts", () => {
    for (const raw of [mintInvitationToken().raw, mintInvitationCode().raw]) {
      const hash = hashSecret(raw);
      expect(hash).toMatch(HASH_RE);
      expect(hash).toHaveLength(64);
      expect(hash).toBe(hash.toLowerCase());
    }
  });

  it("is plain SHA-256 of the raw value", () => {
    const raw = "any-value";
    expect(hashSecret(raw)).toBe(
      createHash("sha256").update(raw, "utf8").digest("hex"),
    );
  });

  it("never returns the raw value in the minted pair's hash", () => {
    const token = mintInvitationToken();
    expect(token.hash).not.toContain(token.raw);
    expect(token.raw).not.toBe(token.hash);
    const code = mintInvitationCode();
    expect(code.hash).not.toContain(code.raw);
  });

  it("compares equal hashes and rejects different ones", () => {
    const a = hashSecret("a");
    const b = hashSecret("b");
    expect(hashesMatch(a, a)).toBe(true);
    expect(hashesMatch(a, b)).toBe(false);
  });

  it("returns false on a length mismatch instead of throwing", () => {
    // `timingSafeEqual` throws on differing lengths. A throw here would become
    // a 500 for a malformed value and a 404 for a wrong one — two answers
    // where the design promises one.
    expect(hashesMatch(hashSecret("a"), "short")).toBe(false);
    expect(hashesMatch("", hashSecret("a"))).toBe(false);
  });

  it("mints tokens that do not collide", () => {
    const tokens = Array.from({ length: 500 }, () => mintInvitationToken());
    expect(new Set(tokens.map((t) => t.raw)).size).toBe(500);
    expect(new Set(tokens.map((t) => t.hash)).size).toBe(500);
  });
});
