import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edgePolicy, envelopeUrl, reportEdgeError } from "./edge";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

/** Lo que se lee del evento recibido. */
interface Evento {
  [campo: string]: unknown;
  exception: { values: { stacktrace: { frames: unknown[] } }[] };
}

const senuelo = () => `s${randomBytes(9).toString("hex")}`;
const DSN = "https://publica@receptor.test/prefijo/7";

const enviados = vi.fn();

beforeEach(() => {
  enviados.mockReset().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", enviados);
  vi.stubEnv("SENTRY_DSN", DSN);
  vi.stubEnv("PSICO_ENV", "staging");
  vi.stubEnv("SOURCE_COMMIT", "0123456789abcdef0123456789abcdef01234567");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const cuerpo = (i = 0) => String(enviados.mock.calls[i]?.[1]?.body);

describe("a dónde se manda", () => {
  it("del DSN a la dirección de sobres", () => {
    expect(envelopeUrl(DSN)).toBe(
      "https://receptor.test/prefijo/api/7/envelope/?sentry_key=publica&sentry_version=7",
    );
    expect(envelopeUrl("http://k@127.0.0.1:9/1")).toBe(
      "http://127.0.0.1:9/api/1/envelope/?sentry_key=k&sentry_version=7",
    );
  });

  it("lo que no es un DSN no manda nada", async () => {
    for (const dsn of ["", "x", "https://sin-clave.test/7", "ftp://k@h/7"]) {
      expect(envelopeUrl(dsn), dsn).toBeNull();
    }
    vi.stubEnv("SENTRY_DSN", "");
    await reportEdgeError(new Error("x"));
    expect(enviados).not.toHaveBeenCalled();
  });
});

describe("el informe del middleware", () => {
  it("lleva tipo, pila, entorno, servicio y versión", async () => {
    const err = new TypeError("Cannot read properties of null (reading 'map')");
    err.stack =
      "TypeError: x\n    at f (/app/apps/web/.next/server/src/middleware.js:1:2345)\n    at async Object.a (/app/apps/web/.next/server/src/middleware.js:2:9)";
    await reportEdgeError(err);
    const [cab, item, evento] = cuerpo()
      .split("\n")
      .map((l) => JSON.parse(l) as Evento);
    expect(Object.keys(cab!).sort()).toEqual(["event_id", "sent_at"]);
    expect(item).toEqual({ type: "event" });
    expect(evento).toMatchObject({
      environment: "staging",
      release: "0123456789ab",
      tags: { service: "feelverse-web-edge", runtime: "edge" },
    });
    expect(evento!.exception.values[0]).toEqual({
      type: "TypeError",
      value: "Cannot read properties of null (reading 'map')",
      mechanism: { type: "middleware", handled: false },
      stacktrace: {
        frames: [
          {
            filename: ".next/server/src/middleware.js",
            function: "Object.a",
            in_app: true,
            lineno: 2,
            colno: 9,
          },
          {
            filename: ".next/server/src/middleware.js",
            function: "f",
            in_app: true,
            lineno: 1,
            colno: 2345,
          },
        ],
      },
    });
  });

  it("ni el mensaje, ni la causa, ni el nombre, ni la pila llevan contenido", async () => {
    const s = senuelo();
    const err = Object.assign(
      new Error(`https://feelverse.test/i?t=${s}`, {
        cause: new Error(s),
      }),
      { name: s, peticion: s },
    );
    err.stack = `Error: ${s}\n    at ${s} (https://h/${s}.js:1:1)\n    at f (/tmp/${s}/.next/server/${s}.js:1:1)`;
    await reportEdgeError(err);
    expect(enviados).toHaveBeenCalledOnce();
    expect(JSON.stringify(enviados.mock.calls)).not.toContain(s);
  });

  it("lo que se tira y no es un error también deja constancia, sin su texto", async () => {
    const s = senuelo();
    await reportEdgeError(s);
    expect(cuerpo()).toContain("NonErrorRejection");
    expect(cuerpo()).not.toContain(s);
  });

  it("nunca rechaza, y respeta la pausa que pida el receptor", async () => {
    enviados.mockRejectedValueOnce(new Error("sin red"));
    await expect(reportEdgeError(new Error("x"))).resolves.toBeUndefined();
    enviados.mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );
    await reportEdgeError(new Error("x"));
    await reportEdgeError(new Error("x"));
    expect(enviados).toHaveBeenCalledTimes(2);
  });

  it("los únicos ficheros que puede nombrar son los del middleware", () => {
    const { file } = edgePolicy();
    expect(file("/app/apps/web/.next/server/src/middleware.js")).toEqual({
      name: ".next/server/src/middleware.js",
      inApp: true,
    });
    // Idempotente: la segunda puerta vuelve a preguntar.
    expect(file(".next/server/src/middleware.js")).not.toBeNull();
    expect(file(`/app/.next/server/${senuelo()}.js`)).toBeNull();
    expect(file("https://feelverse.test/compartir/cmu1")).toBeNull();
  });
});

describe("el middleware que falla", () => {
  const rota = () => {
    const request = new NextRequest("https://feelverse.test/dashboard");
    Object.defineProperty(request, "cookies", {
      get() {
        throw new Error("rota");
      },
    });
    return request;
  };

  it("relanza el mismo error y avisa sin esperar", async () => {
    vi.resetModules();
    const waitUntil = vi.fn();
    const error = await middleware(rota(), { waitUntil } as never).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ message: "rota" });
    // Marcado ya al salir: si no, el servidor de Node lo informaría también.
    expect(error).toHaveProperty("__sentry_captured__", true);
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
  });

  it("sin DSN ni siquiera carga el módulo", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const waitUntil = vi.fn();
    await expect(middleware(rota(), { waitUntil } as never)).rejects.toThrow(
      "rota",
    );
    expect(waitUntil).not.toHaveBeenCalled();
    expect(enviados).not.toHaveBeenCalled();
  });
});
