/**
 * C.0A1 — the seed is an ADMINISTRATIVE operation, not a deployment step.
 *
 * Until C.0A1 the API's pre-deploy ran `migrate:deploy && prisma db seed`, so
 * every single production deployment replayed the whole seed. That is not a
 * theoretical concern: the seed wipes and reinserts `TherapistAvailability`,
 * rewrites `Journey.publishedAt` to the deploy timestamp, and forces
 * `isActive: true` on therapists and `isPublished: true` on books and
 * chapters — silently reverting anything operations or the content team had
 * changed. "Idempotent" describes the final state against the constants in the
 * file; it does not describe the damage on the way there.
 *
 * The seed command has been removed from the pre-deploy, and this guard is the
 * second line: if it is ever wired back in, or run by hand against production,
 * it refuses BEFORE the first Prisma call rather than discovering the problem
 * afterwards.
 *
 * Authorization is deliberately EPHEMERAL — an env var set for one invocation,
 * never a persisted Railway variable. A permanent variable would be a
 * permanent bypass, which is the thing this exists to prevent.
 */

/** Set for a single invocation. Exactly `"1"` — nothing else authorizes. */
export const SEED_AUTHORIZATION_VAR = "ALLOW_PRODUCTION_BOOTSTRAP_SEED";

/**
 * Authorization for the QA user fixture, deliberately SEPARATE from the
 * catalog seed's.
 *
 * One variable for both would mean that authorizing a catalog refresh also
 * authorizes minting an ADMIN login — two unrelated hazards behind one switch.
 * They are different questions and they get different answers.
 */
export const QA_SEED_AUTHORIZATION_VAR = "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX";

export interface SeedGuardEnv {
  RAILWAY_ENVIRONMENT_NAME?: string;
  NODE_ENV?: string;
  /**
   * The platform-neutral posture marker. On a deployed box this is the only
   * word that counts (cf. `resolveEnvironment()` in
   * `src/emotional-map/cache-identity.ts`), because NODE_ENV is set by tooling
   * for a hundred reasons that say nothing about our safety posture.
   */
  PSICO_ENV?: string;
  /** Neutral "I am deployed" marker — keeps working on the next platform. */
  PSICO_DEPLOYED?: string;
  RAILWAY_ENVIRONMENT?: string;
  RAILWAY_PROJECT_ID?: string;
  RAILWAY_SERVICE_ID?: string;
  COOLIFY_RESOURCE_UUID?: string;
  COOLIFY_CONTAINER_NAME?: string;
  [SEED_AUTHORIZATION_VAR]?: string;
  [QA_SEED_AUTHORIZATION_VAR]?: string;
}

export class ProductionSeedNotAuthorizedError extends Error {
  readonly code = "PRODUCTION_SEED_NOT_AUTHORIZED" as const;
  constructor() {
    // Sanitized on purpose: it explains the rule and how to authorize, and
    // carries no environment value, no connection string, no host.
    super(
      "Refusing to seed a production environment.\n" +
        "The seed is an administrative operation, not part of a deployment: it " +
        "rewrites curated catalogs and overwrites operationally managed data " +
        "(therapist availability, publication timestamps, active flags).\n" +
        `To run it deliberately, set ${SEED_AUTHORIZATION_VAR}=1 for that single ` +
        "invocation. Never persist it as a service variable.",
    );
    this.name = "ProductionSeedNotAuthorizedError";
  }
}

/**
 * Normalized because a stray space or capital must not open a guard:
 * `NODE_ENV=" production"` is production, and an exact `===` would have waved
 * it through. Widening what counts as production can only ever cause MORE
 * refusals, never fewer, so it is the safe direction to be loose in.
 */
