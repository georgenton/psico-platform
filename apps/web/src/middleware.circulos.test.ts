import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

/**
 * Exercises the middleware itself, not just the policy builder.
 *
 * `circulosCspFor` returning a good string proves nothing about whether that
 * string reaches the two places it has to reach. The nonce only works if Next
 * can SEE the policy on the incoming request — that is how it learns which
 * nonce to stamp on its inline scripts — and the browser only enforces it if
 * it is on the response. A test that checked the builder alone would pass
 * happily while the page failed to hydrate.
 */

function request(path: string): NextRequest {
  return new NextRequest(new URL(`https://app.test${path}`));
}

/** The nonce inside a policy string. */
function nonceOf(policy: string | null): string | null {
  if (!policy) return null;
  return (policy.match(/'nonce-([a-f0-9]+)'/) ?? [])[1] ?? null;
}

afterEach(() => vi.unstubAllEnvs());

const SENSITIVE = ["/i", "/compartir/act-1", "/api/circulos/sesion"];

describe("the policy reaches BOTH the request and the response", () => {
  it.each(SENSITIVE)("%s carries it on the request headers", async (path) => {
    const res = await middleware(request(path));
    // `NextResponse.next({ request: { headers } })` forwards the overridden
    // request headers through this response header.
    const forwarded = res.headers.get(
      "x-middleware-request-content-security-policy",
    );
    expect(forwarded, path).toBeTruthy();
    expect(forwarded).toContain("'strict-dynamic'");
  });

  it.each(SENSITIVE)("%s carries it on the response", async (path) => {
    const res = await middleware(request(path));
    const policy = res.headers.get("content-security-policy");
    expect(policy, path).toBeTruthy();
    expect(policy).toContain("default-src 'self'");
  });

  it.each(SENSITIVE)("%s uses ONE nonce everywhere", async (path) => {
    const res = await middleware(request(path));
    const onRequest = res.headers.get(
      "x-middleware-request-content-security-policy",
    );
    const onResponse = res.headers.get("content-security-policy");
    const xNonce = res.headers.get("x-middleware-request-x-nonce");

    // Three copies, one value. A mismatch anywhere means Next stamps one nonce
    // onto the scripts while the browser enforces another, and every inline
    // script is blocked.
    expect(nonceOf(onRequest)).toBeTruthy();
    expect(nonceOf(onRequest)).toBe(nonceOf(onResponse));
    expect(xNonce).toBe(nonceOf(onResponse));
  });

  it("mints a different nonce per request", async () => {
    const a = await middleware(request("/i"));
    const b = await middleware(request("/i"));
    expect(nonceOf(a.headers.get("content-security-policy"))).not.toBe(
      nonceOf(b.headers.get("content-security-policy")),
    );
  });
});

describe("production gets no escape hatch", () => {
  it("has neither unsafe-eval nor unsafe-inline in script-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await middleware(request("/i"));
    const policy = res.headers.get("content-security-policy") ?? "";
    const scriptSrc = policy
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));

    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("allows eval only in development, where hot reload needs it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = await middleware(request("/i"));
    expect(dev.headers.get("content-security-policy")).toContain(
      "'unsafe-eval'",
    );
  });
});

describe("the rest of the app is untouched", () => {
  it.each([
    "/",
    "/login",
    "/register",
    "/actividades/algo",
    "/index",
    "/imagenes",
  ])("%s gets no CSP from this middleware", async (path) => {
    const res = await middleware(request(path));
    expect(res.headers.get("content-security-policy"), path).toBeNull();
  });
});

/**
 * The defect a manual tester hit: "an error when closing the Dúo, on the
 * inviter's page".
 *
 * The access token lives fifteen minutes. A Dúo takes longer. This branch used
 * to return the CSP response early, so `/compartir/:id` and every
 * `/api/circulos/*` handler the room calls were the only authenticated
 * surfaces in the app that never renewed the pair — and once the token expired,
 * the actor resolver read 401 from the API, fell through, and answered
 * CIRCLE_FORBIDDEN. The room showed an error for a session that was alive, and
 * reloading could not fix it because reloading lands on a Círculos path too.
 */
describe("a Dúo outlives an access token", () => {
  /** A JWT with only the claim the middleware reads: `exp`. */
  function jwt(expSecondsFromNow: number): string {
    const body = Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
      }),
    ).toString("base64url");
    return `x.${body}.y`;
  }

  function withCookies(
    path: string,
    cookies: Record<string, string>,
  ): NextRequest {
    const req = new NextRequest(new URL(`https://app.test${path}`));
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
    return req;
  }

  const ROOM = "/compartir/act-1";
  const COMMAND = "/api/circulos/actividad/act-1/comando";

  afterEach(() => vi.unstubAllGlobals());

  /** The API's refresh endpoint, answering with a rotated pair. */
  function refreshReturns(pair: { accessToken: string; refreshToken: string }) {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(pair), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each([ROOM, COMMAND])(
    "%s renews the pair when the access token has expired",
    async (path) => {
      const fresh = { accessToken: jwt(900), refreshToken: "rt-new" };
      const fetchMock = refreshReturns(fresh);

      const res = await middleware(
        withCookies(path, { psico_at: jwt(-60), psico_rt: "rt-old" }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The renewed token reaches THIS request, which is what the room's own
      // handler reads a moment later.
      expect(res.headers.get("x-middleware-request-cookie")).toContain(
        fresh.accessToken,
      );
      // And the browser keeps the rotated pair.
      expect(res.headers.getSetCookie().join(" ")).toContain(fresh.accessToken);
      // Without losing the reason this branch exists.
      expect(res.headers.get("content-security-policy")).toContain(
        "'strict-dynamic'",
      );
    },
  );

  it("does not spend a refresh when the access token is still good", async () => {
    const fetchMock = refreshReturns({
      accessToken: "should-not-be-used",
      refreshToken: "nor-this",
    });
    await middleware(
      withCookies(ROOM, { psico_at: jwt(900), psico_rt: "rt-old" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a guest with no account untouched", async () => {
    // No refresh token: a guest's credential is their own cookie, and there is
    // nothing to renew. This must not become a refusal.
    const fetchMock = refreshReturns({ accessToken: "x", refreshToken: "y" });
    const res = await middleware(
      withCookies(ROOM, { fv_circulo_guest: "guest-secret" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("content-security-policy")).toBeTruthy();
  });

  it("ends the session when the refresh token itself is dead", async () => {
    // "Your session ended" and "this activity is not for you" are different
    // sentences; this one must not arrive dressed as a Círculos refusal.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    const res = await middleware(
      withCookies(ROOM, { psico_at: jwt(-60), psico_rt: "rt-dead" }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/logout");
  });
});
