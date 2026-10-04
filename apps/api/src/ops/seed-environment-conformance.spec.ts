import { describe, expect, it } from "vitest";

import { seedPosture } from "../../prisma/seed-guard";
// The dependency-free mirror the runnable `.mjs` ops scripts import. Plain Node
// cannot load the TypeScript guard, so this is the copy that actually runs when
// an operator types `node scripts/seed-demo-users.mjs`.
import { seedPosture as mjsSeedPosture } from "../../scripts/seed-posture.mjs";
// The runtime AUTHORITY. Imported through the neutral shim, which is what the
// rest of the codebase uses; the implementation lives in cache-identity.
import { resolveEnvironment } from "../shared/psico-environment";

/**
 * One table, three implementations of the same question.
 *
 * ── Why this test exists ──────────────────────────────────────────────────
 *
 * "What kind of box is this?" is answered in three places, and they cannot be
 * one place:
 *
 *   - `resolveEnvironment()` is the semantic AUTHORITY. It reads `process.env`
 *     directly and THROWS on a box it cannot classify, which is correct for a
 *     server that must not boot in an unknown posture.
 *   - `seedPosture()` in the Prisma guard takes an injectable `env` and returns
 *     a value instead of throwing, because a CLI's right answer is a legible
 *     refusal naming the variable to set — and because a matrix exercised as
 *     data beats one that mutates the process and hopes the restore ran.
 *   - `seed-posture.mjs` is the same classification for scripts started by
 *     plain `node`, which cannot import TypeScript that never reaches `dist/`.
 *
 * Three copies of a safety rule is a liability. This is the tripwire that makes
 * it an acceptable one: every row below is classified by all three, and any
 * disagreement fails the build.
 *
 * ── Scope: classification, NOT authorization ──────────────────────────────
 *
 * This asserts only what KIND of box each input describes. What a given posture
 * then permits — which variable, whether production is a hard deny, whether a
 * variable is exactly `"1"` — is policy, it differs by caller on purpose, and it
 * is covered in `seed-guard.spec.ts`. Conflating the two here would mean a
 * deliberate policy difference reads as a conformance failure.
 *
 * ── It has already paid for itself ────────────────────────────────────────
 *
 * The `PSICO_ENV=prod` row below is the reason. The runtime threw on it; the
 * seed guard answered "development" and ran with no authorization at all. Since
 * the seed picks its database from `DATABASE_URL` and never from `PSICO_ENV`, a
 * laptop pointed at the production database plus that one typo reached exactly
 * the failure the guard exists to prevent. Nothing but a side-by-side table
 * would have shown it.
 */

/**
 * `"throws"` means the runtime refuses to classify — the fail-closed cases. The
 * seed resolvers must answer `"invalid"` there: same verdict, different shape,
 * because a CLI explains itself instead of crashing.
 */
type Expected = "production" | "staging" | "development" | "test" | "throws";

interface Row {
  readonly what: string;
  readonly env: Record<string, string | undefined>;
  readonly expect: Expected;
}

