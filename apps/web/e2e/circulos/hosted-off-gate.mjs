#!/usr/bin/env node
/**
 * Close Círculos on the hosted environment, watch it refuse, open it again.
 *
 * §6 of the runbook is the procedure to reach for when something goes wrong in
 * front of real people: set `CIRCLES_ROLLOUT_MODE=off`, restart, and the
 * surfaces refuse. A procedure nobody has executed is a hope. This executes it
 * against the deployment, checks the refusal is the RIGHT one, and puts the
 * environment back exactly as it found it.
 *
 * Three things are worth being precise about:
 *
 *   · The probe distinguishes closed from broken. `/health` must stay `200`
 *     while the Círculos surfaces answer `503 CIRCLES_UNAVAILABLE`. A dead
 *     service also stops serving Círculos, and reading that as "the gate
 *     works" would be reading an outage as a feature.
 *
 *   · It checks an ALLOWLISTED member, not a stranger. Under `off` the
 *     allowlist stops mattering, and the only way to observe that is to be
 *     refused while holding the one credential that otherwise works.
 *
 *   · The mode is resolved once at boot and never re-read, so each change costs
 *     a redeploy. That is the design — a mid-flight env change cannot half-open
 *     a surface — and the reason this takes minutes rather than seconds.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-off-gate.mjs \
 *     --config <hosted.json> --accounts <pool.json>
 */

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : process.argv[at + 1];
};
const cfgPath = arg("--config");
const accountsPath = arg("--accounts");
if (!cfgPath || !accountsPath) {
  console.error(
    "usage: hosted-off-gate.mjs --config <path> --accounts <pool.json>",
  );
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const pool = JSON.parse(readFileSync(accountsPath, "utf8"));

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const railway = (args) =>
  execFileSync("railway", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600_000,
  });

const target = [
  "--project", cfg.projectId,
  "--environment", cfg.environmentId,
  "--service", cfg.apiServiceId,
];

/** The allowlist as it stands, so the restore is exact rather than approximate. */
const before = JSON.parse(railway(["variables", ...target, "--json"]));
const previousMode = before.CIRCLES_ROLLOUT_MODE ?? "";
const previousAllowlist = before.CIRCLES_PILOT_USER_IDS ?? "";
console.log(
  `▸ current mode: ${previousMode} · allowlist entries: ${
    previousAllowlist ? previousAllowlist.split(",").length : 0
  }`,
);

function setMode(mode, allowlist) {
  railway([
    "variables",
    ...target,
    "--skip-deploys",
    "--set", `CIRCLES_ROLLOUT_MODE=${mode}`,
    "--set", `CIRCLES_PILOT_USER_IDS=${allowlist}`,
  ]);
  railway(["redeploy", ...target, "--yes"]);
}

/** What the guest surface answers — the shape that tells closed from broken. */
async function guestSurface() {
  const res = await fetch(`${cfg.apiUrl}/api/circles/guest/session`, {
    headers: { "x-circle-guest-session": "probe-not-a-real-session" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body?.code ?? null };
}

async function health() {
  const res = await fetch(`${cfg.apiUrl}/health`);
  return res.status;
}

/** Whether an ALLOWLISTED member can create right now. */
async function memberCanCreate(token) {
  const res = await fetch(`${cfg.apiUrl}/api/circles/duo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      templateKey: cfg.templateKey,
      templateVersion: cfg.templateVersion,
      invitationToken: randomBytes(32).toString("base64url"),
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body?.code ?? null };
}

async function waitUntil(predicate, label, timeoutMs = 900_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const answer = await predicate();
      if (answer === true) return;
      if (answer && answer !== last) {
        last = answer;
        console.log(`   still waiting — ${answer}`);
      }
    } catch {
      /* the service is restarting; keep asking */
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`timed out waiting for ${label} (last: ${last})`);
}

// The member's token is taken ONCE, before anything is redeployed: login is
// capped at five per fifteen minutes and a JWT outlives a restart, since the
// signing secret does not change.
const account = pool.organiser ?? Object.values(pool)[0];
const token = await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.accessToken ?? body?.tokens?.accessToken ?? null;
})();
if (!token) {
  console.error("could not sign in as an allowlisted member");
  process.exit(1);
}

// ── closed ──────────────────────────────────────────────────────────────────

console.log("\n▸ closing Círculos (CIRCLES_ROLLOUT_MODE=off) and redeploying");
setMode("off", previousAllowlist);

await waitUntil(async () => {
  const g = await guestSurface();
  return g.status === 503 ? true : `guest surface ${g.status} ${g.code ?? ""}`;
}, "the guest surface to refuse");

const closedGuest = await guestSurface();
const closedHealth = await health();
const closedCreate = await memberCanCreate(token);

check(
  closedGuest.status === 503 && closedGuest.code === "CIRCLES_UNAVAILABLE",
  "the guest surface refuses with CIRCLES_UNAVAILABLE",
  `${closedGuest.status} ${closedGuest.code}`,
);
check(closedHealth === 200, "while /health still answers 200 — closed, not down", `${closedHealth}`);
check(
  closedCreate.status === 503,
  "an ALLOWLISTED member cannot create either — the list stops mattering",
  `${closedCreate.status} ${closedCreate.code}`,
);

// ── open again, exactly as it was ───────────────────────────────────────────

console.log("\n▸ restoring pilot with the same allowlist, and redeploying");
setMode(previousMode || "pilot", previousAllowlist);

await waitUntil(async () => {
  const g = await guestSurface();
  return g.status !== 503 ? true : "guest surface still closed";
}, "the guest surface to come back");

const openGuest = await guestSurface();
const openCreate = await memberCanCreate(token);

check(
  openGuest.status === 401 && openGuest.code === "CIRCLE_GUEST_SESSION_INVALID",
  "the guest surface is back and judging sessions on their merits",
  `${openGuest.status} ${openGuest.code}`,
);
check(
  openCreate.status === 201,
  "and the allowlisted member can create again",
  `${openCreate.status} ${openCreate.code ?? ""}`,
);

const after = JSON.parse(railway(["variables", ...target, "--json"]));
check(
  after.CIRCLES_ROLLOUT_MODE === previousMode &&
    (after.CIRCLES_PILOT_USER_IDS ?? "") === previousAllowlist,
  "the environment is left exactly as it was found",
  `mode ${after.CIRCLES_ROLLOUT_MODE}`,
);

console.log(
  failures === 0
    ? "\n✔ the off gate closes Círculos, and opening it again restores the pilot"
    : `\n✖ ${failures} check(s) failed — CHECK THE MODE BEFORE LEAVING THIS`,
);
process.exit(failures === 0 ? 0 : 1);
