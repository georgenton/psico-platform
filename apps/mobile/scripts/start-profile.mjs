#!/usr/bin/env node
/**
 * start-profile — run the mobile app against a named environment, explicitly.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 *
 * `expo start` reads `apps/mobile/.env`, and the question "which API am I
 * talking to?" was answered by whatever was last typed into that file and
 * forgotten. The fix people reach for is editing it between sessions, which is
 * how a QA session ends up somewhere nobody chose.
 *
 * Since 2026-11-05 a retired platform in `.env` is refused outright by
 * `src/config/environment.ts`, in every profile. This wrapper is the other half
 * of that: the refusal says where NOT to go, and `start:staging` makes where to
 * go a single command instead of an edit.
 *
 * ── The mechanism, and why it is this one ─────────────────────────────────
 *
 * This spawns Expo with the profile's variables in the CHILD's environment.
 * Verified against the installed `@expo/env@0.4.2`: it snapshots
 * `userDefinedEnvironment = {...process.env}` and a key already defined there is
 * "already defined and IS NOT overwritten" by any `.env` file. So the profile
 * wins, the developer's `.env` is never read, written, renamed or copied, and
 * any variable the profile does NOT declare still comes from `.env` as usual.
 *
 * The alternatives were measured and rejected:
 *
 *   - A committed `.env.staging`: Expo would never load it. Its dotenv mode
 *     comes from `NODE_ENV` and is restricted to development | test |
 *     production; `staging` is not a mode, and forcing it logs "non-conventional
 *     and might cause development code to run in production". `.gitignore` also
 *     covers `.env`, `.env.local`, `.env.*.local`, `.env.development` and
 *     `.env.production` but NOT `.env.staging`, so the file would additionally
 *     be one `git add -A` away from being committed.
 *   - EAS environments: real value for installable builds, none for
 *     `expo start` on a laptop, and it would add a service dependency to the
 *     thing we are trying to make simple. Deferred with a decision, not an
 *     omission.
 *
 * Nothing is persisted: no file is written, no value is exported into the
 * operator's shell, and `process.env` of this wrapper is left alone.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(HERE, "..");

/**
 * The staging origins, mirrored from `src/config/environment.ts`.
 *
 * Mirrored because this is a runnable `.mjs` started by plain `node` and the
 * authority is TypeScript that only Metro compiles — the same bargain as
 * `apps/api/scripts/seed-posture.mjs`. And mirroring is only honest if
 * divergence is caught: `src/config/profiles.spec.ts` parses BOTH files and
 * fails the build the moment the two disagree, so the wrapper can never hand
 * Expo an origin that the app's own validation would then reject.
 */
const STAGING_API_ORIGIN = "https://api-staging.feelverse.app";
const STAGING_WEB_ORIGIN = "https://staging.feelverse.app";

/**
 * The profiles.
 *
 * `production` exists and is deliberately WITHOUT urls: production does not
 * exist as a Coolify resource yet, so there is no origin to write. The profile
 * fails closed and says why, which is more honest than quietly having no
 * production profile at all.
 */
const PROFILES = {
  staging: {
    env: {
      EXPO_PUBLIC_APP_ENV: "staging",
      EXPO_PUBLIC_API_URL: STAGING_API_ORIGIN,
      EXPO_PUBLIC_WEB_ORIGIN: STAGING_WEB_ORIGIN,
    },
    describe: "Coolify staging",
  },
  production: {
    env: null,
    describe: "not available yet — production is not a Coolify resource",
    blocked:
      "There is no production profile yet, on purpose.\n" +
      "FeelVerse production does not exist as a resource: the Coolify project " +
      "holds three applications and all three are staging, so there is no " +
      "origin to point this at. That `feelverse.app` resolves to the server " +
      "does not make it a destination.\n" +
      "This profile will be filled in when production exists and has its domain.",
  },
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const [name, ...passthrough] = process.argv.slice(2);

if (!name || !Object.hasOwn(PROFILES, name)) {
  fail(
    `Usage: node scripts/start-profile.mjs <${Object.keys(PROFILES).join("|")}> [-- …expo args]\n\n` +
      Object.entries(PROFILES)
        .map(([k, p]) => `  ${k.padEnd(12)} ${p.describe}`)
        .join("\n") +
      "\n\nFor a local run against your own API, use `pnpm start` with your .env.",
  );
}

const profile = PROFILES[name];
if (!profile.env) fail(profile.blocked);

// What the operator needs to see, and nothing else: the posture and the origins.
// No tokens, no Sentry DSN, no device identifiers — and notably not the
// developer's own `.env`, which this never reads.
console.log("");
console.log(`  environment: ${profile.env.EXPO_PUBLIC_APP_ENV}`);
console.log(`  api origin:  ${profile.env.EXPO_PUBLIC_API_URL}`);
console.log(`  web origin:  ${profile.env.EXPO_PUBLIC_WEB_ORIGIN}`);
console.log(`  (profile values apply to this run only — .env is untouched)`);
console.log("");

const child = spawn("expo", ["start", ...passthrough], {
  cwd: MOBILE_ROOT,
  stdio: "inherit",
  shell: false,
  // The profile lives only in the child's environment.
  env: { ...process.env, ...profile.env },
});

child.on("error", (err) => {
  fail(
    `Could not start Expo: ${err.message}\n` +
      "Is `expo` on PATH? Run this through the package script " +
      "(`pnpm --filter @psico/mobile start:staging`), which resolves the local " +
      "binary.",
  );
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
