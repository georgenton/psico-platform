import { describe, expect, it, vi } from "vitest";

const construcciones: Array<Record<string, unknown>> = [];
vi.mock("voyageai", () => ({
  VoyageAIClient: class {
    constructor(opts: Record<string, unknown>) {
      construcciones.push(opts);
    }
  },
}));

const { EmbeddingService } = await import("./embedding.service");

/**
 * `VOYAGE_BASE_URL` existe para poder gobernar la frontera externa en pruebas
 * locales. Lo que no puede hacer es cambiar nada cuando no está.
 */

type Config = { get: (clave: string, opts?: unknown) => unknown };
const config = (valores: Record<string, unknown>): Config => ({
  get: (clave) => valores[clave],
});

describe("EmbeddingService · destino del cliente", () => {
  it("sin la variable, no se pasa `environment`: el cliente conserva el suyo", () => {
    construcciones.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new EmbeddingService(config({ VOYAGE_API_KEY: "k" }) as any);
    expect(construcciones).toHaveLength(1);
    expect(construcciones[0]).toEqual({ apiKey: "k" });
    expect(Object.keys(construcciones[0]!)).not.toContain("environment");
  });

  it("con la variable vacía tampoco: una cadena vacía no es un destino", () => {
    construcciones.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new EmbeddingService(
      config({ VOYAGE_API_KEY: "k", VOYAGE_BASE_URL: "" }) as any,
    );
    expect(Object.keys(construcciones[0]!)).not.toContain("environment");
  });

  it("con un destino declarado, se usa ese y sólo ese", () => {
    construcciones.length = 0;
    new EmbeddingService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config({
        VOYAGE_API_KEY: "k",
        VOYAGE_BASE_URL: "http://127.0.0.1:4555/v1",
      }) as any,
    );
    expect(construcciones[0]).toEqual({
      apiKey: "k",
      environment: "http://127.0.0.1:4555/v1",
    });
  });
});
