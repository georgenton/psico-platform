#!/usr/bin/env node
/**
 * seed-mood-history — backdated MoodLog generator for testing the affect
 * dynamics (Tier 2 OU) layer with real-shaped data.
 *
 * The OU fit needs mood observations SPREAD ACROSS DAYS (irregular Δt). You
 * can't get that by clicking the mood chip today — every row would land on the
 * same timestamp. This script inserts MoodLog rows dated across the past N days
 * for a given account, so you can open /dashboard/mapa and see the affect
 * dynamics block go "active".
 *
 * Privacy: only writes ordinal mood + a backdated createdAt. No text.
 *
 * ── SECURITY (C.1) ────────────────────────────────────────────────────────
 *
 * This writes SYNTHETIC EMOTIONS into an existing account, flagged
 * `moodEligibleForDynamics: true`, so the rows feed that person's affect
 * dynamics and change what their Emotional Map says about them. Until C.1 it had
 * no environment guard at all: it took whatever `DATABASE_URL` pointed at and a
 * `--email` of any stored account, which included production and real users.
 *
 * Two independent barriers now, and the second is the one that matters here.
 * BOTH are keyed to the declared POSTURE, never to a platform marker:
 *
 *   1. POSTURE — production is a hard deny that no variable lifts; a box that
 *      will not declare itself is denied the same way; a STAGING posture needs
 *      `ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1` for that single invocation.
 *      Classification comes from `scripts/seed-posture.mjs`, the same mirror the
 *      other seeds use — not a fresh comparison.
 *   2. TARGET NAMESPACE — in a staging environment the account must be
 *      `@psico.test`, EVEN WITH the authorization present. Authorizing an
 *      environment is not the same as authorizing every account stored in it,
 *      and this script's whole effect is to rewrite one person's emotional
 *      history.
 *
 * "Staging posture" and not "staging container": a laptop with
 * `PSICO_ENV=staging` and `DATABASE_URL` pointed at the staging database is
 * writing to staging, and the first version of this guard let exactly that
 * through because it asked `isDeployedPlatform()` instead. Where the database
 * actually is cannot be read from the environment, so the declared posture is
 * the only honest input.
 *
 * Locally the namespace is NOT enforced: pointing this at your own dev account
 * is the normal use, and a local box is not a shared one. The posture gate is
 * what keeps "local" honest.
 *
 * Usage (from apps/api, with DATABASE_URL pointing at the target DB):
 *   node scripts/seed-mood-history.mjs --email=you@example.com
 *   node scripts/seed-mood-history.mjs --email=you@example.com --days=90 --pattern=volatile --reset
 *
 * Under a staging posture, prefer the wrapper, which supplies the authorization to
 * the child process only:
 *   pnpm --filter @psico/api seed:staging:mood-history -- --email=demo-x@psico.test
 *
 * Flags:
 *   --email    (required) account to seed; `@psico.test` under a staging posture
 *   --days     window length in days (1..3650, default 90)
 *   --pattern  stable | volatile | improving | declining (default volatile)
 *   --skip     fraction of days to skip for irregular sampling, 0 ≤ skip < 1
 *   --reset    delete existing MoodLog in the window before inserting
 *              (`--reset=false` is honoured; any other value is refused)
 *
 * If REDIS_URL is set, the emotional-map cache for that user is busted so the
 * change shows up immediately.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";
// Classification only. The posture rules live in `prisma/seed-guard.ts`; this is
// the dependency-free mirror plain `node` can import, kept in step with the
// runtime resolver by `src/ops/seed-environment-conformance.spec.ts`.
import { isDeployedPlatform, seedPosture } from "./seed-posture.mjs";

const MOODS = ["hard", "low", "ok", "good", "great"];

/** The only patterns `moodForDay` actually implements. */
export const MOOD_PATTERNS = ["stable", "volatile", "improving", "declining"];

/**
 * Accounts this may touch on a deployed box.
 *
 * The same namespace the QA and demo fixtures mint into, so "synthetic" is a
 * property of the address rather than a list somebody has to maintain.
 */
export const SYNTHETIC_EMAIL_SUFFIX = "@psico.test";

