#!/usr/bin/env node
/**
 * What the abuse limit actually guarantees on the HOSTED services.
 *
 * `attested-client-throttler.spec.ts` proves the guard's logic in isolation and
 * the attestation has its own unit tests. Neither can answer the question that
 * matters for a pilot: **how much can one caller spend if they try every path
 * at once?** That is not a property of either piece — it is a property of the
 * deployment, and it is measured here, over the public URLs.
 *
 * ── The order these run in is the whole point ──────────────────────────────
 *
 * The limiter is a global guard: it runs BEFORE the attestation guards and it
 * counts every request, refused or not. So a question about attestation can
 * only be asked with budget in hand, and a question about the budget can only
 * be asked once it is gone. An earlier version of this file ignored that,
 * spent the allowance in its first section, and then asked five attestation
 * questions that all came back `429` — the limiter answering a question it
 * had not been asked. Eight checks went red and none of them was about
 * attestation.
 *
 * Hence two scenarios, with the counters cleared between them:
 *
 *   A · WITH budget — every disbelieved attestation is refused by the
 *       attestation boundary (`403`, and the same `403` for all of them so
 *       none names which check failed), and a genuine one reaches the domain
 *       and gets its contractual answer. `404` exactly: the secret is
 *       synthetic, so "no such invitation" is the correct reply, and a 500
 *       or a 503 is a broken route rather than a pass.
 *
 *   B · the budget itself — the BFF allowance is exactly the route limit,
 *       and the API declares that same limit in its own header.
 *
 *   C · WITHOUT budget — no header and no route change buys a second
 *       allowance, and the domain is not reached at all.
 *
 *   D · a second, genuinely different client is unaffected.
 *
 * The matrix, in the order it runs:
 *
 *   1 · Through the real BFF. The browser's actual path: same-origin POST to
 *       the Web, which signs an identity and forwards to the API. Spend it to
 *       the limit and watch the refusal arrive.
 *
 *   2 · Can the caller CHOOSE that identity? The BFF derives it from the
 *       address the platform reports. If a client-supplied header can reach
 *       that derivation, the identity is attacker-controlled and the limit is
 *       decoration. Tried with every header platforms commonly honour.
 *
 *   3 · Straight to the API, with no attestation at all. These two routes have
 *       one consumer — our own Web — so a caller who cannot present its
 *       signature is refused outright rather than given a second budget.
 *
 *   4 · Straight to the API with an attestation that is malformed, expired, or
 *       signed with the wrong key. All four must get the SAME answer as absent:
 *       naming which one failed is most of a forgery.
 *
 *   5 · Switching paths. Before `CirclesBffOnlyGuard` this was where the budget
 *       grew: ten through the Web plus ten to twenty more going direct, because
 *       the two paths are different buckets by construction. The direct path is
 *       now closed, so there is one budget and this proves there is no second.
 *
 *   6 · Two legitimate clients, from genuinely different networks, staying out
 *       of each other's way.
 *
 * ── On counters, and not stealing somebody's test ──────────────────────────
 *
 * This spends real budget, so it clears the test environment's `throttle:` keys
 * at the start and again at the end, and is meant to run BEFORE the environment
 * is handed over for manual use. It is not safe to run underneath somebody's
 * session.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-limits.mjs --config <path/to/hosted.json>
 */

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { makeTransport, railwayNode } from "./transports.mjs";

const at = process.argv.indexOf("--config");
if (at < 0) {
  console.error("usage: hosted-limits.mjs --config <path>");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(process.argv[at + 1], "utf8"));

const env = {
  CIRCULOS_E2E_RAILWAY_PROJECT: cfg.projectId,
  CIRCULOS_E2E_RAILWAY_ENVIRONMENT: cfg.environmentId,
  CIRCULOS_E2E_RAILWAY_SERVICE: cfg.apiServiceId,
};
const transport = makeTransport({ ...env, CIRCULOS_E2E_TRANSPORT: "railway" });

/** `INVITATION_THROTTLE` on the inspect route. Read from the API, not guessed. */
const LIMIT = 10;
/** Enough to see a refusal even if a caller turns out to hold several buckets. */
const CEILING = 60;

const identity = () => randomBytes(16).toString("base64url");
const madeUpSecret = () => `no-such-invitation-${identity()}`;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};
const note = (what, detail) =>
  console.log(`   · ${what}${detail ? ` — ${detail}` : ""}`);

// ── the two ways in ─────────────────────────────────────────────────────────

/** The browser's path: same-origin POST to the Web, which signs and forwards. */
async function viaBff(extraHeaders = {}) {
  const res = await fetch(`${cfg.webUrl}/api/circulos/inspeccion`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: cfg.webUrl,
      ...extraHeaders,
    },
    body: JSON.stringify({ secret: madeUpSecret() }),
  });
  return res.status;
}

