import { describe, expect, it } from "vitest";
import {
  canonicalizeIdempotencyKey,
  isCanonicalizableIdempotencyKey,
} from "./idempotency-key";

/**
 * CC-7.4B — the SHARED canonicalization extracted from CC-7.2's
 * LearningEventRepository. Same guarantees, one definition: UUID v1–8 with
 * canonical variant, case-insensitive input, lowercase canonical output,
 * pre-DB rejection of everything else, no input mutation, caller-supplied
 * value-free error.
 */

class TestInvalid extends Error {}
const invalid = () => new TestInvalid();

describe("shared idempotency-key canonicalization", () => {
  it("accepts UUID v1–v8 in any casing and canonicalizes to lowercase", () => {
    const upper = "CCCCCCCC-CCCC-4CCC-8CCC-000000000001";
    expect(canonicalizeIdempotencyKey(upper, invalid)).toBe(
      upper.toLowerCase(),
    );
    for (const version of [1, 4, 7, 8]) {
      const key = `cccccccc-cccc-${version}ccc-9ccc-000000000002`;
      expect(canonicalizeIdempotencyKey(key, invalid)).toBe(key);
    }
  });

  it("rejects non-UUIDs, bad versions/variants, whitespace and non-strings", () => {
    for (const bad of [
      "",
      "not-a-uuid",
      "cccccccc-cccc-0ccc-8ccc-000000000003", // version 0
      "cccccccc-cccc-9ccc-8ccc-000000000004", // version 9
      "cccccccc-cccc-4ccc-0ccc-000000000005", // non-canonical variant
      " cccccccc-cccc-4ccc-8ccc-000000000006", // whitespace
      "cccccccc-cccc-4ccc-8ccc-000000000007 ",
      42,
      null,
      undefined,
      {},
    ]) {
      expect(() => canonicalizeIdempotencyKey(bad, invalid)).toThrow(
        TestInvalid,
      );
      expect(isCanonicalizableIdempotencyKey(bad)).toBe(false);
    }
  });

  it("never mutates the input value", () => {
    const original = "CCCCCCCC-CCCC-4CCC-8CCC-000000000008";
    const copy = `${original}`;
    canonicalizeIdempotencyKey(original, invalid);
    expect(original).toBe(copy);
  });

  it("throws the CALLER'S error — one fresh instance per failure, no value inside", () => {
    let first: unknown;
    let second: unknown;
    try {
      canonicalizeIdempotencyKey("secret-value-abc", invalid);
    } catch (err) {
      first = err;
    }
    try {
      canonicalizeIdempotencyKey("secret-value-abc", invalid);
    } catch (err) {
      second = err;
    }
    expect(first).toBeInstanceOf(TestInvalid);
    expect(first).not.toBe(second);
    expect(String(first)).not.toContain("secret-value-abc");
  });
});
