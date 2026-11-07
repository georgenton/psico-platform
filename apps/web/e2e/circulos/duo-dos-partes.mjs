#!/usr/bin/env node
/**
 * El Dúo, recorrido por DOS partes contra el entorno alojado.
 *
 * ── Qué es, y qué no ──────────────────────────────────────────────────────
 *
 * `production-ready.mjs` comprueba que Círculos está abierto y rechaza lo que
 * debe, sin crear nada; `duo.walk.mjs` recorre diez escenarios y para eso
 * registra una cuenta por escenario, reescribe la lista de admitidos y espera
 * un redespliegue. Este guion es el hueco entre los dos: **un** recorrido
 * completo con **dos** partes, sin tocar la configuración del entorno ni
 * registrar un grupo de cuentas.
 *
 * Eso importa porque la lista de admitidos de este entorno tiene una sola
 * identidad QA a propósito. Un recorrido que la reescribiera dejaría el entorno
 * distinto de como lo encontró, y habría que acordarse de devolverlo.
 *
 * ── Por qué cada parte entra por su propia puerta ─────────────────────────
 *
 * El organizador habla con la API con su credencial. La contraparte **no tiene
 * cuenta**: entra por una invitación, como invitada, y sus rutas son
 * `bff-only` — exigen una atestación que sólo la Web sabe firmar. Así que su
 * mitad va por las rutas de la Web (`/api/circulos/*`), que es por donde entra
 * una persona de verdad.
 *
 * No se reimplementa la atestación ni se lee su secreto. Si los dos secretos
 * discreparan, este recorrido fallaría en la inspección — que es justo lo que
 * debería hacer.
 *
 * ── El invariante que de verdad se comprueba ──────────────────────────────
 *
 * Que cada parte ve SÓLO lo que le toca, y en particular que **nadie ve lo del
 * otro antes de que los dos hayan confirmado**. Eso se mide en la ventana
 * intermedia: con uno confirmado y el otro no, se lee por los dos lados y se
 * exige que el contenido ajeno no esté. Un recorrido que sólo comprobara el
 * final no distinguiría «se revela al confirmar los dos» de «se revela
 * siempre».
 *
 * Uso:
 *   node apps/web/e2e/circulos/duo-dos-partes.mjs \
 *     --api https://… --web https://… --email … --password …
 *
 * La contraseña se puede pasar por `CIRCULOS_QA_PASSWORD` para no dejarla en
 * la tabla de procesos, que es lo que hace el envoltorio de ops.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const arg = (flag, fallback = null) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const API = (arg("--api") ?? "").replace(/\/+$/, "");
const WEB = (arg("--web") ?? "").replace(/\/+$/, "");
const EMAIL = arg("--email") ?? process.env.CIRCULOS_QA_EMAIL ?? "";
const PASSWORD = arg("--password") ?? process.env.CIRCULOS_QA_PASSWORD ?? "";
const TEMPLATE = arg("--template", "duo-lo-que-me-ayuda");
const VERSION = Number(arg("--template-version", "2"));

if (!API || !WEB || !EMAIL || !PASSWORD) {
  console.error(
    "uso: duo-dos-partes.mjs --api <url> --web <url> --email <qa> --password <qa>\n" +
      "     (o CIRCULOS_QA_EMAIL / CIRCULOS_QA_PASSWORD en el entorno)",
  );
  process.exit(2);
}

let failures = 0;
const steps = [];
/**
 * Comprobaciones que no se pudieron ejecutar: ni acierto ni fallo.
 *
 * Con una sola, el parte final NO dice ✔, porque lo que no se midió no se
 * sabe. Importa sobre todo aquí: la comprobación central de este recorrido es
 * un límite de privacidad, y una ausencia sin lectura válida detrás se
 * aprobaría sola.
 */
