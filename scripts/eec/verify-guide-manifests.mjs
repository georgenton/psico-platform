#!/usr/bin/env node
/**
 * EEC — comprobar un paquete de manifiestos **sellado**, sin tocar el
 * manuscrito vivo.
 *
 *   node scripts/eec/verify-guide-manifests.mjs                 # C01
 *   node scripts/eec/verify-guide-manifests.mjs --chapter=C02
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * `build-guide-manifests.mjs` **regenera**, y para eso compara el manuscrito
 * vivo con el SHA que los manifiestos declaran. Eso vale mientras las dos cosas
 * sean la misma revisión. Cuando un capítulo se reabre —C01 pasó a v1.1 el
 * 2026-11-13— la receta deja de servir, y por dos razones independientes:
 *
 *   1. el canónico vivo ya no es el que los manifiestos sellaron, así que el
 *      generador se niega (y hace bien: regenerar produciría manifiestos de
 *      otro texto);
 *   2. el sellado del 2026-11-12 escribió `publishAllowed: true` y recalculó
 *      `manifestSha256`, mientras el generador emite `publishAllowed: false`.
 *      Es decir: **ni con el canónico correcto** reproduciría los ficheros que
 *      las cinco actas firmaron.
 *
 * Así que lo que hace falta no es regenerar: es **comprobar que el paquete
 * sellado sigue siendo el que se firmó**. Eso se puede hacer con fuentes
 * inmutables —los propios ficheros del paquete— y es lo que hace este guion.
 *
 * ── Lo que comprueba ───────────────────────────────────────────────────────
 *
 *   1. `SHA256SUMS.txt` cubre todos los manifiestos y todas las actas del
 *      directorio, y cada fichero hashea exactamente lo que dice.
 *   2. Cada manifiesto es coherente consigo mismo: `manifestSha256` recalculado
 *      sobre el manifiesto **sin ese campo** da el valor declarado. Es la misma
 *      regla que el generador, de modo que un fichero editado a mano se cae.
 *   3. Cada acta cubre a su manifiesto: `canonicalVersion`, `canonicalSha256` y
 *      `manifestSha256` coinciden exactamente con los del manifiesto. Son los
 *      tres campos que `checkApprovals` compara en producción.
 *   4. Los seis ficheros (cinco más la suite) declaran la MISMA revisión
 *      canónica — un paquete a medio sellar sería peor que uno roto.
 *
 * ── Lo que NO comprueba, y conviene no leerlo de más ───────────────────────
 *
 * **No verifica ninguna firma.** La clave pública vive en
 * `EDITORIAL_APPROVAL_KEYS`, en el entorno, nunca en el repositorio: la
 * criptografía la comprueba `checkApprovals` contra el llavero del entorno, y
 * sin llavero no verifica nada y lo dice. Lo que este guion acredita es que el
 * paquete **no se ha movido**; no que una firma sea válida.
 *
 * Y no mira el manuscrito vivo a propósito. Si lo mirase, volvería a atar una
 * comprobación histórica al fichero más reciente del capítulo, que es justo el
 * defecto que esto cierra.
 *
 * Sólo lectura. Salida: `0` todo coincide · `1` hay una discrepancia.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Dónde vive el paquete sellado de cada capítulo.
 *
 * Declarado, no derivado del generador: el generador describe dónde ESCRIBIRÍA,
 * y para C01 eso ya no es lo mismo que dónde está lo firmado. Una tabla corta y
 * explícita no se desincroniza en silencio.
 */
const PAQUETES = {
  C01: "artifacts/eec/C01/v1.0/feelverse/guides",
  C02: "artifacts/eec/C02/v1.0/feelverse/guides",
  C03: "artifacts/eec/C03/v1.0/feelverse/guides",
  C04: "artifacts/eec/C04/v1.0/feelverse/guides",
  C05: "artifacts/eec/C05/v1.0/feelverse/guides",
  C06: "artifacts/eec/C06/v1.1/feelverse/guides",
  C07: "artifacts/eec/C07/v1.0/feelverse/guides",
  C08: "artifacts/eec/C08/v1.0/feelverse/guides",
  C09: "artifacts/eec/C09/v1.0/feelverse/guides",
  C10: "artifacts/eec/C10/v1.0/feelverse/guides",
};

const fallos = [];
const notas = [];
const fallo = (m) => fallos.push(m);

function leerSumas(dir) {
  const texto = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8");
  const mapa = new Map();
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(linea);
    if (!m) {
      fallo(`SHA256SUMS.txt: línea ilegible → ${linea}`);
      continue;
    }
    mapa.set(m[2], m[1]);
  }
  return mapa;
}