/**
 * Straight at the API, the way anything that is not our Web would arrive.
 *
 * Returns the status AND the limiter's own declaration of the budget. The
 * header is the server saying what it thinks the allowance is, which is a
 * better thing to assert than a call index measured from this machine: what
 * a client observes depends on how the edge in front of the API derives an
 * identity, and that is not the guarantee under test.
 */
async function viaApi(attestation, extraHeaders = {}) {
  const headers = { "content-type": "application/json", ...extraHeaders };
  if (attestation) headers["x-client-attestation"] = attestation;
  const res = await fetch(`${cfg.apiUrl}/api/circles/invitations/inspect`, {
    method: "POST",
    headers,
    body: JSON.stringify({ secret: madeUpSecret() }),
  });
  return {
    status: res.status,
    declared: res.headers.get("x-ratelimit-limit"),
  };
}

/** Just the status, for the places that only care about the answer. */
const statusViaApi = async (attestation, extraHeaders = {}) =>
  (await viaApi(attestation, extraHeaders)).status;

/**
 * Spend the DIRECT route's allowance until it refuses, and say how much it
 * took. Bounded: a route that never refuses is the finding, not a hang.
 */
async function spendDirectUntilRefused(ceiling = CEILING) {
  for (let i = 1; i <= ceiling; i++) {
    if ((await statusViaApi(null)) === 429) return i - 1;
  }
  return null;
}

/** Calls `send` until it is refused; returns which call was refused, or null. */
async function spendUntilRefused(send, ceiling = CEILING) {
  for (let i = 1; i <= ceiling; i++) {
    if ((await send()) === 429) return i;
  }
  return null;
}

/** A genuine attestation, minted where the secret is. `offsetMs` shifts expiry. */
function mintGenuine(offsetMs = 60_000, id = identity()) {
  const snippet = `
    const crypto = require('node:crypto');
    const secret = process.env.CLIENT_ATTESTATION_SECRET;
    if (!secret) { console.error('NO_SECRET'); process.exit(1); }
    const payload = ${JSON.stringify(id)} + '.' + (Date.now() + ${offsetMs});
    console.log('<<<E2E' + payload + '.' + crypto.createHmac('sha256', secret)
      .update(payload).digest('base64url') + 'E2E>>>');
  `;
  return railwayNode(env, snippet);
}

