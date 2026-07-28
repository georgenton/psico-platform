import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";
import { TOKEN_NAMES } from "./lib/cookies";

/**
 * PR #596 — the refresh handoff, tested through the REAL middleware.
 *
 * The bug this closes: `serverFetch` rotated the token pair during a Server
 * Component render, but `cookies().set()` throws there, so the rotated pair
 * never reached the browser. The API had revoked the old refresh token while
 * the browser kept holding it — the NEXT navigation's refresh failed and the
 * user was force-logged-out.
 *
 * The fix moves rotation into the middleware, the one place that can write
 * cookies. These tests mock the NETWORK (`fetch`) — never a domain seam — so
 * they exercise the handoff end to end: request cookies updated for THIS
 * render, response cookies persisted for the browser, exactly one refresh call.
 */

const OLD_ACCESS_EXPIRED = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
const OLD_ACCESS_FRESH = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
const OLD_REFRESH = "refresh-token-old";
const NEW_ACCESS = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
const NEW_REFRESH = "refresh-token-new";

/** A minimal unsigned JWT carrying only an `exp` — all the middleware reads. */
function jwtWithExp(exp: number): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url({ exp })}.sig`;
}

function requestFor(
  path: string,
  cookies: Partial<Record<"access" | "refresh", string>>,
): NextRequest {
  const req = new NextRequest(new URL(`http://localhost${path}`), {});
  if (cookies.access) req.cookies.set(TOKEN_NAMES.access, cookies.access);
  if (cookies.refresh) req.cookies.set(TOKEN_NAMES.refresh, cookies.refresh);
  return req;
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockRefresh(
  impl: () => Promise<Response> | Response,
): ReturnType<typeof vi.fn> {
  fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okPair(): Response {
  return new Response(
    JSON.stringify({ accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("middleware — refresh handoff", () => {
  it("does not refresh when the access token is still valid", async () => {
    const spy = mockRefresh(okPair);
    const res = await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_FRESH,
        refresh: OLD_REFRESH,
      }),
    );

    expect(spy).not.toHaveBeenCalled();
    // Untouched: no rotated cookies on the response.
    expect(res.cookies.get(TOKEN_NAMES.access)).toBeUndefined();
    expect(res.cookies.get(TOKEN_NAMES.refresh)).toBeUndefined();
  });

  it("rotates exactly once when the access token is expired", async () => {
    const spy = mockRefresh(okPair);
    const req = requestFor("/dashboard", {
      access: OLD_ACCESS_EXPIRED,
      refresh: OLD_REFRESH,
    });
    const res = await middleware(req);

    // AUTH_REFRESH_CALLS_PER_NAVIGATION = 1 — never a second concurrent call.
    expect(spy).toHaveBeenCalledTimes(1);
    // ROTATED_*_COOKIE_PERSISTED — the browser receives the new pair.
    expect(res.cookies.get(TOKEN_NAMES.access)?.value).toBe(NEW_ACCESS);
    expect(res.cookies.get(TOKEN_NAMES.refresh)?.value).toBe(NEW_REFRESH);
    // The old refresh token is NOT reused on the response.
    expect(res.cookies.get(TOKEN_NAMES.refresh)?.value).not.toBe(OLD_REFRESH);
    // Forwarded to THIS render: downstream `cookies()` reads the new access.
    expect(req.cookies.get(TOKEN_NAMES.access)?.value).toBe(NEW_ACCESS);
  });

  it("rotates when the access token is absent but a refresh token exists", async () => {
    const spy = mockRefresh(okPair);
    const res = await middleware(
      requestFor("/dashboard", { refresh: OLD_REFRESH }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.cookies.get(TOKEN_NAMES.access)?.value).toBe(NEW_ACCESS);
  });

  it("sends the refresh token only in the JSON body, never the URL", async () => {
    const spy = mockRefresh(okPair);
    await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).not.toContain(OLD_REFRESH);
    expect(String(url)).toContain("/api/auth/refresh");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain(OLD_REFRESH);
  });

  it("ends the session (→ /logout) only when the refresh token is revoked", async () => {
    mockRefresh(() => new Response("nope", { status: 401 }));
    const res = await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/logout");
  });

  it("returns a safe temporary failure on 429 (no logout, no cookie clear)", async () => {
    mockRefresh(() => new Response("slow down", { status: 429 }));
    const res = await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );

    expect(res.status).toBe(503);
    // No redirect, so no /login → /dashboard loop.
    expect(res.headers.get("location")).toBeNull();
    // Cookies untouched — the session may still be valid.
    expect(res.cookies.get(TOKEN_NAMES.access)).toBeUndefined();
    expect(res.cookies.get(TOKEN_NAMES.refresh)).toBeUndefined();
  });

  it("returns a safe temporary failure on 500", async () => {
    mockRefresh(() => new Response("boom", { status: 500 }));
    const res = await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
  });

  it("treats a 200 with a missing pair as transient, not a revocation", async () => {
    mockRefresh(
      () =>
        new Response(JSON.stringify({ accessToken: NEW_ACCESS }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const res = await middleware(
      requestFor("/dashboard", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );
    expect(res.status).toBe(503);
  });

  it("does not run the handoff outside authenticated areas", async () => {
    const spy = mockRefresh(okPair);
    // A public marketing path with an expired access + refresh present.
    const res = await middleware(
      requestFor("/some-public-page", {
        access: OLD_ACCESS_EXPIRED,
        refresh: OLD_REFRESH,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(res.status).not.toBe(503);
  });

  it("runs the handoff for /onboarding and /autor too", async () => {
    for (const path of ["/onboarding", "/autor/libros"]) {
      const spy = mockRefresh(okPair);
      await middleware(
        requestFor(path, { access: OLD_ACCESS_EXPIRED, refresh: OLD_REFRESH }),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    }
  });
});

describe("middleware — session gates (unchanged)", () => {
  it("redirects a protected path with no session to /login", async () => {
    const res = await middleware(requestFor("/dashboard", {}));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("from=%2Fdashboard");
  });

  it("redirects an auth page with a session to /dashboard", async () => {
    const res = await middleware(
      requestFor("/login", { refresh: OLD_REFRESH }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });
});
