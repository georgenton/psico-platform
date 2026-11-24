/**
 * API y worker, compilados, contra un receptor local.
 *
 *   node scripts/sentry-sumidero/ensayo.mjs api
 *   node scripts/sentry-sumidero/ensayo.mjs worker
 *
 * Necesita Docker (dos contenedores desechables) y `apps/api/dist`.
 * `--dist=RUTA` ensaya otro binario; `--control` espera encontrar fugas.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AQUI,
  COMMIT,
  NOMBRES_ERROR,
  NOMBRES_HTTP,
  RAIZ,
  cabeceras,
  cabecerasDeTraza,
  contenedor,
  elementos,
  entornoApi,
  espera,
  fugas,
  hex,
  porTipo,
  proceso,
  receptor,
  resumen,
  senuelos,
} from "./lib.mjs";

const API = join(RAIZ, "apps/api");
const SONDAS = [
  "-r",
  join(AQUI, "sonda-red.cjs"),
  "-r",
  join(AQUI, "sonda-api.cjs"),
];

/**
 * Variables del SDK que cambian lo que sale sin tocar el código: encienden
 * trazas, o mandan una copia de cada sobre por fuera del transporte.
 */
const QUE_ABREN = (rx) => ({
  SENTRY_TRACES_SAMPLE_RATE: "1",
  SENTRY_SPOTLIGHT: `http://127.0.0.1:${rx.port}/spotlight`,
});

const sinOtroCamino = (a, rx) =>
  a.comprueba(
    "SENTRY_SPOTLIGHT y SENTRY_TRACES_SAMPLE_RATE no abren otro camino",
    !rx.todos.some((r) => /spotlight/.test(r.url)),
    `${rx.todos.filter((r) => /spotlight/.test(r.url)).length} copias por fuera`,
  );

export async function infraestructura() {
  const clave = hex(8);
  const pg = await contenedor("pgvector/pgvector:pg16", 5432, {
    POSTGRES_PASSWORD: clave,
  });
  const redis = await contenedor("redis:7-alpine", 6379);
  const url = `postgresql://postgres:${clave}@127.0.0.1:${pg.puerto}/postgres`;
  const parar = () => {
    pg.parar();
    redis.parar();
  };
  try {
    for (let i = 0; ; i++) {
      try {
        pg.exec("pg_isready", "-U", "postgres", "-h", "127.0.0.1");
        break;
      } catch (e) {
        if (i > 60) throw e;
        await espera(500);
      }
    }
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: API,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    parar();
    throw e;
  }
  return {
    pg: url,
    redis: `redis://127.0.0.1:${redis.puerto}`,
    sql: (orden) =>
      pg.exec("psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", orden),
    parar,
  };
}

function version(dist) {
  return existsSync(join(dist, "observability", "policy.js"))
    ? "actual"
    : "anterior";
}

/** Destinos de red de un proceso, sin los de la propia infraestructura. */
function destinos(fichero, propios) {
  if (!existsSync(fichero)) return [];
  const todos = readFileSync(fichero, "utf8").split("\n").filter(Boolean);
  return [...new Set(todos)].filter((d) => !propios.some((p) => d.includes(p)));
}

async function evento(cond, ms = 8000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (cond()) return true;
    await espera(100);
  }
  return false;
}