const skipped = [];
function check(ok, what, detail = "") {
  steps.push({ ok: !!ok, what });
  if (!ok) failures += 1;
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? `  (${detail})` : ""}`);
}
function skip(what, why) {
  skipped.push({ what, why });
  console.log(`   ⊘ ${what}  — NO EJECUTADA: ${why}`);
}
function section(title) {
  console.log(`\n▸ ${title}`);
}
async function body(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}
const idem = () => randomUUID();

/** 256 bits, base64url, 43 caracteres: la forma que exige el DTO. */
const invitationSecret = () => randomBytes(32).toString("base64url");

// ── el organizador, por la API, con su credencial ───────────────────────────

async function apiCall(method, path, token, payload, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (payload !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { res, data: await body(res) };
}

// ── la contraparte, por la Web, como invitada ───────────────────────────────
//
// La cookie se lleva a mano en vez de con un navegador: es la misma cookie que
// pondría un navegador, y así el recorrido no depende de uno. El `Origin` no es
// decorativo — la Web tiene su propia guarda de mismo origen y sin él responde
// 403, que se parece demasiado al fallo que este recorrido busca.

let guestCookie = null;

/**
 * Dónde se guarda la cookie de la invitada, si se pide.
 *
 * El seguimiento de una actividad se abre POR RELOJ: hace falta un barrido con
 * su instante fijado entre la primera pasada y la segunda. Eso obliga a dos
 * procesos, y sin persistir la cookie la segunda no puede actuar como ella —
 * su invitación ya está consumida y no se puede volver a aceptar.
 *
 * Va a un fichero con permisos 600 y NO se imprime: es un token de sesión, y
 * un recorrido que lo vuelque en su salida lo deja en cualquier registro que
 * recoja esa salida.
 */
const SESSION_FILE = arg("--sesion-archivo");

async function webCall(method, path, payload) {
  const headers = { origin: new URL(WEB).origin };
  if (payload !== undefined) headers["content-type"] = "application/json";
  if (guestCookie) headers.cookie = guestCookie;
  const res = await fetch(`${WEB}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    if (pair && pair.includes("=") && !pair.endsWith("=")) {
      guestCookie = pair;
      if (SESSION_FILE) writeFileSync(SESSION_FILE, pair, { mode: 0o600 });
    }
  }
  return { res, data: await body(res) };
}

function mentions(value, needle) {
  return JSON.stringify(value ?? {})
    .toLowerCase()
    .includes(needle.toLowerCase());
}

/**
 * Una ausencia sólo demuestra algo si la lectura fue real y el estado es el
 * esperado.
 *
 * ── Por qué hace falta esto ────────────────────────────────────────────────
 *
 * `!mentions(respuesta, LO_DEL_OTRO)` pasa sola en los peores casos: un 401
 * por cookie caducada, un 404 por id mal armado y un 500 traen cuerpos que
 * tampoco contienen lo del otro. Es decir, la comprobación más importante de
 * este recorrido —el límite de privacidad— era la que más fácil se aprobaba
 * sin medir nada.
 *
 * Así que la ausencia se afirma sólo cuando:
 *   1. la respuesta fue 200 (hubo lectura, no error),
 *   2. el estado es el esperado (la vista es la de esta etapa), y
 *   3. **lo del otro ya existe** en ese instante.
 *
 * El tercero es el que convierte la prueba en prueba: sin él, «no lo veo»
 * podría ser «todavía nadie lo había escrito», que es una carrera, no una
 * barrera.
 */
function absenceIsMeaningful(label, read, expectations) {
  if (read.res.status !== 200) {
    return {
      ok: false,
      why: `la lectura respondió ${read.res.status} ${read.data?.code ?? ""}, no 200`,
    };
  }
  for (const [what, actual, expected] of expectations) {
    if (actual !== expected) {
      return {
        ok: false,
        why: `${what} es ${JSON.stringify(actual)}, se esperaba ${JSON.stringify(expected)}`,
      };
    }
  }
  return { ok: true, why: label };
}

// ────────────────────────────────────────────────────────────────────────────

console.log(`▸ API ${API}`);
console.log(`▸ Web ${WEB}`);

