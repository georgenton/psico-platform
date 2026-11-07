#!/usr/bin/env node
/**
 * Las cinco microguías de EEC-C01, recorridas de verdad.
 *
 * ── Qué problema resuelve este guion ──────────────────────────────────────
 *
 * «El catálogo devuelve cinco títulos» no es un recorrido. Lo que hay que
 * saber es si una persona puede **descubrirlas, empezarlas, interactuar,
 * terminarlas y volver** — y eso sólo lo contesta ejercerlas una por una.
 *
 * ── El control negativo, que es la mitad del valor ────────────────────────
 *
 * El modo piloto admite exactamente a quien esté en la lista. Un recorrido que
 * sólo comprobara al admitido no distinguiría «la lista funciona» de «está
 * abierto para todos», que es justo la diferencia que importa cuando la
 * decisión editorial de encender esto está en HOLD. Así que entra una segunda
 * cuenta que NO está en la lista y se exige que no vea nada.
 *
 * Uso:
 *   node apps/web/e2e/guide/c01-cinco-microguias.mjs --api https://…
 *   (CIRCULOS_QA_EMAIL/PASSWORD = la admitida;
 *    QA_FUERA_EMAIL/PASSWORD = la que no debe ver nada)
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (f, d = null) => {
  const i = process.argv.indexOf(f);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const API = (arg("--api") ?? "").replace(/\/+$/, "");
const BOOK = arg("--libro", "emociones-en-construccion");
const CHAPTER = arg("--capitulo", "1");

let failures = 0;
let passed = 0;
const check = (ok, what, detail = "") => {
  ok ? passed++ : failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? `  (${detail})` : ""}`);
};
const body = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 140) };
  }
};
async function call(method, path, token, payload) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (payload !== undefined) headers["content-type"] = "application/json";
  // La clave de intención va en el CUERPO, no en una cabecera — y el cuerpo es
  // CERRADO: `checkBody` nombra las claves exactas que admite, así que una
  // cabecera `idempotency-key` no la ve nadie y una clave extra se rechaza.
  // Mi primera versión la mandó como cabecera y recibió cinco
  // `GUIDE_IDEMPOTENCY_KEY_REQUIRED` seguidos.
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { res, data: await body(res) };
}
async function login(email, password) {
  const { res, data } = await call("POST", "/api/auth/login", null, {
    email,
    password,
  });
  if (res.status === 429) throw new Error("429 — cupo de accesos agotado");
  return data?.accessToken ?? null;
}


/**
 * La respuesta que se envía en el paso de recuerdo de cada microguía.
 *
 * El paso `recordar-*` NO admite `complete`: responde
 * `422 GUIDE_STEP_COMMAND_MISMATCH` —paso correcto, mandato equivocado— porque
 * es un recuerdo objetivo y **lo califica el servidor**. Su cuerpo acepta
 * exactamente `{idempotencyKey, selectedOptionKey}`: ni `itemKey` ni `result`
 * ni la fuente de evaluación, a propósito, para que un cliente no se pueda
 * aprobar solo.
 *
 * Las claves salen de `exercise-ingestion-catalog.ts`. Se escriben aquí porque
 * **elegir una respuesta es una entrada de la prueba**, no un dato derivable:
 * un recorrido que leyera «la correcta» del catálogo estaría comprobando que
 * el servidor coincide consigo mismo.
 */
const RESPUESTA = {
  "eec-c1-teorias-como-lentes": "opcion-preguntas-distintas",
  "eec-c1-rostro-como-pista": "opcion-pista-sin-lectura",
  "eec-c1-alarma-antes-del-relato": "opcion-reconocer-esto-me-asusta",
  "eec-c1-emocion-informa-no-manda": "opcion-informa-no-dicta",
  "eec-c1-construida-no-significa-falsa": "opcion-real-y-no-elegida",
};

console.log(`▸ API ${API}\n▸ ${BOOK} · capítulo ${CHAPTER}`);

