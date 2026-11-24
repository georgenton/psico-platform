/**
 * Servidor de Web, Edge y navegador, sobre `next build` + `next start`.
 *
 * Copia cuatro páginas de prueba dentro de la aplicación, añade una línea al
 * middleware, construye, ensaya y lo deja todo como estaba.
 *
 * Reemplaza `apps/web/.next`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AQUI,
  COMMIT,
  NOMBRES_HTTP,
  RAIZ,
  TRAZA,
  cabeceras,
  cabecerasDeTraza,
  elementos,
  espera,
  fugas,
  porTipo,
  proceso,
  receptor,
  resumen,
  senuelos,
} from "./lib.mjs";

let WEB = join(RAIZ, "apps/web");
const ANCLA = "  const { pathname } = request.nextUrl;\n";

function construir(env, red) {
  try {
    execFileSync("npx", ["next", "build"], {
      cwd: WEB,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_OPTIONS: `-r ${join(AQUI, "sonda-red.cjs")}`,
        SONDA_RED: red,
        ...env,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(
      `No construyó:\n${`${e.stdout}${e.stderr}`
        .split("\n")
        .filter((l) => !/Warning:|^\.\/src.*test/.test(l))
        .slice(-40)
        .join("\n")}`,
    );
  }
}

const hosts = (fichero) =>
  existsSync(fichero)
    ? [
        ...new Set(readFileSync(fichero, "utf8").split("\n").filter(Boolean)),
      ].filter((d) => !/^(127\.0\.0\.1|localhost|::1|\/)/.test(d))
    : [];

async function evento(cond, ms = 8000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (cond()) return true;
    await espera(100);
  }
  return false;
}

export async function ensayoWeb({ n, web: otraWeb, sdk }, a) {
  if (otraWeb) WEB = otraWeb;
  const SONDA = join(WEB, "src/app/zz-sonda");
  const MIDDLEWARE = join(WEB, "src/middleware.ts");
  const tmp = mkdtempSync(join(tmpdir(), "sumidero-"));
  const original = readFileSync(MIDDLEWARE, "utf8");
  const limpiar = () => {
    rmSync(SONDA, { recursive: true, force: true });
    writeFileSync(MIDDLEWARE, original);
  };
  process.once("SIGINT", () => {
    limpiar();
    process.exit(130);
  });
  const rx = await receptor();
  const sinSobre = rx.todos;
  const api = await receptor();
  const s = senuelos([
    ...NOMBRES_HTTP,
    "fragmento",
    "campo",
    "formulario",
    "cuerpoRuta",
    "tituloEdge",
  ]);
  const puerto = 20_000 + Math.floor(Math.random() * 20_000);
  const base = `http://127.0.0.1:${puerto}`;
  const arranca = (extra) =>
    proceso(
      "node",
      [
        "-r",
        join(AQUI, "sonda-red.cjs"),
        join(WEB, "node_modules/next/dist/bin/next"),
        "start",
        "-p",
        String(puerto),
      ],
      {
        cwd: WEB,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NEXT_TELEMETRY_DISABLED: "1",
          NODE_ENV: "production",
          PSICO_ENV: "staging",
          SOURCE_COMMIT: COMMIT,
          // Las que encienden trazas por su cuenta en el SDK.
          SENTRY_TRACES_SAMPLE_RATE: "1",
          SENTRY_TRACE: TRAZA,
          // Y la que manda una copia por fuera del transporte.
          SENTRY_SPOTLIGHT: `http://127.0.0.1:${rx.port}/spotlight`,
          ...extra,
        },
        listo: "Ready in",
      },
    );

  try {
    cpSync(join(AQUI, "web"), SONDA, { recursive: true });
    // Para ensayar una versión que usaba otro paquete (`--sdk=@sentry/nextjs`).
    if (sdk) {
      for (const f of ["rsc/page.tsx", "navegador/page.tsx"]) {
        const ruta = join(SONDA, f);
        writeFileSync(
          ruta,
          readFileSync(ruta, "utf8").replace(/"@sentry\/\w+"/, `"${sdk}"`),
        );
      }
    }
    if (!original.includes(ANCLA)) throw new Error("Cambió el middleware");
    writeFileSync(
      MIDDLEWARE,
      original.replace(
        ANCLA,
        `${ANCLA}  if (pathname.startsWith("/zz-sonda/edge")) {
    throw Object.assign(
      new Error(\`edge \${request.url} \${request.headers.get("authorization")} \${request.headers.get("cookie")}\`, { cause: new Error(request.nextUrl.search) }),
      { peticion: request.url },
    );
  }\n`,
      ),
    );

    console.log("\n— Web · construcción con DSN —");
    const redConstruccion = join(tmp, "red-build");
    // Desde cero, para que la sonda de red tenga algo que ver: las tipografías
    // se descargan en la primera construcción.
    rmSync(join(WEB, ".next"), { recursive: true, force: true });
    construir(
      {
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${api.port}`,
        NEXT_PUBLIC_SENTRY_DSN: rx.dsn,
        NEXT_PUBLIC_PSICO_ENV: "staging",
        SOURCE_COMMIT: COMMIT,
      },
      redConstruccion,
    );
    const contactados = hosts(redConstruccion);
    a.comprueba(
      "la construcción no pide token ni habla con Sentry",
      !contactados.some((h) => /sentry/i.test(h)) && rx.recibidos.length === 0,
      `contactados: ${contactados.join(" ") || "ninguno"}`,
    );

    // ── Servidor ──
    console.log("\n— Web · servidor —");
    let web = await arranca({ SENTRY_DSN: rx.dsn });
    const pide = (ruta, init = {}, conTraza = false) =>
      fetch(`${base}${ruta}`, {
        redirect: "manual",
        ...init,
        headers: { ...cabeceras(s, conTraza), ...init.headers },
      });
    const rsc = (await pide(`/zz-sonda/rsc?t=${s.query}`)).status;
    const ruta = (
      await pide(`/zz-sonda/ruta/${s.ruta}?t=${s.query}`, {
        method: "POST",
        body: JSON.stringify({ textPlaintext: s.cuerpoRuta, clave: s.clave }),
      })
    ).status;
    await evento(
      () =>
        elementos(rx.recibidos).filter((e) => e.carga.exception).length >= 2,
    );
    await espera(2000);
    let eventos = elementos(rx.recibidos);
    for (const e of eventos) a.anota(resumen(e.carga));
    const con = (marca) =>
      eventos.filter((e) =>
        e.carga.exception?.values?.some((v) =>
          v.stacktrace?.frames?.some((f) => f.filename.includes(marca)),
        ),
      );
    const bien = (e) =>
      e &&
      e.carga.environment === "staging" &&
      e.carga.tags?.service === "feelverse-web-server" &&
      e.carga.release === COMMIT.slice(0, 12) &&
      e.carga.exception.values
        .at(-1)
        .stacktrace.frames.some((f) => f.in_app && f.lineno && f.colno);
    a.comprueba(
      "componente de servidor anidado: llega con pila, entorno, servicio y versión",
      rsc === 500 && bien(con("zz-sonda/rsc")[0]),
      `HTTP ${rsc}, ${con("zz-sonda/rsc").length} informe(s)`,
    );
    a.comprueba(
      "manejador de ruta: llega",
      ruta === 500 && bien(con("zz-sonda/ruta")[0]),
      `HTTP ${ruta}, ${con("zz-sonda/ruta").length} informe(s)`,
    );

    // ── Edge ──
    console.log("\n— Web · Edge (middleware) —");
    rx.vaciar();
    const edge = (await pide(`/zz-sonda/edge/${s.ruta}?t=${s.query}`, {}, true))
      .status;
    await evento(() => elementos(rx.recibidos).length > 0);
    await espera(2000);
    const deEdge = elementos(rx.recibidos);
    for (const e of deEdge) a.anota(resumen(e.carga));
    const suyos = deEdge.filter(
      (e) => e.carga.tags?.service === "feelverse-web-edge",
    );
    const uno = suyos[0];
    // Next escribe después un error propio («Cannot append headers…»), que es
    // otro. Lo que no puede pasar es que el del middleware llegue dos veces.
    const repetido = deEdge.some(
      (e) =>
        e.carga.tags?.service === "feelverse-web-server" &&
        JSON.stringify(e.carga).includes(".next/server/src/middleware.js"),
    );
    a.comprueba(
      "el fallo del middleware llega una sola vez, con su servicio y su pila",
      edge === 500 &&
        suyos.length === 1 &&
        !repetido &&
        uno.carga.environment === "staging" &&
        uno.carga.release === COMMIT.slice(0, 12) &&
        uno.carga.exception.values
          .at(-1)
          .stacktrace.frames.some((f) => f.in_app && f.lineno && f.colno),
      `HTTP ${edge}, ${suyos.length} informe(s) de Edge, repetido en Node: ${repetido}`,
    );
    a.comprueba(
      "señuelos en el sobre de Edge: 0",
      fugas(rx.recibidos, s).length === 0,
      fugas(rx.recibidos, s).join(", "),
    );
    const todosServidor = [...rx.recibidos];

    // ── Navegador (incluye la acción de servidor, que se lanza desde ahí) ──
    console.log("\n— Web · navegador —");
    rx.vaciar();
    const require = createRequire(join(WEB, "package.json"));
    const { chromium } = require("playwright");
    const navegador = await chromium.launch();
    const contexto = await navegador.newContext({
      userAgent: `Mozilla/5.0 Chrome/130 Navegador/${s.agente}`,
    });
    await contexto.addCookies([
      { name: "psico_prueba", value: s.cookie, url: base },
      {
        name: "psico_prueba",
        value: s.cookie,
        url: `http://127.0.0.1:${rx.port}`,
      },
    ]);
    const pagina = await contexto.newPage();
    const abrir = async () => {
      await pagina.goto(
        `${base}/zz-sonda/navegador?t=${s.query}#${s.fragmento}`,
      );
      await pagina.waitForSelector("main[data-listo=true]");
      await pagina.fill("#texto", s.campo);
    };
    await abrir();
    const cuenta = () =>
      elementos(rx.recibidos).filter((e) => e.tipo === "event").length;
    const pulsa = async (id, llega = true) => {
      const antes = cuenta();
      await pagina.click(`#${id}`);
      if (llega) return evento(() => cuenta() > antes, 5000);
      await espera(1500);
      return cuenta() > antes;
    };
    const natural = await pulsa("natural");
    const ev = elementos(rx.recibidos)[0]?.carga;
    a.anota(resumen(ev));
    a.comprueba(
      "un error llega con tipo, pila de nuestros fragmentos, entorno, servicio y versión",
      natural &&
        ev?.environment === "staging" &&
        ev.tags?.service === "feelverse-web-browser" &&
        ev.release === COMMIT.slice(0, 12) &&
        ev.exception.values[0].type === "TypeError" &&
        ev.exception.values[0].stacktrace.frames.some(
          (f) => f.in_app && /^\/_next\/static\//.test(f.filename) && f.colno,
        ),
    );
    const llegan = {};
    for (const id of ["sincrono", "promesa", "consola", "nombre"]) {
      llegan[id] = await pulsa(id);
    }
    llegan.cadena = await pulsa("cadena", false);
    await pagina.click("#salir");
    llegan.render = await pulsa("render");
    a.comprueba(
      "manejador, promesa, consola, nombre manipulado y fallo al pintar: llegan",
      ["sincrono", "promesa", "consola", "nombre", "render"].every(
        (k) => llegan[k],
      ),
      JSON.stringify(llegan),
    );
    a.comprueba("lo que no es un error no se informa", !llegan.cadena);

    await pagina.goto(`${base}/zz-sonda/accion`);
    await pagina.fill("#texto", s.formulario);
    const antesAccion = cuenta();
    await pagina.click("#enviar");
    await evento(() => cuenta() > antesAccion, 5000);
    await espera(1500);
    const accion = elementos(rx.recibidos).filter(
      (e) =>
        e.carga.tags?.service === "feelverse-web-server" &&
        e.carga.exception?.values.at(-1).type === "TypeError",
    );
    for (const e of accion) a.anota(resumen(e.carga));
    a.comprueba(
      "la acción de servidor que falla llega desde el servidor",
      accion.length >= 1,
      `${accion.length} informe(s)`,
    );
    const alReceptor = rx.recibidos.filter((r) => /envelope/.test(r.url));
    const cabecerasNavegador = JSON.stringify(
      alReceptor
        .filter((r) => r.cabeceras.some((c) => /^origin$/i.test(c)))
        .map((r) => r.cabeceras.filter((_, i) => i % 2 === 0)),
    ).toLowerCase();
    a.comprueba(
      "el navegador no manda cookies ni la dirección de la página",
      !/"cookie"|"referer"/.test(cabecerasNavegador),
      cabecerasNavegador.slice(0, 220),
    );
    const enHttp = Object.entries(s)
      .filter(([k]) => k !== "agente")
      .filter(([, v]) => JSON.stringify(alReceptor).includes(v))
      .map(([k]) => k);
    const enSobre = fugas(
      alReceptor.map((r) => ({ url: r.url, cuerpo: r.cuerpo })),
      s,
    );
    a.comprueba(
      `señuelos en los sobres del navegador (texto en pantalla, campo, almacenamiento, fragmento): 0 de ${Object.keys(s).length}`,
      enSobre.length === 0 && enHttp.length === 0,
      [...enSobre, ...enHttp].join(", "),
    );
    a.anota(
      `el agente de usuario viaja en la cabecera HTTP de la conexión, como en cualquier petición: ${JSON.stringify(alReceptor).includes(s.agente)}`,
    );

    const f = fugas(todosServidor, s);
    a.comprueba(
      `señuelos en los sobres del servidor: 0 de ${Object.keys(s).length}`,
      f.length === 0,
      f.join(", "),
    );

    // ── Trazas ──
    console.log(`\n— Web · trazas, N=${n} por caso —`);
    for (const conTraza of [false, true]) {
      rx.vaciar();
      for (let i = 0; i < n; i++) {
        await pide(i % 2 ? "/login" : `/dashboard?t=${s.query}`, {}, conTraza);
      }
      await espera(5000);
      const t = porTipo(rx.recibidos);
      a.comprueba(
        `servidor y Edge, ${conTraza ? "CON" : "SIN"} sentry-trace: 0 transacciones y 0 sesiones`,
        // La API de mentira responde `{}` y el panel falla al leerla: esos son
        // errores de verdad, y tienen que llegar limpios.
        Object.keys(t).every((k) => k === "event") &&
          fugas(rx.recibidos, s).length === 0,
        `${n} peticiones · ${JSON.stringify(t)} · señuelos: ${fugas(rx.recibidos, s).join(", ") || "ninguno"}`,
      );
      rx.vaciar();
      const p = await contexto.newPage();
      if (conTraza) {
        await p.addInitScript(
          ([traza]) => {
            const pon = () => {
              for (const [nombre, valor] of [
                ["sentry-trace", traza],
                ["baggage", "sentry-sampled=true"],
              ]) {
                const m = document.createElement("meta");
                m.name = nombre;
                m.content = valor;
                document.documentElement.appendChild(m);
              }
            };
            if (document.documentElement) pon();
            else document.addEventListener("DOMContentLoaded", pon);
          },
          [TRAZA],
        );
      }
      for (let i = 0; i < n; i++) {
        await p.goto(`${base}/login?t=${s.query}&i=${i}`, {
          waitUntil: "load",
        });
      }
      await espera(3000);
      await p.close();
      const tn = porTipo(rx.recibidos);
      a.comprueba(
        `navegador, ${conTraza ? "CON" : "SIN"} meta de traza: nada sale`,
        Object.keys(tn).length === 0,
        `${n} cargas · ${JSON.stringify(tn)}`,
      );
    }
    a.comprueba(
      "las peticiones salientes a la API (servidor y navegador) no llevan cabeceras de traza",
      api.recibidos.some((r) => /proveedor-ruta/.test(r.url)) &&
        api.recibidos.some((r) => /proveedor-navegador/.test(r.url)) &&
        cabecerasDeTraza(api.recibidos) === 0,
      `${api.recibidos.length} salientes, ${cabecerasDeTraza(api.recibidos)} con traza`,
    );
    a.comprueba(
      "SENTRY_SPOTLIGHT y SENTRY_TRACES_SAMPLE_RATE no abren otro camino",
      !sinSobre.some((r) => /spotlight/.test(r.url)),
    );
    await navegador.close();
    await web.parar();

    // ── Sin DSN ──
    console.log("\n— Web · sin DSN —");
    rx.vaciar();
    rmSync(redConstruccion, { force: true });
    construir(
      { NEXT_PUBLIC_API_URL: `http://127.0.0.1:${api.port}` },
      redConstruccion,
    );
    const trozos = readdirSync(join(WEB, ".next/static/chunks"), {
      recursive: true,
    })
      .filter((x) => x.endsWith(".js"))
      .filter((x) =>
        readFileSync(join(WEB, ".next/static/chunks", x), "utf8").includes(
          "sentry_key",
        ),
      );
    const red = join(tmp, "red-web");
    web = await arranca({ SONDA_RED: red });
    const sano = (await pide("/login")).status;
    const roto = (await pide(`/zz-sonda/rsc?t=${s.query}`)).status;
    const rotoEdge = (await pide("/zz-sonda/edge/x")).status;
    const nav = await chromium.launch();
    const pag = await nav.newPage();
    const ajenas = [];
    pag.on("request", (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith("data:")) {
        ajenas.push(r.url());
      }
    });
    await pag.goto(`${base}/zz-sonda/navegador`);
    await pag.waitForSelector("main[data-listo=true]");
    await pag.click("#natural");
    await espera(2000);
    await nav.close();
    await web.parar();
    const destinosAjenos = hosts(red);
    a.comprueba(
      "arranca igual, falla igual y no sale nada de ningún proceso",
      sano < 400 &&
        roto === 500 &&
        rotoEdge === 500 &&
        rx.recibidos.length === 0 &&
        destinosAjenos.length === 0 &&
        ajenas.length === 0,
      `login=${sano} rsc=${roto} edge=${rotoEdge} sobres=${rx.recibidos.length} destinos=${destinosAjenos.join(" ") || "ninguno"} navegador=${ajenas.join(" ") || "ninguna"}`,
    );
    a.comprueba(
      "el SDK del navegador no está en el paquete",
      trozos.filter((x) => !/daily/i.test(x)).length === 0 ||
        trozos.every((x) => esDeDaily(x)),
      trozos.join(" ") || "ninguno",
    );
  } finally {
    limpiar();
    await rx.cerrar();
    await api.cerrar();
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** La librería de videollamadas trae su propio Sentry dentro. */
function esDeDaily(x) {
  return readFileSync(join(WEB, ".next/static/chunks", x), "utf8").includes(
    "daily",
  );
}
