/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@psico/ui", "@psico/types"],

  // Google Identity Services (the "Continuar con Google" button) opens a
  // popup or uses FedCM and needs to call `window.postMessage` back to the
  // parent window. Modern browsers block that call when the parent has
  // `Cross-Origin-Opener-Policy: same-origin` (the default Next.js sets in
  // some deployments / under certain headers).
  //
  // The fix is to set COOP to `same-origin-allow-popups` on the auth pages
  // where the GIS button lives. We scope the header only to /login and
  // /register so the rest of the app keeps the stricter default if it
  // ever gets one.
  async headers() {
    return [
      {
        source: "/login",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        source: "/register",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      // ── Círculos: the invitation door, the room, and their handlers ────────
      //
      // Scoped to these three prefixes rather than applied globally. A strict
      // CSP across the whole app would break the surfaces that legitimately
      // load Google Identity Services and remote media; the guest flow loads
      // nothing external, so it can afford the strict one and should have it.
      //
      // Why each header:
      //  - `no-store` keeps a shared or borrowed device from re-rendering
      //    somebody's reflection from the back/forward cache.
      //  - `noindex, nofollow` because an invitation link that reached a
      //    crawler is an invitation link in a search index.
      //  - `no-referrer` so the URL — which names an activity — is not handed
      //    to any site the person opens next.
      //
      // The CSP is NOT here. It needs a per-request nonce — without one, Next's
      // inline bootstrap scripts are blocked and the page never hydrates — and
      // a static header cannot carry one. It lives in `middleware.ts`, next to
      // the nonce that makes it work.
      ...["/i", "/compartir/:path*", "/api/circulos/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      })),
    ];
  },
};

module.exports = nextConfig;
