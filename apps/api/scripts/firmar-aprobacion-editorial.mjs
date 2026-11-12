/**
 * Firma las actas de aprobación editorial de un capítulo. Lo ejecuta el TITULAR.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * `publishAllowed: true` en un manifiesto declara la intención, y cualquiera con
 * acceso al repositorio puede escribirlo. La autoridad la da una firma Ed25519
 * cuya clave privada vive FUERA de la plataforma: ni el repositorio ni el
 * despliegue la tienen, y por tanto nadie con acceso a ellos puede aprobar.
 * Ver `experience-editorial-approval.ts` y el ADR 0028.
 *
 * Este guion no decide nada: compone exactamente lo que hay que firmar, lo
 * firma con la clave que le indiques, y comprueba el resultado antes de
 * terminar. Si la comprobación falla, no deja actas a medias.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   # la primera vez, para crear el par de claves (fuera del repositorio):
 *   node apps/api/scripts/firmar-aprobacion-editorial.mjs \
 *     --nueva-clave ~/.psico-ops/editorial-approval-2026.key
 *
 *   # firmar:
 *   node apps/api/scripts/firmar-aprobacion-editorial.mjs \
 *     --clave ~/.psico-ops/editorial-approval-2026.key \
 *     --aprobado-por "Jorge Quizamanchuro" \
 *     --key-id jq-2026
 *
 * Opcional: `--capitulo C01` (por defecto), `--fecha <ISO>` para fijar el
 * instante, `--solo-mostrar` para ver los payloads sin escribir nada.
 *
 * ── Lo que NO hace, a propósito ────────────────────────────────────────────
 *
 *   - no escribe la clave privada dentro del repositorio, y se niega si la ruta
 *     que le das está dentro: una clave junto al artefacto que autoriza no es
 *     una autoridad;
 *   - no toca la base de datos, ni publica, ni sella. Sellar es `reseal` y
 *     publicar es el mecanismo de publicación, los dos aparte;
 *   - no inventa la clave pública del entorno: la imprime para que la
 *     configures tú donde corresponda.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as firmar,
} from "node:crypto";

const RAIZ = resolve(import.meta.dirname, "../../..");
const API = join(RAIZ, "apps/api");

function argumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) a[k] = true;
    else {
      a[k] = v;
      i += 1;
    }
  }
  return a;
}

const a = argumentos(process.argv.slice(2));

/** Una clave privada dentro del repositorio sería una clave publicada. */
function fueraDelRepositorio(ruta) {
  const abs = resolve(ruta.replace(/^~/, process.env.HOME ?? "~"));
  if (abs.startsWith(RAIZ + "/") || abs === RAIZ) {
    console.error(
      `rechazado: ${abs}\n` +
        `está DENTRO del repositorio (${RAIZ}). La clave privada tiene que vivir\n` +
        `fuera — por ejemplo en ~/.psico-ops/ — o deja de ser una autoridad.`,
    );
    process.exit(1);
  }
  return abs;
}

