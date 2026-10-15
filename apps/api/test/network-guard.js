/**
 * Guardia de red para recorridos locales: detecta y rechaza salidas a destinos
 * no permitidos ANTES de enviar nada.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Durante el macro bloque B, una corrida local emitió una petición REAL a
 * `api.voyageai.com` con una clave de prueba y recibió un 401. Eso es un hecho
 * histórico y no se borra: el RAG de Eco pide embeddings antes de llamar al
 * modelo, la pila arrancaba con una clave obviamente falsa, y la llamada salió
 * de la máquina. Lo que no vuelve a pasar inadvertido es la siguiente.
 *
 * Un 401 dice que la credencial fue rechazada; NO dice que el cuerpo no
 * llegara. Por eso el guardia bloquea antes de enviar, y no se conforma con
 * observar el resultado.
 *
 * ── Por qué DOS capas, y no una ────────────────────────────────────────────
 *
 * Medido, no supuesto. Instrumenté `fetch`, `net.Socket.prototype.connect`,
 * `http.request` y `https.request`, y llamé a cada SDK contra un servidor
 * local:
 *
 *   voyageai 0.2.1       fetch=1  socket.connect=1  http.request=0  https=0
 *   @anthropic-ai/sdk    fetch=1  socket.connect=1  http.request=0  https=0
 *   fetch directo        fetch=1  socket.connect=0  http.request=0  https=0
 *
 * Dos lecciones:
 *
 * 1. Hoy ambos SDK pasan por `globalThis.fetch`. Envolverlo basta para ellos
 *    — y por eso mi primer sustituto funcionó.
 * 2. El control directo abre CERO sockets: undici reutiliza conexiones del
 *    pool. Es decir, un guardia puesto SÓLO en el socket deja pasar toda
 *    petición que viaje por una conexión ya abierta. Y uno puesto sólo en
 *    `fetch` deja pasar cualquier transporte futuro que no lo use.
 *
 * Así que se vigilan las dos: `fetch` como camino principal, y el socket como
 * red de seguridad para lo que no lo use. `http.request` y `https.request`
 * terminan abriendo un socket, de modo que quedan cubiertos por la segunda.
 *
 * ── Qué cubre, y qué NO ────────────────────────────────────────────────────
 *
 * Cubre, comprobado en la suite:
 *
 *   · `fetch` directo (undici).
 *   · `http.get` / `https.request` a través de su Agent, que llaman a
 *     `net.createConnection` y por tanto a `connect` con argumentos
 *     NORMALIZADOS —un array `[options, cb]`—. Ésa era la rendija: el guardia
 *     leía `args[0].host`, que ahí es `undefined`, y delegaba.
 *   · Las formas `(options)` y `(port, host)` de `connect`.
 *
 * NO cubre, y conviene saberlo antes de confiarse:
 *
 *   · Sockets de dominio Unix: no tienen host y no salen de la máquina.
 *   · Procesos HIJOS con su propio Node. El guardia se instala por proceso;
 *     un `child_process` no lo hereda salvo que también lo precargue.
 *   · Conexiones ya abiertas ANTES de instalarlo. Por eso va con `--require`,
 *     que corre antes que el código de la aplicación.
 *   · Resolución DNS por sí sola: se bloquea por nombre, antes de resolver.
 *     Un destino escrito como IP literal no permitida también se bloquea,
 *     pero una IP que alguien considere «local» y no esté en la lista, no.
 *
 * ── Dónde vive y dónde NO ──────────────────────────────────────────────────
 *
 * Fuera de `src/`, que es lo único que compila el build. Este archivo no viaja
 * en la imagen de producción, no se instala en staging y no se activa solo:
 * hay que pedirlo explícitamente con `--require` o importándolo en una prueba.
 */

"use strict";

const net = require("node:net");

/** Lo que un recorrido local tiene permitido tocar. */
const PERMITIDOS_POR_OMISION = ["127.0.0.1", "localhost", "::1", "0.0.0.0"];

class NetworkGuardError extends Error {
  constructor(host, via) {
    super(
      `Salida de red bloqueada: ${host} (vía ${via}). ` +
        `El recorrido local sólo puede hablar con destinos permitidos.`,
    );
    this.name = "NetworkGuardError";
    this.host = host;
    this.via = via;
  }
}

let instalado = null;

/** Normaliza lo que cada capa llama «host» a una cadena comparable. */
function hostDe(valor) {
  if (!valor) return null;
  if (typeof valor !== "string") return null;
  // Un host entre corchetes es IPv6 literal: `[::1]`.
  return valor.replace(/^\[|\]$/g, "").toLowerCase();
}

function permitido(host, lista) {
  const h = hostDe(host);
  if (!h) return false;
  return lista.some((p) => h === p || h.endsWith(`.${p}`));
}

