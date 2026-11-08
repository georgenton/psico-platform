#!/usr/bin/env node
/**
 * Puerta de aislamiento del ensayo de recuperación (nivel 4).
 *
 * ── Qué problema resuelve ──────────────────────────────────────────────────
 *
 * El ensayo de nivel 4 restaura el volcado real en una caja nueva y arranca los
 * tres servicios. La base restaurada lleva **filas reales**: direcciones de
 * correo, fichas de dispositivo, solicitudes de exportación. Y el worker, al
 * arrancar, registra sus crons contra ellas.
 *
 * Siete de los trece procesadores tienen efecto FUERA de la caja, y dos de
 * ellos **borran objetos en R2**, que no es una copia:
 *
 *   · `account-deletion`       → borra objetos de R2 y filas de personas
 *   · `data-export-retention`  → borra objetos de R2
 *   · `data-export`            → sube a R2 y manda correo
 *   · `email`                  → manda correo
 *   · `weekly-digest`          → correo + push, a destinatarios restaurados
 *   · `inactive-nudge`         → push, a fichas restauradas
 *   · `weekly-summary`         → llamadas al modelo, que se facturan
 *
 * El borrado de filas queda contenido —opera sobre la copia—, pero R2, el
 * correo, el push y el modelo **no**. Un ensayo con las credenciales vivas
 * dentro no sería un ensayo: sería una operación sobre el sistema real,
 * disfrazada de prueba.
 *
 * Así que esto se comprueba ANTES de arrancar ningún servicio, y **falla
 * cerrado**: si no puede afirmar que algo está aislado, dice que no lo está.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/rehearsal-isolation-check.mjs \
 *     --ensayo ./env-del-ensayo \
 *     --bucket-vivo <nombre del bucket real> \
 *     --db-viva <host de la base real>
 *
 * Los dos identificadores «vivos» no son secretos: son un nombre de bucket y un
 * nombre de host. Se piden explícitamente para que la puerta pueda comparar sin
 * necesitar ninguna credencial real.
 *
 * Código de salida 0 sólo si TODO está aislado. Cualquier otra cosa, 1.
 */

import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

/** Lee un archivo de entorno a un mapa. Ignora comentarios y líneas vacías. */
export function parseEnv(text) {
  const out = {};
  for (const linea of text.split("\n")) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/** Vacío = apagado. Una clave en blanco y una ausente son lo mismo. */
const vacia = (v) => v === undefined || v === null || v.trim() === "";

/**
 * Las seis comprobaciones, cada una ligada a los procesadores que la motivan.
 *
 * Exportada para que la prueba pueda ejercitar cada una con su mutación, sin
 * tener que montar archivos en disco.
 */
export function checkIsolation(env, { bucketVivo, dbViva }) {
  const fallos = [];
  const pasa = [];
  const anota = (ok, qué, porqué) =>
    ok ? pasa.push(qué) : fallos.push({ qué, porqué });

  // 1 · R2. El más serio: `account-deletion` y `data-export-retention` BORRAN.
  const bucket = env.R2_BUCKET_NAME;
  const tieneCredR2 =
    !vacia(env.R2_ACCESS_KEY_ID) || !vacia(env.R2_SECRET_ACCESS_KEY);
  if (!tieneCredR2) {
    anota(true, "R2 sin credenciales — nada que borrar fuera");
  } else {
    anota(
      !vacia(bucket) && bucket !== bucketVivo,
      "R2 apunta a un bucket distinto del vivo",
      vacia(bucket)
        ? "hay credenciales de R2 pero R2_BUCKET_NAME está vacío, así que no se puede afirmar a dónde escriben"
        : `R2_BUCKET_NAME es el bucket VIVO (${bucketVivo}); account-deletion y data-export-retention borrarían objetos reales`,
    );
  }

  // 2 · Correo. `email`, `data-export` y `weekly-digest` escriben a direcciones
  //     que vienen de las filas restauradas: personas de verdad.
  anota(
    vacia(env.RESEND_API_KEY),
    "correo apagado (RESEND_API_KEY vacía)",
    "con clave de Resend, el digest semanal y las exportaciones escribirían a las direcciones restauradas",
  );

  // 3 · Push. `inactive-nudge` y `weekly-digest` empujan a fichas restauradas.
  for (const k of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
    anota(
      vacia(env[k]),
      `push apagado (${k} vacía)`,
      `con ${k} puesta, el nudge y el digest empujarían a las fichas de dispositivo restauradas`,
    );
  }

  // 4 · Modelo. `weekly-summary` llama por cada persona candidata, y se factura.
  anota(
    vacia(env.ANTHROPIC_API_KEY),
    "modelo apagado (ANTHROPIC_API_KEY vacía)",
    "weekly-summary llamaría al modelo una vez por persona restaurada, y eso se factura",
  );

  // 5 · Superficies de producto cerradas, para que el recorrido del ensayo no
  //     se confunda con un piloto abierto.
  for (const k of ["CIRCLES_ROLLOUT_MODE", "GUIDE_ROLLOUT_MODE"]) {
    anota(
      env[k] === "off",
      `${k}=off`,
      `${k} vale ${env[k] ?? "(ausente)"}, y el ensayo no debe abrir ninguna superficie`,
    );
  }

  // 6 · Y que la base del ensayo no sea la viva, que haría del «ensayo» una
  //     operación sobre el sistema real.
  const url = env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "";
  }
  anota(
    host !== "" && host !== dbViva,
    "la base del ensayo no es la viva",
    host === ""
      ? "DATABASE_URL ausente o no analizable: no se puede afirmar a qué base apunta"
      : `DATABASE_URL apunta al host VIVO (${dbViva})`,
  );

  return { fallos, pasa };
}

/**
 * La interfaz de línea de órdenes, SÓLO cuando se invoca directamente.
 *
 * Sin esta guarda, importar este archivo desde una prueba ejecutaría el CLI:
 * leería `argv`, intentaría abrir un archivo que no existe y llamaría a
 * `process.exit`. Es la misma trampa que tienen los archivos de semilla de este
 * repositorio, y se evita igual.
 */
function main() {
  const arg = (f, d = null) => {
    const i = argv.indexOf(f);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const ensayo = arg("--ensayo");
  const bucketVivo = arg("--bucket-vivo");
  const dbViva = arg("--db-viva");

  if (!ensayo || !bucketVivo || !dbViva) {
    console.error(
      "uso: rehearsal-isolation-check.mjs --ensayo <archivo> --bucket-vivo <nombre> --db-viva <host>",
    );
    return 1;
  }

  const env = parseEnv(readFileSync(ensayo, "utf8"));
  const { fallos, pasa } = checkIsolation(env, { bucketVivo, dbViva });

  for (const p of pasa) console.log(`   ✓ ${p}`);
  for (const f of fallos) console.log(`   ✗ ${f.qué}\n       ${f.porqué}`);

  if (fallos.length === 0) {
    console.log(
      `\n✔ aislado — ${pasa.length} comprobaciones. Se puede arrancar.`,
    );
    return 0;
  }
  console.log(
    `\n✗ NO aislado — ${fallos.length} de ${pasa.length + fallos.length} fallan. ` +
      `NO arranques ningún servicio hasta corregirlas.`,
  );
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