// ── crear el par de claves ──────────────────────────────────────────────────
if (a["nueva-clave"]) {
  const ruta = fueraDelRepositorio(String(a["nueva-clave"]));
  if (existsSync(ruta)) {
    console.error(`rechazado: ${ruta} ya existe. No sobrescribo una clave.`);
    process.exit(1);
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(
    ruta,
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    { mode: 0o600 },
  );
  chmodSync(ruta, 0o600);
  const spki = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  console.log(
    JSON.stringify(
      {
        clavePrivada: ruta,
        permisos: "600",
        clavePublicaBase64Spki: spki,
        siguiente:
          "guarda la ruta, no la compartas, y vuelve a ejecutar este guion con " +
          "--clave, --aprobado-por y --key-id",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ── firmar ──────────────────────────────────────────────────────────────────
const capitulo = String(a.capitulo ?? "C01");
const DIR = join(RAIZ, `artifacts/eec/${capitulo}/v1.0/feelverse/guides`);

const { loadManifests } = await import(
  join(API, "dist/content-core/eec-c01-guides-cli.js")
);
const { approvalRequests } = await import(
  join(API, "dist/content-core/eec-c01-guides-apply.js")
);
const { approvalPayload, verifyApproval } = await import(
  join(API, "dist/experience/experience-editorial-approval.js")
);

const manifiestos = loadManifests(DIR);
const solicitudes = approvalRequests(manifiestos);

if (a["solo-mostrar"]) {
  for (const s of solicitudes) {
    console.log(`\n── ${s.manifestId} ──`);
    console.log(s.payload);
  }
  process.exit(0);
}

for (const requerido of ["clave", "aprobado-por", "key-id"]) {
  if (typeof a[requerido] !== "string" || a[requerido] === "") {
    console.error(
      `falta --${requerido}.\n\n` +
        `uso: node apps/api/scripts/firmar-aprobacion-editorial.mjs \\\n` +
        `       --clave <ruta fuera del repositorio> \\\n` +
        `       --aprobado-por "<tu nombre>" \\\n` +
        `       --key-id <identificador corto de la clave>\n\n` +
        `para crear el par: --nueva-clave <ruta fuera del repositorio>`,
    );
    process.exit(1);
  }
}

const rutaClave = fueraDelRepositorio(String(a.clave));
const privada = createPrivateKey(readFileSync(rutaClave, "utf8"));
const publica = createPublicKey(privada);
const spki = publica.export({ type: "spki", format: "der" }).toString("base64");

const keyId = String(a["key-id"]);
const aprobadoPor = String(a["aprobado-por"]);
// UN instante para las cinco: es una decisión, no cinco.
const fecha = String(a.fecha ?? new Date().toISOString());

const llavero = new Map([[keyId, spki]]);
const escritas = [];
const actas = [];

for (const s of solicitudes) {
  const sinFirma = {
    ...s.approval,
    approvedBy: aprobadoPor,
    approvedAt: fecha,
    keyId,
  };
  delete sinFirma.signature;
  const payload = approvalPayload(sinFirma);
  const firma = firmar(null, Buffer.from(payload, "utf8"), privada).toString(
    "base64",
  );
  actas.push({
    manifestId: s.manifestId,
    acta: { ...sinFirma, signature: firma },
  });
}

// Comprobar ANTES de escribir: una acta inválida en disco es peor que ninguna.
const problemas = [];
for (const { manifestId, acta } of actas) {
  const m = manifiestos.find((x) => x.manifestId === manifestId);
  const v = verifyApproval({
    approval: acta,
    keyring: llavero,
    expect: {
      manifestId: m.manifestId,
      experienceKey: m.experienceKey,
      experienceVersion: m.experienceVersion,
      guideKey: m.guideKey,
      guideVersion: m.guideVersion,
      canonicalVersion: m.canonicalVersion,
      canonicalSha256: m.canonicalSha256,
      manifestSha256: m.manifestSha256,
      definitionSha256: acta.definitionSha256,
    },
  });
  if (!v.valid) problemas.push(`${manifestId}: ${v.code} — ${v.detail}`);
}

if (problemas.length > 0) {
  console.error("NO se escribió ninguna acta. La comprobación falló:");
  for (const p of problemas) console.error(`  · ${p}`);
  process.exit(1);
}

for (const { manifestId, acta } of actas) {
  const n = manifestId.slice(-4).toLowerCase(); // EEC-C01-MG01 → mg01
  const destino = join(DIR, `${n}.approval.json`);
  writeFileSync(destino, JSON.stringify(acta, null, 2) + "\n");
  escritas.push(
    `artifacts/eec/${capitulo}/v1.0/feelverse/guides/${n}.approval.json`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      actasEscritas: escritas,
      aprobadoPor,
      aprobadoEn: fecha,
      keyId,
      comprobacionLocal: `${actas.length}/${actas.length} válidas`,
      configurarEnElEntorno: {
        variable: "EDITORIAL_APPROVAL_KEYS",
        valor: `${keyId}:${spki}`,
        nota:
          "Es la clave PÚBLICA. Va en el entorno de la API (y del worker si " +
          "publica), nunca en el repositorio.",
      },
      siguiente:
        "devuelve los cinco ficheros y la línea de EDITORIAL_APPROVAL_KEYS; " +
        "la clave privada se queda contigo",
    },
    null,
    2,
  ),
);
