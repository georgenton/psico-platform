#!/usr/bin/env node
/**
 * ¿Qué sale de cada proceso hacia Sentry? Lee `README.md`.
 *
 *   node scripts/sentry-sumidero/ensayo.mjs api|worker|web|todo
 */
import { join, resolve } from "node:path";
import { RAIZ, acta } from "./lib.mjs";

const args = process.argv.slice(2);
const cual = args.find((x) => !x.startsWith("--"));
const opcion = (n) =>
  args.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3);

const opciones = {
  dist: resolve(opcion("dist") ?? join(RAIZ, "apps/api/dist")),
  web: opcion("web") && resolve(opcion("web")),
  sdk: opcion("sdk"),
  n: Number(opcion("n") ?? 60),
  control: args.includes("--control"),
  sesiones: args.includes("--sesiones"),
};

const a = acta();
const corre = { api: false, worker: false, web: false };
if (cual === "todo") for (const k of Object.keys(corre)) corre[k] = true;
else if (cual in corre) corre[cual] = true;
else {
  console.error(
    "Uso: ensayo.mjs api|worker|web|todo [--n=60] [--sesiones] [--control [--dist=… | --web=… --sdk=…]]",
  );
  process.exit(2);
}

const { ensayoApi, ensayoWorker } = await import("./ensayo-api.mjs");
if (corre.api) await ensayoApi(opciones, a);
if (corre.worker) await ensayoWorker(opciones, a);
if (corre.web) {
  const { ensayoWeb } = await import("./ensayo-web.mjs");
  await ensayoWeb(opciones, a);
}

const mal = a.filas.filter((f) => !f.ok).length;
console.log(
  `\n${mal === 0 ? "✔" : "✗"} ${a.filas.length - mal} de ${a.filas.length} comprobaciones`,
);
// El control negativo existe para FALLAR: que no falle significa que el ensayo
// no está mirando donde hay que mirar.
process.exit(opciones.control ? (mal > 0 ? 0 : 1) : mal > 0 ? 1 : 0);
