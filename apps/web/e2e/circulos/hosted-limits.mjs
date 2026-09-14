#!/usr/bin/env node
/**
 * The abuse limit, observed on the HOSTED API.
 *
 * `attested-client-throttler.spec.ts` proves the guard's logic in isolation.
 * What it cannot prove is that the deployed pair actually behaves this way:
 * that the Web and the API hold the same secret, that Railway's edge does not
 * eat or rewrite the header, and that the bucket a real request lands in is the
 * one the design intends. That is what this asks, over HTTPS, of the running
 * services.
 *
 * Two claims, each with its own control:
 *
 *   1 · A named client gets its OWN allowance. One attested identity exhausts
 *       the limit and is refused; a second identity, same instant, same route,
 *       same egress address, is not. Without the attestation these two would
 *       share one bucket and the first would close the route for the second —
 *       which is the whole reason the attestation exists.
 *
 *   2 · Forging one buys NOTHING. A claim with the right grammar and a wrong
 *       signature does not obtain a fresh bucket: it falls back to the address
 *       it came from. Observed against an exhausted address bucket, where a
 *       forged claim stays refused and a genuine one passes — so the pass is
 *       attributable to the signature and not to the request being new.
 *
 * The requests are issued from INSIDE the API container. Not to make them
 * easier: it is where `CLIENT_ATTESTATION_SECRET` already lives, so a genuine
 * attestation can be minted without the secret ever crossing to this machine.
 *
 * Claim 1 travels over the public HTTPS URL, through the same edge a browser
 * goes through — which is what makes it evidence that the deployed edge passes
 * the header along untouched.
 *
 * Claim 2 is issued over the loopback instead, and that is a deliberate
 * correction rather than a shortcut. Measured first through the edge, thirteen
 * identical unattested calls produced two counters of 6 and 7: the container's
 * egress alternates between two addresses, so no single address bucket ever
 * filled and the phase proved nothing. The address bucket is exactly what
 * claim 2 is about, so it is exercised from the one place whose address does
 * not move. The edge plays no part in which bucket a request lands in — claim
 * 1 already covers the edge — so nothing is assumed away by this.
 *
 * The route is `POST /api/circles/invitations/inspect` — 10 per 15 minutes —
 * and inspection is the one guest call that consumes nothing: the secrets sent
 * here are made up and match no invitation, so every one of them is answered
 * with the same refusal a stranger's would be.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-limits.mjs --config <path/to/hosted.json>
 */

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

const snippet = `
  const crypto = require('node:crypto');
  const IORedis = require('ioredis');

  const API = ${JSON.stringify(cfg.apiUrl)};
  const SECRET = process.env.CLIENT_ATTESTATION_SECRET;
  const LIMIT = ${LIMIT};

  /** The BFF's grammar: <clientIdHash>.<expiresAtMs>.<hmac>. */
  const mint = (hash, secret) => {
    const payload = hash + '.' + (Date.now() + 60000);
    return payload + '.' + crypto.createHmac('sha256', secret)
      .update(payload).digest('base64url');
  };
  /** 22 base64url chars — inside the header's own [16,64] grammar. */
  const identity = () => crypto.randomBytes(16).toString('base64url');

  /** The same process, reached without leaving it: one stable address. */
  const LOOPBACK = 'http://127.0.0.1:' + (process.env.PORT || '3000');

  async function inspect(attestation, origin) {
    const headers = { 'content-type': 'application/json' };
    if (attestation) headers['x-client-attestation'] = attestation;
    const res = await fetch((origin || API) + '/api/circles/invitations/inspect', {
      method: 'POST',
      headers,
      // Matches no invitation; inspection spends nothing either way.
      body: JSON.stringify({ secret: 'no-such-invitation-' + identity() }),
    });
    return res.status;
  }

  async function clearBuckets() {
    const r = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', 'throttle:*', 'COUNT', 500);
      cursor = next;
      if (keys.length) await r.del(...keys);
    } while (cursor !== '0');
    await r.quit();
  }

  (async () => {
    const out = {};

    // ── 1 · a named client has its own allowance ────────────────────────────
    await clearBuckets();
    const a = identity();
    out.attestedA = [];
    for (let i = 0; i < LIMIT; i++) out.attestedA.push(await inspect(mint(a, SECRET)));
    out.attestedAOverLimit = await inspect(mint(a, SECRET));
    // Same moment, same route, same address — a different signed identity.
    out.attestedBWhileAExhausted = await inspect(mint(identity(), SECRET));

    // ── 2 · forging buys nothing ────────────────────────────────────────────
    await clearBuckets();
    out.unattested = [];
    for (let i = 0; i < LIMIT; i++) out.unattested.push(await inspect(null, LOOPBACK));
    out.unattestedOverLimit = await inspect(null, LOOPBACK);
    // Right shape, wrong key: must NOT be granted a bucket of its own.
    out.forgedWhileAddressExhausted = await inspect(mint(identity(), 'not-the-secret'), LOOPBACK);
    // The control for that refusal: a genuine one, equally new, passes.
    out.genuineWhileAddressExhausted = await inspect(mint(identity(), SECRET), LOOPBACK);

    // Leave the environment as it was found.
    await clearBuckets();
    console.log('<<<E2E' + JSON.stringify(out) + 'E2E>>>');
  })().catch((e) => { console.error('LIMITERR ' + e.message); process.exit(1); });
`;

console.log("▸ exercising the hosted limit from inside the API container");
const answer = JSON.parse(railwayNode(env, snippet));

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const none429 = (list) => list.every((s) => s !== 429);

check(
  none429(answer.attestedA),
  `an attested client spends its own allowance (${LIMIT} calls, none refused)`,
  answer.attestedA.join(","),
);
check(
  answer.attestedAOverLimit === 429,
  "and is refused on the call past the limit",
  `got ${answer.attestedAOverLimit}`,
);
check(
  answer.attestedBWhileAExhausted !== 429,
  "a DIFFERENT attested client is unaffected by the first one's exhaustion",
  `got ${answer.attestedBWhileAExhausted}`,
);
check(
  none429(answer.unattested) && answer.unattestedOverLimit === 429,
  "an unattested caller is bucketed by its address, and that bucket runs out",
  `got ${answer.unattestedOverLimit}`,
);
check(
  answer.forgedWhileAddressExhausted === 429,
  "a FORGED attestation gets no bucket of its own — it falls back to the address",
  `got ${answer.forgedWhileAddressExhausted}`,
);
check(
  answer.genuineWhileAddressExhausted !== 429,
  "while a GENUINE one, equally new, passes — so the refusal was the signature",
  `got ${answer.genuineWhileAddressExhausted}`,
);

console.log(
  failures === 0
    ? "\n✔ the hosted limit names clients, and only signed claims are believed"
    : `\n✖ ${failures} check(s) failed`,
);
transport.resetRateLimits();
process.exit(failures === 0 ? 0 : 1);