try {
  // `/api/auth/login` admite cinco por cuarto de hora y por IP, y este
  // recorrido necesita dos cuentas: reutilizar un token ya emitido deja el cupo
  // para lo que de verdad lo necesita.
  const TOKEN_FILE = arg("--token-archivo");
  const token = TOKEN_FILE
    ? readFileSync(TOKEN_FILE, "utf8").trim()
    : await login(process.env.CIRCULOS_QA_EMAIL, process.env.CIRCULOS_QA_PASSWORD);
  check(!!token, "la cuenta admitida entra");
  if (!token) throw new Error("sin credencial");

  // ── descubrimiento ────────────────────────────────────────────────────────
  console.log("\n▸ descubrimiento");
  const route = await call("GET", `/api/guide/route/${BOOK}/${CHAPTER}`, token);
  // El campo es `guides`. Mi primera versión leyó `items` y contó cero con la
  // ruta respondiendo 200 y cinco guías dentro — un cero que no significaba
  // «no hay», sino «miré donde no estaba».
  const items = route.data?.guides ?? route.data?.items ?? [];
  check(route.res.status === 200, "la ruta guiada responde", `${route.res.status}`);
  check(items.length === 5, "y ofrece las CINCO microguías", `${items.length}`);
  const pinOf = (it) => it.pin ?? { guideKey: it.guideKey, guideVersion: it.guideVersion };
  for (const it of items) {
    const p = pinOf(it);
    console.log(
      `     · ${p.guideKey}@${p.guideVersion} — ${it.title} (${it.estimatedMinutes ?? "?"})`,
    );
  }

  // ── una por una ───────────────────────────────────────────────────────────
  const resultados = [];
  for (const it of items) {
    const { guideKey: key, guideVersion: version } = pinOf(it);
    console.log(`\n▸ ${key}`);

    const started = await call("POST", "/api/guide/sessions", token, {
      idempotencyKey: randomUUID(),
      guideKey: key,
      guideVersion: version,
    });
    // La respuesta es `{created, replayed, session:{…}}`: la sesión va DENTRO.
    // Y no trae una lista de pasos, sino `totalSteps` y `currentStepKey` — se
    // avanza paso a paso, que es como avanza una persona.
    let sesion = started.data?.session ?? null;
    check(
      (started.res.status === 200 || started.res.status === 201) && !!sesion?.sessionId,
      "empieza",
      `${started.res.status} ${started.data?.code ?? ""}`,
    );
    if (!sesion?.sessionId) {
      resultados.push({ key, estado: "no empezó" });
      continue;
    }
    const sessionId = sesion.sessionId;
    const total = sesion.totalSteps ?? 0;
    check(total > 0, "y declara sus pasos", `${total}`);

    // Interacción: completar el paso actual hasta agotarlos. El límite por
    // vueltas no es decoración — si el servidor dejara de avanzar
    // `currentStepKey`, un `while` honesto se quedaría girando para siempre.
    let completados = 0;
    for (let vuelta = 0; vuelta < total + 2 && sesion?.currentStepKey; vuelta += 1) {
      const paso = sesion.currentStepKey;
      // Un paso de recuerdo va por su propia ruta y con su respuesta.
      const esRecuerdo = paso.startsWith("recordar-");
      const c = esRecuerdo
        ? await call(
            "POST",
            `/api/guide/sessions/${sessionId}/steps/${paso}/recall`,
            token,
            {
              idempotencyKey: randomUUID(),
              selectedOptionKey: RESPUESTA[key],
            },
          )
        : await call(
            "POST",
            `/api/guide/sessions/${sessionId}/steps/${paso}/complete`,
            token,
            { idempotencyKey: randomUUID() },
          );
      if (c.res.status !== 200 && c.res.status !== 201) {
        console.log(`     · el paso ${paso} respondió ${c.res.status} ${c.data?.code ?? ""}`);
        break;
      }
      const siguiente = c.data?.session ?? null;
      if (siguiente?.currentStepKey === paso) break; // no avanzó: no insistas
      sesion = siguiente;
      completados += 1;
    }
    check(
      completados === total,
      "se interactúa con todos sus pasos",
      `${completados}/${total}`,
    );

    const finished = await call(
      "POST",
      `/api/guide/sessions/${sessionId}/complete`,
      token,
      { idempotencyKey: randomUUID() },
    );
    const estadoFinal = finished.data?.session?.status ?? "?";
    check(
      (finished.res.status === 200 || finished.res.status === 201) &&
        estadoFinal === "COMPLETED",
      "y termina COMPLETED",
      `${finished.res.status} ${estadoFinal} ${finished.data?.code ?? ""}`,
    );

    // Continuidad: lo terminado se puede volver a consultar, que es lo que
    // permite a alguien volver al capítulo y ver qué ya hizo.
    const again = await call(
      "GET",
      `/api/guide/sessions/state?guideKey=${key}&guideVersion=${version}`,
      token,
    );
    check(
      again.res.status === 200,
      "y queda consultable después",
      `${again.res.status}`,
    );
    resultados.push({
      key,
      estado: estadoFinal === "COMPLETED" ? "recorrida" : "incompleta",
      pasos: `${completados}/${total}`,
    });
  }

  // ── el control negativo ───────────────────────────────────────────────────
  console.log("\n▸ una cuenta FUERA de la lista");
  let fuera = null;
  try {
    fuera = await login(process.env.QA_FUERA_EMAIL, process.env.QA_FUERA_PASSWORD);
    check(!!fuera, "entra en el producto (su cuenta es válida)");
  } catch (e) {
    // El cupo de accesos es de cinco por cuarto de hora y este recorrido ya
    // gastó varios. Se declara en vez de contarlo como fallo del producto.
    console.log(`   · omitido: ${e.message}`);
  }
  if (fuera) {
    const r = await call("GET", `/api/guide/route/${BOOK}/${CHAPTER}`, fuera);
    const n = (r.data?.guides ?? r.data?.items ?? []).length;
    check(
      n === 0 || r.data?.available === false,
      "pero NO ve ninguna microguía",
      `items=${n} available=${r.data?.available}`,
    );
    const s = await call("POST", "/api/guide/sessions", fuera, {
      idempotencyKey: randomUUID(),
      guideKey: pinOf(items[0] ?? {}).guideKey,
      guideVersion: pinOf(items[0] ?? {}).guideVersion,
    });
    check(
      s.res.status === 503 || s.res.status === 403 || s.res.status === 404,
      "y no puede empezar ninguna",
      `${s.res.status} ${s.data?.code ?? ""}`,
    );
  }

  console.log("\n▸ resumen por microguía");
  for (const r of resultados) {
    console.log(`   ${r.estado === "recorrida" ? "✓" : "✗"} ${r.key} — ${r.estado}${r.pasos ? ` · pasos ${r.pasos}` : ""}`);
  }
} catch (err) {
  console.log(`\n✗ se detuvo: ${err.message}`);
  failures += 1;
}

console.log(`\n${failures === 0 ? "✔" : "✗"} ${passed}/${passed + failures} comprobaciones`);
process.exit(failures === 0 ? 0 : 1);
