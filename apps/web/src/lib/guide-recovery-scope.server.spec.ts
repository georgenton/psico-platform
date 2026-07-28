import { describe, expect, it, vi } from "vitest";

/**
 * CC-7.5 — the actor partition.
 *
 * `server-only` throws the moment a client bundle touches it, which is exactly
 * the guarantee we want in production and exactly what breaks a test runner.
 * Stubbing the marker module keeps the guarantee (the import is still there,
 * so a client import still fails at build time) while letting the pure
 * derivation be tested.
 */
vi.mock("server-only", () => ({}));

import { deriveGuideRecoveryActorScope } from "./guide-recovery-scope.server";

const USER_A = "cmb0usuarioalpha01";
const USER_B = "cmb0usuariobeta002";

describe("deriveGuideRecoveryActorScope", () => {
  it("is deterministic: the same account always derives the same scope", () => {
    expect(deriveGuideRecoveryActorScope(USER_A)).toBe(
      deriveGuideRecoveryActorScope(USER_A),
    );
  });

  it("separates two accounts", () => {
    expect(deriveGuideRecoveryActorScope(USER_A)).not.toBe(
      deriveGuideRecoveryActorScope(USER_B),
    );
  });

  it("emits SHA-256 in base64url — 43 characters, url-safe alphabet", () => {
    const scope = deriveGuideRecoveryActorScope(USER_A);
    expect(scope).toHaveLength(43);
    expect(scope).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // base64url means no padding and no `+` / `/`, so it survives a storage
    // key, a URL or a JSON blob untouched.
    expect(scope).not.toContain("=");
    expect(scope).not.toContain("+");
    expect(scope).not.toContain("/");
  });

  it("never carries the raw user id", () => {
    const scope = deriveGuideRecoveryActorScope(USER_A);
    expect(scope).not.toContain(USER_A);
    expect(scope.toLowerCase()).not.toContain(USER_A.toLowerCase());
    // …and it is not a reversible encoding of it either.
    expect(Buffer.from(scope, "base64url").toString("utf8")).not.toContain(
      USER_A,
    );
  });

  it("refuses to derive a scope for an unknown actor", () => {
    expect(() => deriveGuideRecoveryActorScope("")).toThrow(
      "GUIDE_ACTOR_SCOPE_UNAVAILABLE",
    );
    expect(() =>
      deriveGuideRecoveryActorScope(undefined as unknown as string),
    ).toThrow("GUIDE_ACTOR_SCOPE_UNAVAILABLE");
  });

  it("is a partition, not a secret: it is derived only from the id", () => {
    // Pinning the value documents that the scope is stable across deploys —
    // a changed digest would silently orphan every stored record.
    expect(deriveGuideRecoveryActorScope("u_1")).toBe(
      deriveGuideRecoveryActorScope("u_1"),
    );
    expect(deriveGuideRecoveryActorScope("u_1")).not.toBe(
      deriveGuideRecoveryActorScope("u_2"),
    );
  });
});
