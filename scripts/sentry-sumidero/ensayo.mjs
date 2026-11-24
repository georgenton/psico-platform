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
  fuga: opcion("fuga"),
  hasta: opcion("hasta") ?? (opcion("fuga") && "navegador"),
};

const a = acta();
const corre = { api: false, worker: false, web: false };
if (cual === "todo") for (const k of Object.keys(corre)) corre[k] = true;
else if (cual in corre) corre[cual] = true;

const { ensayoApi, ensayoWorker } = await import("./ensayo-api.mjs");
const { FUGAS, PARTES, ensayoWeb } = await import("./ensayo-web.mjs");
const soloWeb = opciones.hasta ?? opciones.fuga;
if (
  !Object.values(corre).includes(true) ||
  (soloWeb && cual !== "web") ||
  (opciones.hasta && !PARTES.includes(opciones.hasta)) ||
  (opciones.fuga && (!FUGAS[opciones.fuga] || opciones.control))
) {
  console.error(
    `Uso: ensayo.mjs api|worker|web|todo [--n=60] [--sesiones] [--control [--dist=… | --web=… --sdk=…]]
     ensayo.mjs web [--hasta=${PARTES.join("|")}] [--fuga=${Object.keys(FUGAS).join("|")}]`,
  );
  process.exit(2);
}

if (corre.api) await ensayoApi(opciones, a);
if (corre.worker) await ensayoWorker(opciones, a);
if (corre.web) await ensayoWeb(opciones, a);

const mal = a.filas.filter((f) => !f.ok).length;
const falta = opciones.hasta
  ? PARTES.slice(PARTES.indexOf(opciones.hasta) + 1)
  : [];
console.log(
  `\n${mal === 0 ? "✔" : "✗"} ${a.filas.length - mal} de ${a.filas.length} comprobaciones${falta.length ? ` · PARCIAL, sin: ${falta.join(", ")}` : ""}`,
);

if (opciones.fuga) {
  // Aquí fallar es lo correcto, pero no cualquier fallo: tiene que caer la
  // comprobación de ESE lote, por ESE señuelo, y sólo ella.
  const { lote, senuelo } = FUGAS[opciones.fuga];
  const caidas = a.filas.filter((f) => !f.ok);
  const otros = a.filas.filter((f) => f.lote && f.lote !== lote);
  const bien =
    caidas.length === 1 &&
    caidas[0].lote === lote &&
    caidas[0].salen.join() === senuelo &&
    ["Edge", "navegador", "acción de servidor"].every((l) =>
      otros.some((f) => f.lote === l && f.ok),
    );
  console.log(
    `${bien ? "✔" : "✗"} control negativo: «${senuelo}» dejado salir en «${lote}» · caen: ${caidas.map((f) => `«${f.lote ?? f.nombre}»`).join(", ") || "ninguna"} · siguen en pie: ${
      otros
        .filter((f) => f.ok)
        .map((f) => `«${f.lote}»`)
        .join(", ") || "ninguna"
    }`,
  );
  process.exit(bien ? 0 : 1);
}
// El control negativo existe para FALLAR: que no falle significa que el ensayo
// no está mirando donde hay que mirar.
process.exit(opciones.control ? (mal > 0 ? 0 : 1) : mal > 0 ? 1 : 0);
