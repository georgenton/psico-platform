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
    ];
  },
};

module.exports = nextConfig;