function marker(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/** Any signal saying so — none is trusted alone. */
export function isProductionEnvironment(env: SeedGuardEnv): boolean {
  return (
    marker(env.PSICO_ENV) === "production" ||
    marker(env.RAILWAY_ENVIRONMENT_NAME) === "production" ||
    marker(env.NODE_ENV) === "production"
  );
}

/**
 * Is this a box the platform is hosting — production OR staging?
 *
 * A different question from `isProductionEnvironment`, for a different hazard,
 * and the reason both exist:
 *
 *   - The CATALOG seed's hazard is overwriting curated and operationally
 *     managed data. That is a production concern; wiping staging's therapist
 *     availability costs nobody anything.
 *   - The QA FIXTURE's hazard is a live ADMIN login on a host that answers to
 *     the internet. `api-staging.feelverse.app` answers to the internet, so
 *     staging is fully in scope. "Not production" is no comfort at all here.
 *
 * Hence this predicate, rather than loosening the production one. Loosening
 * shared detection to let staging through would have handed the catalog seed
 * a quieter refusal as a side effect — a guard weakened for an unrelated
 * script's convenience.
 *
 * The vendor markers mirror `deploymentPlatform()` in
 * `src/emotional-map/cache-identity.ts`, including its hard-won exclusion:
 * `COOLIFY_URL` / `COOLIFY_TOKEN` are how a CLIENT is configured to TALK to a
 * Coolify, so any laptop with the CLI or the MCP configured carries them.
 * Reading those as "I am deployed" would make this refuse on the maintainer's
 * own machine — which is where the fixture is legitimately used.
 */
export function isDeployedEnvironment(env: SeedGuardEnv): boolean {
  const posture = marker(env.PSICO_ENV);
  if (posture === "production" || posture === "staging") return true;

  // Neutral marker first: one variable WE set, which outlives any vendor.
  if (marker(env.PSICO_DEPLOYED)) return true;

  if (
    marker(env.RAILWAY_ENVIRONMENT_NAME) ||
    marker(env.RAILWAY_ENVIRONMENT) ||
    marker(env.RAILWAY_PROJECT_ID) ||
    marker(env.RAILWAY_SERVICE_ID)
  ) {
    return true;
  }

  if (marker(env.COOLIFY_RESOURCE_UUID) || marker(env.COOLIFY_CONTAINER_NAME)) {
    return true;
  }

  // Backstop for a deployed box that set none of the above. NODE_ENV is weak
  // evidence of posture, but in the direction of refusing it costs only an
  // explicit token.
  return marker(env.NODE_ENV) === "production";
}

/**
 * Exactly `"1"`. Not `"true"`, not `"yes"`, not `"01"` — a loose check is how
 * a bypass ends up switched on by a value somebody typed for a different
 * reason.
 */
export function isSeedAuthorized(env: SeedGuardEnv): boolean {
  return env[SEED_AUTHORIZATION_VAR] === "1";
}

/** Same exactness, separate switch. See `QA_SEED_AUTHORIZATION_VAR`. */
export function isQaUserSeedAuthorized(env: SeedGuardEnv): boolean {
  return env[QA_SEED_AUTHORIZATION_VAR] === "1";
}

export class QaUserSeedNotAuthorizedError extends Error {
  readonly code = "QA_USER_SEED_NOT_AUTHORIZED" as const;
  constructor() {
    // Sanitized like its sibling: the rule and the remedy, no environment
    // value, no connection string, no host — and no password.
    super(
      "Refusing to run the QA user fixture against a deployed host.\n" +
        "Seeding mints working logins, one of them with the ADMIN role, which " +
        "opens the Pulso back-office. A deployed host answers to the internet " +
        "— staging included — so the account it creates is a live credential " +
        "there, not a test fixture. Wiping is gated by the same switch " +
        "because it deletes rows from that same deployed database.\n" +
        `To do it deliberately, set ${QA_SEED_AUTHORIZATION_VAR}=1 for that ` +
        "single invocation. Never persist it as a service variable.",
    );
    this.name = "QaUserSeedNotAuthorizedError";
  }
}

/**
 * Is this PRODUCTION, for the purpose of the QA fixture's hard deny?
 *
 * A separate predicate from `isProductionEnvironment`, and the separation is the
 * whole point. That one is `OR` across every signal, which is right for the
 * catalog seed: being loose there can only cause more refusals. Here looseness
 * costs something real — `NODE_ENV=production` is set on our Coolify STAGING box,
 * so an `OR` would hard-deny the one environment where the fixture is wanted, and
 * the only way to let staging back in would be to NARROW the shared predicate and
 * weaken the catalog seed's guard as a side effect.
 *
 * So this asks the question by PRECEDENCE instead:
 *
 *   - `PSICO_ENV` is the posture marker we set deliberately on every deployed
 *     box. When it is present it is believed, and nothing else gets a vote:
 *     "staging" means staging even though NODE_ENV says production.
 *   - When it is absent we fall back to the vendor/tooling signals and treat
 *     production as the answer — a box that failed to declare its posture is not
 *     a box to mint an ADMIN login on.
 *
 * `isProductionEnvironment` is left exactly as it is. Nothing is loosened and
 * nothing is narrowed; a second question simply gets its own answer.
 */
export function isQaSeedProductionPosture(env: SeedGuardEnv): boolean {
  const posture = marker(env.PSICO_ENV);
  if (posture) return posture === "production";

  return (
    marker(env.RAILWAY_ENVIRONMENT_NAME) === "production" ||
    marker(env.NODE_ENV) === "production"
  );
}

export class QaUserSeedForbiddenInProductionError extends Error {
  readonly code = "QA_USER_SEED_FORBIDDEN_IN_PRODUCTION" as const;
  constructor() {
    // Deliberately does NOT name the staging token. Mentioning it would read as
    // "set this and it will work", sending the operator to look for a config
    // problem instead of reading the sentence.
    super(
      "Refusing to run the QA user fixture against PRODUCTION.\n" +
        "This is not a missing-authorization error and no environment variable " +
        "lifts it. The fixture mints working logins, one with the ADMIN role; in " +
        "production those are credentials for real users' data.\n" +
        "If production genuinely needs an account, create it through the normal " +
        "registration and role-assignment path, which is auditable.",
    );
    this.name = "QaUserSeedForbiddenInProductionError";
  }
}

/**
 * Throws before the fixture touches anything. Call it FIRST, ahead of any
 * Prisma client use, so a refusal costs no connection.
 *
 * Three outcomes, in this order, because the order is the policy:
 *
 *   1. PRODUCTION  → refuse, unconditionally. No token lifts it.
 *   2. any other deployed host (staging) → refuse unless the single-invocation
 *      token is present.
 *   3. local / test → allow.
 *
 * Why production is not merely "a deployed host that needs a token": the staging
 * gate means an operator types that token routinely. Once it is a habit, it stops
 * being a decision — and a token typed out of habit is no longer evidence that
 * somebody considered which database they were pointed at. Production therefore
 * refuses on a different axis entirely, so the habit cannot reach it.
 *
 * Note this still refuses on STAGING, where the fixture is legitimately wanted.
 * That is the accepted weak point: a guard that always fires is a guard people
 * stop reading. It is accepted because the only way to tell "staging, on purpose"
 * from "production, by accident" without a token is to trust a hostname, and a
 * seed run does not get to see one.
 */
export function assertQaUserSeedAllowed(env: SeedGuardEnv = process.env): void {
  if (isQaSeedProductionPosture(env)) {
    throw new QaUserSeedForbiddenInProductionError();
  }
  if (!isDeployedEnvironment(env)) return;
  if (isQaUserSeedAuthorized(env)) return;
  throw new QaUserSeedNotAuthorizedError();
}

/**
 * Throws before the seed touches anything. Call it FIRST — ahead of any Prisma
 * client use, so a refusal costs no connection.
 */
export function assertSeedAllowed(env: SeedGuardEnv = process.env): void {
  if (!isProductionEnvironment(env)) return;
  if (isSeedAuthorized(env)) return;
  throw new ProductionSeedNotAuthorizedError();
}
