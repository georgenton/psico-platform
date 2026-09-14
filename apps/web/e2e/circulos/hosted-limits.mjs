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

/** Straight at the API, the way anything that is not our Web would arrive. */
async function viaApi(attestation) {
  const headers = { "content-type": "application/json" };
  if (attestation) headers["x-client-attestation"] = attestation;
  const res = await fetch(`${cfg.apiUrl}/api/circles/invitations/inspect`, {
    method: "POST",
    headers,
    body: JSON.stringify({ secret: madeUpSecret() }),
  });
  return res.status;
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

// ── 1 · the real BFF path ───────────────────────────────────────────────────

console.log("\n▸ 1 · through the real BFF, as a browser does");
const bffSpent = await spendUntilRefused(() => viaBff());
check(
  bffSpent !== null,
  "the BFF path is rate limited end to end",
  bffSpent ? `refused on call ${bffSpent}` : `never refused in ${CEILING}`,
);
note(
  "budget through the BFF",
  bffSpent ? `${bffSpent - 1} calls (route limit is ${LIMIT})` : "unbounded",
);

// ── 2 · can the caller pick the identity? ───────────────────────────────────

console.log("\n▸ 2 · trying to choose a different identity with client headers");
const spoofs = {
  "x-forwarded-for": "203.0.113.9",
  "x-real-ip": "203.0.113.10",
  "x-vercel-forwarded-for": "203.0.113.11",
  "true-client-ip": "203.0.113.12",
  "cf-connecting-ip": "203.0.113.13",
  forwarded: "for=203.0.113.14",
};
const honoured = [];
for (const [header, value] of Object.entries(spoofs)) {
  const status = await viaBff({ [header]: value });
  if (status !== 429) honoured.push(`${header} → ${status}`);
  note(`${header}: ${value}`, `→ ${status}`);
}
check(
  honoured.length === 0,
  "no client header buys a fresh identity through the BFF",
  honoured.length ? `HONOURED: ${honoured.join(", ")}` : "all still refused",
);

// ── 3 · straight at the API, unattested ─────────────────────────────────────

console.log("\n▸ 3 · straight at the API, with no attestation");
const direct = [];
for (let i = 0; i < LIMIT + 2; i++) direct.push(await viaApi(null));
check(
  direct.every((s) => s === 403),
  "a caller without the Web's signature is refused, not given a budget",
  `statuses ${[...new Set(direct)].join(",")}`,
);
check(
  !direct.includes(429),
  "and never reaches the limiter at all — there is no second allowance to spend",
);

// ── 4 · attestations the API must NOT believe ───────────────────────────────

console.log("\n▸ 4 · attestations that must be disbelieved");
const disbelieved = {
  absent: null,
  malformed: "not-an-attestation",
  "right shape, junk parts": `${identity()}.notanumber.xxxx`,
  expired: mintGenuine(-60_000),
  forged: mintForged(),
};
const answers = new Set();
for (const [kind, value] of Object.entries(disbelieved)) {
  const status = await viaApi(value);
  answers.add(status);
  check(status === 403, `${kind}: refused`, `got ${status}`);
}
check(
  answers.size === 1,
  "all four get the SAME answer as absent — none says which check failed",
  `distinct answers: ${[...answers].join(",")}`,
);
// The control: the route is not simply refusing everything. A holder of the
// Web's secret — which is what a genuine attestation proves — still passes.
const freshGenuine = await viaApi(mintGenuine());
check(
  freshGenuine !== 403 && freshGenuine !== 429,
  "while a GENUINE attestation still passes",
  `got ${freshGenuine}`,
);

// ── 5 · what one caller holds in total ──────────────────────────────────────

console.log("\n▸ 5 · switching paths");
const stillBff = await viaBff();
const stillApi = await viaApi(null);
check(
  stillBff === 429,
  "the BFF path stays spent",
  `got ${stillBff}`,
);
check(
  stillApi === 403,
  "and the direct path is closed rather than merely spent",
  `got ${stillApi}`,
);
note(
  "TOTAL for one caller on this route",
  `${(bffSpent ?? 1) - 1} via the BFF, and no direct budget at all`,
);

// ── 6 · two legitimate clients ──────────────────────────────────────────────

console.log("\n▸ 6 · a second, genuinely different client");
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
check(
  fromElsewhere !== "429",
  "it is unaffected by this machine having spent its own budget",
  `got ${fromElsewhere}`,
);

console.log(
  failures === 0 ? "\n✔ every claim above held" : `\n✖ ${failures} check(s) failed`,
);
console.log("▸ clearing counters again — the environment is free for manual use");
transport.resetRateLimits();
process.exit(failures === 0 ? 0 : 1);