export async function ensayoApi({ dist, control, n, sesiones }, a) {
  const infra = await infraestructura();
  const tmp = mkdtempSync(join(tmpdir(), "sumidero-"));
  const puertos = [infra.pg, infra.redis].map((u) => `:${new URL(u).port}`);
  try {
    const rx = await receptor();
    const s = senuelos([...NOMBRES_HTTP, ...NOMBRES_ERROR]);
    const puerto = 20_000 + Math.floor(Math.random() * 20_000);
    const base = `http://127.0.0.1:${puerto}`;
    const arranca = (extra) =>
      proceso("node", [...SONDAS, join(dist, "main.js")], {
        cwd: API,
        env: entornoApi({
          ...infra,
          extra: {
            PORT: String(puerto),
            ...QUE_ABREN(rx),
            SONDA_SENUELOS: JSON.stringify(s),
            SONDA_PUERTO: String(rx.port),
            ...extra,
          },
        }),
        listo: "API running on",
      });

    console.log(`\n— API (${version(dist)}) · errores —`);
    let api = await arranca({ SENTRY_DSN: rx.dsn });
    const entrar = (conTraza) =>
      fetch(`${base}/api/auth/login?t=${s.query}`, {
        method: "POST",
        headers: {
          ...cabeceras(s, conTraza),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: `${s.textoEco}@ejemplo.test`,
          password: s.clave,
        }),
      });
    const estados = [];
    for (let i = 0; i < 4; i++)
      estados.push((await entrar(i % 2 === 1)).status);
    await evento(() => elementos(rx.recibidos).length >= 4);
    await espera(3000);
    const errores = elementos(rx.recibidos).filter((e) => e.tipo === "event");
    a.comprueba(
      "los cuatro fallos provocados respondieron 500",
      estados.every((e) => e === 500),
      estados.join(","),
    );
    const util = errores.find(
      (e) =>
        e.carga.exception?.values?.length &&
        e.carga.tags?.route === "/api/auth/login",
    );
    for (const e of errores) a.anota(resumen(e.carga));
    a.comprueba(
      "llega un error útil: tipo, pila propia, ruta plantilla, entorno, servicio y versión",
      Boolean(util) &&
        util.carga.environment === "staging" &&
        util.carga.tags.service === "feelverse-api" &&
        util.carga.release === COMMIT.slice(0, 12) &&
        util.carga.exception.values.some((v) =>
          v.stacktrace?.frames?.some((f) => f.in_app && f.lineno),
        ),
    );
    a.comprueba(
      "el código de Prisma llega",
      errores.some((e) => e.carga.tags?.error_code === "P2002"),
    );
    const f = fugas(rx.recibidos, s);
    a.comprueba(
      `señuelos en los sobres: 0 de ${Object.keys(s).length}`,
      f.length === 0,
      f.join(", "),
    );
    const tipos = porTipo(rx.recibidos);
    a.comprueba(
      "sólo salen errores",
      Object.keys(tipos).every((t) => t === "event"),
      JSON.stringify(tipos),
    );
    const salientes = rx.recibidos.filter((r) => /proveedor/.test(r.url));
    a.comprueba(
      "las peticiones salientes no llevan cabeceras de traza",
      salientes.length === 2 && cabecerasDeTraza(salientes) === 0,
      `${salientes.length} salientes, ${cabecerasDeTraza(salientes)} con traza`,
    );

    console.log(`\n— API (${version(dist)}) · un fallo natural, sin sonda —`);
    rx.vaciar();
    infra.sql('ALTER TABLE "User" RENAME TO "UserFuera"');
    const natural = (
      await fetch(`${base}/api/auth/register?t=${s.query}`, {
        method: "POST",
        headers: { ...cabeceras(s, true), "content-type": "application/json" },
        body: JSON.stringify({
          email: `${s.textoEco}@ejemplo.test`,
          password: `${s.clave}-Aa1!`,
          name: s.textoEco,
        }),
      })
    ).status;
    await evento(() => elementos(rx.recibidos).length > 0);
    await espera(1500);
    infra.sql('ALTER TABLE "UserFuera" RENAME TO "User"');
    const deLaBase = elementos(rx.recibidos).find((x) => x.tipo === "event");
    const propios = deLaBase?.carga.exception?.values
      .flatMap((v) => v.stacktrace?.frames ?? [])
      .filter((x) => x.in_app)
      .map((x) => `${x.filename}:${x.lineno} ${x.function ?? ""}`);
    a.comprueba(
      "una tabla que falta: llega con su código y los marcos de nuestro binario",
      natural === 500 &&
        deLaBase?.carga.tags?.error_code === "P2021" &&
        deLaBase.carga.tags.route === "/api/auth/register" &&
        propios.some((x) => x.startsWith("apps/api/dist/auth/")) &&
        fugas(rx.recibidos, s).length === 0,
      `${natural} · ${resumen(deLaBase?.carga)} · ${JSON.stringify(deLaBase?.carga.tags)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
    );
    for (const x of propios ?? []) a.anota(x);

    console.log(`\n— API (${version(dist)}) · trazas, N=${n} por caso —`);
    for (const conTraza of [false, true]) {
      rx.vaciar();
      for (let i = 0; i < n; i++) {
        await fetch(`${base}/api/compartir/${s.ruta}?t=${s.query}`, {
          method: "POST",
          headers: {
            ...cabeceras(s, conTraza),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            textPlaintext: s.textoEco,
            password: s.clave,
          }),
        });
      }
      await espera(5000);
      const t = porTipo(rx.recibidos);
      const tx = t.transaction ?? 0;
      a.comprueba(
        `${conTraza ? "CON" : "SIN"} sentry-trace: 0 transacciones`,
        tx === 0 && (t.session ?? 0) + (t.sessions ?? 0) === 0,
        `${tx}/${n} · ${JSON.stringify(t)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
      );
    }
    if (sesiones) {
      rx.vaciar();
      await espera(66_000);
      const t = porTipo(rx.recibidos);
      a.comprueba(
        "tras un minuto, ninguna sesión",
        (t.session ?? 0) + (t.sessions ?? 0) === 0,
        JSON.stringify(t),
      );
    }
    await api.parar();
    sinOtroCamino(a, rx);

    console.log(`\n— API (${version(dist)}) · fallos que nadie atrapa —`);
    for (const modo of ["excepcion", "promesa"]) {
      const codigos = {};
      for (const dsn of ["", rx.dsn]) {
        rx.vaciar();
        const p = await arranca({
          SENTRY_DSN: dsn,
          SONDA_FATAL: modo,
          SONDA_FATAL_MS: "12000",
        });
        const codigo = await Promise.race([
          p.fin,
          espera(30_000).then(() => "sigue vivo"),
        ]);
        await p.parar();
        codigos[dsn ? "con DSN" : "sin DSN"] = codigo;
      }
      const e = elementos(rx.recibidos).find((x) => x.tipo === "event");
      a.comprueba(
        `${modo}: mismo código de salida con y sin DSN`,
        codigos["con DSN"] === codigos["sin DSN"] && codigos["con DSN"] === 1,
        JSON.stringify(codigos),
      );
      a.comprueba(
        `${modo}: el error llega antes de morir y sin señuelos`,
        Boolean(e) && fugas(rx.recibidos, s).length === 0,
        `${resumen(e?.carga)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
      );
    }

    console.log(`\n— API (${version(dist)}) · sin DSN —`);
    rx.vaciar();
    const red = join(tmp, "red-api");
    api = await arranca({ SONDA_RED: red });
    const sano = (await fetch(`${base}/health`)).status;
    await entrar(true);
    await espera(2000);
    await api.parar();
    const envelopes = rx.recibidos.filter((r) => /envelope/.test(r.url));
    const ajenos = destinos(red, [...puertos, `:${puerto}`, `:${rx.port}`]);
    a.comprueba(
      "arranca igual y no abre ninguna conexión ajena",
      sano === 200 && envelopes.length === 0 && ajenos.length === 0,
      `health=${sano} sobres=${envelopes.length} destinos ajenos=${ajenos.join(" ") || "ninguno"}`,
    );
    await rx.cerrar();
  } finally {
    infra.parar();
    rmSync(tmp, { recursive: true, force: true });
  }
  void control;
}

export async function ensayoWorker({ dist, control, n }, a) {
  const infra = await infraestructura();
  const tmp = mkdtempSync(join(tmpdir(), "sumidero-"));
  try {
    const rx = await receptor();
    const s = senuelos([...NOMBRES_HTTP, ...NOMBRES_ERROR]);
    const require = createRequire(join(API, "package.json"));
    const { Queue } = require("bullmq");
    const u = new URL(infra.redis);
    const cola = new Queue("email", {
      connection: { host: u.hostname, port: Number(u.port) },
    });
    const arranca = (extra) =>
      proceso("node", [...SONDAS, join(dist, "worker.js")], {
        cwd: API,
        env: entornoApi({
          ...infra,
          extra: {
            ...QUE_ABREN(rx),
            SONDA_SENUELOS: JSON.stringify(s),
            SONDA_PUERTO: String(rx.port),
            ...(control ? { SONDA_CONTROL: "1" } : {}),
            ...extra,
          },
        }),
        listo: "Awaiting jobs from Redis",
      });
    const datos = {
      to: `${s.tarea}@ejemplo.test`,
      subject: s.tarea,
      html: s.tarea,
      text: s.textoEco,
      tag: s.tarea,
    };
    const falla = async (cuantos, attempts) => {
      const antes = await cola.getFailedCount();
      for (let i = 0; i < cuantos; i++) {
        await cola.add("send-email", datos, {
          attempts,
          backoff: { type: "fixed", delay: 50 },
        });
      }
      const hasta = Date.now() + 20_000;
      while (
        (await cola.getFailedCount()) < antes + cuantos &&
        Date.now() < hasta
      ) {
        await espera(100);
      }
    };

    console.log(`\n— worker (${version(dist)}) · un trabajo que falla —`);
    let w = await arranca({ SENTRY_DSN: rx.dsn });
    await falla(1, 3);
    await espera(4000);
    const eventos = elementos(rx.recibidos).filter((e) => e.tipo === "event");
    for (const e of eventos) a.anota(resumen(e.carga));
    const delTrabajo = eventos.filter((e) => e.carga.tags?.queue === "email");
    a.comprueba(
      "llega UN informe, en el tercer y último intento, con cola y trabajo",
      delTrabajo.length === 1 &&
        delTrabajo[0].carga.tags.job === "send-email" &&
        delTrabajo[0].carga.tags.service === "feelverse-worker" &&
        delTrabajo[0].carga.environment === "staging" &&
        delTrabajo[0].carga.release === COMMIT.slice(0, 12) &&
        delTrabajo[0].carga.exception.values.some((v) =>
          v.stacktrace?.frames?.some((f) => f.lineno),
        ),
      `${delTrabajo.length} del trabajo, ${eventos.length} en total`,
    );
    const f = fugas(rx.recibidos, s);
    a.comprueba(
      `señuelos en los sobres (datos del trabajo incluidos): 0 de ${Object.keys(s).length}`,
      f.length === 0,
      f.join(", "),
    );
    const tipos = porTipo(rx.recibidos);
    a.comprueba(
      "sólo salen errores",
      Object.keys(tipos).every((t) => t === "event"),
      JSON.stringify(tipos),
    );
    const salientes = rx.recibidos.filter((r) => /proveedor/.test(r.url));
    a.comprueba(
      "las peticiones salientes no llevan cabeceras de traza",
      salientes.length === 2 && cabecerasDeTraza(salientes) === 0,
      `${salientes.length} salientes, ${cabecerasDeTraza(salientes)} con traza`,
    );

    console.log(`\n— worker (${version(dist)}) · trazas, N=${n} trabajos —`);
    rx.vaciar();
    await falla(n, 1);
    await espera(5000);
    const t = porTipo(rx.recibidos);
    a.comprueba(
      "0 transacciones y 0 sesiones",
      Object.keys(t).every((k) => k === "event"),
      `${t.transaction ?? 0} transacciones en ${n} trabajos · ${JSON.stringify(t)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
    );
    await w.parar();
    sinOtroCamino(a, rx);

    console.log(`\n— worker (${version(dist)}) · fallo que nadie atrapa —`);
    for (const modo of ["excepcion", "promesa"]) {
      const codigos = {};
      for (const dsn of ["", rx.dsn]) {
        rx.vaciar();
        const p = await arranca({
          SENTRY_DSN: dsn,
          SONDA_FATAL: modo,
          SONDA_FATAL_MS: "12000",
        });
        codigos[dsn ? "con DSN" : "sin DSN"] = await Promise.race([
          p.fin,
          espera(30_000).then(() => "sigue vivo"),
        ]);
        await p.parar();
      }
      const e = elementos(rx.recibidos).find((x) => x.tipo === "event");
      a.comprueba(
        `${modo}: mismo código de salida con y sin DSN, y el error llega`,
        codigos["con DSN"] === codigos["sin DSN"] &&
          codigos["con DSN"] === 1 &&
          Boolean(e) &&
          fugas(rx.recibidos, s).length === 0,
        `${JSON.stringify(codigos)} · ${resumen(e?.carga)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
      );
    }

    console.log(`\n— worker (${version(dist)}) · sin DSN —`);
    rx.vaciar();
    const red = join(tmp, "red-worker");
    w = await arranca({ SONDA_RED: red });
    await espera(1500);
    await w.parar();
    const ajenos = destinos(red, [
      ...[infra.pg, infra.redis].map((x) => `:${new URL(x).port}`),
    ]);
    a.comprueba(
      "arranca igual y no abre ninguna conexión ajena",
      rx.recibidos.length === 0 && ajenos.length === 0,
      `destinos ajenos=${ajenos.join(" ") || "ninguno"}`,
    );
    await cola.close();
    await rx.cerrar();
  } finally {
    infra.parar();
    rmSync(tmp, { recursive: true, force: true });
  }
}
