#!/usr/bin/env node
/**
 * La segunda mitad: el seguimiento, por las DOS partes, y el cierre.
 *
 * ── Por qué es un guion aparte y no el final del otro ─────────────────────
 *
 * El seguimiento de una actividad **se abre por reloj**, no a petición:
 * `recordFollowUp` exige `status === "FOLLOW_UP"`, y a ese estado se llega
 * cuando el barrido del worker alcanza la fecha programada. Pedir la decisión
 * antes responde `404 CIRCLE_ACTIVITY_UNAVAILABLE` — y hace bien.
 *
 * Entre una mitad y la otra hay que encolar una pasada del barrido con su
 * instante fijado (`nowIso`, la válvula que el propio payload declara). Eso
 * ocurre en el servidor, no aquí, así que el recorrido son dos procesos por
 * necesidad y no por comodidad.
 *
 * La invitada no puede volver a aceptar: su invitación está consumida. Por eso
 * `duo-dos-partes.mjs --sesion-archivo` guarda su cookie, y esto la lee.
 *
 * Uso:
 *   node apps/web/e2e/circulos/duo-seguimiento.mjs \
 *     --api … --web … --actividad <id> --sesion-archivo <path>
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (flag, fallback = null) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const API = (arg("--api") ?? "").replace(/\/+$/, "");
const WEB = (arg("--web") ?? "").replace(/\/+$/, "");
const ACT = arg("--actividad") ?? "";
const SESSION_FILE = arg("--sesion-archivo") ?? "";
const EMAIL = process.env.CIRCULOS_QA_EMAIL ?? "";
const PASSWORD = process.env.CIRCULOS_QA_PASSWORD ?? "";

/**
 * Un token ya emitido, en vez de una contraseña.
 *
 * `/api/auth/login` admite **5 intentos por cuarto de hora y por IP**, y este
 * recorrido son dos procesos con un barrido en medio: es fácil llegar a la
 * segunda pasada con el cupo gastado y leer un `429` como si el recorrido
 * hubiera fallado. Reutilizar el token de la primera pasada evita gastar un
 * intento en algo que ya está resuelto.
 */
const TOKEN_FILE = arg("--token-archivo");

if (!API || !WEB || !ACT || !SESSION_FILE || (!TOKEN_FILE && (!EMAIL || !PASSWORD))) {
  console.error(
    "uso: duo-seguimiento.mjs --api <url> --web <url> --actividad <id> --sesion-archivo <path>\n" +
      "     (CIRCULOS_QA_EMAIL y CIRCULOS_QA_PASSWORD en el entorno)",
  );
  process.exit(2);
}

let failures = 0;
let passed = 0;
function check(ok, what, detail = "") {
  if (ok) passed += 1;
  else failures += 1;
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? `  (${detail})` : ""}`);
}
async function body(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 160) };
  }
}
const idem = () => randomUUID();
const guestCookie = readFileSync(SESSION_FILE, "utf8").trim();

async function apiCall(method, path, token, payload, extra = {}) {
  const headers = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (payload !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { res, data: await body(res) };
}
async function webCall(method, path, payload) {
  const headers = { origin: new URL(WEB).origin, cookie: guestCookie };
  if (payload !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${WEB}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: "manual",
  });
  return { res, data: await body(res) };
}

console.log(`▸ API ${API}\n▸ Web ${WEB}\n▸ actividad ${ACT}`);

try {
  let token = null;
  if (TOKEN_FILE) {
    token = readFileSync(TOKEN_FILE, "utf8").trim();
    check(!!token, "el organizador reutiliza su credencial de la primera pasada");
  } else {
    const login = await apiCall("POST", "/api/auth/login", null, {
      email: EMAIL,
      password: PASSWORD,
    });
    token = login.data?.accessToken ?? null;
    check(
      !!token,
      "el organizador entra",
      login.res.status === 429
        ? "429 — cupo de accesos agotado; usa --token-archivo"
        : `${login.res.status}`,
    );
  }
  if (!token) throw new Error("sin credencial");

  console.log("\n▸ el seguimiento, abierto por el barrido");
  const before = await apiCall("GET", `/api/circles/activities/${ACT}`, token);
  check(
    before.data?.status === "FOLLOW_UP",
    "la actividad está en seguimiento",
    before.data?.status,
  );

  // El organizador puede haberla registrado ya en una pasada anterior; lo que
  // importa es que quede registrada, no que sea la primera vez.
  const orgDecision = (before.data?.you ?? {}).followUpDecision;
  if (!orgDecision) {
    const org = await apiCall(
      "POST",
      `/api/circles/activities/${ACT}/follow-up`,
      token,
      { decision: "KEEP" },
      { "idempotency-key": idem() },
    );
    check(org.res.status === 200, "el organizador decide", `${org.res.status}`);
  } else {
    check(true, "el organizador ya había decidido", orgDecision);
  }

  const mid = await apiCall("GET", `/api/circles/activities/${ACT}`, token);
  check(
    (mid.data?.counterpart ?? {}).followUpDecision == null,
    "y la contraparte todavía no — una decisión no cierra el seguimiento",
  );

  console.log("\n▸ la invitada, por su propia puerta");
  const guest = await webCall("POST", `/api/circulos/actividad/${ACT}/comando`, {
    kind: "follow-up",
    idempotencyKey: idem(),
    payload: { decision: "KEEP" },
  });
  check(
    guest.res.status === 200 || guest.res.status === 201,
    "decide ella misma, por la Web",
    `${guest.res.status} ${guest.data?.code ?? ""}`,
  );

  // La SEGUNDA decisión cierra la actividad. No es un efecto colateral: el
  // servicio lo hace explícito —`if (decided >= participatingSize(current))`,
  // y entonces cierra y añade un evento `ACTIVITY_CLOSED`—. El seguimiento es
  // el último compás, así que completarlo termina la actividad.
  check(
    guest.data?.closed === true,
    "y con la segunda decisión el seguimiento se cierra",
    `closed=${guest.data?.closed}`,
  );

  const after = await apiCall("GET", `/api/circles/activities/${ACT}`, token);
  check(
    after.data?.status === "CLOSED",
    "la actividad queda cerrada",
    after.data?.status,
  );

  console.log("\n▸ lo que ya no se puede hacer, y hace bien");
  // Retirarse de algo cerrado no es una retirada: no queda nada de lo que
  // salir. Mi primera versión esperaba un 200 aquí y contaba el 404 como fallo
  // del producto; era la expectativa la que estaba mal.
  const withdraw = await apiCall(
    "POST",
    `/api/circles/activities/${ACT}/withdraw`,
    token,
    {},
    { "idempotency-key": idem() },
  );
  check(
    withdraw.res.status === 404,
    "no se puede retirar de una actividad ya cerrada",
    `${withdraw.res.status} ${withdraw.data?.code ?? ""}`,
  );
  await webCall("DELETE", "/api/circulos/sesion");
} catch (err) {
  console.log(`\n✗ se detuvo: ${err.message}`);
  failures += 1;
}

console.log(
  `\n${failures === 0 ? "✔" : "✗"} ${passed}/${passed + failures} comprobaciones`,
);
process.exit(failures === 0 ? 0 : 1);
