import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET, dynamic } from "./route";

/**
 * Coolify decide si el contenedor de Web está sano preguntando a esta ruta. Si
 * devolviera algo que no es 200, o una hora congelada en build, el orquestador
 * reiniciaría un contenedor sano o mantendría vivo uno atascado.
 */

const guardado = new Map<string, string | undefined>();
const CLAVES = ["PSICO_ENV", "VERCEL_ENV"] as const;

beforeEach(() => {
  for (const k of CLAVES) {
    guardado.set(k, process.env[k]);
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of CLAVES) {
    const v = guardado.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/health", () => {
  it("responde 200 sin identidad ni dependencias", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("fecha la respuesta, que es su único valor", async () => {
    const antes = Date.now();
    const body = await GET().json();
    const t = Date.parse(body.timestamp);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBeGreaterThanOrEqual(antes - 1000);
  });

  it("no se cachea — un 200 guardado no dice nada del proceso de ahora", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
  });

  it("es dinámica, para que Next no la resuelva en build", () => {
    // Sin esto la ruta puede servirse estática, con una hora congelada: diría
    // 200 aunque el proceso estuviera atascado.
    expect(dynamic).toBe("force-dynamic");
  });

  it("publica el entorno declarado, que es lo que el paso VALIDATE comprueba", async () => {
    process.env.PSICO_ENV = "staging";
    const body = await GET().json();
    expect(body.environment).toBe("staging");
  });

  it("dice null en lugar de inventar un entorno cuando nadie lo declaró", async () => {
    const body = await GET().json();
    expect(body.environment).toBeNull();
  });

  it("no filtra nada más que estado, hora y entorno", async () => {
    process.env.PSICO_ENV = "production";
    const body = await GET().json();
    expect(Object.keys(body).sort()).toEqual([
      "environment",
      "status",
      "timestamp",
    ]);
  });
});
