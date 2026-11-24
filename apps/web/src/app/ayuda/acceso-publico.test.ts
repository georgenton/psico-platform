import { existsSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOKEN_NAMES } from "@/lib/cookies";
import { hrefAyuda } from "@/lib/ayuda";
import { circulosCspFor, middleware } from "@/middleware";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require("../../../next.config.js") as {
  headers: () => Promise<
    { source: string; headers: { key: string; value: string }[] }[]
  >;
  redirects: () => Promise<
    { source: string; destination: string; permanent: boolean }[]
  >;
};

/**
 * Que la ayuda se pueda abrir SIN cuenta, por su dirección y por las antiguas.
 *
 * Lo que aquí se fija es el orden: Next aplica las redirecciones de
 * `next.config.js` antes del middleware, y el middleware es la puerta de
 * sesión. Por eso las dos mitades se prueban encadenadas —redirección y luego
 * middleware sobre el destino— y hay un control con el orden contrario.
 */

const raizApp = join(__dirname, "..");

function peticion(
  ruta: string,
  cookies: Partial<Record<"access" | "refresh", string>> = {},
): NextRequest {
  const req = new NextRequest(new URL(`http://localhost${ruta}`), {});
  if (cookies.access) req.cookies.set(TOKEN_NAMES.access, cookies.access);
  if (cookies.refresh) req.cookies.set(TOKEN_NAMES.refresh, cookies.refresh);
  return req;
}

const redirigir = async (ruta: string) =>
  (await nextConfig.redirects()).find((r) => r.source === ruta) ?? null;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/ayuda pasa la puerta", () => {
  it.each([
    ["sin sesión", {}],
    ["con una sesión muerta", { refresh: "muerta" }],
    ["con una sesión vencida", { access: "vencida", refresh: "x" }],
  ])("%s: ni acceso, ni renovación, ni 503", async (_caso, cookies) => {
    // La API no responde. Si el middleware intentara renovar el par, esto
    // acabaría en el 503 de «estamos reconectando tu sesión».
    const fetchMock = vi.fn(() => Promise.reject(new Error("sin red")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await middleware(peticion("/ayuda?pais=CO&desde=eco", cookies));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no hereda la CSP con nonce de Círculos", () => {
    expect(circulosCspFor("/ayuda", "n")).toBeNull();
  });
});

describe("los enlaces antiguos llegan a la ayuda", () => {
  const ANTIGUOS: ReadonlyArray<[string, string]> = [
    // La pantalla de antes, enlazada desde Terapia.
    ["/dashboard/terapia/crisis", hrefAyuda({ desde: "terapia" })],
    // `CRISIS_PATH`, lo que la API manda en el evento de crisis de Eco.
    ["/terapia/crisis", hrefAyuda({ desde: "eco" })],
  ];

  it.each(ANTIGUOS)("%s → %s, sin sesión", async (antigua, destino) => {
    const r = await redirigir(antigua);
    expect(r?.destination).toBe(destino);
    // Temporal: un 308 se queda en la caché del navegador para siempre.
    expect(r?.permanent).toBe(false);

    const res = await middleware(peticion(r!.destination));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("control: sin la redirección previa, la antigua acababa en el acceso", async () => {
    const res = await middleware(peticion("/dashboard/terapia/crisis"));
    expect(res.headers.get("location")).toContain("/login");
  });

  it("no queda una segunda pantalla de crisis detrás de la sesión", () => {
    expect(
      existsSync(join(raizApp, "dashboard", "terapia", "crisis", "page.tsx")),
    ).toBe(false);
  });

  it("y no se redirige nada más: las otras rutas de Terapia siguen siendo suyas", async () => {
    const fuentes = (await nextConfig.redirects()).map((r) => r.source);
    expect(fuentes).toEqual(ANTIGUOS.map(([antigua]) => antigua));
  });
});

describe("las cabeceras de /ayuda", () => {
  async function cabeceras() {
    const entrada = (await nextConfig.headers()).find(
      (h) => h.source === "/ayuda",
    );
    return Object.fromEntries(
      (entrada?.headers ?? []).map((h) => [h.key, h.value]),
    );
  }

  it("no dejan cargar nada de terceros", async () => {
    const csp = (await cabeceras())["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    // Ni un origen externo, con esquema o sin él.
    expect(csp).not.toMatch(/https?:|googleapis|gstatic|\*/);
  });

  it("y sí los scripts en línea con los que Next hidrata", async () => {
    const csp = (await cabeceras())["Content-Security-Policy"];
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'/);
    // El eval es sólo del servidor de desarrollo.
    expect(csp).not.toContain("unsafe-eval");
  });

  it("no cuentan de dónde se viene", async () => {
    expect((await cabeceras())["Referrer-Policy"]).toBe("no-referrer");
  });
});
