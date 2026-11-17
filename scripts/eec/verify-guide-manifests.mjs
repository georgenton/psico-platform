#!/usr/bin/env node
/**
 * EEC — comprobar un paquete de manifiestos **sellado**, sin tocar el
 * manuscrito vivo.
 *
 *   node scripts/eec/verify-guide-manifests.mjs                 # C01
 *   node scripts/eec/verify-guide-manifests.mjs --chapter=C02
 *   node scripts/eec/verify-guide-manifests.mjs --chapter=all
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
 * sellado sigue siendo el que se firmó**.
 *
 * ── El falso verde que esto cierra (2026-11-16) ────────────────────────────
 *
 * La primera versión derivaba todo de los ficheros que encontraba. Ejecutada
 * contra un directorio que contenía **sólo un `SHA256SUMS.txt` vacío** —cero
 * manifiestos, cero actas, cero sumas— respondía `exit 0` y «OK — el paquete
 * sellado coincide con lo que se firmó». Un paquete borrado se leía como un
 * paquete intacto, que es la peor forma posible de fallar.
 *
 * La causa era de método: preguntaba «¿cuadran entre sí los ficheros que hay?»
 * cuando la pregunta es «¿está lo que tiene que estar, y cuadra?». Hoy el
 * inventario es **declarado por identidad** —`manifestId` a `manifestId`— y no
 * se deriva del directorio. Un recuento no basta: cinco ficheros con otros
 * cinco identificadores suman cinco igual.
 *
 * ── Qué garantiza el resultado, y qué no ───────────────────────────────────
 *
 * El informe separa cuatro cosas, porque confundirlas fue el otro defecto:
 *
 *   1. **Consistencia interna** — el inventario está completo, cada fichero
 *      hashea lo que `SHA256SUMS.txt` dice, y cada `manifestSha256` se
 *      recalcula desde su propio contenido. Siempre se comprueba.
 *   2. **Correspondencia manifiesto ↔ acta** — los tres campos que
 *      `checkApprovals` compara. Se comprueba donde hay actas declaradas.
 *   3. **Verificación criptográfica** — **NUNCA se hace aquí.** La clave
 *      pública vive en `EDITORIAL_APPROVAL_KEYS`, en el entorno, nunca en el
 *      repositorio. Una firma válida la acredita `checkApprovals` contra ese
 *      llavero, no este guion.
 *   4. **Comparación histórica** — los ficheros sellados contra sus blobs en
 *      un commit **declarado**, que es una referencia independiente de los
 *      propios ficheros. Sin ella, 1 y 2 sólo dicen que el paquete es
 *      coherente consigo mismo — y un paquete reescrito entero también lo
 *      sería. Son **doce** lecturas: los once ficheros del inventario y la
 *      lista de sumas que los ata. Si **cualquiera** de las doce no se puede
 *      leer, la garantía NO se declara: se informa como lectura incompleta,
 *      con el nombre de lo que faltó. Una lectura parcial no es media
 *      garantía — lo que falta por leer puede ser justo lo que cambió.
 *
 * Por eso la salida ya no dice «el paquete no se ha movido» cuando sólo ha
 * comprobado 1 y 2: lo afirma cuando 4 se ha realizado **completa**, y cuando
 * no, dice qué comprobó y qué no.
 *
 * Sólo lectura. Salida: `0` todo lo declarado coincide · `1` hay discrepancia.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Las cinco microguías de cada capítulo, por identidad y en orden de ruta. */
const CINCO = ["mg01", "mg02", "mg03", "mg04", "mg05"];

/**
 * El inventario esperado de cada paquete, **declarado**.
 *
 * `dir` es dónde vive lo firmado — no dónde escribiría el generador, que para
 * C01 ya no es lo mismo.
 *
 * `approvals` es un hecho declarado, no algo que se infiera del directorio:
 * inferirlo es lo que permitía el falso verde, y además «no inventes
 * aprobaciones» significa que un capítulo sin actas firmadas espera **cero**,
 * y que un acta que aparezca donde no se declaró ninguna es una discrepancia.
 *
 * `sealedAt` es la referencia histórica independiente: el commit en que ese
 * material se escribió por última vez de forma legítima. `null` donde no se ha
 * declarado una, y entonces la comparación histórica se informa como **no
 * realizada** en vez de darse por hecha.
 */