/** Keeps `--days=36500` from generating a decade of rows by accident. */
const MAX_DAYS = 3650;

// PR-2A · seeded MoodLog rows are canonical + explicit + eligible, but their
// provenance is SEED — NOT MOOD_LOG: seeded rows must not masquerade as real
// user taps. Raw `mood` is preserved; these are the additive normalization
// columns (kept inline — this is a plain .mjs).
function moodNorm(mood) {
  return {
    moodNormalized: mood, // seed moods are always canonical
    moodProvenance: "SEED",
    moodExplicitlySelected: true,
    moodVocabularyVersion: "diary-v1",
    moodNormalizerVersion: "norm-1",
    moodClientVersion: "seed",
    // PR-2B · versioned attestation for seeded moods (see seed-demo-users.mjs).
    moodSelectionVersion: "seed-v1",
    moodEligibleForDynamics: true,
    moodExclusionReason: null,
  };
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/**
 * Resolve + VALIDATE everything from argv + env. Pure and side-effect free, and
 * called FIRST in `main()` — before the Pool, the PrismaClient or Redis exist,
 * so a refusal costs no connection. That ordering is testable: point
 * `DATABASE_URL` at an unreachable host and a refused run still fails on the
 * guard, never on the socket.
 *
 * Order is policy:
 *
 *   1. posture — production, then undeclared-deployed. Neither is lifted by any
 *      variable. Environment first so the message sends the operator to the box
 *      rather than to their arguments.
 *   2. authorization — deployed staging needs the existing QA/demo variable.
 *      No new vocabulary: one switch for the hazard "writes to a host that
 *      answers to the internet".
 *   3. target account — on a deployed box, `@psico.test` only, even WITH the
 *      authorization. See the file header.
 *   4. arguments — fail-closed on anything that is not a value this script can
 *      actually act on.
 *
 * @param {{ argv: string[], env: Record<string, string | undefined> }} io
 * @returns {{ email: string, days: number, pattern: string, skip: number, reset: boolean }}
 */
export function resolveMoodSeedConfig({ argv, env }) {
  const args = parseArgs(argv);
  const posture = seedPosture(env);

  // ── 1. Posture ──────────────────────────────────────────────────────────
  if (posture === "production") {
    throw new Error(
      "Refusing to write mood history against PRODUCTION.\n" +
        "This is not a missing-authorization error and no environment variable " +
        "lifts it — including for a @psico.test address. The rows this inserts " +
        "are flagged eligible for affect dynamics, so they change what a " +
        "person's Emotional Map says about them.\n" +
        "If production needs mood data investigated, read it; do not write it.",
    );
  }

  if (posture === "invalid") {
    throw new Error(
      isDeployedPlatform(env)
        ? "Refusing to write mood history: this box is deployed but does not " +
            "declare a valid posture.\n" +
            "Set PSICO_ENV=production or PSICO_ENV=staging on the RESOURCE, not " +
            "on the command. NODE_ENV is not accepted here — a build sets it for " +
            "reasons that say nothing about safety posture.\n" +
            "No authorization variable lifts this: a posture nobody declared " +
            "cannot be turned into staging by naming staging on the command line."
        : "Refusing to write mood history: PSICO_ENV is set to a value this " +
            "does not recognize.\n" +
            "It must be one of production | staging | development | test. Check " +
            'it for a typo — "prod" and "stage" are not accepted, deliberately, ' +
            "because a value nobody can interpret must not be read as a " +
            "development machine while DATABASE_URL points somewhere real.",
    );
  }

  // ── 2. Authorization, decided by POSTURE ────────────────────────────────
  //
  // `posture === "staging"`, NOT `isDeployedPlatform(env)`. The first version
  // gated on the platform marker and that was a real bypass: a laptop with
  // `PSICO_ENV=staging` and `DATABASE_URL` pointed at the staging database
  // classifies as staging but carries no Coolify/Railway marker, so neither the
  // authorization nor the namespace restriction applied — and the script wrote
  // to a real account with `--reset`, unauthorized. Reproduced before fixing.
  //
  // It also made this script WEAKER than its siblings, which both decide by
  // posture: `assertSeedAllowed` refuses that same environment with
  // `StagingSeedNotAuthorizedError`, and `seed-demo-users.mjs` refuses it too.
  // The conformance table could not catch the divergence because it pins
  // CLASSIFICATION, and this was an AUTHORIZATION policy that disagreed with
  // its own classifier.
  //
  // The lesson generalizes: the posture is the answer to "how much does a
  // mistake cost here", and the platform marker only ever answered "is a vendor
  // telling us where we are". Where the database is cannot be read from the
  // environment at all, so the declared posture is the only honest input.
  const isStaging = posture === "staging";
  if (isStaging && env.ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX !== "1") {
    // Exactly "1" — not "true", not "on", not "01". A loose check is how a
    // bypass gets switched on by a value somebody typed for another reason.
    throw new Error(
      "Refusing to write mood history against a STAGING environment without " +
        "authorization.\n" +
        "Staging answers to the internet and its accounts are reachable, and " +
        "this applies wherever the command runs: a laptop pointed at the " +
        "staging database is writing to staging.\n" +
        "To do it deliberately, set ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 for " +
        "that single invocation. Never persist it as a service variable.",
    );
  }

  // ── 3. Target account ───────────────────────────────────────────────────
  const email = typeof args.email === "string" ? args.email.trim() : "";
  if (!email) {
    throw new Error(
      "--email is required and has no default. Pass --email=someone@psico.test.",
    );
  }

  const normalized = email.toLowerCase();
  const localPart = normalized.slice(
    0,
    normalized.length - SYNTHETIC_EMAIL_SUFFIX.length,
  );
  // `endsWith` plus a non-empty local part: `@psico.test` alone is not an
  // address, and `x@psico.test.example.com` does not end with the suffix.
  const isSynthetic =
    normalized.endsWith(SYNTHETIC_EMAIL_SUFFIX) && localPart.length > 0;

  // Same correction as the authorization gate: keyed to the POSTURE, so a
  // laptop pointed at the staging database is held to the same namespace as a
  // command run inside the staging container.
  if (isStaging && !isSynthetic) {
    throw new Error(
      `Refusing to write mood history to an account outside ${SYNTHETIC_EMAIL_SUFFIX} ` +
        "in a STAGING environment.\n" +
        "The authorization variable authorizes the ENVIRONMENT, not every " +
        "account stored in it. This script rewrites one person's emotional " +
        "history, so on a shared database it may only touch the synthetic " +
        "namespace.\n" +
        `Use an address ending in ${SYNTHETIC_EMAIL_SUFFIX}.`,
    );
  }

  // ── 4. Arguments, fail-closed ───────────────────────────────────────────
  const days = Number(args.days ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    // `Number("abc")` is NaN and `Number("Infinity")` is Infinity. The old code
    // took either: NaN produced a loop that never ran and an Invalid Date
    // window, and Infinity produced a loop that never ENDED.
    throw new Error(
      `--days must be a whole number between 1 and ${MAX_DAYS} (got ${JSON.stringify(args.days ?? 90)}).`,
    );
  }

  const pattern = String(args.pattern ?? "volatile");
  if (!MOOD_PATTERNS.includes(pattern)) {
    // Previously a `default:` arm in the switch, so a typo silently produced
    // the volatile curve and the operator read the resulting map as their own
    // chosen pattern. A CLI that quietly substitutes a different behaviour is
    // worse than one that stops.
    throw new Error(
      `--pattern must be one of ${MOOD_PATTERNS.join(" | ")} (got ${JSON.stringify(pattern)}).`,
    );
  }

  const skip = Number(args.skip ?? 0.25);
  if (!Number.isFinite(skip) || skip < 0 || skip >= 1) {
    // skip = 1 would skip every day and insert nothing while reporting success;
    // NaN compared false against Math.random() and skipped nothing at all.
    throw new Error(
      `--skip must be a number where 0 <= skip < 1 (got ${JSON.stringify(args.skip ?? 0.25)}).`,
    );
  }

  // `Boolean("false")` is TRUE, so `--reset=false` used to DELETE — somebody
  // writing what looks like an explicit opt-out got the destructive branch.
  //
  // The rule is: `--reset` and `--reset=true` delete, `--reset=false` does not,
  // and any OTHER value is refused rather than guessed. An earlier comment here
  // said "nothing else", which read as though `=false` were rejected too; it is
  // honoured, because refusing somebody's explicit "no" would be its own small
  // trap. What must never come back is a value silently meaning its opposite.
  const resetRaw = args.reset;
  let reset;
  if (resetRaw === undefined) reset = false;
  else if (resetRaw === true || resetRaw === "true") reset = true;
  else if (resetRaw === "false") reset = false;
  else {
    throw new Error(
      `--reset takes no value (or =true / =false); got ${JSON.stringify(resetRaw)}. ` +
        "It deletes rows, so it is not inferred from an unrecognized value.",
    );
  }

  return { email, days, pattern, skip, reset };
}

function moodForDay(pattern, i, total) {
  // i = 0 (oldest) .. total-1 (most recent)
  const t = total <= 1 ? 0 : i / (total - 1); // 0..1
  const noise = () => Math.floor(Math.random() * 3) - 1; // -1,0,1
  const clampIdx = (n) => Math.max(0, Math.min(MOODS.length - 1, n));
  switch (pattern) {
    case "stable":
      return MOODS[clampIdx(3 + noise())]; // around "good"
    case "improving":
      return MOODS[clampIdx(Math.round(t * 4) + noise())];
    case "declining":
      return MOODS[clampIdx(Math.round((1 - t) * 4) + noise())];
    case "volatile":
    default:
      return MOODS[clampIdx(i % 2 === 0 ? 4 + noise() : 0 + noise())];
  }
}

async function bustCache(userId) {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { default: IORedis } = await import("ioredis");
    const redis = new IORedis(url, { maxRetriesPerRequest: 1 });
    await redis.del(`emotional-map:${userId}`);
    await redis.quit();
    console.log("• Busted emotional-map cache");
  } catch (e) {
    console.warn("• Could not bust cache (non-fatal):", e.message);
  }
}

