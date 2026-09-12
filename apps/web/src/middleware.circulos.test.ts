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
