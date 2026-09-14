#!/usr/bin/env node
/**
 * One durable account for the people who will actually try the Dúo.
 *
 * The pool a hosted run registers is disposable by design: the next run writes
 * a new allowlist, and yesterday's accounts stop being admitted mid-sentence.
 * Somebody who was given one of those would open the room a week later and be
 * told, correctly and uselessly, that the activity is not available.
 *
 * So the person who organises gets an account of their own, added to the
 * allowlist ALONGSIDE whatever is already there, and recorded in `hosted.json`
 * as `extraAllowlistIds` so every later run keeps admitting it.
 *
 * The account is registered through the ordinary endpoint and is an ordinary
 * account: no special role, no test flag, no exception to any guard. What makes
 * it work is the same allowlist that governs everybody else in the pilot.
 *
 * The password is written to a file outside the repository, `0600`, and is
 * never printed. The email is printed, because somebody has to be told which
 * account to hand over.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-pilot-account.mjs --config <hosted.json>
 */

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const at = process.argv.indexOf("--config");
if (at < 0) {
  console.error("usage: hosted-pilot-account.mjs --config <path>");
  process.exit(2);
}
const cfgPath = process.argv[at + 1];
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));

const railway = (args) =>
  execFileSync("railway", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600_000,
  });

const OUT_DIR = join(homedir(), ".psico-ops");
const OUT_FILE = join(OUT_DIR, "circulos-hosted-pilot.env");

// ── the account ─────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const email = `circulos-piloto-${stamp}@example.test`;
const password = `Pw-${randomBytes(12).toString("base64url")}`;

console.log(`▸ registering ${email}`);
const registered = await fetch(`${cfg.apiUrl}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, name: "Piloto Círculos" }),
});
if (registered.status >= 300) {
  console.error(`registration failed: ${registered.status}`);
  process.exit(1);
}
const userId = (await registered.json().catch(() => ({})))?.user?.id ?? null;
if (!userId) {
  console.error("registration returned no user id");
  process.exit(1);
}

// The token is taken now, before the redeploy: login is capped and a JWT
// survives a restart because the signing secret does not change.
const token = await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.accessToken ?? body?.tokens?.accessToken ?? null;
})();
if (!token) {
  console.error("could not sign in as the new account");
  process.exit(1);
}

// The app sends every new account through onboarding, and the middleware holds
// them there until it is closed — including on the way to `/dashboard/circulos`.
// Somebody handed this account would otherwise open the start URL and land in a
// four-step questionnaire wondering whether they were given the wrong link. So
// it is closed here, through the ordinary endpoint the "Saltar" button calls.
const skipped = await fetch(`${cfg.apiUrl}/api/onboarding/skip`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
});
console.log(`▸ onboarding closed → ${skipped.status}`);

// ── the allowlist, added to rather than replaced ─────────────────────────────

const target = (service) => [
  "--project", cfg.projectId,
  "--environment", cfg.environmentId,
  "--service", service,
];

const current = JSON.parse(
  railway(["variables", ...target(cfg.apiServiceId), "--json"]),
);
const existing = (current.CIRCLES_PILOT_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (existing.includes(userId)) {
  console.log("   already on the allowlist");
}
const allowlist = [...new Set([...existing, userId])].join(",");

console.log(`▸ allowlist: ${existing.length} → ${allowlist.split(",").length}`);
for (const service of [cfg.apiServiceId, cfg.workerServiceId]) {
  railway([
    "variables",
    ...target(service),
    "--skip-deploys",
    "--set", `CIRCLES_PILOT_USER_IDS=${allowlist}`,
  ]);
  railway(["redeploy", ...target(service), "--yes"]);
}

// ── wait for the deployment that KNOWS this account ──────────────────────────

console.log("▸ waiting until the API has booted with it");
const deadline = Date.now() + 900_000;
let last = "";
let ready = false;
while (Date.now() < deadline) {
  const res = await fetch(`${cfg.apiUrl}/api/circles/access`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (res?.status === 200) {
    ready = true;
    break;
  }
  const said = `${res?.status ?? "no answer"}`;
  if (said !== last) {
    last = said;
    console.log(`   still waiting — ${said}`);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
if (!ready) {
  console.error("the account never became eligible; leaving it registered");
  process.exit(1);
}

// One real creation, through the same endpoint the screen uses, so "it works"
// is observed rather than inferred from the allowlist being right.
const created = await fetch(`${cfg.apiUrl}/api/circles/duo`, {
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
console.log(`   creation check → ${created.status}`);

// ── where the credentials live ───────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT_FILE,
  [
    "# Círculos — hosted pilot account (SYNTHETIC test environment).",
    "# Not a production account. Nothing here belongs to a real person.",
    "# Technical test: use made-up answers, never intimate or clinical material.",
    `CIRCULOS_PILOT_WEB=${cfg.webUrl}`,
    `CIRCULOS_PILOT_START_URL=${cfg.webUrl}${cfg.startPath ?? "/dashboard/circulos"}`,
    `CIRCULOS_PILOT_EMAIL=${email}`,
    `CIRCULOS_PILOT_PASSWORD=${password}`,
    `CIRCULOS_PILOT_USER_ID=${userId}`,
    `CIRCULOS_PILOT_CREATED=${new Date().toISOString()}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(OUT_FILE, 0o600);

// Remember it in the config, so the next run's allowlist keeps this account.
cfg.extraAllowlistIds = [...new Set([...(cfg.extraAllowlistIds ?? []), userId])];
writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);

console.log(`\n✔ pilot account ready: ${email}`);
console.log(`   credentials: ${OUT_FILE} (0600, outside the repository)`);
console.log(`   start here:  ${cfg.webUrl}${cfg.startPath ?? "/dashboard/circulos"}`);