async function main() {
  // Guard FIRST — posture, authorization, target account and arguments all
  // resolve before a Pool, a PrismaClient or a Redis client exists, so a refused
  // run never opens a connection to the database it was refused from.
  const { email, days, pattern, skip, reset } = resolveMoodSeedConfig({
    argv: process.argv,
    env: process.env,
  });

  // Prisma 7 requires an explicit driver adapter (same as the app's PrismaService).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`ERROR: no user with email ${email}`);
      process.exit(1);
    }

    const now = Date.now();
    const windowStart = new Date(now - days * 86400_000);

    if (reset) {
      const del = await prisma.moodLog.deleteMany({
        where: { userId: user.id, createdAt: { gte: windowStart } },
      });
      console.log(`• Reset: deleted ${del.count} MoodLog rows in the window`);
    }

    const rows = [];
    for (let d = days - 1; d >= 0; d--) {
      if (Math.random() < skip) continue; // irregular sampling
      const i = days - 1 - d; // 0 = oldest
      // Randomize the time-of-day so Δt isn't a clean integer.
      const jitterMs = Math.floor(Math.random() * 86400_000);
      const createdAt = new Date(now - d * 86400_000 - jitterMs);
      const mood = moodForDay(pattern, i, days);
      rows.push({
        userId: user.id,
        mood,
        ...moodNorm(mood),
        createdAt,
      });
    }

    if (rows.length) {
      await prisma.moodLog.createMany({ data: rows });
    }
    console.log(
      `✓ Inserted ${rows.length} MoodLog rows for ${email} · pattern=${pattern} · window=${days}d`,
    );

    await bustCache(user.id);
    console.log(
      "→ Open /dashboard/mapa. With ≥8 mood points the 'Dinámica afectiva' block goes active.",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run only when invoked directly. Imported — the guard tests import
// `resolveMoodSeedConfig` — nothing runs: no connection, no process.exit.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e instanceof Error ? `Error: ${e.message}` : e);
    process.exit(1);
  });
}