const PAQUETES = {
  C01: {
    dir: "artifacts/eec/C01/v1.0/feelverse/guides",
    // Las cinco actas que Jorge firmó el 2026-11-12 con la clave `jq-2026`,
    // escritas en #844. Es el único capítulo con actas.
    approvals: CINCO,
    sealedAt: "2bee9db5dbd0a9534b3dba5e9977870fa0f9f6f2",
    sealedAtNote: "#844 · las cinco actas firmadas el 2026-11-12",
  },
  C02: { dir: "artifacts/eec/C02/v1.0/feelverse/guides" },
  C03: { dir: "artifacts/eec/C03/v1.0/feelverse/guides" },
  C04: { dir: "artifacts/eec/C04/v1.0/feelverse/guides" },
  C05: { dir: "artifacts/eec/C05/v1.0/feelverse/guides" },
  C06: { dir: "artifacts/eec/C06/v1.1/feelverse/guides" },
  C07: { dir: "artifacts/eec/C07/v1.0/feelverse/guides" },
  C08: { dir: "artifacts/eec/C08/v1.0/feelverse/guides" },
  C09: { dir: "artifacts/eec/C09/v1.0/feelverse/guides" },
  C10: { dir: "artifacts/eec/C10/v1.0/feelverse/guides" },
};

/** Lo que cada manifiesto de microguía debe declarar para ser legible. */
const CAMPOS_MANIFIESTO = [
  "schemaVersion",
  "manifestId",
  "bookSlug",
  "editionKey",
  "chapterCode",
  "chapterOrder",
  "unitKey",
  "canonicalVersion",
  "canonicalSha256",
  "status",
  "publishAllowed",
  "manifestSha256",
];

/** La suite es el índice del recorrido: no lleva `manifestSha256` propio. */
const CAMPOS_SUITE = CAMPOS_MANIFIESTO.filter((c) => c !== "manifestSha256");

const CAMPOS_ACTA = [
  "manifestId",
  "canonicalVersion",
  "canonicalSha256",
  "manifestSha256",
  "definitionSha256",
  "approvedBy",
  "approvedAt",
  "keyId",
  "signature",
];

/** El inventario esperado, derivado de la identidad del capítulo. */
function inventario(code) {
  const p = PAQUETES[code];
  return {
    dir: p.dir,
    manifiestos: CINCO.map((n, i) => ({
      file: `${n}.manifest.json`,
      manifestId: `EEC-${code}-MG0${i + 1}`,
    })),
    suite: {
      file: "chapter-guided-suite.manifest.json",
      manifestId: `EEC-${code}-SUITE`,
    },
    actas: (p.approvals ?? []).map((n, i) => ({
      file: `${n}.approval.json`,
      manifestId: `EEC-${code}-MG0${i + 1}`,
    })),
    sealedAt: p.sealedAt ?? null,
    sealedAtNote: p.sealedAtNote ?? null,
  };
}

