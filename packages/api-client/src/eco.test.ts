import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./error";
import { ecoApi } from "./eco";

/**
 * El error de `sendMessage` no lleva el cuerpo de la respuesta dentro.
 *
 * EL FALLO QUE ESTO IMPIDE (#741). Aquí se lanzaba
 * `new Error(\`ECO_STREAM_HTTP_\${status}: \${await res.text()}\`)`. Los dos
 * consumidores —la web y el móvil— pintaban `err.message`, así que la burbuja
 * del chat acababa enseñando el sobre JSON del API, con su código interno,
 * a quien sólo estaba escribiendo.
 *
 * Quien elige la frase es `ecoErrorCopy`, y para eso le basta el estado. El
 * cuerpo no hace falta para nada de lo que la pantalla necesita decidir.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function servidorResponde(status: number, cuerpo: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    body: null,
    text: async () => cuerpo,
  }) as unknown as typeof fetch;
}

async function enviar() {
  return ecoApi
    .sendMessage(
      {
        threadId: "t1",
        textPlaintext: "hola",
        textCiphertext: "c",
        textNonce: "n",
      },
      { baseUrl: "http://api.test", accessToken: "tok", onEvent: () => {} },
    )
    .then(
      () => null,
      (e: unknown) => e,
    );
}

describe("un fallo antes de que abra el stream", () => {
  it("lanza un ApiError con el estado, y nada más", async () => {
    servidorResponde(
      403,
      '{"statusCode":403,"code":"ECO_QUOTA_EXCEEDED","message":"You have used all your messages"}',
    );
    const err = (await enviar()) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
  });

  it("y su mensaje no contiene el cuerpo de la respuesta", async () => {
    const cuerpo =
      '{"statusCode":403,"code":"ECO_QUOTA_EXCEEDED","message":"secreto interno"}';
    servidorResponde(403, cuerpo);
    const err = (await enviar()) as Error;

    // Lo que se pintaba antes, palabra por palabra.
    expect(err.message).not.toContain(cuerpo);
    expect(err.message).not.toContain("ECO_QUOTA_EXCEEDED");
    expect(err.message).not.toContain("secreto interno");
    expect(err.message).not.toContain("{");
  });

  it("ni siquiera llega a leer el cuerpo", async () => {
    // No basta con no pintarlo: si no se lee, no hay nada que se pueda filtrar
    // más adelante por descuido.
    const leerCuerpo = vi.fn().mockResolvedValue("no debería leerse");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      text: leerCuerpo,
    }) as unknown as typeof fetch;

    await enviar();
    expect(leerCuerpo).not.toHaveBeenCalled();
  });
});
