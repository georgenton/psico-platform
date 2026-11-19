/**
 * ¿Saldría un correo a ESTA dirección, en ESTE proceso?
 *
 * ── Por qué existe, y por qué el informe de salud no basta ─────────────────
 *
 * `GET /api/health/integrations` dice `mode` y `recipients`, y eso es lo
 * correcto para un informe que lee cualquier ADMIN: enumerar la lista lo
 * convertiría en un directorio de direcciones. Pero el estado y el recuento
 * **no distinguen** una errata que produzca otra dirección válida. Medido
 * contra el contenedor real con una lista de una sola entrada y una letra
 * cambiada:
 *
 *   informe de salud → mode=allowlisted recipients=1   ← idéntico al caso bueno
 *   esta comprobación → NO SALE (not-allowlisted)       ← lo detecta
 *
 * Así que antes de que alguien se registre hay que acreditar la **pertenencia
 * de la dirección exacta**, y en **los dos procesos** que mandan correo: la
 * API (verificación de cuenta, restablecimiento, cambio de dirección,
 * exportación, avisos de autoría) y el worker (el digest semanal, que lo
 * dispara un cron).
 *
 * ── Qué garantiza, y qué no ───────────────────────────────────────────────
 *
 * Pregunta a la guarda **real** del contenedor —`mailGate` y
 * `parseMailAllowlist` compilados, los mismos que deciden el envío— y resuelve
 * el entorno con `resolveEnvironment()`, el mismo criterio que `ResendService`.
 * Así no puede discrepar con el servicio.
 *
 * Son **tres afirmaciones distintas** y esto contesta sólo la primera:
 *
 *   1. «la guarda permitiría esta dirección»  → lo dice este guion
 *   2. «el proveedor funciona»                → lo dice la cuenta de Resend
 *   3. «el mensaje llegó»                     → lo dice una recepción real
 *
 * Un `SÍ SALE` no es una entrega. No envía nada: ni abre una conexión, ni
 * encola, ni toca el SDK.
 *
 * ── Privacidad ────────────────────────────────────────────────────────────
 *
 * La dirección entra por **stdin**, no por argumento, para que no quede en el
 * historial del shell ni la vea un `ps`. La salida es un veredicto: no imprime
 * la dirección, ni el valor de la lista, ni sus entradas.
 *
 * ── Uso ───────────────────────────────────────────────────────────────────
 *
 *   printf '%s' "$DIRECCION" | docker exec -i <contenedor> sh -lc \
 *     'cd /app/apps/api && /mise/installs/node/20/bin/node scripts/check-mail-recipient.cjs'
 *
 * Código de salida: 0 saldría · 1 no saldría · 2 no se pudo preguntar.
 */

const path = require("node:path");

const GUARDA =
  process.env.MAIL_GATE_PATH ??
  path.join(__dirname, "..", "dist", "notifications", "mail-gate.js");

/**
 * El mismo módulo del que el servicio de correo saca su entorno.
 *
 * Leer `PSICO_ENV` a pelo —que es lo que hacía la primera versión— no es
 * equivalente: `resolveEnvironment()` recorta y pasa a minúsculas, y en una
 * caja desplegada **rechaza** cualquier palabra que no sea `production` o
 * `staging`. Con `PSICO_ENV=" Production "` el servicio decide sobre
 * `"production"` y este guion habría decidido sobre `" Production "`, que no
 * es producción para `mailGate`: con la lista ausente, uno abre y el otro
 * dice que no sale. La diferencia aparece justo en el entorno donde la guarda
 * abre, que es donde una respuesta equivocada cuesta más.
 */
const RESOLUTOR =
  process.env.PSICO_ENVIRONMENT_PATH ??
  path.join(__dirname, "..", "dist", "shared", "psico-environment.js");

function cargar(ruta, queEs) {
  try {
    return require(ruta);
  } catch (err) {
    console.log(`NO SE PUDO PREGUNTAR — no se encontró ${queEs} en ${ruta}`);
    console.log(`  (${err && err.message ? err.message : err})`);
    process.exit(2);
  }
}

const guarda = cargar(GUARDA, "la guarda compilada");
const entornoMod = cargar(RESOLUTOR, "el resolutor de entorno compilado");

const { mailGate, parseMailAllowlist } = guarda;
if (
  typeof mailGate !== "function" ||
  typeof parseMailAllowlist !== "function"
) {
  console.log(
    "NO SE PUDO PREGUNTAR — la guarda compilada no exporta mailGate/parseMailAllowlist",
  );
  process.exit(2);
}

const { resolveEnvironment } = entornoMod;
if (typeof resolveEnvironment !== "function") {
  console.log(
    "NO SE PUDO PREGUNTAR — el módulo de entorno no exporta resolveEnvironment",
  );
  process.exit(2);
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (trozo) => {
  entrada += trozo;
});
process.stdin.on("end", () => {
  const direccion = entrada.trim();
  if (!direccion) {
    console.log("NO SE PUDO PREGUNTAR — no llegó ninguna dirección por stdin");
    process.exit(2);
  }

  // El mismo criterio que el servicio, no una lectura paralela de la variable.
  // Si la caja está desplegada y no declara su postura, esto lanza — y lanzar
  // es la respuesta correcta: significa que el servicio tampoco arrancaría.
  let entorno;
  try {
    entorno = resolveEnvironment();
  } catch (err) {
    console.log(
      "NO SE PUDO PREGUNTAR — el entorno no se pudo resolver con el mismo criterio que el servicio",
    );
    console.log(`  (${err && err.message ? err.message : err})`);
    process.exit(2);
  }

  const lista = parseMailAllowlist(process.env.EMAIL_ALLOWLIST);
  const veredicto = mailGate(direccion, lista, entorno);

  console.log(
    [
      `estado=${lista.state}`,
      `entradas=${lista.entries.length}`,
      `entorno=${entorno}`,
      `→ ${veredicto.send ? "SÍ SALE" : "NO SALE"} (${veredicto.reason})`,
    ].join(" "),
  );
  process.exit(veredicto.send ? 0 : 1);
});
