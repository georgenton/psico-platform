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
 * `parseMailAllowlist` compilados, los mismos que decide el envío—, así que no
 * puede discrepar con ella. Lo que NO acredita: que el proveedor acepte el
 * dominio, ni que el mensaje llegue. Eso sólo lo demuestra una recepción.
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

let guarda;
try {
  guarda = require(GUARDA);
} catch (err) {
  console.log(
    `NO SE PUDO PREGUNTAR — no se encontró la guarda compilada en ${GUARDA}`,
  );
  console.log(`  (${err && err.message ? err.message : err})`);
  process.exit(2);
}

const { mailGate, parseMailAllowlist } = guarda;
if (typeof mailGate !== "function" || typeof parseMailAllowlist !== "function") {
  console.log(
    "NO SE PUDO PREGUNTAR — la guarda compilada no exporta mailGate/parseMailAllowlist",
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

  const entorno = process.env.PSICO_ENV;
  if (!entorno) {
    console.log("NO SE PUDO PREGUNTAR — PSICO_ENV no está definida");
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
