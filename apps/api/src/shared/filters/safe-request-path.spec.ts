import { describe, expect, it } from "vitest";
import { safeRequestPath } from "./safe-request-path";

/**
 * CC-7.4D — the sanitizer is the single privacy boundary for every error
 * surface (logs, Sentry, envelope). These tests pin that a real id can never
 * survive it, whatever the route did.
 */

const SESSION = "cmb0abc1234567890";
const STEP = "explorar-cuerpo-antes-que-mente";

describe("safeRequestPath", () => {
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

  it("drops the query string on an unmatched route", () => {
    expect(
      safeRequestPath({ path: "/api/unknown", url: "/api/unknown?token=abc" }),
    ).toBe("/api/unknown");
  });

  it("redacts id-looking segments when there is no template", () => {
    const path = safeRequestPath({
      path: `/api/guide/sessions/${SESSION}/cancel`,
    });
    expect(path).toBe("/api/guide/sessions/:redacted/cancel");
    expect(path).not.toContain(SESSION);
  });

  it("keeps fixed route words readable", () => {
    expect(safeRequestPath({ path: "/api/guide/sessions" })).toBe(
      "/api/guide/sessions",
    );
    expect(safeRequestPath({ path: "/api/health/integrations" })).toBe(
      "/api/health/integrations",
    );
  });

  it("redacts uuids, cuids and anything long or mixed", () => {
    for (const id of [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "cmb0abc123",
      "AbCdEf",
      "user@example.test",
      "a".repeat(40),
    ]) {
      expect(safeRequestPath({ path: `/api/x/${id}` }), id).toBe(
        "/api/x/:redacted",
      );
    }
  });

  it("never throws on a malformed request object", () => {
    expect(safeRequestPath({})).toBe("/");
    expect(safeRequestPath({ route: null })).toBe("/");
    expect(safeRequestPath({ route: { path: 42 }, path: "/api/x" })).toBe(
      "/api/x",
    );
  });
});
