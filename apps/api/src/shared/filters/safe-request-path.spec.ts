import { describe, expect, it } from "vitest";
import {
  safeRequestPath,
  UNMATCHED_API_PATH,
  UNMATCHED_PATH,
} from "./safe-request-path";

/**
 * CC-7.4D — the sanitizer is the single privacy boundary for every error
 * surface (logs, Sentry, envelope). These pin that a real id can never survive
 * it, whatever the route did.
 */

const SESSION = "cmb0abc1234567890";
const STEP = "explorar-cuerpo-antes-que-mente";

describe("safeRequestPath · resolved routes", () => {
  it("returns the matched route TEMPLATE, never the values", () => {
    const path = safeRequestPath({
      url: `/api/guide/sessions/${SESSION}/steps/${STEP}/complete?x=1`,
      route: { path: "/api/guide/sessions/:sessionId/steps/:stepKey/complete" },
    });
    expect(path).toBe("/api/guide/sessions/:sessionId/steps/:stepKey/complete");
    expect(path).not.toContain(SESSION);
    expect(path).not.toContain(STEP);
    expect(path).not.toContain("?");
  });

  it("honours a mount prefix without duplicating the slash", () => {
    expect(
      safeRequestPath({
        baseUrl: "/api",
        route: { path: "/guide/sessions/:sessionId/cancel" },
      }),
    ).toBe("/api/guide/sessions/:sessionId/cancel");
    expect(safeRequestPath({ route: { path: "guide/x" } })).toBe("/guide/x");
  });
});

describe("safeRequestPath · unresolved routes fail closed", () => {
  /**
   * Without a template there is no way to tell a fixed route word from a value:
   * the route table that could have told them apart is precisely the one that
   * just failed to match. So NOTHING from the request survives — the result is
   * a constant, and every one of these inputs collapses onto it.
   */
  const apiCases = [
    "/api/x/12345",
    "/api/x/alice",
    "/api/x/ses-que-no-existe",
    "/api/x/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "/api/x/%2Fsecret",
    "/api/x/value?token=secret",
    `/api/guide/sessions/${SESSION}/steps/${STEP}/complete`,
    "/api",
  ];

  it("collapses every API path onto one constant with no input in it", () => {
    for (const raw of apiCases) {
      const path = safeRequestPath({ path: raw.split("?")[0], url: raw });
      expect(path, raw).toBe(UNMATCHED_API_PATH);
      // No segment, query value or id of the request survives.
      for (const fragment of [
        "12345",
        "alice",
        "ses-que-no-existe",
        "aaaaaaaa",
        "secret",
        "token",
        SESSION,
        STEP,
      ]) {
        expect(path.includes(fragment), `${raw} → ${fragment}`).toBe(false);
      }
    }
  });

  it("uses the non-API constant for anything outside the prefix", () => {
    for (const raw of ["/health", "/", "/apiary/x", "/favicon.ico"]) {
      expect(safeRequestPath({ path: raw }), raw).toBe(UNMATCHED_PATH);
    }
  });

  it("takes the prefix bit from `path`, then originalUrl, then url", () => {
    expect(safeRequestPath({ originalUrl: "/api/x?y=1" })).toBe(
      UNMATCHED_API_PATH,
    );
    expect(safeRequestPath({ url: "/api/x" })).toBe(UNMATCHED_API_PATH);
    expect(safeRequestPath({ url: "/other" })).toBe(UNMATCHED_PATH);
  });

  it("never throws on a malformed request object", () => {
    expect(safeRequestPath({})).toBe(UNMATCHED_PATH);
    expect(safeRequestPath({ route: null })).toBe(UNMATCHED_PATH);
    expect(safeRequestPath({ route: { path: 42 }, path: "/api/x" })).toBe(
      UNMATCHED_API_PATH,
    );
  });

  it("returns only the two declared constants — nothing derived", () => {
    const seen = new Set(
      [...apiCases, "/health", "/", "/x/y/z"].map((raw) =>
        safeRequestPath({ path: raw.split("?")[0], url: raw }),
      ),
    );
    expect([...seen].sort()).toEqual(
      [UNMATCHED_API_PATH, UNMATCHED_PATH].sort(),
    );
  });
});