/** The same grammar, a key the API does not have. */
function mintForged(id = identity()) {
  const payload = `${id}.${Date.now() + 60_000}`;
  const signature = createHmac("sha256", "not-the-secret")
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

console.log("▸ clearing this environment's throttle counters before measuring");
transport.resetRateLimits();

// ── A · the attestation boundary, WITH budget available ─────────────────────
//
// ── The guard order, observed rather than assumed ──────────────────────────
//
// On the inspect route the chain is:
//
//     rate limiter  →  guest-surface + BFF-only guards  →  domain
//
// The limiter is a global guard, so it runs FIRST and counts every request
// whether or not a later guard refuses it. That single fact is what the
// previous version of this file got wrong: it spent the allowance in its
// first section and then asked the attestation questions with an exhausted
// budget, so every answer came back `429` — the limiter's — and eight checks
// went red without a single one of them being about attestation.
//
// So the two scenarios are separated, and the counters are cleared between
// them. With budget available, a refusal is the ATTESTATION boundary
// speaking and `403` is the only acceptable answer. With the budget gone,
// `429` is the LIMITER speaking and the question is a different one.
console.log("\n▸ A · attestations, with budget available");
const attestationCases = {
  absent: null,
  malformed: "not-an-attestation",
  "right shape, junk parts": `${identity()}.notanumber.xxxx`,
  expired: mintGenuine(-60_000),
  forged: mintForged(),
};
const answers = new Set();
for (const [kind, value] of Object.entries(attestationCases)) {
  // Cleared before EACH case: five cases plus the control would otherwise
  // walk into the allowance themselves, which is the bug being fixed.
  transport.resetRateLimits();
  const status = await statusViaApi(value);
  answers.add(status);
  check(
    status === 403,
    `${kind}: refused by the attestation boundary`,
    `got ${status}${status === 429 ? " — that is the LIMITER, not the boundary" : ""}`,
  );
}
check(
  answers.size === 1 && answers.has(403),
  "all five get the SAME answer — none says which check failed",
  `distinct answers: ${[...answers].join(",")}`,
);

// The positive control, and it demands a CONCRETE answer.
//
// A holder of the Web's secret reaches the domain, and the domain's
// contractual reply to a syntactically valid secret that matches no
// invitation is `404`. "Not 429" is not a pass: a `500` or a `503` is the
// route being broken, and the earlier version would have counted both.
transport.resetRateLimits();
const genuine = await statusViaApi(mintGenuine());
check(
  genuine === 404,
  "a GENUINE attestation reaches the domain and gets its contractual answer",
  `got ${genuine} (want 404 — the synthetic secret matches no invitation)`,
);

// ── B · the budget, as declared and as spent ────────────────────────────────

console.log("\n▸ B · the budget itself");
transport.resetRateLimits();
const bffSpent = await spendUntilRefused(() => viaBff());
check(
  bffSpent !== null,
  "the BFF path is rate limited end to end",
  bffSpent ? `refused on call ${bffSpent}` : `never refused in ${CEILING}`,
);
// The EXPECTED budget, not merely "some 429 eventually". The browser's path
// is the one a person actually uses, and it must allow exactly the route's
// limit before refusing.
check(
  bffSpent !== null && bffSpent - 1 === LIMIT,
  `the BFF allowance is exactly the route limit (${LIMIT})`,
  `spent ${bffSpent === null ? "unbounded" : bffSpent - 1}`,
);

transport.resetRateLimits();
const { declared } = await viaApi(null);
check(
  declared === String(LIMIT),
  `the API declares the same limit on the route (x-ratelimit-limit=${LIMIT})`,
  `got ${declared ?? "no header"}`,
);

// What one client actually gets through the direct route, recorded rather
// than asserted. It is NOT the route limit here, and the gap is reported
// separately — see the anomaly printed at the end. Asserting a number that
// depends on how the edge derives an identity would be asserting the
// deployment's plumbing, not the product's guarantee.
transport.resetRateLimits();
const directSpent = await spendDirectUntilRefused();
check(
  directSpent !== null,
  "the direct route is rate limited too, and refuses within the ceiling",
  directSpent === null ? `never refused in ${CEILING}` : `after ${directSpent}`,
);
note(
  "observed direct allowance for THIS client",
  `${directSpent} call(s) before 429, against a declared limit of ${LIMIT}`,
);

// ── C · with the budget gone ────────────────────────────────────────────────
//
// ── What the limiter actually counts, and why that is the design ──────────
//
// Not "an IP". The attested CLIENT IDENTITY: the Web mints one per browser,
// signs it, and the API tracks the allowance against it. So the question
// "does anything buy a second allowance?" has to be asked about ONE identity
// — spend that identity's budget, then try everything a caller could try
// while still being that identity.
//
// A caller who can mint a DIFFERENT identity does get a different allowance,
// and that is not a hole: minting requires the Web's signing secret, which
// is the same thing the attestation proves. That is asserted below too,
// explicitly, so nobody reads its absence as an oversight.
console.log("\n▸ C · with one identity's budget spent");

// Ten minutes, not the default sixty seconds: spending an allowance takes
// longer than a minute over the public URL, and an attestation that expired
// mid-section would refuse for a reason this section is not asking about.
const spentIdentity = identity();
const spentAttestation = mintGenuine(10 * 60_000, spentIdentity);

transport.resetRateLimits();
let spentAfter = null;
for (let i = 1; i <= CEILING; i++) {
  if ((await statusViaApi(spentAttestation)) === 429) {
    spentAfter = i - 1;
    break;
  }
}
check(
  spentAfter !== null,
  "one attested identity's allowance runs out",
  spentAfter === null ? `never refused in ${CEILING}` : `after ${spentAfter}`,
);

// The same identity, again. No second allowance.
const again = await statusViaApi(spentAttestation);
check(again === 429, "the same identity gets nothing more", `got ${again}`);
// And the domain was not reached: 200 or 404 is what reaching it looks like.
check(
  again !== 404 && again !== 200,
  "and the domain was not reached at all",
  `got ${again}`,
);

// The six headers a caller could try, while being that same identity.
const spoofs = {
  "x-forwarded-for": "203.0.113.9",
  "x-real-ip": "203.0.113.10",
  "x-vercel-forwarded-for": "203.0.113.11",
  "true-client-ip": "203.0.113.12",
  "cf-connecting-ip": "203.0.113.13",
  forwarded: "for=203.0.113.14",
};
const honouredDirect = [];
for (const [header, value] of Object.entries(spoofs)) {
  const status = await statusViaApi(spentAttestation, { [header]: value });
  if (status !== 429) honouredDirect.push(`${header} → ${status}`);
}
check(
  honouredDirect.length === 0,
  "no client header buys a fresh identity at the API",
  honouredDirect.length
    ? `HONOURED: ${honouredDirect.join(", ")}`
    : "all six still refused with 429",
);

// Switching to the other route does not add the two allowances together.
// The BFF's own allowance is spent here rather than assumed from section B:
// the counters were cleared in between, and a check that depends on state
// somebody else left behind is a check that passes for the wrong reason.
const bffSpentAgain = await spendUntilRefused(() => viaBff());
check(
  bffSpentAgain !== null,
  "the BFF path refuses once its own allowance is spent",
  bffSpentAgain ? `refused on call ${bffSpentAgain}` : `never in ${CEILING}`,
);
const stillBff = await viaBff();
check(
  stillBff === 429,
  "and stays spent — switching between the two routes adds nothing",
  `got ${stillBff}`,
);
const stillApi = await statusViaApi(spentAttestation);
check(stillApi === 429, "the direct route stays spent too", `got ${stillApi}`);

// The other half of the design, stated rather than left implicit: a caller
// who can SIGN is a new client, and gets a new client's allowance. What
// protects the route is that signing needs the Web's secret — which is
// exactly what section A proves cannot be faked.
const freshIdentity = await statusViaApi(mintGenuine(60_000, identity()));
check(
  freshIdentity === 404,
  "a DIFFERENT signed identity is a different client, with its own allowance",
  `got ${freshIdentity} (want 404 — minting one requires the Web's secret)`,
);

// ── C-bis · the same six headers, against the real BFF ──────────────────────
//
// Restored, and it is a different question from the one section C asks.
//
// C asks the API directly, where the identity is an attested client id. The
// BFF derives its identity from the address the platform reports, and that
// derivation is the one a browser could try to influence: a client header is
// the only thing a caller controls on that path. A run that only asked the
// API would leave the browser's own path — the one every real person uses —
// unmeasured.
console.log("\n▸ C-bis · client headers against the real BFF");
transport.resetRateLimits();
const bffBudget = await spendUntilRefused(() => viaBff());
check(
  bffBudget !== null && bffBudget - 1 === LIMIT,
  "the BFF allowance is spent, so a fresh identity would be visible",
  `spent ${bffBudget === null ? "unbounded" : bffBudget - 1}`,
);
const honouredByBff = [];
for (const [header, value] of Object.entries(spoofs)) {
  const status = await viaBff({ [header]: value });
  if (status !== 429) honouredByBff.push(`${header} → ${status}`);
}
check(
  honouredByBff.length === 0,
  "no client header buys a fresh identity through the BFF either",
  honouredByBff.length
    ? `HONOURED: ${honouredByBff.join(", ")}`
    : "all six still refused with 429",
);

// ── D · two legitimate clients ──────────────────────────────────────────────

console.log("\n▸ D · a second, genuinely different client");
// The API container sits on another network. Same BFF, same route, no headers
// of its own — a real second client rather than a simulated one.
const fromElsewhere = railwayNode(
  env,
  `
    const WEB = ${JSON.stringify(cfg.webUrl)};
    fetch(WEB + '/api/circulos/inspeccion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ secret: 'no-such-invitation-from-elsewhere' }),
    }).then(r => console.log('<<<E2E' + r.status + 'E2E>>>'))
      .catch(e => { console.error('ERR ' + e.message); process.exit(1); });
  `,
);
// A CONCRETE answer, not "anything but 429". This client is legitimate, so
// it must reach the domain and be told the secret matches no invitation —
// the same 404 the positive control in section A demands. A 500 or a 503
// here would mean the route is broken for everybody, which the old
// "not 429" form would have reported as a pass.
check(
  fromElsewhere === "404",
  "it reaches the domain, unaffected by this machine's spent budget",
  `got ${fromElsewhere} (want 404)`,
);

// ── The anomaly watch ───────────────────────────────────────────────────────
//
// Reported when it happens, never smoothed into a pass.
//
// The route declares `x-ratelimit-limit: 10`, and that is what an attested
// identity gets — section C spends exactly ten. The UNATTESTED path is
// tracked differently, by an identity this environment's edge derives, and
// while writing this block a probe watched that path allow twenty before
// refusing: `x-ratelimit-remaining` fell by one every SECOND request. It has
// not reproduced since, and the checks above measured ten both times.
//
// It is left as a watch rather than an assertion because an unattested
// request cannot reach the domain whatever its budget — section A shows it
// is refused `403` every time — so a looser allowance there buys a caller
// nothing but more refusals. If the gap returns, this line names it.
if (directSpent !== null && directSpent !== LIMIT) {
  console.log(
    `\n▸ ANOMALY · declared limit ${LIMIT}, but the unattested path allowed ` +
      `${directSpent} for one client before refusing. Not caller-controlled ` +
      "(section C) and it reaches no domain (section A) — but the gap is " +
      "real and belongs to identity derivation at the edge.",
  );
}

console.log(
  failures === 0
    ? "\n✔ every claim above held"
    : `\n✖ ${failures} check(s) failed`,
);
console.log(
  "▸ clearing counters again — the environment is free for manual use",
);
transport.resetRateLimits();
process.exit(failures === 0 ? 0 : 1);