const TABLE: readonly Row[] = [
  // ── Local / CI ──────────────────────────────────────────────────────────
  { what: "a bare local box", env: {}, expect: "development" },
  {
    what: "local, NODE_ENV=test (the test runner's own shape)",
    env: { NODE_ENV: "test" },
    expect: "test",
  },
  {
    what: "local, NODE_ENV=development",
    env: { NODE_ENV: "development" },
    expect: "development",
  },
  {
    what: "local, PSICO_ENV=development",
    env: { PSICO_ENV: "development" },
    expect: "development",
  },
  {
    what: "local, PSICO_ENV=test",
    env: { PSICO_ENV: "test" },
    expect: "test",
  },
  {
    what: "local, NODE_ENV=production (a build default, not a deployment)",
    env: { NODE_ENV: "production" },
    expect: "production",
  },
  {
    what: "local, PSICO_ENV=production (someone pointed a laptop at prod)",
    env: { PSICO_ENV: "production" },
    expect: "production",
  },
  {
    what: "local, PSICO_ENV=staging",
    env: { PSICO_ENV: "staging" },
    expect: "staging",
  },
  {
    what: "PSICO_ENV wins over a contradicting NODE_ENV",
    env: { PSICO_ENV: "staging", NODE_ENV: "production" },
    expect: "staging",
  },
  {
    what: "PSICO_ENV normalized — leading space and capital",
    env: { PSICO_ENV: " Production" },
    expect: "production",
  },

  // ── Fail-closed: a value nobody can interpret ───────────────────────────
  {
    // The row that found the divergence.
    what: "local, PSICO_ENV=prod (a typo, and the shorthand people type)",
    env: { PSICO_ENV: "prod" },
    expect: "throws",
  },
  {
    what: "local, PSICO_ENV=stage (same typo, other word)",
    env: { PSICO_ENV: "stage" },
    expect: "throws",
  },
  {
    what: "an uninterpretable PSICO_ENV is not rescued by NODE_ENV",
    env: { PSICO_ENV: "zzz", NODE_ENV: "production" },
    expect: "throws",
  },

  // ── Deployed: PSICO_ENV is the only word ────────────────────────────────
  {
    what: "Coolify staging as it really is (NODE_ENV=production on the box)",
    env: {
      COOLIFY_RESOURCE_UUID: "res-abc",
      PSICO_ENV: "staging",
      NODE_ENV: "production",
    },
    expect: "staging",
  },
  {
    what: "Railway production as it really is",
    env: { RAILWAY_ENVIRONMENT_NAME: "production", PSICO_ENV: "production" },
    expect: "production",
  },
  {
    what: "our own neutral marker, declared",
    env: { PSICO_DEPLOYED: "1", PSICO_ENV: "staging" },
    expect: "staging",
  },
  {
    what: "deployed and silent (Railway)",
    env: { RAILWAY_ENVIRONMENT_NAME: "production" },
    expect: "throws",
  },
  {
    what: "deployed and silent (Railway project id only)",
    env: { RAILWAY_PROJECT_ID: "proj-1" },
    expect: "throws",
  },
  {
    what: "deployed and silent (Railway service id only)",
    env: { RAILWAY_SERVICE_ID: "svc-1" },
    expect: "throws",
  },
  {
    what: "deployed and silent (Coolify container name only)",
    env: { COOLIFY_CONTAINER_NAME: "api-xyz" },
    expect: "throws",
  },
  {
    what: "deployed and silent (our own marker only)",
    env: { PSICO_DEPLOYED: "1" },
    expect: "throws",
  },
  {
    what: "deployed, with NODE_ENV but no PSICO_ENV — NODE_ENV is not a posture",
    env: { PSICO_DEPLOYED: "1", NODE_ENV: "production" },
    expect: "throws",
  },
  {
    what: "deployed, calling itself development",
    env: { COOLIFY_RESOURCE_UUID: "res-abc", PSICO_ENV: "development" },
    expect: "throws",
  },
  {
    what: "deployed, calling itself test",
    env: { PSICO_DEPLOYED: "1", PSICO_ENV: "test" },
    expect: "throws",
  },

  // ── A configured CLIENT is not a deployed box ───────────────────────────
  {
    // Hard-won: COOLIFY_URL / COOLIFY_TOKEN are how a client is configured to
    // TALK to a Coolify, so the maintainer's own laptop carries them. Reading
    // them as "deployed" would refuse exactly where seeding is routine.
    what: "a laptop with the Coolify CLI configured",
    env: { COOLIFY_URL: "https://coolify.example", COOLIFY_TOKEN: "redacted" },
    expect: "development",
  },
];

/**
 * Run the runtime resolver against one row.
 *
 * It reads `process.env` directly, so this is the one place the process has to
 * be mutated. The restore is in `finally` so a thrown row — and a third of the
 * table throws by design — cannot leak a posture into the rest of the suite.
 * Keys absent from the row are DELETED rather than left alone, because an
 * inherited `PSICO_ENV` or a CI runner's `RAILWAY_*` would silently rewrite
 * every expectation below.
 */
