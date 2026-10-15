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
    // El guardia EMITE el error en vez de lanzarlo: `connect` devuelve el
    // socket y el problema llega como evento `error`, que es lo que esperan
    // `http` y `https`. Un `throw` síncrono se escapaba de su manejador y en
    // un proceso que sirve lo habría matado.
    installNetworkGuard();
    const net = await import("node:net");
    const s = new net.Socket();
    const err = await new Promise<Error>((resolve) => {
      s.on("error", resolve);
      s.connect({ host: "api.anthropic.com", port: 443 });
    });
    expect(err).toBeInstanceOf(NetworkGuardError);
    s.destroy();
    expect(
      networkGuardViolations().some((v) => v.via === "socket.connect"),
    ).toBe(true);
  });

  /**
   * El contraexemplo de la revisión, reproducido antes de corregir nada.
   *
   * `net.createConnection` normaliza sus argumentos y llama a
   * `Socket.prototype.connect(normalized)`, donde `normalized` es un ARRAY
   * `[options, cb]`. El guardia leía `args[0].host`, que en ese array es
   * `undefined`, así que delegaba y la conexión salía.
   *
   * Es el camino que usan `http.get` y `https.request` a través de su Agent,
   * o sea el que tomaría cualquier SDK que no use `fetch`. El destino es un
   * servidor LOCAL de esta prueba —nunca un proveedor real— resuelto por un
   * `lookup` propio, de modo que el experimento no depende de DNS ni sale de
   * la máquina ni siquiera cuando el guardia falla.
   */
  it("bloquea el camino http → Agent → createConnection (args normalizados)", async () => {
    installNetworkGuard();
    const http = await import("node:http");

    const antes = recibidas;
    const resultado = await new Promise<string>((resolve) => {
      const req = http.get(
        {
          host: "destino-no-permitido.test",
          port: puerto,
          // Resuelve SÓLO a nuestro servidor local: si el guardia fallara, el
          // contador de abajo lo delataría sin tocar internet.
          lookup: (_h, _o, cb) =>
            (cb as (e: null, a: string, f: number) => void)(
              null,
              "127.0.0.1",
              4,
            ),
        },
        (res) => {
          res.resume();
          resolve(`PASÓ con HTTP ${res.statusCode}`);
        },
      );
      req.on("error", (e) => resolve(`bloqueado: ${e.name}`));
    });

    expect(resultado).toMatch(/^bloqueado: NetworkGuardError/);
    // La aserción que de verdad importa: el receptor no recibió NADA.
    expect(recibidas).toBe(antes);
    expect(
      networkGuardViolations().some(
        (v) => v.host === "destino-no-permitido.test",
      ),
    ).toBe(true);
  });

  it("bloquea https por el mismo camino", async () => {
    installNetworkGuard();
    const https = await import("node:https");
    const resultado = await new Promise<string>((resolve) => {
      const req = https.get(
        { host: "api.anthropic.com", port: 443, path: "/" },
        () => resolve("PASÓ"),
      );
      req.on("error", (e) => resolve(`bloqueado: ${e.name}`));
    });
    expect(resultado).toMatch(/^bloqueado: NetworkGuardError/);
  });

  it("deja pasar un socket local pedido por el mismo camino normalizado", async () => {
    // El guardia tiene que distinguir, no sólo negar: si rompiera también lo
    // local, la pila no arrancaría y el guardia sería inútil.
    installNetworkGuard();
    const http = await import("node:http");
    const antes = recibidas;
    const codigo = await new Promise<number>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: puerto }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
    });
    expect(codigo).toBe(200);
    expect(recibidas).toBe(antes + 1);
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
