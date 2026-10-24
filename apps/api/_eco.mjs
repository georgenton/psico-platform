/** §8 · camino normal de Eco con cuenta sintética y presupuesto acotado.
 *  Acotación: max_tokens del servidor = 1024/llamada; mensaje de entrada
 *  mínimo; SIN scope de lectura para no disparar recuperación RAG amplia;
 *  UNA sola llamada. El coste observado se lee de la propia fila. */
import fs from "node:fs";
import { deriveMasterKey, deriveSubKey, ECO_KEY_INFO, encryptString } from "@psico/crypto";
const API = "https://api-staging.feelverse.app";
const env = Object.fromEntries(fs.readFileSync(process.env.HOME + "/.psico-ops/feelverse-staging-qa-visual-20261024.env", "utf8")
  .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
  .map(l => [l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const H = (t) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
const P = (v,m) => console.log(`${v.padEnd(10)} ${m}`);

const s = await (await fetch(`${API}/api/auth/login`, { method:"POST", headers:{ "content-type":"application/json" },
  body: JSON.stringify({ email: env.QA_VISUAL_EMAIL, password: env.QA_VISUAL_PASSWORD_2 }) })).json();
const me = await (await fetch(`${API}/api/user/me`, { headers: H(s.accessToken) })).json();
const salt = me.cryptoSalt ?? me.user?.cryptoSalt ?? s.cryptoSalt;
if (!salt) { console.log("claves de /user/me:", Object.keys(me).join(","), "| login:", Object.keys(s).join(",")); process.exit(1); }
const ecoKey = deriveSubKey(await deriveMasterKey(env.QA_VISUAL_PASSWORD_2, salt), ECO_KEY_INFO);

const hilo = await (await fetch(`${API}/api/eco/threads`, { method:"POST", headers:H(s.accessToken), body:"{}" })).json();
const threadId = hilo.thread?.id ?? hilo.id;
P("hilo", `creado ${String(threadId).slice(0,12)}…`);

const TEXTO = "Hola. ¿Para qué sirves?";          // entrada mínima, contenido sintético
const sobre = encryptString(TEXTO, ecoKey);
const t0 = Date.now();
const r = await fetch(`${API}/api/eco/messages`, { method:"POST", headers:{ ...H(s.accessToken), accept:"text/event-stream" },
  body: JSON.stringify({ threadId, textPlaintext: TEXTO, textCiphertext: sobre.ciphertext, textNonce: sobre.nonce }) });
P("POST", `/api/eco/messages → ${r.status}`);
const texto = await r.text();
const eventos = texto.split("\n\n").filter(Boolean);
const tipos = {};
let delta = 0, fin = null;
for (const ev of eventos) {
  const m = ev.match(/^event:\s*(\S+)/m); const d = ev.match(/^data:\s*(.*)$/m);
  if (!m) continue; tipos[m[1]] = (tipos[m[1]] ?? 0) + 1;
  if (m[1] === "delta" && d) { try { delta += (JSON.parse(d[1]).text ?? "").length; } catch {} }
  if (m[1] === "done" && d) { try { fin = JSON.parse(d[1]); } catch {} }
}
P("SSE", `${eventos.length} eventos · ${JSON.stringify(tipos)} · ${delta} caracteres de respuesta · ${Math.round((Date.now()-t0)/1000)} s`);
P(tipos.delta > 0 ? "CAMINO ✓" : "CAMINO ✗", tipos.delta > 0 ? "respuesta normal recibida en streaming" : "sin deltas: no hubo respuesta del modelo");
P("done", fin ? JSON.stringify(fin).slice(0, 200) : "(sin evento done)");

// persistencia: el contrato exige que el hilo guarde ambos mensajes
const leido = await (await fetch(`${API}/api/eco/threads/${threadId}`, { headers: H(s.accessToken) })).json();
const msgs = leido.messages ?? leido.thread?.messages ?? [];
P("persist", `${msgs.length} mensajes en el hilo · tipos: ${msgs.map(m=>m.kind).join(",")}`);
const asistente = msgs.find(m => m.kind === "ASSISTANT");
P(asistente ? "persist ✓" : "persist ✗", asistente ? `la respuesta quedó guardada (${(asistente.assistantText??"").length} caracteres)` : "la respuesta NO se guardó");
console.log(`TOKENS ${JSON.stringify(msgs.map(m => ({ k: m.kind, in: m.inputTokens, out: m.outputTokens })))}`);
