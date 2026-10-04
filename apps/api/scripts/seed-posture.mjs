/**
 * The seed posture classifier, for runnable `.mjs` ops scripts.
 *
 * ── Why this exists as a mirror ───────────────────────────────────────────
 *
 * `prisma/seed-guard.ts` is the authority: it owns the posture rules, the three
 * authorization tokens and the refusal messages, and it has the test suite. This
 * file is a MIRROR of its classification half, and nothing more — no tokens, no
 * error classes, no policy.
 *
 * The mirror is not a preference. These scripts are started by plain `node`, and
 * the guard is TypeScript that never reaches `dist/` (`apps/api/tsconfig.json` is
 * `include: ["src/**\/*"]` with `rootDir: "./src"`, so `prisma/*.ts` is outside
 * every compile and every bundle). Plain Node cannot import it. The alternatives
 * were a build step for ops scripts — in front of code whose entire value is
 * refusing before anything is constructed — or this.
 *
 * A mirror is only honest if divergence is caught. `seed-environment-conformance`
 * runs this function, the TypeScript guard and the live runtime resolver over ONE
 * shared fixture table and fails the build the moment any two disagree. That is
 * the same bargain `seed-guard.ts` already documents for the runtime resolver,
 * and it is why the duplication is a liability with a tripwire rather than a
 * liability with a comment.
 *
 * Keep this file dependency-free. Importing anything that reads config, opens a
 * connection or logs would defeat the point of classifying before connecting.
 */

/**
 * Normalized because a stray space or capital must not open a guard:
 * `PSICO_ENV=" Production"` is production, and an exact `===` would have waved
 * it through. Loose in the direction of MORE refusals is the safe direction.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
export function marker(value) {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Is a hosting PLATFORM telling us this box is deployed?
 *
 * Mirrors `isDeployedPlatform` in the guard, which mirrors `deploymentPlatform()`
 * in the runtime resolver. Two deliberate exclusions carry over:
 *
 *   - `NODE_ENV` is not a deployment signal. A build sets it for its own
 *     reasons; our Coolify staging box carries `NODE_ENV=production`.
 *   - `COOLIFY_URL` / `COOLIFY_TOKEN` are how a CLIENT is configured to TALK to
 *     a Coolify, so any laptop with the CLI or the MCP configured carries them.
 *     Reading those as "I am deployed" would refuse on the maintainer's own
 *     machine, which is where these fixtures are legitimately used.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isDeployedPlatform(env) {
  if (marker(env.PSICO_DEPLOYED)) return true;
  if (
    marker(env.RAILWAY_ENVIRONMENT_NAME) ||
    marker(env.RAILWAY_ENVIRONMENT) ||
    marker(env.RAILWAY_PROJECT_ID) ||
    marker(env.RAILWAY_SERVICE_ID)
  ) {
    return true;
  }
  return Boolean(
    marker(env.COOLIFY_RESOURCE_UUID) || marker(env.COOLIFY_CONTAINER_NAME),
  );
}

/**
 * What kind of box this is. Same five answers as `seedPosture` in the guard.
 *
 * `"invalid"` is not an environment — it is the answer when the box is deployed
 * and will not say what it is. No token lifts it anywhere in this system: a
 * posture nobody declared cannot be turned into staging by typing a staging
 * token.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {"development" | "test" | "staging" | "production" | "invalid"}
 */
export function seedPosture(env) {
  const explicit = marker(env.PSICO_ENV);

  // ── Deployed: PSICO_ENV is the only word ────────────────────────────────
  if (isDeployedPlatform(env)) {
    if (explicit === "production" || explicit === "staging") return explicit;
    // Includes `PSICO_ENV=development` on a deployed box: a configuration
    // conflict, not a development machine. A deployed box does not get to opt
    // out of the barriers by renaming itself.
    return "invalid";
  }

  // ── Local / CI ──────────────────────────────────────────────────────────
  if (explicit === "production") return "production";
  if (explicit === "staging") return "staging";
  if (explicit === "test") return "test";
  if (explicit === "development") return "development";

  // A PSICO_ENV that is set but not one of the four is "invalid", not "whatever
  // NODE_ENV says". The runtime resolver throws on an unrecognized value here,
  // so falling through would have made `PSICO_ENV=prod` — the shorthand people
  // actually type — classify a box as a development machine while DATABASE_URL
  // pointed somewhere real.
  if (explicit) return "invalid";

  const node = marker(env.NODE_ENV);
  if (node === "test") return "test";
  if (node === "production") return "production";
  if (node === "staging") return "staging";

  return "development";
}
