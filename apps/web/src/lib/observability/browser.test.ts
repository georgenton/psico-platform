import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserPolicy, startBrowserObservability } from "./browser";

/**
 * El cliente del navegador, con el SDK de verdad y `fetch` sustituido. Lo que de
 * verdad importa —una página construida, en Chromium— lo cubre el ensayo.
 */

/** Lo que se lee del evento recibido. */
interface Evento {
  [campo: string]: unknown;
  exception: { values: { stacktrace: { frames: unknown[] } }[] };
}

const senuelo = () => `s${randomBytes(9).toString("hex")}`;
const enviados = vi.fn();
const TROZO = "/_next/static/chunks/app/page-0123456789abcdef.js";

beforeEach(() => {
  enviados.mockReset().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", enviados);
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://publica@receptor.test/7");
  vi.stubEnv("NEXT_PUBLIC_PSICO_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_RELEASE_SHA", "0123456789abcdef");
  const script = document.createElement("script");
  script.setAttribute("src", TROZO);
  document.head.appendChild(script);
  window.history.replaceState({}, "", "/dashboard");
});
afterEach(() => {
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Un error con un marco de un fragmento nuestro. */
const propio = (mensaje: string, extra: object = {}) => {
  const err = Object.assign(new Error(mensaje), extra);
  err.stack = `Error: ${mensaje.split("\n")[0]}\n    at aB (${window.location.origin}${TROZO}:1:23)`;
  return err;
};

const mandado = async () => {
  await new Promise((r) => setTimeout(r, 20));
  return enviados.mock.calls.map((c) => String(c[1]?.body));
};

describe("el informe del navegador", () => {
  it("lleva tipo, pila de nuestros fragmentos, entorno, servicio y versión", async () => {
    const report = startBrowserObservability()!;
    report(propio("x"));
    const [uno] = await mandado();
    const evento = JSON.parse(uno!.split("\n")[2]!) as Evento;
    expect(evento).toMatchObject({
      environment: "staging",
      release: "0123456789ab",
      tags: { service: "feelverse-web-browser", runtime: "browser" },
    });
    expect(evento.exception.values[0].stacktrace.frames).toEqual([
      { filename: TROZO, function: "aB", in_app: true, lineno: 1, colno: 23 },
    ]);
  });

  it("sin cookies y sin decir de qué página sale", async () => {
    startBrowserObservability()!(propio("x"));
    await mandado();
    expect(enviados.mock.calls[0]![1]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("ni la dirección, ni el mensaje, ni las propiedades, ni el nombre", async () => {
    const s = senuelo();
    window.history.replaceState({}, "", `/dashboard?t=${s}#${s}`);
    document.title = s;
    const err = propio(`${s} ${window.location.href}`, {
      name: s,
      extra: s,
      cause: new Error(s),
    });
    err.stack += `\n    at ${s} (${window.location.href}:1:1)\n    at f (${window.location.origin}/_next/static/chunks/${s}-0123456789abcdef.js:1:1)`;
    startBrowserObservability()!(err);
    const todo = await mandado();
    expect(todo).toHaveLength(1);
    expect(JSON.stringify(enviados.mock.calls)).not.toContain(s);
  });
});

describe("lo que no se informa", () => {
  it.each(["/i", "/compartir/cmu123", "/i/x", "/ayuda"])(
    "nada desde %s: esas páginas no cargan nada de terceros",
    async (ruta) => {
      const report = startBrowserObservability()!;
      window.history.replaceState({}, "", ruta);
      report(propio("x"));
      expect(await mandado()).toHaveLength(0);
    },
  );

  it("y `/inicio` no es `/i`", async () => {
    const report = startBrowserObservability()!;
    window.history.replaceState({}, "", "/inicio");
    report(propio("x"));
    expect(await mandado()).toHaveLength(1);
  });

  it("ni lo que ya informó el servidor, ni una redirección de Next", async () => {
    const report = startBrowserObservability()!;
    report(propio("x", { digest: "NEXT_REDIRECT;replace;/compartir/x;307;" }));
    report(propio("x", { digest: "1234567890" }));
    expect(await mandado()).toHaveLength(0);
  });

  it("ni una extensión, ni lo que no es un error", async () => {
    const report = startBrowserObservability()!;
    const ajeno = new Error("x");
    ajeno.stack = "Error: x\n    at f (chrome-extension://abc/x.js:1:1)";
    report(ajeno);
    report("texto");
    report(null);
    expect(await mandado()).toHaveLength(0);
  });

  it("y una página que falla en bucle se calla a los veinte", async () => {
    const report = startBrowserObservability()!;
    for (let i = 0; i < 40; i++) {
      const err = propio("x");
      err.stack = err.stack!.replace(":23)", `:${100 + i})`);
      report(err);
    }
    expect((await mandado()).length).toBe(20);
  });

  it("sin DSN no hay cliente", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(startBrowserObservability()).toBeNull();
  });
});

describe("los ficheros publicables", () => {
  it("sólo guiones que esta página cargó", () => {
    startBrowserObservability();
    const { file } = browserPolicy();
    expect(file(`${window.location.origin}${TROZO}`)).toEqual({
      name: TROZO,
      inApp: true,
    });
    expect(file(TROZO)?.name).toBe(TROZO);
    expect(file(`${window.location.origin}/compartir/cmu1`)).toBeNull();
    expect(
      file(`${window.location.origin}/_next/static/chunks/${senuelo()}.js`),
    ).toBeNull();
    expect(file("https://otro.test/_next/static/chunks/a.js")).toBeNull();
  });
});