function runtimeVerdict(env: Record<string, string | undefined>): Expected {
  const keys = [
    "PSICO_ENV",
    "NODE_ENV",
    "PSICO_DEPLOYED",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
    "COOLIFY_RESOURCE_UUID",
    "COOLIFY_CONTAINER_NAME",
    "COOLIFY_URL",
    "COOLIFY_TOKEN",
  ];
  const saved = new Map(keys.map((k) => [k, process.env[k]]));

  try {
    for (const k of keys) {
      const value = env[k];
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
    return resolveEnvironment();
  } catch {
    return "throws";
  } finally {
    for (const [k, value] of saved) {
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  }
}

/** A seed resolver's verdict, mapped onto the runtime's vocabulary. */
function seedVerdict(posture: string): Expected {
  return posture === "invalid" ? "throws" : (posture as Expected);
}

describe("seed environment conformance · one table, three resolvers", () => {
  it.each(TABLE.map((row) => [row.what, row] as const))("%s", (_what, row) => {
    const runtime = runtimeVerdict(row.env);
    const guard = seedVerdict(seedPosture(row.env));
    const mjs = seedVerdict(mjsSeedPosture(row.env));

    // The expectation is asserted against the AUTHORITY first. If the runtime
    // ever changes its mind about a row, this fails here — on the row's
    // meaning — rather than showing up as two resolvers agreeing with each
    // other and both being wrong.
    expect(runtime).toBe(row.expect);
    expect(guard).toBe(row.expect);
    expect(mjs).toBe(row.expect);
  });

  it("the table covers both fail-closed shapes and the agreeable cases", () => {
    // A conformance table that only contained rows everybody already agrees on
    // would pass forever and prove nothing. The counts are asserted so trimming
    // the interesting rows is a visible change, not a quiet one.
    const throwing = TABLE.filter((r) => r.expect === "throws");
    expect(throwing.length).toBeGreaterThanOrEqual(10);
    // Deployed-and-silent, and uninterpretable-value: the two distinct ways a
    // box declines to identify itself.
    expect(throwing.some((r) => r.env.PSICO_ENV === undefined)).toBe(true);
    expect(
      throwing.some(
        (r) => r.env.PSICO_ENV !== undefined && !r.env.PSICO_DEPLOYED,
      ),
    ).toBe(true);
    expect(TABLE.filter((r) => r.expect !== "throws").length).toBeGreaterThan(
      10,
    );
  });

  it("restores process.env exactly, including keys it had to delete", () => {
    // The guarantee the `finally` is making. Without it, one throwing row could
    // leave `PSICO_ENV` set and quietly reclassify everything that runs after.
    const before = JSON.stringify(
      Object.fromEntries(
        Object.entries(process.env).filter(([k]) =>
          /^(PSICO_|RAILWAY_|COOLIFY_|NODE_ENV)/.test(k),
        ),
      ),
    );

    for (const row of TABLE) runtimeVerdict(row.env);

    const after = JSON.stringify(
      Object.fromEntries(
        Object.entries(process.env).filter(([k]) =>
          /^(PSICO_|RAILWAY_|COOLIFY_|NODE_ENV)/.test(k),
        ),
      ),
    );
    expect(after).toBe(before);
  });

  it("the two seed resolvers agree on inputs the table does not enumerate", () => {
    // The table is hand-written, so it can only cover what somebody thought of.
    // This sweeps the cross-product of the signals that matter and asserts the
    // TypeScript guard and the `.mjs` mirror never diverge — the pair most
    // likely to drift, since they are literally two copies.
    const postures = [
      undefined,
      "production",
      "staging",
      "development",
      "test",
      "prod",
      " STAGING ",
      "",
    ];
    const nodes = [undefined, "production", "test", "development", ""];
    const markers: Record<string, string | undefined>[] = [
      {},
      { PSICO_DEPLOYED: "1" },
      { RAILWAY_ENVIRONMENT: "prod-env" },
      { COOLIFY_RESOURCE_UUID: "res-abc" },
      { COOLIFY_URL: "https://coolify.example" },
    ];

    let checked = 0;
    for (const PSICO_ENV of postures) {
      for (const NODE_ENV of nodes) {
        for (const marker of markers) {
          const env = { ...marker, PSICO_ENV, NODE_ENV };
          expect(mjsSeedPosture(env)).toBe(seedPosture(env));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(postures.length * nodes.length * markers.length);
  });
});
