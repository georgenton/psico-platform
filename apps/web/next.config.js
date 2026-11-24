// ── La CSP de la ayuda pública ───────────────────────────────────────────────
//
// `/ayuda` tiene que verse cuando todo lo demás falla, y no contarle a nadie
// quién la abre. Hoy no carga nada de fuera —comprobado sobre el build servido:
// ni siquiera el `@import` de Google Fonts con el que abre `globals.css`, que
// no sobrevive a la compilación—, pero eso es una circunstancia, no una
// garantía. Esta cabecera la convierte en una: una fuente, una analítica o un
// informe de errores que mañana se añadiera al layout raíz no podrá pedirse
// desde esta página, y la página seguirá en pie sin ellos.
//
// A diferencia de la de Círculos no necesita nonce —aquí no hay secreto en la
// URL ni datos de nadie—, por eso puede ser una cabecera estática: los scripts
// en línea de Next se permiten, los de fuera no. `'unsafe-eval'` y el websocket
// son sólo del servidor de desarrollo.
const enDesarrollo = process.env.NODE_ENV === "development";
const cspAyuda = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${enDesarrollo ? " ws:" : ""}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@psico/ui", "@psico/types"],

  // ── Las direcciones antiguas de la ayuda en crisis ─────────────────────────
  //
  // `/dashboard/terapia/crisis` es donde vivía la pantalla, y `/terapia/crisis`
  // es la ruta que la API manda en el evento de crisis de Eco. Las dos acaban
  // en la página pública.
  //
  // Van AQUÍ y no en `middleware.ts` ni en un `redirect()` de página por una
  // razón de orden: Next aplica estas redirecciones ANTES del middleware, así
  // que ocurren antes de la puerta de sesión. Un enlace antiguo abierto sin
  // cuenta —o con la sesión vencida y la API caída, que es cuando el middleware
  // respondería 503— llega a las líneas y no a un formulario de acceso.
  //
  // Temporales (307) a propósito: un 308 se queda en la caché del navegador
  // para siempre, y ésta no es una decisión que convenga no poder deshacer.
  async redirects() {
    return [
      {
        source: "/dashboard/terapia/crisis",
        destination: "/ayuda?desde=terapia",
        permanent: false,
      },
      {
        source: "/terapia/crisis",
        destination: "/ayuda?desde=eco",
        permanent: false,
      },
    ];
  },

  experimental: {
    // Next 14.2 no ejecuta `src/instrumentation.ts` sin esto.
    instrumentationHook: true,
    // El cliente de errores del servidor se carga de `node_modules` en vez de
    // empaquetarse, y sólo si hay DSN. Empaquetarlo arrastraría todas sus
    // instrumentaciones, que no se usan.
    serverComponentsExternalPackages: ["@sentry/node"],
  },

  // Lo que se incrusta en la CONSTRUCCIÓN para el navegador. Con el DSN vacío,
  // la condición de `ObservabilityBoot` es falsa al compilar y el fragmento del
  // SDK no se genera. Ninguna de las tres es un secreto: van a la vista en el
  // JavaScript de la página.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "",
    NEXT_PUBLIC_PSICO_ENV:
      process.env.NEXT_PUBLIC_PSICO_ENV || process.env.PSICO_ENV || "",
    NEXT_PUBLIC_RELEASE_SHA:
      process.env.NEXT_PUBLIC_RELEASE_SHA ||
      process.env.SOURCE_COMMIT ||
      process.env.RELEASE_SHA ||
      "",
  },

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
      // La ayuda pública: nada de terceros, y ninguna página a la que se salga
      // desde ella se entera de que se venía de ahí.
      {
        source: "/ayuda",
        headers: [
          { key: "Content-Security-Policy", value: cspAyuda },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
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
