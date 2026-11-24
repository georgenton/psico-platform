/**
 * Piezas comunes del ensayo: el receptor local, los señuelos, los contenedores
 * desechables y cómo se arranca un proceso.
 *
 * Nada de aquí habla con nadie fuera de 127.0.0.1.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(AQUI, "../..");

export const espera = (ms) => new Promise((r) => setTimeout(r, ms));
export const hex = (n) => randomBytes(n).toString("hex");
/** Un commit inventado, con forma de commit. */
export const COMMIT = hex(20);

/**
 * Señuelos: valores que no existen en ningún fichero.
 *
 * Se generan al EJECUTAR. Si fueran literales, un SDK que adjunta líneas de
 * código los encontraría en el propio guion y el ensayo acusaría una fuga que no
 * hay. Ya pasó.
 */
export function senuelos(nombres) {
  return Object.fromEntries(
    nombres.map((n) => [
      n,
      n.startsWith("ip") ? `203.0.113.${randomInt(10, 250)}` : `cmu${hex(10)}`,
    ]),
  );
}

/** Un receptor que guarda cada petición entera, cabeceras incluidas. */
export async function receptor() {
  const recibidos = [];
  const todos = [];
  const server = createServer((req, res) => {
    const trozos = [];
    req.on("data", (c) => trozos.push(c));
    req.on("end", () => {
      const uno = {
        metodo: req.method,
        url: req.url,
        cabeceras: req.rawHeaders,
        cuerpo: Buffer.concat(trozos).toString("utf8"),
      };
      recibidos.push(uno);
      todos.push(uno);
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-headers", "*");
      res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    port,
    dsn: `http://${hex(16)}@127.0.0.1:${port}/1`,
    recibidos,
    /** Igual, pero `vaciar` no lo toca. */
    todos,
    vaciar: () => recibidos.splice(0),
    cerrar: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(r);
      }),
  };
}

/** Los elementos de los sobres recibidos: `{ tipo, carga }`. */
export function elementos(recibidos) {
  const out = [];
  for (const r of recibidos) {
    if (!/\/envelope\//.test(r.url ?? "")) continue;
    const lineas = r.cuerpo.split("\n");
    for (let i = 1; i + 1 < lineas.length + 1; i += 2) {
      if (!lineas[i]) continue;
      try {
        out.push({
          tipo: JSON.parse(lineas[i]).type,
          carga: JSON.parse(lineas[i + 1] || "{}"),
        });
      } catch {
        out.push({ tipo: "ilegible", carga: {} });
      }
    }
  }
  return out;
}

/** Qué señuelos aparecen en los bytes crudos de los sobres. */
export function fugas(recibidos, valores) {
  const bruto = JSON.stringify(
    recibidos.filter((r) => /\/envelope\//.test(r.url ?? "")),
  );
  return Object.entries(valores)
    .filter(([, v]) => bruto.includes(v))
    .map(([k]) => k);
}

export function porTipo(recibidos) {
  const cuenta = {};
  for (const { tipo } of elementos(recibidos)) {
    cuenta[tipo] = (cuenta[tipo] ?? 0) + 1;
  }
  return cuenta;
}

/** Cabeceras de traza en peticiones que NO van al receptor de errores. */
export function cabecerasDeTraza(recibidos) {
  return recibidos
    .filter((r) => !/\/envelope\//.test(r.url ?? ""))
    .filter((r) =>
      r.cabeceras.some((c) => /^(sentry-trace|baggage|traceparent)$/i.test(c)),
    ).length;
}

/** Un contenedor desechable con un puerto libre. Devuelve cómo pararlo. */
export async function contenedor(imagen, puertoInterno, env = {}) {
  const nombre = `sumidero-${hex(4)}`;
  execFileSync("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    nombre,
    "-p",
    `127.0.0.1:0:${puertoInterno}`,
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    imagen,
  ]);
  // Docker puede tardar un instante en publicar el puerto.
  let salida = "";
  for (let i = 0; i < 40 && !salida; i++) {
    try {
      salida = execFileSync("docker", ["port", nombre, `${puertoInterno}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      await espera(250);
    }
  }
  if (!salida) {
    execFileSync("docker", ["rm", "-f", nombre], { stdio: "ignore" });
    throw new Error(`Docker no publicó el puerto de ${imagen}`);
  }
  return {
    nombre,
    puerto: Number(salida.trim().split("\n")[0].split(":").pop()),
    exec: (...cmd) =>
      execFileSync("docker", ["exec", nombre, ...cmd], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    parar: () => {
      try {
        execFileSync("docker", ["rm", "-f", nombre], { stdio: "ignore" });
      } catch {
        // Ya no estaba.
      }
    },
  };
}

/** Arranca un proceso y espera a que escriba algo. */
export async function proceso(cmd, args, { cwd, env, listo, espera: tope }) {
  const hijo = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let salida = "";
  hijo.stdout.on("data", (d) => (salida += d));
  hijo.stderr.on("data", (d) => (salida += d));
  const fin = new Promise((r) => hijo.on("exit", (codigo) => r(codigo)));
  const hasta = Date.now() + (tope ?? 60_000);
  let codigo;
  void fin.then((c) => (codigo = c));
  while (listo && !salida.includes(listo)) {
    if (codigo !== undefined || Date.now() > hasta) {
      hijo.kill("SIGKILL");
      throw new Error(
        `No arrancó (${cmd} ${args.join(" ")}):\n${salida.slice(-3000)}`,
      );
    }
    await espera(100);
  }
  return {
    hijo,
    fin,
    salida: () => salida,
    parar: async () => {
      if (codigo === undefined) hijo.kill("SIGTERM");
      await Promise.race([fin, espera(4000)]);
      if (codigo === undefined) hijo.kill("SIGKILL");
    },
  };
}

/** El entorno mínimo para arrancar la API o el worker. Todo ficticio. */
export function entornoApi({ pg, redis, extra = {} }) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    PSICO_ENV: "staging",
    DATABASE_URL: pg,
    REDIS_URL: redis,
    JWT_SECRET: hex(32),
    R2_ACCOUNT_ID: "ficticio",
    R2_ACCESS_KEY_ID: "ficticio",
    R2_SECRET_ACCESS_KEY: "ficticio",
    R2_BUCKET_NAME: "ficticio",
    R2_ENDPOINT: "http://127.0.0.1:9",
    ANTHROPIC_API_KEY: "ficticio",
    VOYAGE_API_KEY: "ficticio",
    VOYAGE_BASE_URL: "http://127.0.0.1:9",
    OPENAI_API_KEY: "ficticio",
    STRIPE_SECRET_KEY: "ficticio",
    STRIPE_WEBHOOK_SECRET: "ficticio",
    STRIPE_PRO_MONTHLY_PRICE_ID: "ficticio",
    STRIPE_PRO_YEARLY_PRICE_ID: "ficticio",
    STRIPE_B2B_PRICE_ID: "ficticio",
    EMOTIONAL_MAP_CACHE_EPOCH: "1",
    EMOTIONAL_MAP_FACTS_EPOCH: "1",
    EMOTIONAL_MAP_V2: "on",
    EMOTIONAL_MAP_LEGACY_UI: "off",
    EMOTIONAL_MAP_LLM_SCORING: "off",
    EMOTIONAL_MAP_EWS_PUBLIC: "off",
    EMOTIONAL_MAP_NARRATOR: "off",
    CONTENT_RESONANCE: "off",
    EMOTIONAL_MAP_OU: "on",
    EMOTIONAL_MAP_PUBLIC: "on",
    GUIDE_ROLLOUT_MODE: "off",
    EEC_C01_GUIDED_SUITE_V1: "off",
    CIRCLES_ROLLOUT_MODE: "off",
    CLIENT_ATTESTATION_SECRET: hex(32),
    SOURCE_COMMIT: COMMIT,
    ...extra,
  };
}

/** Cabeceras de una petición con un secreto en cada sitio. */
export const TRAZA = `${hex(16)}-${hex(8)}-1`;
export function cabeceras(s, conTraza) {
  return {
    authorization: `Bearer ${s.authorization}`,
    cookie: `psico_at=${s.cookie}; psico_circulos_guest=${s.cookieInvitada}`,
    "x-circle-guest-session": s.invitada,
    "x-client-attestation": s.atestacion,
    "x-forwarded-for": s.ip,
    "x-real-ip": s.ip,
    "user-agent": `Navegador/${s.agente}`,
    referer: `https://feelverse.test/i?t=${s.referente}`,
    ...(conTraza
      ? {
          "sentry-trace": TRAZA,
          baggage: `sentry-sampled=true,sentry-sample_rate=1,sentry-trace_id=${TRAZA.slice(0, 32)},sentry-transaction=${s.baggage},ajeno=${s.baggage}`,
        }
      : {}),
  };
}

export const NOMBRES_HTTP = [
  "authorization",
  "cookie",
  "cookieInvitada",
  "invitada",
  "atestacion",
  "ip",
  "agente",
  "referente",
  "baggage",
  "ruta",
  "query",
  "textoEco",
  "clave",
];

export const NOMBRES_ERROR = [
  "mensaje",
  "causa",
  "agregado",
  "propiedad",
  "nombre",
  "pila",
  "prisma",
  "mensajeSuelto",
  "usuario",
  "extra",
  "contexto",
  "etiqueta",
  "miga",
  "consola",
  "adjunto",
  "comentario",
  "tarea",
  "sesion",
  "transaccion",
];

/** Una línea legible por comprobación, y si algo falló. */
export function acta() {
  const filas = [];
  return {
    filas,
    comprueba(nombre, ok, detalle = "") {
      filas.push({ nombre, ok, detalle });
      console.log(
        `${ok ? "✔" : "✗"} ${nombre}${detalle ? ` · ${detalle}` : ""}`,
      );
      return ok;
    },
    anota(texto) {
      console.log(`  ${texto}`);
    },
    fallo: () => filas.some((f) => !f.ok),
  };
}

/** Lo que hace útil a un evento, en una frase. */
export function resumen(evento) {
  const exc = evento?.exception?.values?.at(-1);
  const f = exc?.stacktrace?.frames?.filter((x) => x.in_app).at(-1);
  return exc
    ? `${exc.type}: ${exc.value} @ ${f ? `${f.filename}:${f.lineno ?? "?"}${f.function ? ` (${f.function})` : ""}` : "sin marco propio"} · env=${evento.environment} service=${evento.tags?.service ?? "-"} release=${evento.release ?? "-"}`
    : "sin excepción";
}
