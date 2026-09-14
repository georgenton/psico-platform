#!/usr/bin/env node
/**
 * The abuse limit, observed on the HOSTED API, over the public HTTPS URL.
 *
 * `attested-client-throttler.spec.ts` proves the guard's logic in isolation.
 * What it cannot prove is that the deployed pair actually behaves this way:
 * that the Web and the API hold the same secret, that Railway's edge does not
 * eat or rewrite the header, and that the bucket a real request lands in is the
 * one the design intends. That is what this asks of the running services.
 *
 * Two claims, each with its own control:
 *
 *   1 · A named client gets its OWN allowance. One attested identity exhausts
 *       the limit and is refused; a second identity, same instant, same route,
 *       same source address, is not. Without the attestation these two would
 *       share one bucket and the first would close the route for the second —
 *       which is the whole reason the attestation exists.
 *
 *   2 · Forging one buys NOTHING. The trick is to forge a claim about an
 *       identity that is already SPENT: exhaust a genuine identity, prove it is
 *       spent by being refused again with the real signature, then present the
 *       same identity with a wrong one. If the API believed it, the request
 *       would land in the exhausted bucket and be refused. It is not refused —
 *       so the claim never reached that bucket at all, and fell back to the
 *       address, which these eleven attested calls have not touched.
 *
 * ── Where each part runs, and why ──────────────────────────────────────────
 *
 * Every request is issued from THIS machine against the hosted URL, through the
 * same edge a browser goes through. Only the minting happens inside the API
 * container: `CLIENT_ATTESTATION_SECRET` lives there, and a genuine attestation
 * can be produced without the secret ever crossing to a developer machine. What
 * comes back is a signed claim about a made-up client id that expires in sixty
 * seconds; it is used immediately and never printed.
 *
 * ── A finding that changed how claim 2 is asked ────────────────────────────
 *
 * The obvious shape for claim 2 — fill the address bucket, then show the forged
 * claim stays refused — cannot be made to work against this deployment, and the
 * reason is worth writing down. Twelve identical unattested calls, from inside
 * the container AND from a developer machine, land in TWO buckets rather than
 * one: counters of 6 and 6, 6 and 7. The API does not see one address per
 * caller. So an unattested caller effectively gets twice the allowance here,
 * and no amount of calling from one place fills a single address bucket.
 *
 * That is a property of the hosted platform, not of the guard, and it is
 * precisely the weakness the attestation exists to remove — the attested path
 * is stable, as claim 1 shows. Claim 2 is therefore asked in a way that does
 * not depend on the address bucket at all: the forged claim is aimed at an
 * identity bucket that is provably exhausted.
 *
 * The route is `POST /api/circles/invitations/inspect` — 10 per 15 minutes —
 * and inspection is the one guest call that consumes nothing: the secrets sent
 * here are made up and match no invitation, so every one of them is answered
 * with the same refusal a stranger's would be.
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

/** 22 base64url chars — inside the header's own [16,64] grammar. */
const identity = () => randomBytes(16).toString("base64url");

/**
 * Genuine attestations for `count` made-up client identities, minted where the
 * secret is. They expire in a minute, so they are minted immediately before use
 * and never written down.
 */
function mintGenuine(count) {
  const snippet = `
    const crypto = require('node:crypto');
    const secret = process.env.CLIENT_ATTESTATION_SECRET;
    if (!secret) { console.error('NO_SECRET'); process.exit(1); }
    const out = [];
    for (let i = 0; i < ${count}; i++) {
      const hash = crypto.randomBytes(16).toString('base64url');
      const payload = hash + '.' + (Date.now() + 60000);
      out.push(payload + '.' + crypto.createHmac('sha256', secret)
        .update(payload).digest('base64url'));
    }
    console.log('<<<E2E' + out.join(' ') + 'E2E>>>');
  `;
  return railwayNode(env, snippet).split(/\s+/).filter(Boolean);
}

/**
 * Two ways to present the SAME client identity: signed by the API's key, and
 * signed by one it does not have. Same identity on both sides is the whole
 * point — it is what makes the forged call's fate attributable to the
 * signature rather than to which bucket it happened to land in.
 */
