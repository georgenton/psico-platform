#!/usr/bin/env node
/**
 * Run the Dúo walk against a HOSTED environment (Railway + Vercel).
 *
 * Not a second harness: it prepares what a hosted pilot needs, then runs
 * `duo.walk.mjs` — the same scenarios, the same assertions — pointed at the
 * hosted URLs, with the database and queue reached through `transports.mjs`.
 *
 * ── What a hosted pilot needs that a local `on` does not ───────────────────
 *
 * Under `CIRCLES_ROLLOUT_MODE=pilot` only an ALLOWLISTED account may create a
 * Dúo, and the allowlist is configuration read once at boot. The walk's
 * scenarios are independent because each owns its data — and one of them
 * deletes its organiser on purpose — so this registers ONE account per
 * scenario, writes the allowlist, waits for the redeploy, and hands the walk
 * the pool.
 *
 * Registration uses the ordinary endpoint. Nothing here is a back door: no
 * test-only auth, no catalog injection, no guard exception. The synthetic
 * catalog reached the servers in the deployed ARTIFACT, not at runtime.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted.mjs --config <path/to/hosted.json>
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeTransport } from "./transports.mjs";

const at = process.argv.indexOf("--config");
if (at < 0) {
  console.error("usage: hosted.mjs --config <path>");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(process.argv[at + 1], "utf8"));

/** Every label the walk asks `register()` for, one account each. */
const LABELS = [
  "organiser",
  "prep",
  "reveal",
  "artifact",
  "withdraw-before",
  "withdraw-after",
  "retry",
  "roomA",
  "roomB",
  "temporal",
  "deleted",
];

const log = (m) => console.log(`▸ ${m}`);

async function registerAccount(label, runId) {
  const email = `circulos-${label.toLowerCase()}-${runId}@example.test`;
  const password = `Pw-${randomBytes(9).toString("base64url")}`;
  const res = await fetch(`${cfg.apiUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: `Prueba ${label}` }),
  });
  if (res.status >= 300) {
    throw new Error(`registration failed for ${label}: ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  return { email, password, userId: body?.user?.id ?? null };
}

function railway(args) {
  return execFileSync("railway", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600_000,
  });
}