const ORG_SUMMARY = `QA-ORG-${randomBytes(4).toString("hex")}`;
const GUEST_SUMMARY = `QA-INV-${randomBytes(4).toString("hex")}`;
let activityId = null;
let circleId = null;

try {
  // ── 1 · el organizador entra y crea ──────────────────────────────────────
  section("el organizador");
  const login = await apiCall("POST", "/api/auth/login", null, {
    email: EMAIL,
    password: PASSWORD,
  });
  const token = login.data?.accessToken;
  check(
    !!token,
    "entra con su contraseña",
    login.res.status === 429
      ? "429 — /api/auth/login admite 5 por cuarto de hora y por IP"
      : `${login.res.status}`,
  );
  if (!token) throw new Error("sin credencial no hay recorrido");
  // Se guarda para la segunda pasada del seguimiento, que si no gastaría otro
  // intento del mismo cupo.
  const TOKEN_FILE = arg("--token-archivo");
  if (TOKEN_FILE) writeFileSync(TOKEN_FILE, token, { mode: 0o600 });

  const access = await apiCall("GET", "/api/circles/access", token);
  check(
    access.data?.available === true,
    "está admitido (la lista de piloto lo incluye)",
    JSON.stringify(access.data),
  );

  const secret = invitationSecret();
  const created = await apiCall(
    "POST",
    "/api/circles/duo",
    token,
    {
      templateKey: TEMPLATE,
      templateVersion: VERSION,
      invitationTokens: [secret],
    },
    { "idempotency-key": idem() },
  );
  activityId = created.data?.activityId ?? null;
  circleId = created.data?.circleId ?? null;
  check(
    created.res.status === 201 && !!activityId,
    "crea el Dúo y recibe su actividad",
    `${created.res.status}`,
  );
  if (!activityId) throw new Error("sin actividad no hay recorrido");

  const first = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  check(
    first.data?.status === "INVITING",
    "la actividad nace invitando",
    first.data?.status,
  );
  check(
    first.data?.counterpart?.status === "INVITED",
    "y la contraparte figura invitada",
    first.data?.counterpart?.status,
  );
  check(
    first.data?.readyCount === 0,
    "nadie ha confirmado todavía",
    `${first.data?.readyCount}`,
  );

  // ── 2 · la contraparte abre la invitación y acepta por sí misma ──────────
  section("la contraparte, por su propia puerta");
  const inspect = await webCall("POST", "/api/circulos/inspeccion", { secret });
  check(
    inspect.res.status === 200,
    "inspecciona la invitación a través de la Web",
    `${inspect.res.status} ${inspect.data?.code ?? ""}`,
  );
  check(
    mentions(inspect.data, "me ayuda"),
    "y ve de qué actividad se trata, por su título aprobado",
  );
  check(
    !mentions(inspect.data, ORG_SUMMARY),
    "sin ver nada de lo que el organizador vaya a escribir",
  );

  const accept = await webCall("POST", "/api/circulos/sesion", {
    secret,
    alias: "QA Contraparte",
  });
  check(
    accept.res.status === 201,
    "ACEPTA ella misma, y recibe su sesión de invitada",
    `${accept.res.status} ${accept.data?.code ?? ""}`,
  );
  check(
    !!guestCookie,
    "con su propia cookie, distinta de la credencial del organizador",
  );

  const guestFirst = await webCall(
    "GET",
    `/api/circulos/actividad/${activityId}`,
  );
  check(
    guestFirst.res.status === 200,
    "y puede leer la actividad como invitada",
    `${guestFirst.res.status}`,
  );

  const orgAfterAccept = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  check(
    orgAfterAccept.data?.counterpart?.status === "ACCEPTED",
    "el organizador ve que la contraparte aceptó",
    orgAfterAccept.data?.counterpart?.status,
  );

  // ── 3 · la ventana intermedia: uno confirmó, el otro no ──────────────────
  section("la ventana intermedia — aquí se mide la privacidad");
  const orgShare = await apiCall(
    "POST",
    `/api/circles/activities/${activityId}/share-confirmations`,
    token,
    { mode: "EDITED_SUMMARY", summary: ORG_SUMMARY },
    { "idempotency-key": idem() },
  );
  check(
    orgShare.res.status === 201,
    "el organizador confirma lo que comparte",
    `${orgShare.res.status}`,
  );

  // Primero, que lo del organizador EXISTE ya: su propia confirmación se lee de
  // vuelta antes del revelado, así que esto no es un detalle de implementación,
  // es la prueba de que hay algo que la barrera está conteniendo.
  const orgMid = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  const orgReadable = absenceIsMeaningful("vista del organizador", orgMid, [
    ["you.status", orgMid.data?.you?.status, "READY"],
    ["revealed", orgMid.data?.revealed, null],
  ]);
  check(
    orgReadable.ok && mentions(orgMid.data?.you?.confirmed, ORG_SUMMARY),
    "el organizador se lee a SÍ MISMO ya confirmado — hay algo que contener",
    orgReadable.ok ? "" : orgReadable.why,
  );

  // Y ahora sí: la invitada lee de verdad, su vista es la de esta etapa, y en
  // ella no está lo del otro.
  const guestMid = await webCall(
    "GET",
    `/api/circulos/actividad/${activityId}`,
  );
  const guestReadable = absenceIsMeaningful("vista de la invitada", guestMid, [
    ["you.status", guestMid.data?.you?.status, "ACCEPTED"],
    ["revealed", guestMid.data?.revealed, null],
    ["readyCount", guestMid.data?.readyCount, 1],
  ]);
  check(
    guestReadable.ok,
    "la invitada LEE su actividad, y su vista es la de esta etapa (1 de 2 confirmados)",
    guestReadable.ok ? "" : guestReadable.why,
  );
  if (guestReadable.ok) {
    check(
      !mentions(guestMid.data, ORG_SUMMARY),
      "y NO ve lo del organizador, que en ese instante YA existe",
    );
  } else {
    // Sin lectura válida la ausencia no dice nada, y presentarla como ✓ sería
    // afirmar justo lo que no se midió.
    skip(
      "la invitada no ve lo del organizador antes de confirmar lo suyo",
      `no hubo lectura válida sobre la que medirlo — ${guestReadable.why}`,
    );
  }

  // La simétrica NO se puede medir, y conviene decirlo en vez de contarla.
  // En un Dúo la segunda confirmación revela en el mismo acto, así que no
  // existe ninguna ventana en la que ella haya confirmado y él no: lo de ella
  // todavía no se ha escrito, y «no veo lo que no existe» no es privacidad.
  check(
    guestMid.data?.you?.confirmed == null,
    "lo de la invitada aún no existe — la simétrica no es medible en un Dúo, y no se cuenta como tal",
  );
  check(
    orgMid.data?.revealed === null && orgMid.data?.revealedAt === null,
    "nada está revelado con una sola confirmación",
    `revealed=${JSON.stringify(orgMid.data?.revealed)} revealedAt=${orgMid.data?.revealedAt}`,
  );

  // ── 4 · la segunda confirmación abre el intercambio ──────────────────────
  section("el intercambio");
  // El envoltorio de la Web es CERRADO y la carga va en `payload`. Mi primera
  // versión mandaba `confirmation`, y la ruta respondió 400
  // CIRCLE_INVALID_PAYLOAD sin reenviar nada — que es exactamente lo que debe
  // hacer con una clave que no espera.
  const guestShare = await webCall(
    "POST",
    `/api/circulos/actividad/${activityId}/comando`,
    {
      kind: "share",
      idempotencyKey: idem(),
      payload: { mode: "EDITED_SUMMARY", summary: GUEST_SUMMARY },
    },
  );
  check(
    guestShare.res.status === 200 || guestShare.res.status === 201,
    "la invitada confirma lo suyo, por la Web",
    `${guestShare.res.status} ${guestShare.data?.code ?? ""}`,
  );

  const orgAfter = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  const guestAfter = await webCall(
    "GET",
    `/api/circulos/actividad/${activityId}`,
  );
  check(
    mentions(orgAfter.data, GUEST_SUMMARY),
    "ahora el organizador SÍ ve lo de ella",
  );
  check(mentions(guestAfter.data, ORG_SUMMARY), "y ella ve lo del organizador");
  check(
    orgAfter.data?.readyCount === 2,
    "los dos cuentan como confirmados",
    `${orgAfter.data?.readyCount}`,
  );

  // ── 5 · el cierre y el seguimiento ───────────────────────────────────────
  section("el cierre");
  // El acuerdo se PROPONE con PUT —`artifact` es la única ruta PUT del módulo—
  // y después se confirma nombrando su id Y su versión: quien tenga una copia
  // vieja no puede aceptar un texto que no vio.
  const AGREEMENT = `QA-ACUERDO-${randomBytes(3).toString("hex")}`;
  const propose = await apiCall(
    "PUT",
    `/api/circles/activities/${activityId}/artifact`,
    token,
    { body: AGREEMENT },
    { "idempotency-key": idem() },
  );
  check(
    propose.res.status === 200 || propose.res.status === 201,
    "el organizador propone el acuerdo",
    `${propose.res.status} ${propose.data?.code ?? ""}`,
  );

  const withArtifact = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  const art = withArtifact.data?.artifact ?? null;
  check(
    !!art?.artifactId,
    "y queda visible con su id y su versión",
    JSON.stringify(art ?? {}).slice(0, 90),
  );

  const guestSeesArtifact = await webCall(
    "GET",
    `/api/circulos/actividad/${activityId}`,
  );
  check(
    mentions(guestSeesArtifact.data, AGREEMENT),
    "la invitada ve el acuerdo propuesto",
  );

  if (art?.artifactId) {
    const confirmOrg = await apiCall(
      "POST",
      `/api/circles/activities/${activityId}/artifact/confirm`,
      token,
      { artifactId: art.artifactId, version: art.version },
      { "idempotency-key": idem() },
    );
    check(
      confirmOrg.res.status === 200 || confirmOrg.res.status === 201,
      "el organizador lo confirma",
      `${confirmOrg.res.status} ${confirmOrg.data?.code ?? ""}`,
    );
    const confirmGuest = await webCall(
      "POST",
      `/api/circulos/actividad/${activityId}/comando`,
      {
        kind: "artifact-confirm",
        idempotencyKey: idem(),
        payload: { artifactId: art.artifactId, version: art.version },
      },
    );
    check(
      confirmGuest.res.status === 200 || confirmGuest.res.status === 201,
      "y la invitada también, por la Web",
      `${confirmGuest.res.status} ${confirmGuest.data?.code ?? ""}`,
    );
  }

  // El seguimiento NO se puede decidir todavía, y eso es correcto.
  //
  // `recordFollowUp` exige `status === "FOLLOW_UP"`
  // (`circles-participation.service.ts`), y a ese estado se llega **por
  // reloj**: el barrido del worker abre el seguimiento cuando llega su fecha.
  // Hoy la actividad está en `REVEALED` con su seguimiento PROGRAMADO para
  // dentro de una semana, así que la decisión responde 404 y hace bien.
  //
  // Mi primera versión afirmaba lo contrario y lo contaba como fallo del
  // producto. Era la afirmación la que estaba mal: un seguimiento programado no
  // es un seguimiento ejecutado, y pedirle su decisión antes de que se abra es
  // pedirle algo que no existe.
  const followUp = await apiCall(
    "POST",
    `/api/circles/activities/${activityId}/follow-up`,
    token,
    { decision: "KEEP" },
    { "idempotency-key": idem() },
  );
  check(
    followUp.res.status === 404 &&
      followUp.data?.code === "CIRCLE_ACTIVITY_UNAVAILABLE",
    "el seguimiento aún no se puede decidir — se abre por reloj, no a petición",
    `${followUp.res.status} ${followUp.data?.code ?? ""}`,
  );
  const closed = await apiCall(
    "GET",
    `/api/circles/activities/${activityId}`,
    token,
  );
  console.log(
    `     (estado: ${closed.data?.status} · seguimiento PROGRAMADO para ${closed.data?.followUpDueAt ?? "ninguno"} — programado, no ejecutado)`,
  );

  // ── 6 · la retirada ──────────────────────────────────────────────────────
  //
  // `--sin-retirada` deja la actividad REVELADA a propósito, para poder abrir
  // su seguimiento con el barrido y ejercer la decisión. Sin eso, el
  // seguimiento sólo se puede describir, no comprobar.
  if (process.argv.includes("--sin-retirada")) {
    section("la retirada");
    console.log("   · omitida a petición: la actividad queda REVELADA");
    console.log(
      `   · para abrir su seguimiento: barrido con nowIso > ${closed.data?.followUpDueAt}`,
    );
  } else {
    section("la retirada");
    const withdraw = await apiCall(
      "POST",
      `/api/circles/activities/${activityId}/withdraw`,
      token,
      {},
      { "idempotency-key": idem() },
    );
    check(
      withdraw.res.status === 200,
      "el organizador se retira",
      `${withdraw.res.status} ${JSON.stringify(withdraw.data)}`,
    );
    // CANCELLED o CLOSED, según dónde estuviera: el propio tipo de retorno dice
    // `"CANCELLED" | "CLOSED"`. Retirarse de un intercambio que ya ocurrió lo
    // CIERRA; retirarse de uno que nadie abrió lo CANCELA. Ayer, retirándome de
    // una actividad en `INVITING`, salió CANCELLED; hoy, de una revelada y
    // confirmada, sale CLOSED — y es la respuesta más cuidadosa de las dos.
    const final = await apiCall(
      "GET",
      `/api/circles/activities/${activityId}`,
      token,
    );
    check(
      final.data?.status === "CLOSED" || final.data?.status === "CANCELLED",
      "y la actividad termina cerrada o cancelada, según dónde estuviera",
      final.data?.status,
    );
    check(
      withdraw.data?.outcome === final.data?.status,
      "con el desenlace que la propia retirada anunció",
      `${withdraw.data?.outcome} = ${final.data?.status}`,
    );

    // La invitada sigue pudiendo leerla, y conviene decir por qué NO es una
    // fuga: el contenido ya le había sido revelado con su propia confirmación.
    // Quitarle el acceso ahora borraría algo que vio legítimamente.
    const guestAfterWithdraw = await webCall(
      "GET",
      `/api/circulos/actividad/${activityId}`,
    );
    check(
      guestAfterWithdraw.res.status === 200,
      "y la invitada conserva lo que ya se le había revelado",
      `${guestAfterWithdraw.res.status}`,
    );
    await webCall("DELETE", "/api/circulos/sesion");
  }
} catch (err) {
  console.log(`\n✗ el recorrido se detuvo: ${err.message}`);
  failures += 1;
}

const ok = steps.filter((s) => s.ok).length;
if (failures === 0 && skipped.length === 0) {
  console.log(`\n✔ ${ok}/${steps.length} comprobaciones`);
} else if (failures > 0) {
  console.log(
    `\n✗ ${ok}/${steps.length} comprobaciones · ${failures} fallo(s)` +
      (skipped.length ? ` · ${skipped.length} sin ejecutar` : ""),
  );
} else {
  console.log(
    `\n⊘ INCOMPLETO — ${ok}/${steps.length} pasaron, y ${skipped.length} no se ejecutaron:`,
  );
  for (const sk of skipped) console.log(`   · ${sk.what} — ${sk.why}`);
}
console.log(`\ndatos creados por esta ejecución (quedan como cancelados):`);
console.log(`  circleId   ${circleId ?? "—"}`);
console.log(`  activityId ${activityId ?? "—"}`);
process.exit(failures === 0 && skipped.length === 0 ? 0 : 1);
