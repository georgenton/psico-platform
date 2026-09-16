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
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeTransport } from "./transports.mjs";
import { redactDiagnostics } from "./redact.mjs";

const at = process.argv.indexOf("--config");
if (at < 0) {
  console.error("usage: hosted.mjs --config <path>");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(process.argv[at + 1], "utf8"));

/**
 * Every label the walk asks `register()` for, one account each.
 *
 * This list and the walk's `register("…")` calls have to agree, and nothing
 * checks that they do at build time — `register` throws at RUN time, naming the
 * missing label, which is the right failure but arrives after the allowlist has
 * been written and a redeploy waited for. So when a scenario is added, its label
 * is added here in the same change. The three at the end are this block's.
 */
const LABELS = [
  "organiser",
  "prep",
  "reveal",
  "artifact",
  "withdraw-before",
  "withdraw-after",
  "retry",
  "closing",
  "purge",
  "roomA",
  "roomB",
  "temporal",
  "deleted",
  "candidate",
  "coexistence",
  "analytics",
  "grupo",
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

async function waitFor(check, label, timeoutMs = 900_000, everyMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const answer = await check();
      if (answer === true) return;
      if (answer && answer !== last) {
        last = answer;
        console.log(`   still waiting — ${answer}`);
      }
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${label} (last answer: ${last})`);
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

/**
 * Refuse to start if the walk asks for an account this list does not have.
 *
 * `register()` already fails on a missing label, clearly and by name — but it
 * fails DURING the walk, which is after this script has registered a dozen
 * accounts, written the allowlist and waited out a redeploy. Reading the walk's
 * own source first turns that into a sentence before anything is created.
 *
 * Only literal labels are checked. `register(\`withdraw-${when}\`)` is
 * computed, so its two values stay in the list by hand; a regex that tried to
 * evaluate template literals would be guessing.
 */
{
  // `new URL(…, import.meta.url)` rather than `import.meta.dirname`: the latter
  // needs Node 20.11+, and a harness that throws on an older runner would be
  // reporting its own incompatibility as a deploy failure.
  const walkSrc = readFileSync(
    new URL("duo.walk.mjs", import.meta.url),
    "utf8",
  );
  const asked = new Set(
    [...walkSrc.matchAll(/\bregister\("([a-zA-Z-]+)"\)/g)].map((m) => m[1]),
  );
  const missing = [...asked].filter((l) => !LABELS.includes(l));
  if (missing.length > 0) {
    console.error(
      `✖ the walk registers ${missing.map((m) => `"${m}"`).join(", ")}, ` +
        `which this harness has no account for.\n` +
        `  Add them to LABELS in hosted.mjs — nothing has been created yet.`,
    );
    process.exit(1);
  }
}

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

/** One login, before anything is redeployed. See `poolAccountCanCreate`. */
const probeToken = await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: pool.organiser.email,
      password: pool.organiser.password,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.accessToken ?? body?.tokens?.accessToken ?? null;
})();
if (!probeToken) {
  throw new Error("could not obtain a probe token for the readiness check");
}

const allowlist = [
  ...Object.values(pool).map((a) => a.userId),
  ...(cfg.extraAllowlistIds ?? []),
].join(",");

log("setting the allowlist on the API and the worker");
for (const service of [cfg.apiServiceId, cfg.workerServiceId]) {
  railway([
    "variables",
    "--project",
    cfg.projectId,
    "--environment",
    cfg.environmentId,
    "--service",
    service,
    "--skip-deploys",
    "--set",
    `CIRCLES_ROLLOUT_MODE=pilot`,
    "--set",
    `CIRCLES_PILOT_USER_IDS=${allowlist}`,
    // The modality switch, set HERE and nowhere else. It is written on the
    // test project's services, in the same call that writes the allowlist, so
    // "groups are open" is part of this run's configuration rather than a
    // state somebody has to remember to undo. Production carries its own
    // value and this cannot reach it.
    "--set",
    `CIRCLES_GROUPS=on`,
  ]);
}

log("redeploying so the new allowlist is the one the services booted with");
for (const service of [cfg.apiServiceId, cfg.workerServiceId]) {
  railway([
    "redeploy",
    "--project",
    cfg.projectId,
    "--environment",
    cfg.environmentId,
    "--service",
    service,
    "--yes",
  ]);
}

/**
 * Wait until THIS run's allowlist is the one the API booted with.
 *
 * The obvious probe — "does the guest route answer INVALID instead of
 * UNAVAILABLE" — is true under `pilot` whatever the allowlist CONTAINS, so it
 * passes on the deployment that is still running the PREVIOUS run's list. The
 * walk then logs in with accounts the API has never heard of and every scenario
 * fails on "Esta actividad todavía no está disponible", which is the product
 * correctly refusing a stranger.
 *
 * So the probe is the question that actually matters: can an account from THIS
 * pool create? It uses the ordinary endpoint, and the activity it makes is one
 * more synthetic row in a synthetic database.
 */
async function poolAccountCanCreate() {
  // The token is obtained ONCE, before the redeploy, and reused.
  //
  // The first cut logged in on every poll — and login is capped at five per
  // fifteen minutes per address, so the probe rate-limited itself into never
  // getting a token and waited forever for a deployment that was already live.
  // A JWT survives the redeploy: the secret does not change.
  const token = probeToken;
  if (!token) return "no probe token";

  // Creation is rate limited, and this poll is the only caller — so clear the
  // limiter's keys in the TEST Redis first. Without it the probe spends the
  // allowance it is using to ask the question and then reads its own 429 as
  // "not ready", forever.
  transport.resetRateLimits();

  const res = await fetch(`${cfg.apiUrl}/api/circles/duo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      // `IdempotencyKeyHeaderDto` is `@IsUUID(4)` — a hex string is refused
      // with CIRCLE_INVALID_PAYLOAD, which reads like a rollout problem and is
      // not one.
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      templateKey: cfg.templateKey,
      templateVersion: cfg.templateVersion,
      // An ARRAY since groups: one secret per seat that is not the
      // organiser's, which for this Dúo probe is one.
      invitationTokens: [randomBytes(32).toString("base64url")],
    }),
  });
  if (res.status === 201) return true;
  const body = await res.json().catch(() => ({}));
  return `${res.status} ${body?.code ?? ""}`.trim();
}

await waitFor(
  poolAccountCanCreate,
  "this run's allowlist to be the one the API booted with",
);
log("API is live in pilot mode, with THIS run's allowlist");

// ── 2 · the allowlist is enforced, observed on the hosted API ───────────────

log("checking that a NON-allowlisted account cannot create");
const outsiderToken = await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: outsider.email,
      password: outsider.password,
    }),
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
      // `IdempotencyKeyHeaderDto` is `@IsUUID(4)` — a hex string is refused
      // with CIRCLE_INVALID_PAYLOAD, which reads like a rollout problem and is
      // not one.
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      templateKey: cfg.templateKey,
      templateVersion: cfg.templateVersion,
      // An ARRAY since groups: one secret per seat that is not the
      // organiser's, which for this Dúo probe is one.
      invitationTokens: [randomBytes(32).toString("base64url")],
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
  // The walk redacts its own output; this is the wrapper's own message, and it
  // can carry whatever the child was doing when it gave up.
  console.error(
    `\n✖ the hosted walk failed: ${redactDiagnostics(String(err.message))}`,
  );
  console.error(`   accounts: ${poolPath}`);
  process.exit(1);
}

console.log(`\n✔ hosted walk finished`);
console.log(`   accounts: ${poolPath}`);
console.log(`   outsider refusal: ${outsiderRefused}`);