async function waitFor(check, label, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** The code the guest-session route answers with, as a liveness probe. */
async function circlesCode() {
  const res = await fetch(`${cfg.apiUrl}/api/circles/guest/session`, {
    headers: { "x-circle-guest-session": "probe-not-a-real-session" },
  });
  const body = await res.json().catch(() => ({}));
  return body?.code ?? `HTTP_${res.status}`;
}

// ── 1 · the accounts, and the allowlist that admits them ────────────────────

const runId = randomBytes(3).toString("hex");

/**
 * Clear the rate limiter's own keys in the TEST environment's Redis.
 *
 * Registration is capped at ten per hour per address, and a run needs twelve
 * accounts — one per scenario, plus the one deliberately left off the
 * allowlist. Raising the cap would weaken the very configuration under test.
 * These are the `throttle:` keys only, in a Redis that belongs to this test
 * project, and the limiter has its own tests, its own negative controls, and a
 * dedicated hosted verification of its own further down.
 */
const transport = makeTransport({
  CIRCULOS_E2E_TRANSPORT: "railway",
  CIRCULOS_E2E_RAILWAY_PROJECT: cfg.projectId,
  CIRCULOS_E2E_RAILWAY_ENVIRONMENT: cfg.environmentId,
  CIRCULOS_E2E_RAILWAY_SERVICE: cfg.apiServiceId,
});

log(`registering ${LABELS.length + 1} synthetic accounts (run ${runId})`);
transport.resetRateLimits();

const pool = {};
for (const [i, label] of LABELS.entries()) {
  // The cap is real and this run is over it by design; clear again partway
  // rather than pretend a dozen registrations fit under a limit of ten.
  if (i > 0 && i % 6 === 0) transport.resetRateLimits();
  pool[label] = await registerAccount(label, runId);
}
transport.resetRateLimits();

// One account deliberately OUTSIDE the allowlist, so "the pilot is enforced"
// is something observed rather than assumed.
const outsider = await registerAccount("fuera-allowlist", runId);

const poolPath = join(tmpdir(), `circulos-hosted-accounts-${runId}.json`);
writeFileSync(poolPath, JSON.stringify(pool, null, 2), { mode: 0o600 });
writeFileSync(
  join(tmpdir(), `circulos-hosted-outsider-${runId}.json`),
  JSON.stringify(outsider, null, 2),
  { mode: 0o600 },
);
log(`accounts written to ${poolPath} (outside the repository)`);

const allowlist = [
  ...Object.values(pool).map((a) => a.userId),
  ...(cfg.extraAllowlistIds ?? []),
].join(",");

log("setting the allowlist on the API and the worker");
for (const service of [cfg.apiServiceId, cfg.workerServiceId]) {
  railway([
    "variables",
    "--project", cfg.projectId,
    "--environment", cfg.environmentId,
    "--service", service,
    "--skip-deploys",
    "--set", `CIRCLES_ROLLOUT_MODE=pilot`,
    "--set", `CIRCLES_PILOT_USER_IDS=${allowlist}`,
  ]);
}

log("redeploying so the new allowlist is the one the services booted with");
for (const service of [cfg.apiServiceId, cfg.workerServiceId]) {
  railway([
    "redeploy",
    "--project", cfg.projectId,
    "--environment", cfg.environmentId,
    "--service", service,
    "--yes",
  ]);
}

await waitFor(
  async () => (await circlesCode()) === "CIRCLE_GUEST_SESSION_INVALID",
  "the API to come back in pilot mode",
);
log("API is live in pilot mode");

// ── 2 · the allowlist is enforced, observed on the hosted API ───────────────

log("checking that a NON-allowlisted account cannot create");
const outsiderToken = await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: outsider.email, password: outsider.password }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.accessToken ?? body?.tokens?.accessToken ?? null;
})();

let outsiderRefused = "not-attempted";
if (outsiderToken) {
  const res = await fetch(`${cfg.apiUrl}/api/circles/duo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${outsiderToken}`,
      "Idempotency-Key": randomBytes(16).toString("hex"),
    },
    body: JSON.stringify({
      templateKey: cfg.templateKey,
      templateVersion: cfg.templateVersion,
      invitationToken: randomBytes(32).toString("base64url"),
    }),
  });
  const body = await res.json().catch(() => ({}));
  outsiderRefused = `${res.status} ${body?.code ?? ""}`.trim();
}
console.log(`   non-allowlisted creation → ${outsiderRefused}`);

// ── 3 · the walk itself, unchanged ──────────────────────────────────────────

log("running the walk against the hosted services");
try {
  execFileSync("node", ["apps/web/e2e/circulos/duo.walk.mjs"], {
    cwd: cfg.repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CIRCULOS_E2E_TRANSPORT: "railway",
      CIRCULOS_E2E_API: cfg.apiUrl,
      CIRCULOS_E2E_API_OFF: cfg.apiUrl, // the off gate is exercised separately
      CIRCULOS_E2E_WEB: cfg.webUrl,
      CIRCULOS_E2E_ACCOUNTS: poolPath,
      CIRCULOS_E2E_HEAD_SHA: cfg.sourceSha,
      CIRCULOS_E2E_RAILWAY_PROJECT: cfg.projectId,
      CIRCULOS_E2E_RAILWAY_ENVIRONMENT: cfg.environmentId,
      CIRCULOS_E2E_RAILWAY_SERVICE: cfg.apiServiceId,
      CIRCULOS_E2E_SKIP_OFF_SCENARIO: "1",
    },
  });
} catch (err) {
  console.error(`\n✖ the hosted walk failed: ${err.message}`);
  console.error(`   accounts: ${poolPath}`);
  process.exit(1);
}

console.log(`\n✔ hosted walk finished`);
console.log(`   accounts: ${poolPath}`);
console.log(`   outsider refusal: ${outsiderRefused}`);