function identityAttestations() {
  const id = identity();
  const snippet = `
    const crypto = require('node:crypto');
    const secret = process.env.CLIENT_ATTESTATION_SECRET;
    if (!secret) { console.error('NO_SECRET'); process.exit(1); }
    const payload = ${JSON.stringify(id)} + '.' + (Date.now() + 60000);
    console.log('<<<E2E' + payload + '.' + crypto.createHmac('sha256', secret)
      .update(payload).digest('base64url') + 'E2E>>>');
  `;
  // A trip into the container costs seconds; the attestation is good for a
  // minute. So one is minted and reused until it is close to expiring, rather
  // than eleven trips for eleven requests.
  let held = null;
  let heldAt = 0;
  return {
    genuine: () => {
      if (held === null || Date.now() - heldAt > 40_000) {
        held = railwayNode(env, snippet);
        heldAt = Date.now();
      }
      return held;
    },
    forged: () => {
      const payload = `${id}.${Date.now() + 60_000}`;
      const signature = createHmac("sha256", "not-the-secret")
        .update(payload)
        .digest("base64url");
      return `${payload}.${signature}`;
    },
  };
}

async function inspect(attestation) {
  const headers = { "content-type": "application/json" };
  if (attestation) headers["x-client-attestation"] = attestation;
  const res = await fetch(`${cfg.apiUrl}/api/circles/invitations/inspect`, {
    method: "POST",
    headers,
    // Matches no invitation; inspection spends nothing either way.
    body: JSON.stringify({ secret: `no-such-invitation-${identity()}` }),
  });
  return res.status;
}

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};
const none429 = (list) => list.every((s) => s !== 429);

// ── 1 · a named client has its own allowance ────────────────────────────────

console.log("▸ two signed identities, from this machine, through the edge");
transport.resetRateLimits();

const [attestationA, attestationB] = mintGenuine(2);

const spentByA = [];
for (let i = 0; i < LIMIT; i++) spentByA.push(await inspect(attestationA));
const aOverLimit = await inspect(attestationA);
const bWhileAExhausted = await inspect(attestationB);

check(
  none429(spentByA),
  `an attested client spends its own allowance (${LIMIT} calls, none refused)`,
  spentByA.join(","),
);
check(
  aOverLimit === 429,
  "and is refused on the call past the limit",
  `got ${aOverLimit}`,
);
check(
  bWhileAExhausted !== 429,
  "a DIFFERENT attested client is unaffected by the first one's exhaustion",
  `got ${bWhileAExhausted}`,
);

// ── 2 · forging buys nothing ────────────────────────────────────────────────

console.log("▸ the same identity, signed and then forged");
transport.resetRateLimits();

// One identity, spent to its limit with the real signature. Attested requests
// are counted against `client:<id>` and NOT against the address, so after this
// the identity bucket is full and the address bucket is untouched.
const spent = identityAttestations(1);
const spentByC = [];
for (let i = 0; i < LIMIT; i++) spentByC.push(await inspect(spent.genuine()));
const genuineOverLimit = await inspect(spent.genuine());
// The same identity, the same instant, a key the API does not have.
const forgedOverLimit = await inspect(spent.forged());

check(
  none429(spentByC),
  "an identity is spent to its limit with the real signature",
  spentByC.join(","),
);
check(
  genuineOverLimit === 429,
  "and the NEXT genuine call for it is refused — the bucket is provably full",
  `got ${genuineOverLimit}`,
);
check(
  forgedOverLimit !== 429,
  "the SAME identity signed with the wrong key is not refused — so it never " +
    "reached that bucket; a forged claim buys nothing",
  `got ${forgedOverLimit}`,
);

console.log(
  failures === 0
    ? "\n✔ the hosted limit names clients, and only signed claims are believed"
    : `\n✖ ${failures} check(s) failed`,
);
transport.resetRateLimits();
process.exit(failures === 0 ? 0 : 1);
