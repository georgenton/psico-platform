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
 * ── Por qué la primera versión no se podía ejecutar ────────────────────────
 *
 * Exigía las claves VACÍAS. Para Resend y VAPID eso es correcto: el schema las
 * declara opcionales y la app arranca sin ellas. Para el modelo, los embeddings
 * y R2 era **imposible de satisfacer**: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` y
 * las cuatro `R2_*` están declaradas requeridas, así que vaciarlas no arranca.
 * La puerta pedía a la vez una app aislada y una app que no existe.
 *
 * Y había una segunda mitad del mismo error, menos visible: para R2 comprobaba
 * el NOMBRE DEL BUCKET, pero el destino de la petición sale de
 * `R2_ACCOUNT_ID`. Copiar la cuenta de staging renombrando el bucket pasaba la
 * puerta y enviaba el `DeleteObjectCommand` a la cuenta viva. Lo que lo salvaba
 * era que ese bucket no existiera allí — protección por accidente, no por
 * diseño.
 *
 * La pregunta correcta no es «¿está apagada?» sino **«¿puede esto alcanzar al
 * proveedor?»**, y se responde distinto según cómo declare el schema cada
 * frontera:
 *
 *   · frontera OPCIONAL (Resend, VAPID) → vacía. La app arranca sin ella.
 *   · frontera REQUERIDA (modelo, embeddings, R2) → **redirigida**: valor
 *     centinela que no es una credencial viva, Y la costura de destino puesta
 *     y apuntando fuera del proveedor. Dos condiciones independientes: la
 *     primera sola deja un destino vivo con una llave mala; la segunda sola
 *     deja una llave viva a un destino que alguien podría destipear.
 *   · frontera que NINGÚN procesador llama (Stripe, medido por el trinquete)
 *     → basta exigir que no sea la clave viva.
 *
 * Las tres costuras son `ANTHROPIC_BASE_URL` (nativa del SDK),
 * `VOYAGE_BASE_URL` y `R2_ENDPOINT`.
 *
 * ── Y Redis, que no estaba ────────────────────────────────────────────────
 *
 * Las colas de BullMQ viven en Redis sin separación por entorno. Un worker de
 * ensayo apuntando al Redis vivo **consumiría trabajos reales de staging** y
 * registraría sus planificadores encima de los vivos. Es la misma clase de
 * hueco que la base viva, y se comprueba igual.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/rehearsal-isolation-check.mjs \
 *     --ensayo ./env-del-ensayo \
 *     --bucket-vivo <nombre del bucket real> \
 *     --cuenta-viva <id de cuenta R2 real> \
 *     --db-viva <host de la base real> \
 *     [--redis-vivo <host de Redis real>]
 *
 * Los identificadores «vivos» no son secretos: son nombres de bucket, de cuenta
 * y de host. Se piden explícitamente para que la puerta pueda comparar sin
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

/** El anfitrión de una URL, o "" si no hay URL analizable. Falla cerrado. */
const anfitrion = (v) => {
  if (vacia(v)) return "";
  try {
    return new URL(v.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Las fronteras REQUERIDAS por el schema: no se pueden vaciar, así que se
 * redirigen. Cada una lleva su costura, el dominio del proveedor y la forma de
 * su credencial viva.
 *
 * Los prefijos son los que publican los proveedores para sus claves de
 * producción. No sirven para autenticar nada: sólo para reconocer que alguien
 * pegó una credencial de verdad donde iba un centinela.
 */
export const FRONTERAS_REQUERIDAS = [
  {
    clave: "ANTHROPIC_API_KEY",
    costura: "ANTHROPIC_BASE_URL",
    dominio: "anthropic.com",
    prefijoVivo: /^sk-ant-/i,
    porqué:
      "weekly-summary llama al modelo una vez por persona restaurada, y eso se factura",
  },
  {
    clave: "VOYAGE_API_KEY",
    costura: "VOYAGE_BASE_URL",
    dominio: "voyageai.com",
    prefijoVivo: /^pa-/i,
    porqué:
      "la recuperación de Eco pide embeddings antes de preguntar al modelo, y también se factura",
  },
  {
    clave: "OPENAI_API_KEY",
    costura: "OPENAI_BASE_URL",
    dominio: "openai.com",
    // `sk-` cubre las claves de producción de OpenAI y, de paso, una de
    // Anthropic pegada aquí por error: las dos son credenciales vivas.
    prefijoVivo: /^sk-/i,
    porqué:
      "la transcripción de voz se factura por minuto, y `VOICE_PROVIDER=whisper` es el valor por omisión, así que la clave es requerida y no se puede vaciar",
  },
  {
    clave: "R2_SECRET_ACCESS_KEY",
    costura: "R2_ENDPOINT",
    dominio: "cloudflarestorage.com",
    // R2 no publica un prefijo reconocible para sus secretos, así que aquí la
    // forma no dice nada y la cuenta se comprueba aparte, más abajo.
    prefijoVivo: null,
    porqué:
      "account-deletion y data-export-retention BORRAN objetos por esta costura, con las claves que digan las filas restauradas",
  },
];

/** Dominio de un anfitrión: casa el propio y cualquier subdominio. */
const esDelProveedor = (host, dominio) =>
  host === dominio || host.endsWith(`.${dominio}`);

/**
 * Las comprobaciones, cada una ligada a los procesadores que la motivan.
 *
 * Exportada para que la prueba pueda ejercitar cada una con su mutación, sin
 * tener que montar archivos en disco.
 */
export function checkIsolation(
  env,
  { bucketVivo, cuentaViva, dbViva, redisVivo },
) {
  const fallos = [];
  const pasa = [];
  const anota = (ok, qué, porqué) =>
    ok ? pasa.push(qué) : fallos.push({ qué, porqué });

  // 1 · Las fronteras que el schema declara REQUERIDAS. No se vacían: se
  //     redirigen, y hacen falta las dos condiciones.
  for (const f of FRONTERAS_REQUERIDAS) {
    const host = anfitrion(env[f.costura]);
    anota(
      host !== "" && !esDelProveedor(host, f.dominio),
      `${f.costura} apunta fuera del proveedor`,
      host === ""
        ? `${f.costura} ausente o no analizable: el cliente usaría el destino del proveedor, y ${f.porqué}`
        : `${f.costura} apunta a ${host}, que es del proveedor; ${f.porqué}`,
    );

    if (f.prefijoVivo) {
      const valor = env[f.clave] ?? "";
      anota(
        !f.prefijoVivo.test(valor.trim()),
        `${f.clave} no es una credencial viva`,
        `${f.clave} tiene la forma de una clave de producción; si la costura se destipeara, ${f.porqué}`,
      );
    }
  }

  // 2 · R2, la mitad que faltaba: el destino del borrado sale de la CUENTA, no
  //     del nombre del bucket. Se comprueban los dos — el bucket porque es lo
  //     que se nombra en la clave del objeto, y la cuenta porque es a dónde va
  //     la petición si la costura desaparece.
  const bucket = env.R2_BUCKET_NAME;
  anota(
    !vacia(bucket) && bucket !== bucketVivo,
    "R2_BUCKET_NAME no es el bucket vivo",
    vacia(bucket)
      ? "R2_BUCKET_NAME vacío: no se puede afirmar sobre qué bucket operan los borrados"
      : `R2_BUCKET_NAME es el bucket VIVO (${bucketVivo})`,
  );
  anota(
    !vacia(env.R2_ACCOUNT_ID) && env.R2_ACCOUNT_ID !== cuentaViva,
    "R2_ACCOUNT_ID no es la cuenta viva",
    vacia(env.R2_ACCOUNT_ID)
      ? "R2_ACCOUNT_ID vacío: la app no arranca, y sin él no se puede afirmar a qué cuenta iría la petición"
      : "R2_ACCOUNT_ID es la cuenta VIVA: si R2_ENDPOINT desapareciera, el borrado iría al almacenamiento real",
  );

  // 3 · Correo. `email`, `data-export` y `weekly-digest` escriben a direcciones
  //     que vienen de las filas restauradas: personas de verdad. Opcional en el
  //     schema, así que aquí sí se exige vacía.
  anota(
    vacia(env.RESEND_API_KEY),
    "correo apagado (RESEND_API_KEY vacía)",
    "con clave de Resend, el digest semanal y las exportaciones escribirían a las direcciones restauradas",
  );

  // 4 · Push. `inactive-nudge` y `weekly-digest` empujan a fichas restauradas.
  for (const k of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
    anota(
      vacia(env[k]),
      `push apagado (${k} vacía)`,
      `con ${k} puesta, el nudge y el digest empujarían a las fichas de dispositivo restauradas`,
    );
  }

  // 5 · Stripe. Hoy NINGÚN procesador la llama —lo mide el trinquete de
  //     `rehearsal-isolation.spec.ts`—, así que no hace falta redirigirla: basta
  //     con que no sea la clave viva. El recorrido del ensayo puede tocar
  //     facturación, y en modo de prueba eso no cobra a nadie.
  anota(
    !/^sk_live_/i.test((env.STRIPE_SECRET_KEY ?? "").trim()),
    "STRIPE_SECRET_KEY no es la clave viva",
    "STRIPE_SECRET_KEY es una clave de producción: cualquier recorrido que toque facturación operaría sobre cobros reales",
  );

  // 6 · Superficies de producto cerradas, para que el recorrido del ensayo no
  //     se confunda con un piloto abierto.
  for (const k of ["CIRCLES_ROLLOUT_MODE", "GUIDE_ROLLOUT_MODE"]) {
    anota(
      env[k] === "off",
      `${k}=off`,
      `${k} vale ${env[k] ?? "(ausente)"}, y el ensayo no debe abrir ninguna superficie`,
    );
  }

  // 7 · Y que ni la base ni Redis sean los vivos, que harían del «ensayo» una
  //     operación sobre el sistema real. Redis es el que se olvidaba: las colas
  //     de BullMQ no están separadas por entorno.
  const hostDb = anfitrion(env.DATABASE_URL);
  anota(
    hostDb !== "" && hostDb !== dbViva,
    "la base del ensayo no es la viva",
    hostDb === ""
      ? "DATABASE_URL ausente o no analizable: no se puede afirmar a qué base apunta"
      : `DATABASE_URL apunta al host VIVO (${dbViva})`,
  );

  if (redisVivo) {
    const hostRedis = anfitrion(env.REDIS_URL);
    anota(
      vacia(env.REDIS_URL) || hostRedis !== redisVivo,
      "Redis del ensayo no es el vivo",
      `REDIS_URL apunta al Redis VIVO (${redisVivo}): el worker del ensayo consumiría trabajos reales de las colas de BullMQ y registraría sus planificadores encima`,
    );
  }

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
  const cuentaViva = arg("--cuenta-viva");
  const dbViva = arg("--db-viva");
  const redisVivo = arg("--redis-vivo");

  if (!ensayo || !bucketVivo || !cuentaViva || !dbViva) {
    console.error(
      "uso: rehearsal-isolation-check.mjs --ensayo <archivo> --bucket-vivo <nombre> " +
        "--cuenta-viva <id> --db-viva <host> [--redis-vivo <host>]",
    );
    return 1;
  }

  const env = parseEnv(readFileSync(ensayo, "utf8"));
  const { fallos, pasa } = checkIsolation(env, {
    bucketVivo,
    cuentaViva,
    dbViva,
    redisVivo,
  });

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