function leerSumas(dir, fallo) {
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

/** `git show <ref>:<path>`, o `null` cuando no se puede (sin git, sin ref). */
function blobEn(ref, rutaRelativa) {
  try {
    return execFileSync("git", ["show", `${ref}:${rutaRelativa}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function verificar(code) {
  const fallos = [];
  const fallo = (m) => fallos.push(m);
  const inv = inventario(code);
  const dir = join(ROOT, inv.dir);
  const garantias = {
    interna: false,
    correspondencia: null, // null = no aplica (sin actas declaradas)
    criptografica: false, // nunca aquí, por diseño
    historica: null, // null = no realizada (completa)
    historicaParcial: null, // qué se pudo leer y qué no, cuando faltó algo
  };

  // ── 0 · el paquete existe ───────────────────────────────────────────────
  if (!existsSync(join(dir, "SHA256SUMS.txt"))) {
    fallo(`${inv.dir}: no hay SHA256SUMS.txt`);
    return { code, inv, fallos, garantias, resumen: null };
  }

  const sumas = leerSumas(dir, fallo);
  const presentes = new Set(
    readdirSync(dir).filter(
      (f) => f.endsWith(".manifest.json") || f.endsWith(".approval.json"),
    ),
  );

  // ── 1 · el inventario DECLARADO está completo, y nada sellado sobra ─────
  //
  // Éste es el paso que cierra el falso verde: no se pregunta «¿cuadra lo que
  // hay?», se pregunta «¿está lo que tiene que estar?».
  const esperados = [...inv.manifiestos, inv.suite, ...inv.actas];
  for (const e of esperados) {
    if (!presentes.has(e.file)) {
      fallo(`${inv.dir}/${e.file}: FALTA (esperado por inventario)`);
    }
    if (!sumas.has(e.file)) {
      fallo(`${inv.dir}/${e.file}: no listado en SHA256SUMS.txt`);
    }
  }
  const declarados = new Set(esperados.map((e) => e.file));
  for (const f of presentes) {
    if (!declarados.has(f)) {
      // Un acta en un capítulo sin actas declaradas entra por aquí, y debe:
      // tratarla como válida sería inventar una aprobación.
      fallo(`${inv.dir}/${f}: sellable y NO declarado en el inventario`);
    }
  }
  for (const f of sumas.keys()) {
    if (!declarados.has(f)) {
      fallo(`${inv.dir}/${f}: listado en SHA256SUMS.txt y no declarado`);
    }
  }

  // ── 2 · cada fichero hashea lo que su suma dice ─────────────────────────
  for (const [f, esperado] of sumas) {
    if (!existsSync(join(dir, f))) continue; // ya reportado arriba
    const real = sha(readFileSync(join(dir, f), "utf8"));
    if (real !== esperado) {
      fallo(
        `${inv.dir}/${f}: hash distinto · esperado ${esperado.slice(0, 12)}… · real ${real.slice(0, 12)}…`,
      );
    }
  }

  // ── 3 · cada manifiesto, con su identidad y coherente consigo mismo ─────
  const docs = new Map();
  const leer = (file) => {
    if (!existsSync(join(dir, file))) return null;
    try {
      return JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      fallo(`${inv.dir}/${file}: JSON ilegible`);
      return null;
    }
  };

  for (const { file, manifestId } of [...inv.manifiestos, inv.suite]) {
    const doc = leer(file);
    if (doc === null) continue;
    // La identidad, no el recuento. Sustituir cinco manifiestos por otros
    // cinco deja el recuento igual y entra por aquí.
    if (doc.manifestId !== manifestId) {
      fallo(
        `${inv.dir}/${file}: manifestId ${String(doc.manifestId)} donde se esperaba ${manifestId}`,
      );
      continue;
    }
    docs.set(manifestId, doc);
    const requeridos =
      manifestId === inv.suite.manifestId ? CAMPOS_SUITE : CAMPOS_MANIFIESTO;
    for (const campo of requeridos) {
      if (!(campo in doc)) {
        fallo(`${inv.dir}/${file}: falta el campo obligatorio ${campo}`);
      }
    }
    if (typeof doc.manifestSha256 === "string") {
      const copia = { ...doc };
      delete copia.manifestSha256;
      const recomputado = sha(JSON.stringify(copia, null, 2));
      if (recomputado !== doc.manifestSha256) {
        fallo(
          `${inv.dir}/${file}: manifestSha256 no cuadra con su contenido · declarado ${doc.manifestSha256.slice(0, 12)}… · recalculado ${recomputado.slice(0, 12)}…`,
        );
      }
    }
  }

  // ── 4 · cada acta cubre a su manifiesto ────────────────────────────────
  if (inv.actas.length > 0) garantias.correspondencia = true;
  for (const { file, manifestId } of inv.actas) {
    const acta = leer(file);
    if (acta === null) continue;
    if (acta.manifestId !== manifestId) {
      fallo(
        `${inv.dir}/${file}: acta de ${String(acta.manifestId)} donde se esperaba ${manifestId}`,
      );
      continue;
    }
    for (const campo of CAMPOS_ACTA) {
      const v = acta[campo];
      if (v === undefined || v === null || v === "") {
        fallo(`${inv.dir}/${file}: falta el campo obligatorio ${campo}`);
      }
    }
    const m = docs.get(manifestId);
    if (!m) continue;
    // Los tres que `checkApprovals` compara en producción.
    for (const campo of [
      "canonicalVersion",
      "canonicalSha256",
      "manifestSha256",
    ]) {
      if (acta[campo] !== m[campo]) {
        fallo(
          `${inv.dir}/${file}: ${campo} del acta no coincide con el manifiesto · acta ${String(acta[campo]).slice(0, 24)}… · manifiesto ${String(m[campo]).slice(0, 24)}…`,
        );
      }
    }
  }

  // ── 5 · una sola revisión canónica en todo el paquete ──────────────────
  const revisiones = new Set(
    [...docs.values()].map((m) => `${m.canonicalVersion}|${m.canonicalSha256}`),
  );
  if (revisiones.size > 1) {
    fallo(
      `${inv.dir}: el paquete declara ${revisiones.size} revisiones canónicas distintas → ${[...revisiones].join(" / ")}`,
    );
  }
  if (fallos.length === 0) garantias.interna = true;

  // ── 6 · comparación histórica, cuando hay referencia declarada ─────────
  //
  // Lo que hace falta leer son los ONCE ficheros del inventario **más** la
  // lista de sumas, que es lo que los ata entre sí: doce lecturas.
  //
  // Y las doce son necesarias para declarar la garantía. La versión anterior
  // (2026-11-16) trataba la lista de sumas aparte del bucle y sólo miraba
  // `alcanzable`, que únicamente se enteraba de los once primeros. Reproducido
  // el 2026-11-17 en un árbol donde el sello declarado contenía los once y NO
  // la lista: el guion imprimía «✔ contra 0e8a7259 · 11 ficheros» y el cierre
  // «IDÉNTICO a su referencia histórica declarada», con `exit 0`. Una lectura
  // parcial se anunciaba como completa — el mismo error de método que el falso
  // verde de arriba, un paso más adentro.
  //
  // Dos cosas se conservan a propósito:
  //
  //   - **no se corta** en la primera lectura imposible, porque leer el resto
  //     dice exactamente QUÉ faltó y permite seguir comparando lo que sí se
  //     pudo leer. Una diferencia encontrada es un `fallo`, y eso no depende de
  //     que la garantía esté completa;
  //   - la consistencia interna y la correspondencia con las actas siguen
  //     informándose por separado: si son correctas, lo son — no se degradan
  //     por no haber podido leer el histórico.
  if (inv.sealedAt !== null) {
    const requeridos = [
      ...esperados.map((e) => e.file),
      "SHA256SUMS.txt", // la lista que ata el inventario: lectura requerida
    ];
    const ilegibles = [];
    let comparados = 0;

    for (const file of requeridos) {
      const rutaRel = `${inv.dir}/${file}`;
      const historico = blobEn(inv.sealedAt, rutaRel);
      if (historico === null) {
        ilegibles.push(rutaRel);
        continue;
      }
      comparados += 1;
      const actual = existsSync(join(dir, file))
        ? readFileSync(join(dir, file), "utf8")
        : null;
      if (actual === null) continue; // ya reportado por el paso 1
      if (actual !== historico) {
        fallo(
          `${rutaRel}: difiere de su versión en ${inv.sealedAt.slice(0, 8)} (referencia histórica declarada)`,
        );
      }
    }

    garantias.historica =
      ilegibles.length === 0
        ? {
            ref: inv.sealedAt,
            nota: inv.sealedAtNote,
            ficheros: comparados,
            requeridos: requeridos.length,
          }
        : null;
    garantias.historicaParcial =
      ilegibles.length === 0
        ? null
        : { comparados, requeridos: requeridos.length, ilegibles };
  }

  const [una] = [...revisiones];
  const [version, canonicalSha] = (una ?? "|").split("|");
  return {
    code,
    inv,
    fallos,
    garantias,
    resumen: {
      version,
      canonicalSha,
      manifiestos: docs.size,
      actas: inv.actas.length,
      sumas: sumas.size,
    },
  };
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

const codes = (() => {
  const arg = process.argv.find((a) => a.startsWith("--chapter="));
  if (arg === undefined) return ["C01"];
  const v = arg.slice(10);
  return v === "all" ? Object.keys(PAQUETES) : [v];
})();

let fallosTotales = 0;
let historicasHechas = 0;
let historicasParciales = 0;

for (const code of codes) {
  if (!PAQUETES[code]) {
    console.error(`FALLO CAPITULO_DESCONOCIDO: ${code}`);
    process.exit(1);
  }
  const r = verificar(code);
  fallosTotales += r.fallos.length;

  console.log(`${code} · ${r.inv.dir}`);
  if (r.resumen) {
    console.log(`  revisión sellada   ${r.resumen.version}`);
    console.log(
      `  canonicalSha256    ${r.resumen.canonicalSha?.slice(0, 16)}…`,
    );
    console.log(
      `  inventario         ${r.resumen.manifiestos} manifiestos (con la suite) · ${r.resumen.actas} actas · ${r.resumen.sumas} sumas`,
    );
  }
  console.log(
    `  consistencia interna      ${r.garantias.interna ? "✔ comprobada" : "✗ con discrepancias"}`,
  );
  console.log(
    `  correspondencia con actas ${
      r.garantias.correspondencia === null
        ? "— no aplica (sin actas declaradas en este capítulo)"
        : r.garantias.correspondencia && r.fallos.length === 0
          ? "✔ comprobada"
          : "✗ con discrepancias"
    }`,
  );
  console.log("  verificación criptográfica — NO realizada (ver abajo)");
  if (r.garantias.historica) {
    historicasHechas += 1;
    console.log(
      `  comparación histórica     ✔ contra ${r.garantias.historica.ref.slice(0, 8)} · ${r.garantias.historica.ficheros} de ${r.garantias.historica.requeridos} ficheros${
        r.garantias.historica.nota ? ` · ${r.garantias.historica.nota}` : ""
      }`,
    );
  } else if (r.garantias.historicaParcial) {
    // Parcial NO es hecha. Se dice cuánto se leyó, qué faltó y por qué eso no
    // acredita la garantía — nombrar los ficheros es lo que separa «no se pudo
    // comprobar» de «se comprobó y cuadra».
    historicasParciales += 1;
    const p = r.garantias.historicaParcial;
    console.log(
      `  comparación histórica     — NO realizada: lectura INCOMPLETA en ${r.inv.sealedAt.slice(0, 8)} · ${p.comparados} de ${p.requeridos} ficheros`,
    );
    for (const f of p.ilegibles) {
      console.log(`      no se pudo leer: ${f}`);
    }
  } else if (r.inv.sealedAt !== null) {
    console.log(
      `  comparación histórica     — NO realizada: no se pudo leer ${r.inv.sealedAt.slice(0, 8)} con git`,
    );
  } else {
    console.log(
      "  comparación histórica     — NO realizada: este capítulo no declara una referencia",
    );
  }

  for (const f of r.fallos) console.error(`  ✗ ${f}`);
  console.log("");
}

console.log(
  "Las firmas NO se verifican aquí: la clave pública vive en EDITORIAL_APPROVAL_KEYS,\n" +
    "en el entorno, nunca en el repositorio. Una firma válida la acredita\n" +
    "`checkApprovals` contra ese llavero, no este guion.",
);

if (fallosTotales > 0) {
  console.error(`\nFALLO PAQUETE_SELLADO · ${fallosTotales} discrepancia(s).`);
  process.exit(1);
}

if (historicasHechas === codes.length) {
  console.log(
    "\nOK — inventario completo, coherente consigo mismo e IDÉNTICO a su\n" +
      "referencia histórica declarada. El material firmado se conserva.",
  );
} else if (historicasParciales > 0) {
  console.log(
    "\nOK PARCIAL — inventario completo y coherente consigo mismo, y las\n" +
      "diferencias encontradas en lo que SÍ se pudo leer están arriba. Pero la\n" +
      "comparación histórica quedó INCOMPLETA, así que no se afirma que el\n" +
      "paquete sea el aprobado: lo que falta por leer podría ser justo lo que\n" +
      "cambió.",
  );
} else {
  console.log(
    "\nOK — inventario completo y coherente consigo mismo. Sin comparación\n" +
      "histórica en todos los capítulos pedidos, eso NO demuestra por sí solo\n" +
      "que el paquete sea el aprobado: un paquete reescrito entero también\n" +
      "sería coherente consigo mismo.",
  );
}
