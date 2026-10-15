/**
 * Control negativo del guardia de red.
 *
 * Una prueba que sólo comprobara «el recorrido pasó» no diría nada sobre el
 * aislamiento: pasó también la corrida que mandó una petición real a
 * `api.voyageai.com` y recibió un 401. Lo que hay que demostrar es lo
 * contrario — que un destino no permitido **se bloquea**, y que se bloquea
 * **antes de enviar datos**, no después de recibir un rechazo.
 *
 * Por eso el servidor local de esta prueba cuenta peticiones: si el guardia
 * fallara, el contador subiría. Que siga en cero es la aserción de verdad.
 */

import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * El guardia es CommonJS porque `node --require` no puede precargar otra cosa,
 * así que se carga con `createRequire` y se describe su forma aquí: una
 * anotación `typeof import(...)` está prohibida por el lint del repositorio, y
 * no merece una excepción sólo para esto.
 */
interface GuardiaDeRed {
  installNetworkGuard(opciones?: { allow?: string[] }): {
    violations: Array<{ host: string; via: string }>;
    uninstall(): void;
  };
  uninstallNetworkGuard(): void;
  networkGuardViolations(): Array<{ host: string; via: string }>;
  NetworkGuardError: new (host: string, via: string) => Error;
}

const cargar = createRequire(__filename);
const {
  installNetworkGuard,
  uninstallNetworkGuard,
  networkGuardViolations,
  NetworkGuardError,
} = cargar("../../test/network-guard.js") as GuardiaDeRed;

describe("guardia de red de los recorridos locales", () => {
  let servidor: Server;
  let puerto = 0;
  let recibidas = 0;

  beforeEach(async () => {
    recibidas = 0;
    servidor = createServer((_req, res) => {
      recibidas += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
    puerto = (servidor.address() as { port: number }).port;
  });

  afterEach(async () => {
    uninstallNetworkGuard();
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  it("deja pasar lo local, que es con lo que hablan los recorridos", async () => {
    installNetworkGuard();
    const r = await fetch(`http://127.0.0.1:${puerto}/ok`);
    expect(r.status).toBe(200);
    expect(recibidas).toBe(1);
    expect(networkGuardViolations()).toHaveLength(0);
  });

  it("bloquea un destino externo por `fetch`, y lo hace ANTES de enviar", async () => {
    installNetworkGuard();

    // El destino es el que de verdad se escapó aquella vez.
    await expect(
      fetch("https://api.voyageai.com/v1/embeddings"),
    ).rejects.toThrow(NetworkGuardError);

    const v = networkGuardViolations();
    expect(v).toHaveLength(1);
    expect(v[0]?.host).toBe("api.voyageai.com");
    expect(v[0]?.via).toBe("fetch");
  });

  it("el servidor local NO recibe nada cuando el guardia bloquea", async () => {
    // La prueba que separa «bloquea» de «bloquea antes de enviar»: se apunta
    // el guardia a un host no permitido que, por DNS de la máquina, resuelve
    // a nuestro propio servidor. Si el bloqueo ocurriera después de emitir,
    // el contador subiría.
    installNetworkGuard();
    const antes = recibidas;
    await expect(
      fetch(`http://destino-no-permitido.test:${puerto}/`),
    ).rejects.toThrow(NetworkGuardError);
    expect(recibidas).toBe(antes);
  });

  it("también vigila el socket, para un transporte que no use fetch", async () => {
    installNetworkGuard();
    const net = await import("node:net");
    const s = new net.Socket();
    expect(() => s.connect({ host: "api.anthropic.com", port: 443 })).toThrow(
      NetworkGuardError,
    );
    s.destroy();
    expect(
      networkGuardViolations().some((v) => v.via === "socket.connect"),
    ).toBe(true);
  });

  it("un destino se puede permitir explícitamente", async () => {
    installNetworkGuard({ allow: ["proveedor-local.test"] });
    // Permitido: ya no lanza el guardia. Que luego falle la resolución DNS es
    // otra cosa, y no es lo que esta prueba mide.
    await fetch(`http://proveedor-local.test:${puerto}/`).catch((err) => {
      expect(err).not.toBeInstanceOf(NetworkGuardError);
    });
    expect(
      networkGuardViolations().some((v) => v.host === "proveedor-local.test"),
    ).toBe(false);
  });

  it("desinstalar devuelve el comportamiento original", async () => {
    const g = installNetworkGuard();
    await expect(fetch("https://api.voyageai.com/")).rejects.toThrow(
      NetworkGuardError,
    );
    g.uninstall();
    // Sin guardia, la llamada local vuelve a funcionar con normalidad.
    const r = await fetch(`http://127.0.0.1:${puerto}/`);
    expect(r.status).toBe(200);
  });
});