function verificar(code) {
  const rel = PAQUETES[code];
  if (!rel) {
    fallo(`capítulo desconocido: ${code}`);
    return;
  }
  const dir = join(ROOT, rel);
  if (!existsSync(join(dir, "SHA256SUMS.txt"))) {
    fallo(`${rel}: no hay SHA256SUMS.txt`);
    return;
  }

  // ── 1 · cobertura y hash de cada fichero sellado ───────────────────────
  const sumas = leerSumas(dir);
  const sellables = readdirSync(dir).filter(
    (f) => f.endsWith(".manifest.json") || f.endsWith(".approval.json"),
  );
  for (const f of sellables) {
    if (!sumas.has(f)) {
      fallo(`${rel}/${f}: sellable y NO listado en SHA256SUMS.txt`);
    }
  }
  for (const [f, esperado] of sumas) {
    if (!existsSync(join(dir, f))) {
      fallo(`${rel}/${f}: listado y ausente`);
      continue;
    }
    const real = sha(readFileSync(join(dir, f), "utf8"));
    if (real !== esperado) {
      fallo(
        `${rel}/${f}: hash distinto · esperado ${esperado.slice(0, 12)}… · real ${real.slice(0, 12)}…`,
      );
    }
  }

  // ── 2 · cada manifiesto, coherente consigo mismo ───────────────────────
  const manifiestos = new Map();
  for (const f of sellables
    .filter((f) => f.endsWith(".manifest.json"))
    .sort()) {
    const texto = readFileSync(join(dir, f), "utf8");
    let doc;
    try {
      doc = JSON.parse(texto);
    } catch {
      fallo(`${rel}/${f}: JSON ilegible`);
      continue;
    }
    manifiestos.set(doc.manifestId ?? f, doc);
    // La suite no lleva `manifestSha256`: no es un manifiesto de microguía, es
    // el índice del recorrido. Su integridad la cubre el paso 1.
    if (typeof doc.manifestSha256 !== "string") continue;
    const declarado = doc.manifestSha256;
    const copia = { ...doc };
    delete copia.manifestSha256;
    const recomputado = sha(JSON.stringify(copia, null, 2));
    if (recomputado !== declarado) {
      fallo(
        `${rel}/${f}: manifestSha256 no cuadra con su contenido · declarado ${declarado.slice(0, 12)}… · recalculado ${recomputado.slice(0, 12)}…`,
      );
    }
  }

  // ── 3 · cada acta cubre a su manifiesto ────────────────────────────────
  let actas = 0;
  for (const f of sellables
    .filter((f) => f.endsWith(".approval.json"))
    .sort()) {
    let acta;
    try {
      acta = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      fallo(`${rel}/${f}: JSON ilegible`);
      continue;
    }
    actas += 1;
    const m = manifiestos.get(acta.manifestId);
    if (!m) {
      fallo(
        `${rel}/${f}: acta de ${acta.manifestId}, que no está en el paquete`,
      );
      continue;
    }
    for (const campo of [
      "canonicalVersion",
      "canonicalSha256",
      "manifestSha256",
    ]) {
      if (acta[campo] !== m[campo]) {
        fallo(
          `${rel}/${f}: ${campo} del acta no coincide con el manifiesto · acta ${String(acta[campo]).slice(0, 24)}… · manifiesto ${String(m[campo]).slice(0, 24)}…`,
        );
      }
    }
    if (typeof acta.signature !== "string" || acta.signature.length === 0) {
      fallo(`${rel}/${f}: acta sin firma`);
    }
    if (typeof acta.keyId !== "string" || acta.keyId.length === 0) {
      fallo(`${rel}/${f}: acta sin keyId`);
    }
  }

  // ── 4 · una sola revisión canónica en todo el paquete ──────────────────
  const revisiones = new Set(
    [...manifiestos.values()].map(
      (m) => `${m.canonicalVersion}|${m.canonicalSha256}`,
    ),
  );
  if (revisiones.size > 1) {
    fallo(
      `${rel}: el paquete declara ${revisiones.size} revisiones canónicas distintas → ${[...revisiones].join(" / ")}`,
    );
  }
  const [una] = [...revisiones];
  const [version, canonicalSha] = (una ?? "|").split("|");

  notas.push(
    [
      `${code} · ${rel}`,
      `  revisión sellada   ${version}`,
      `  canonicalSha256    ${canonicalSha?.slice(0, 16)}…`,
      `  manifiestos        ${manifiestos.size} (incluida la suite)`,
      `  actas              ${actas}`,
      `  ficheros sellados  ${sumas.size}`,
    ].join("\n"),
  );
}

const codes = (() => {
  const arg = process.argv.find((a) => a.startsWith("--chapter="));
  if (arg === undefined) return ["C01"];
  const v = arg.slice(10);
  return v === "all" ? Object.keys(PAQUETES) : [v];
})();

for (const code of codes) {
  const rel = PAQUETES[code];
  if (rel && !existsSync(join(ROOT, rel, "SHA256SUMS.txt"))) {
    // Un capítulo cuyo paquete aún no existe no es un fallo cuando se piden
    // todos: es un capítulo sin sellar.
    if (codes.length > 1) {
      notas.push(`${code} · sin paquete sellado todavía`);
      continue;
    }
  }
  verificar(code);
}

for (const n of notas) console.log(n);
console.log(
  "\nLas firmas NO se verifican aquí: la clave pública vive en EDITORIAL_APPROVAL_KEYS,\n" +
    "en el entorno. Esto acredita que el paquete no se ha movido, no que una firma\n" +
    "sea válida — eso lo comprueba `checkApprovals` contra el llavero del entorno.",
);

if (fallos.length > 0) {
  console.error(`\nFALLO SELLO_MOVIDO · ${fallos.length} discrepancia(s):`);
  for (const f of fallos) console.error(`  · ${f}`);
  process.exit(1);
}
console.log("\nOK — el paquete sellado coincide con lo que se firmó.");
