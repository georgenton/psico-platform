#!/usr/bin/env node
/**
 * staging-seed — runs ONE seed against a STAGING box, with the authorization
 * token applied to the child process only.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * The seeds refuse on a deployed box unless a single-invocation token is set.
 * That is deliberate, and it means the honest way to refresh staging is a
 * command line with an inline `VAR=1`. Typed by hand, repeatedly, that is how a
 * token ends up pasted into a service's permanent environment "so it stops
 * failing" — which converts the guard into a permanent bypass.
 *
 * So this wrapper types it instead, and keeps it in the child's environment: it
 * is never written to a file, never exported into the operator's shell, and
 * never a Coolify variable. `process.env` of this wrapper is not mutated either,
 * so nothing downstream inherits it by accident.
 *
 * ── What this deliberately does NOT do ────────────────────────────────────
 *
 *   - It does not build or read `DATABASE_URL`. You run it where the connection
 *     already points at the box you mean. A wrapper that assembles a connection
 *     string is a wrapper that can assemble the wrong one.
 *   - It does not read any other secret.
 *   - It does not run migrations. Migrations are a deployment step; the seed is
 *     an administrative operation. Re-chaining them is exactly the mistake
 *     C.0A1 removed from the pre-deploy, and the whole reason the guards exist.
 *   - It does not chain seeds. One target per invocation, so "refresh the
 *     catalog" can never also mean "mint logins".
 *   - It does not check hostnames. A seed run cannot see one, and trusting a
 *     string that looks like a staging URL is how you seed production from a
 *     copied command. The posture marker on the resource is the evidence.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   node scripts/staging-seed.mjs catalog
 *   node scripts/staging-seed.mjs qa-users
 *   DEMO_USER_PASSWORD='…' node scripts/staging-seed.mjs demo-users
 *
 * Or through the package scripts: `seed:staging:catalog`,
 * `seed:staging:qa-users`, `seed:staging:demo-users`.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isDeployedPlatform, seedPosture } from "./seed-posture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, "..");
// The workspace's own ts-node, by path. `pnpm exec` would work too, but resolving
// the bin ourselves keeps the child one process deep and makes a missing
// dependency an obvious error instead of a package-manager message.
const TS_NODE = resolve(API_ROOT, "node_modules/.bin/ts-node");
/**
 * `--transpile-only`, measured rather than assumed.
 *
 * Compiling `prisma/seed.ts` with full type checking peaks at ~837 MiB RSS and
 * takes ~3.9s; transpile-only peaks at ~269 MiB and takes ~0.5s. A deployed
 * container is where that difference decides whether the run completes, and the
 * honest fix is to stop paying for a compile at run time — NOT to raise the
 * service's memory limit, which would make the cost permanent to buy nothing.
 *
 * It drops type checking, which until now was the ONLY thing checking these
 * files: `tsconfig.json` is `include: ["src/**\/*"]`, so `prisma/*.ts` was
 * outside both `pnpm typecheck` and `pnpm build`. That gap is closed by
 * `tsconfig.seed.json`, wired into `pnpm typecheck` — so the check moved from
 * the operator's run to CI, which is where it belonged.
 */
const TS_NODE_ARGS = ["--transpile-only"];

/**
 * One target per entry. The token each one needs is the token for ITS hazard:
 *
 *   - `catalog` rewrites curated content → the catalog seed's own switch.
 *   - `qa-users` and `demo-users` mint working logins on a host that answers to
 *     the internet → the QA fixture's switch, shared because it is one hazard.
 *
 * Neither substitutes for the other, and neither is production's.
 */
const TARGETS = {
  catalog: {
    token: "ALLOW_STAGING_BOOTSTRAP_SEED",
    command: [TS_NODE, ...TS_NODE_ARGS, "prisma/seed.ts"],
    describe: "catalog (books, chapters, prompts, therapists)",
  },
  "qa-users": {
    token: "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX",
    command: [TS_NODE, ...TS_NODE_ARGS, "prisma/seed-test.ts"],
    describe: "QA user fixture (working logins, one ADMIN)",
  },
  "demo-users": {
    token: "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX",
    command: ["node", "scripts/seed-demo-users.mjs"],
    describe: "demo accounts with synthetic activity",
  },
  // Writes synthetic mood history into ONE existing account, so it needs
  // `-- --email=…` and refuses anything outside `@psico.test` on a deployed box.
  // Same variable as the account fixtures: same hazard, one switch.
  "mood-history": {
    token: "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX",
    command: ["node", "scripts/seed-mood-history.mjs"],
    describe: "backdated MoodLog for one @psico.test account (needs --email)",
  },
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const [target, ...passthrough] = process.argv.slice(2);

if (!target || !Object.hasOwn(TARGETS, target)) {
  fail(
    `Usage: node scripts/staging-seed.mjs <${Object.keys(TARGETS).join("|")}> [-- …args]\n\n` +
      Object.entries(TARGETS)
        .map(([name, t]) => `  ${name.padEnd(12)} ${t.describe}`)
        .join("\n") +
      "\n\nOne target per invocation, deliberately. There is no 'all'.",
  );
}

// ── The posture gate ───────────────────────────────────────────────────────
//
// Checked HERE as well as inside the seed, and the duplication is the point:
// this wrapper's job is to supply a token, so it must be sure which box it is
// supplying it for BEFORE it does. The seed's own guard stays the authority and
// would still refuse — this just means the wrapper never hands a staging token
// to something that is not staging.
const posture = seedPosture(process.env);

if (posture !== "staging") {
  const detail =
    posture === "production"
      ? "This box reports PRODUCTION. This wrapper exists for staging and will " +
        "not hand a token to production. Production seeding is an explicit, " +
        "separate decision — and the QA/demo fixtures refuse it outright."
      : posture === "invalid"
        ? isDeployedPlatform(process.env)
          ? "This box is deployed but does not declare a valid posture. Set " +
            "PSICO_ENV=staging on the RESOURCE, not on this command. No " +
            "variable lifts an undeclared posture."
          : // The distinction matters: told "this box is deployed", an operator
            // goes looking for a platform problem that is really a typo.
            "PSICO_ENV is set to a value this does not recognize. It must be " +
            'one of production | staging | development | test — "prod" and ' +
            '"stage" are not accepted, deliberately.'
        : `This box reports ${posture.toUpperCase()}, not staging. Run the seed ` +
          "directly — a local box needs no authorization variable.";

  fail(`Refusing to apply a staging authorization token.\n${detail}`);
}

const { token, command } = TARGETS[target];
const [bin, ...args] = command;

console.log(`→ staging seed · ${target} · ${TARGETS[target].describe}`);
console.log(`   authorization: ${token}=1, for this child process only`);

const result = spawnSync(bin, [...args, ...passthrough], {
  cwd: API_ROOT,
  stdio: "inherit",
  // The token exists only in this child's environment. `process.env` of the
  // wrapper is untouched, so nothing else in this shell inherits it.
  env: { ...process.env, [token]: "1" },
});

if (result.error) {
  fail(`Could not start the seed: ${result.error.message}`);
}

process.exit(result.status ?? 1);
