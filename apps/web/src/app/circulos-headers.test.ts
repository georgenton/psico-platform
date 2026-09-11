import { describe, expect, it } from "vitest";

import { circulosCspFor, isCirculosPath } from "@/middleware";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require("../../next.config.js") as {
  headers: () => Promise<
    { source: string; headers: { key: string; value: string }[] }[]
  >;
};

/**
 * The sensitive routes carry their own headers, and the rest of the app does
 * not inherit them.
 *
 * Both halves matter. A strict CSP applied globally would break the surfaces
 * that legitimately load Google Identity Services and remote media, so this
 * asserts the scoping as well as the presence.
 */

const SENSITIVE = ["/i", "/compartir/:path*", "/api/circulos/:path*"];

async function headersFor(source: string) {
  const all = await nextConfig.headers();
  const entry = all.find((h) => h.source === source);
  if (!entry) return null;
  return Object.fromEntries(entry.headers.map((h) => [h.key, h.value]));
}

describe("the invitation door and the room are private by header", () => {
  it.each(SENSITIVE)(
    "%s is no-store, noindex and no-referrer",
    async (source) => {
      const h = await headersFor(source);
      expect(h).not.toBeNull();

      // A shared or borrowed device must not re-render somebody's reflection out
      // of the back/forward cache.
      expect(h!["Cache-Control"]).toBe("private, no-store");
      // An invitation link that reached a crawler is an invitation link in a
      // search index.
      expect(h!["X-Robots-Tag"]).toBe("noindex, nofollow");
      // The URL names an activity; it is not handed to whatever site is opened
      // next.
      expect(h!["Referrer-Policy"]).toBe("no-referrer");
    },
  );

  it.each(SENSITIVE)("%s refuses framing and sniffing", async (source) => {
    const h = await headersFor(source);
    expect(h!["X-Frame-Options"]).toBe("DENY");
    expect(h!["X-Content-Type-Options"]).toBe("nosniff");
  });

  it.each(SENSITIVE)(
    "%s carries no CSP here — it needs a nonce",
    async (source) => {
      // The CSP is deliberately NOT a static header. Next emits inline bootstrap
      // scripts on every App Router page, so a policy without a per-request nonce
      // blocks them and the page never hydrates — on `/i` that means the fragment
      // is never erased. It lives in the middleware instead; the tests below own
      // it.
      const h = await headersFor(source);
      expect(h!["Content-Security-Policy"]).toBeUndefined();
    },
  );
});

describe("the CSP is per request, and strict", () => {
  const csp = (path: string) => {
    const nonce = "a".repeat(32);
    return circulosCspFor(path, nonce);
  };

  it.each(["/i", "/compartir/act-1", "/api/circulos/sesion"])(
    "%s gets a nonce-based policy Next can hydrate under",
    (path) => {
      const value = csp(path);
      expect(value).not.toBeNull();
      expect(value).toContain(`'nonce-${"a".repeat(32)}'`);
      // Without `strict-dynamic` the nonce'd bootstrap cannot load its chunks.
      expect(value).toContain("'strict-dynamic'");
    },
  );

  it("loads nothing from a third party", () => {
    const value = csp("/i")!;
    expect(value).toContain("default-src 'self'");
    // No analytics, no pixel, no chat widget, no font CDN.
    expect(value).toContain("connect-src 'self'");
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).toContain("form-action 'self'");
    expect(value).toContain("base-uri 'none'");
    expect(value).toContain("object-src 'none'");
    expect(value).not.toContain("https://");
    // Scripts get no inline allowance, whatever styles need.
    expect(value).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("allows eval in development only", () => {
    // The dev runtime evaluates strings for hot reload. Production does not,
    // and must not be given the allowance because development needed it.
    const dev = circulosCspFor("/i", "n", "development")!;
    const prod = circulosCspFor("/i", "n", "production")!;
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("applies to the Círculos routes and to nothing else", () => {
    for (const path of ["/i", "/compartir/act-1", "/api/circulos/sesion"]) {
      expect(isCirculosPath(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/login",
      "/dashboard",
      "/dashboard/biblioteca",
      "/actividades/algo",
      "/index",
      "/imagenes",
      "/api/avatar",
    ]) {
      expect(isCirculosPath(path), path).toBe(false);
    }
  });
});

describe("the rest of the app is left alone", () => {
  it("does not put the strict CSP on /login or /register", async () => {
    for (const source of ["/login", "/register"]) {
      const h = await headersFor(source);
      expect(h).not.toBeNull();
      // These keep the COOP they need for Google Identity Services, and get no
      // CSP that would break it.
      expect(h!["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
      expect(h!["Content-Security-Policy"]).toBeUndefined();
    }
  });

  it("adds no global rule", async () => {
    const all = await nextConfig.headers();
    for (const entry of all) {
      expect(entry.source).not.toBe("/");
      expect(entry.source).not.toBe("/:path*");
      expect(entry.source).not.toBe("/(.*)");
    }
  });
});
