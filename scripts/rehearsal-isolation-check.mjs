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

/**
 * El anfitrión de una URL, o "" si no hay URL analizable. Falla cerrado.
 *
 * **Se retira el punto final**, que es la trampa que destapó la revisión:
 * `https://api.anthropic.com./v1` es una URL perfectamente válida y resuelve
 * al mismo sitio que sin el punto, pero `new URL(...).hostname` devuelve
 * `api.anthropic.com.` — y eso no casa con ningún dominio escrito sin él.
 * Normalizar aquí cierra esa clase entera de evasión, no sólo su primer caso.
 */
const anfitrion = (v) => {
  if (vacia(v)) return "";
  try {
    return new URL(v.trim()).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
};

/**
 * Los destinos que se aceptan como sustituto del ensayo.
 *
 * ── Por qué una lista de AUTORIZADOS y no una de prohibidos ────────────────
 *
 * La versión anterior preguntaba «¿este destino NO es del proveedor?», y eso
 * aprueba cualquier otra cosa: un bucket de otro proveedor, el servidor de
 * alguien, una IP pública. Que un destino no sea de Anthropic no lo convierte
 * en el sustituto previsto; sólo dice que no es ESE error concreto.
 *
 * La pregunta correcta es «¿es uno de los destinos que yo autoricé?», y para
 * que signifique algo, **la autorización tiene que venir de fuera del fichero
 * que se está comprobando**: si el propio `.env` del ensayo pudiera declarar
 * qué destinos valen, no habría comprobación. Por eso la lista llega por la
 * línea de órdenes, y por omisión es el bucle local — una propiedad positiva
 * («esto no sale de la máquina») y no la ausencia de otra.
 */
export const SUSTITUTOS_POR_OMISION = ["127.0.0.1", "::1", "localhost"];

/**
 * La marca que distingue un centinela del ensayo de una credencial de verdad.
 *
 * Mismo razonamiento: la versión anterior rechazaba tres prefijos conocidos
 * —`sk-ant-`, `pa-`, `sk-`— y aprobaba todo lo demás. Pero «no empieza por
 * `sk-ant-`» no certifica que el valor sea un centinela: una credencial de
 * cualquier otro proveedor, o una clave rotada a un formato nuevo, pasaba.
 *
 * Exigir una marca declarada invierte la carga: el valor tiene que DECIR que
 * es de mentira. Ninguna credencial emitida por un proveedor empieza así, y la
 * marca se declara por la línea de órdenes, no en el fichero comprobado.
 */
export const MARCA_CENTINELA_POR_OMISION = "ensayo-";

/** Un anfitrión autorizado, normalizando el punto final también en la lista. */
const autorizado = (host, sustitutos) =>
  host !== "" && sustitutos.includes(host);

/**
 * Las fronteras REQUERIDAS por el schema: no se pueden vaciar, así que se
 * redirigen. Cada una lleva su costura y el dominio del proveedor.
 *
 * `dominio` **ya no decide** si la costura pasa —eso lo decide la lista de
 * autorizados— pero sigue aquí para dar el mensaje preciso cuando el destino
 * resulta ser justamente el del proveedor, que es el error que más veces se
 * comete y el que peor se lee si sólo se dice «no autorizado».
 */
export const FRONTERAS_REQUERIDAS = [
  {
    clave: "ANTHROPIC_API_KEY",
    costura: "ANTHROPIC_BASE_URL",
    dominio: "anthropic.com",
    porqué:
      "weekly-summary llama al modelo una vez por persona restaurada, y eso se factura",
  },
  {
    clave: "VOYAGE_API_KEY",
    costura: "VOYAGE_BASE_URL",
    dominio: "voyageai.com",
    porqué:
      "la recuperación de Eco pide embeddings antes de preguntar al modelo, y también se factura",
  },
  {
    clave: "OPENAI_API_KEY",
    costura: "OPENAI_BASE_URL",
    dominio: "openai.com",
    porqué:
      "la transcripción de voz se factura por minuto, y `VOICE_PROVIDER=whisper` es el valor por omisión, así que la clave es requerida y no se puede vaciar",
  },
  {
    clave: "R2_SECRET_ACCESS_KEY",
    costura: "R2_ENDPOINT",
    dominio: "cloudflarestorage.com",
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
  {
    bucketVivo,
    cuentaViva,
    dbViva,
    redisVivo,
    sustitutos = SUSTITUTOS_POR_OMISION,
    marcaCentinela = MARCA_CENTINELA_POR_OMISION,
  },
) {
  // Los autorizados se normalizan igual que los anfitriones que se comparan
  // con ellos: si alguien declara `--sustituto http://127.0.0.1.:4555`, que
  // case. La normalización vive en un sitio, no en dos que pueden divergir.
  const permitidos = sustitutos.map((s) =>
    String(s).trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""),
  );
  const fallos = [];
  const pasa = [];
  const anota = (ok, qué, porqué) =>
    ok ? pasa.push(qué) : fallos.push({ qué, porqué });

  // 1 · Las fronteras que el schema declara REQUERIDAS. No se vacían: se
  //     redirigen, y hacen falta las dos condiciones.
  for (const f of FRONTERAS_REQUERIDAS) {
    const host = anfitrion(env[f.costura]);
    anota(
      autorizado(host, permitidos),
      `${f.costura} apunta a un sustituto autorizado`,
      host === ""
        ? `${f.costura} ausente o no analizable: el cliente usaría el destino del proveedor, y ${f.porqué}`
        : esDelProveedor(host, f.dominio)
          ? `${f.costura} apunta a ${host}, que es del proveedor; ${f.porqué}`
          : `${f.costura} apunta a ${host}, que no está entre los sustitutos autorizados (${permitidos.join(", ")}). No basta con que no sea del proveedor: ${f.porqué}`,
    );

    // Y el centinela, por marca declarada y no por descarte de prefijos.
    const valor = (env[f.clave] ?? "").trim();
    anota(
      valor.startsWith(marcaCentinela),
      `${f.clave} lleva la marca de centinela`,
      vacia(valor)
        ? `${f.clave} vacía: el schema la declara requerida, así que la app no arrancaría`
        : `${f.clave} no empieza por «${marcaCentinela}», así que no se puede afirmar que sea un centinela del ensayo. Si la costura se destipeara, ${f.porqué}`,
    );
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
  const stripe = (env.STRIPE_SECRET_KEY ?? "").trim();
  anota(
    /^(sk|rk)_test_/.test(stripe) || stripe.startsWith(marcaCentinela),
    "STRIPE_SECRET_KEY es de prueba o centinela",
    // También positiva: `sk_test_`/`rk_test_` es la propia declaración de
    // Stripe de que la clave es de prueba, no una ausencia de `sk_live_`.
    vacia(stripe)
      ? "STRIPE_SECRET_KEY vacía: el schema la declara requerida, así que la app no arrancaría"
      : `STRIPE_SECRET_KEY no se declara de prueba (sk_test_ / rk_test_) ni lleva la marca «${marcaCentinela}»: cualquier recorrido que toque facturación podría operar sobre cobros reales`,
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

  // Redis, y la comprobación que se desvanecía. La versión anterior envolvía
  // esto en `if (redisVivo)`, así que **omitir la referencia aprobaba el
  // ensayo**: justo el descuido que la comprobación existe para atrapar, y sin
  // una sola línea que lo dijera. Ahora, si el entorno USA Redis, la referencia
  // y una URL analizable son obligatorias; sólo un Redis apagado la exime.
  if (vacia(env.REDIS_URL)) {
    pasa.push("Redis apagado — no hay colas que compartir");
  } else if (vacia(redisVivo)) {
    fallos.push({
      qué: "falta declarar el Redis vivo",
      porqué:
        "el entorno declara REDIS_URL pero no se pasó --redis-vivo, así que no se puede afirmar que no sea el vivo. Las colas de BullMQ no se separan por entorno: un worker en el Redis vivo consumiría trabajos reales de staging",
    });
  } else {
    const hostRedis = anfitrion(env.REDIS_URL);
    anota(
      hostRedis !== "" && hostRedis !== redisVivo,
      "Redis del ensayo no es el vivo",
      hostRedis === ""
        ? "REDIS_URL no es analizable: no se puede afirmar a qué Redis apunta, y las colas de BullMQ no se separan por entorno"
        : `REDIS_URL apunta al Redis VIVO (${redisVivo}): el worker del ensayo consumiría trabajos reales de las colas de BullMQ y registraría sus planificadores encima`,
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
  /** Repetible: `--sustituto A --sustituto B`. */
  const args = (f) =>
    argv.reduce(
      (acc, v, i) => (v === f && argv[i + 1] ? [...acc, argv[i + 1]] : acc),
      [],
    );
  const ensayo = arg("--ensayo");
  const bucketVivo = arg("--bucket-vivo");
  const cuentaViva = arg("--cuenta-viva");
  const dbViva = arg("--db-viva");
  const redisVivo = arg("--redis-vivo");

  if (!ensayo || !bucketVivo || !cuentaViva || !dbViva) {
    console.error(
      "uso: rehearsal-isolation-check.mjs --ensayo <archivo> --bucket-vivo <nombre> " +
        "--cuenta-viva <id> --db-viva <host> [--redis-vivo <host>] " +
        "[--sustituto <url|host> ...] [--marca-centinela <prefijo>]\n" +
        "  --sustituto      destino aceptado como sustituto del ensayo; repetible.\n" +
        "                   Por omisión, sólo el bucle local (" +
        SUSTITUTOS_POR_OMISION.join(", ") +
        ").\n" +
        "  --marca-centinela  prefijo que debe llevar toda credencial del ensayo " +
        "(por omisión «" +
        MARCA_CENTINELA_POR_OMISION +
        "»).\n" +
        "  --redis-vivo     obligatorio si el entorno declara REDIS_URL.",
    );
    return 1;
  }

  // Los destinos autorizados y la marca llegan POR AQUÍ, nunca del fichero que
  // se comprueba: si el `.env` del ensayo pudiera declarar qué vale, no habría
  // comprobación. Sin `--sustituto`, sólo se acepta el bucle local.
  const declarados = args("--sustituto");
  const sustitutos = declarados.length
    ? declarados.map((d) => {
        try {
          return new URL(d).hostname;
        } catch {
          return d; // también se acepta un anfitrión suelto
        }
      })
    : SUSTITUTOS_POR_OMISION;
  const marcaCentinela = arg("--marca-centinela", MARCA_CENTINELA_POR_OMISION);

  const env = parseEnv(readFileSync(ensayo, "utf8"));
  const { fallos, pasa } = checkIsolation(env, {
    bucketVivo,
    cuentaViva,
    dbViva,
    redisVivo,
    sustitutos,
    marcaCentinela,
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
