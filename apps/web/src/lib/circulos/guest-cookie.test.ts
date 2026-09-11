import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("server-only", () => ({}));

import {
  GUEST_COOKIE,
  guestCookieOptions,
  lifetimeSeconds,
} from "./guest-cookie";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function asProduction() {
  vi.stubEnv("NODE_ENV", "production");
}

describe("the guest cookie is not reachable from JavaScript", () => {
  it("is HttpOnly, and SameSite=Lax", () => {
    const o = guestCookieOptions("2030-01-01T00:00:00.000Z");
    // HttpOnly is the whole reason the raw guest token can live in a cookie at
    // all: `document.cookie` cannot read it, so an injected script on this
    // origin cannot exfiltrate somebody's session.
    expect(o.httpOnly).toBe(true);
    // Lax, not Strict: the person arrives by following a link somebody sent
    // them, and Strict would withhold the cookie on exactly that navigation.
    expect(o.sameSite).toBe("lax");
  });

  it("is Secure in a deployed environment", () => {
    asProduction();
    expect(guestCookieOptions("2030-01-01T00:00:00.000Z").secure).toBe(true);
  });

  it("is not Secure on localhost, where it would be silently dropped", () => {
    expect(guestCookieOptions("2030-01-01T00:00:00.000Z").secure).toBe(false);
  });

  it("has a name that does not describe its contents", () => {
    expect(GUEST_COOKIE).toBe("fv_circulo_guest");
    expect(GUEST_COOKIE).not.toMatch(/token|secret|session_?id/i);
  });
});

describe("the cookie never outlives the session it carries", () => {
  it("matches the session expiry when that is sooner than the ceiling", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    // One hour out.
    expect(lifetimeSeconds("2026-09-11T01:00:00.000Z")).toBe(3600);
  });

  it("caps at the ceiling when the session claims longer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    expect(lifetimeSeconds("2030-01-01T00:00:00.000Z")).toBe(14 * 24 * 60 * 60);
  });

  it("returns zero for an already-expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    // A cookie that outlives its token is a browser presenting a credential
    // the server stopped honouring — every click fails with no explanation.
    expect(lifetimeSeconds("2026-09-10T00:00:00.000Z")).toBe(0);
  });

  it("falls back to the ceiling, never to forever, on garbage", () => {
    expect(lifetimeSeconds("not-a-date")).toBe(14 * 24 * 60 * 60);
    expect(lifetimeSeconds(null)).toBe(14 * 24 * 60 * 60);
  });
});