/**
 * El host que un `connect` va a usar, mirando TODAS sus formas.
 *
 * `Socket.prototype.connect` acepta `(options)`, `(port, host)` y `(path)`.
 * Pero `net.createConnection` —que es por donde pasan `http` y `https` a
 * través de su Agent— NORMALIZA primero y llama con un ARRAY `[options, cb]`.
 *
 * El guardia leía `args[0].host`, que en ese array es `undefined`, así que
 * delegaba y la conexión salía. La revisión lo señaló y se reprodujo en la
 * suite antes de tocar nada: un `http.get` a un nombre no permitido, con
 * `lookup` propio apuntando a un servidor local, llegaba a entregarse.
 *
 * Por eso se mira dentro del array además de la forma directa. El socket de
 * dominio Unix —`(path)`— no tiene host y no sale de la máquina: se ignora.
 */
function hostDeArgumentosDeConexion(args) {
  const primero = args[0];
  // Forma normalizada: [options, cb]
  if (Array.isArray(primero)) {
    const opciones = primero[0];
    return opciones && typeof opciones === "object"
      ? (opciones.host ?? null)
      : null;
  }
  // Forma directa: (options)
  if (primero && typeof primero === "object") return primero.host ?? null;
  // Forma (port, host)
  if (typeof args[1] === "string") return args[1];
  return null;
}

/**
 * Instala el guardia.
 *
 * @param {{allow?: string[]}} [opciones] destinos permitidos, además de los
 *   locales por omisión.
 * @returns {{violations: Array<{host: string, via: string}>, uninstall: () => void}}
 */
function installNetworkGuard(opciones = {}) {
  if (instalado) return instalado;

  const lista = [...PERMITIDOS_POR_OMISION, ...(opciones.allow ?? [])].map(
    (h) => String(h).toLowerCase(),
  );
  const violations = [];

  const registrar = (host, via) => {
    violations.push({ host: hostDe(host) ?? String(host), via });
  };

  // ── Capa 1: fetch ────────────────────────────────────────────────────────
  const fetchOriginal = globalThis.fetch;
  if (typeof fetchOriginal === "function") {
    globalThis.fetch = function guardedFetch(recurso, init) {
      let url = null;
      try {
        const crudo =
          typeof recurso === "string"
            ? recurso
            : recurso && typeof recurso.url === "string"
              ? recurso.url
              : String(recurso);
        url = new URL(crudo);
      } catch {
        url = null;
      }
      if (url && !permitido(url.hostname, lista)) {
        registrar(url.hostname, "fetch");
        // Rechaza ANTES de delegar: el cuerpo nunca se entrega a undici.
        //
        // Promesa rechazada y no `throw` síncrono, aunque lo segundo sea más
        // ruidoso: `fetch` devuelve una promesa, y quien la espera dentro de
        // un `try` la atrapa. Un lanzamiento síncrono se escaparía de ese
        // `try` en cualquier llamada sin `await` y aparecería como excepción
        // no capturada, lejos del sitio que la causó.
        return Promise.reject(new NetworkGuardError(url.hostname, "fetch"));
      }
      return fetchOriginal.call(this, recurso, init);
    };
  }

  // ── Capa 2: socket ───────────────────────────────────────────────────────
  const connectOriginal = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const host = hostDeArgumentosDeConexion(args);

    if (host && !permitido(host, lista)) {
      registrar(host, "socket.connect");
      // Antes de abrir el TCP: no se escribe un solo byte hacia fuera.
      //
      // Se EMITE el error en vez de lanzarlo. `http.get` y `https.request`
      // esperan que `connect` devuelva el socket y que cualquier problema
      // llegue como evento `error`; un `throw` síncrono se escapa de su
      // manejador y, en un proceso que sirve, lo mata. Medido: el caso de
      // `https.get` reventaba la prueba en vez de reportarse.
      const err = new NetworkGuardError(host, "socket.connect");
      process.nextTick(() => this.destroy(err));
      return this;
    }
    return connectOriginal.apply(this, args);
  };

  instalado = {
    violations,
    uninstall() {
      if (typeof fetchOriginal === "function") globalThis.fetch = fetchOriginal;
      net.Socket.prototype.connect = connectOriginal;
      instalado = null;
    },
  };
  return instalado;
}

/** Desinstala, si está puesto. Idempotente. */
function uninstallNetworkGuard() {
  if (instalado) instalado.uninstall();
}

/** Las salidas bloqueadas hasta ahora. Vacío cuando no hay guardia. */
function networkGuardViolations() {
  return instalado ? instalado.violations.slice() : [];
}

module.exports = {
  NetworkGuardError,
  installNetworkGuard,
  uninstallNetworkGuard,
  networkGuardViolations,
  PERMITIDOS_POR_OMISION,
};

// Cuando se carga con `--require`, se instala solo: ése es justo el caso en el
// que no hay dónde escribir una llamada. Con `NETWORK_GUARD_ALLOW` se añaden
// destinos separados por coma (por ejemplo, un proveedor local en otro host).
if (process.env.NETWORK_GUARD === "1") {
  const extra = (process.env.NETWORK_GUARD_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  installNetworkGuard({ allow: extra });
  // eslint-disable-next-line no-console
  console.log(
    `[network-guard] activo · permitidos: ${[...PERMITIDOS_POR_OMISION, ...extra].join(", ")}`,
  );
}
