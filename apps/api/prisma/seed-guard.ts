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
 * The catalog seed's authorization for a STAGING box, separate from production's.
 *
 * Staging needed its own switch rather than a relaxation of the production one.
 * Our Coolify staging box runs with `NODE_ENV=production` — set by the build, not
 * by us — so the old `OR` over every signal read it as production and refused,
 * and the only way to seed it was a workaround. Widening what counts as
 * "authorized production" to let staging through would have handed production a
 * quieter guard as a side effect.
 *
 * Two switches also keep the blast radius honest: a token typed for a staging
 * refresh cannot be the token that authorizes a production one.
 */
export const STAGING_SEED_AUTHORIZATION_VAR = "ALLOW_STAGING_BOOTSTRAP_SEED";

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
  [STAGING_SEED_AUTHORIZATION_VAR]?: string;
  [QA_SEED_AUTHORIZATION_VAR]?: string;
}

/**
 * What kind of box this is, as the seed tooling classifies it.
 *
 * ── Why a posture, and why it is computed here rather than imported ───────
 *
 * The runtime already has a resolver — `resolveEnvironment()`, reached through
 * `src/shared/psico-environment` — and it is the semantic AUTHORITY: PSICO_ENV
 * normalized, the only word that counts on a deployed box, NODE_ENV explicitly
 * not a substitute. This function must agree with it, and
 * `seed-environment-conformance.spec.ts` fails the build if the two ever
 * classify the same inputs differently.
 *
 * It is not the same code for two measured reasons:
 *
 *   1. The runtime reads `process.env` directly and THROWS on an undeclared
 *      deployed box. Throwing is right for a server that must not boot; for a
 *      CLI the right answer is a legible refusal naming the variable to set.
 *   2. This takes an injectable `env`, so the matrix below is exercised as data
 *      rather than by mutating the process and hoping the restore ran.
 *
 * Agreement enforced by a test beats shared code that drags a dependency graph
 * into a script whose whole value is refusing before anything is constructed.
 *
 * `"invalid"` is not an environment — it is the answer when the box is deployed
 * and will not say what it is. No token lifts it: a posture nobody declared
 * cannot be turned into staging by typing a staging token.
 */
export type SeedPosture =
  | "development"
  | "test"
  | "staging"
  | "production"
  | "invalid";

export function seedPosture(env: SeedGuardEnv): SeedPosture {
  const explicit = marker(env.PSICO_ENV);

  // ── Deployed: PSICO_ENV is the only word ────────────────────────────────
  //
  // Identical to the runtime's rule, and for the same reason: NODE_ENV is set by
  // tooling for a hundred reasons that say nothing about safety posture, and a
  // box that declines to declare itself is the one case where guessing is worst.
  // `isDeployedPlatform`, NOT `isDeployedEnvironment`. The two answer different
  // questions and §4 of this design depends on the difference: CLASSIFICATION
  // must match the runtime, which counts only vendor markers and our own
  // `PSICO_DEPLOYED`. The broader predicate additionally treats a bare
  // `NODE_ENV=production` as deployed — right for the QA fixture's hazard ("could
  // this box answer the internet?"), wrong here, because the runtime would call
  // that same box `production` and the conformance test would catch us.
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
  // NODE_ENV says". Found by the conformance test, which is the whole reason it
  // exists: the runtime THROWS on an unrecognized value here, and this used to
  // fall through to the NODE_ENV branch and answer "development" — so
  // `PSICO_ENV=prod`, the shorthand people actually type, classified a box as a
  // development machine and the seed ran with no authorization at all.
  //
  // That is not a cosmetic disagreement. The seed chooses its database from
  // DATABASE_URL, never from PSICO_ENV, so a laptop pointed at the production
  // database plus that one typo reached exactly the failure C.0A1 exists to
  // prevent. A value nobody can interpret is refused.
  if (explicit) return "invalid";

  const node = marker(env.NODE_ENV);
  if (node === "test") return "test";
  if (node === "production") return "production";
  if (node === "staging") return "staging";

  return "development";
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
/**
 * Is a hosting PLATFORM telling us this box is deployed?
 *
 * Mirrors `deploymentPlatform()` in the runtime resolver exactly: our own
 * neutral marker first, then the vendor ones. Deliberately does NOT consider
 * `NODE_ENV` — a build sets that for its own reasons, and the runtime does not
 * accept it here either. `seed-environment-conformance.spec.ts` is what keeps
 * the two in step.
 *
 * `COOLIFY_URL` / `COOLIFY_TOKEN` are excluded for the same hard-won reason as
 * in the runtime: those are how a CLIENT is configured to talk to a Coolify, so
 * any laptop with the CLI carries them.
 */
export function isDeployedPlatform(env: SeedGuardEnv): boolean {
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

/** Same exactness again, for the staging catalog refresh. */
export function isStagingSeedAuthorized(env: SeedGuardEnv): boolean {
  return env[STAGING_SEED_AUTHORIZATION_VAR] === "1";
}

export class StagingSeedNotAuthorizedError extends Error {
  readonly code = "STAGING_SEED_NOT_AUTHORIZED" as const;
  constructor() {
    super(
      "Refusing to seed a staging environment without authorization.\n" +
        "The catalog seed is an administrative operation, not a deployment step: " +
        "it rewrites curated catalogs. Staging is cheap to refresh, but not by " +
        "accident.\n" +
        `To run it deliberately, set ${STAGING_SEED_AUTHORIZATION_VAR}=1 for that ` +
        "single invocation. Never persist it as a service variable.",
    );
    this.name = "StagingSeedNotAuthorizedError";
  }
}

/**
 * The box will not say what it is, in one of two shapes:
 *
 *   - deployed and silent (or calling itself "development"), or
 *   - any box whose `PSICO_ENV` is set to a word nobody can interpret —
 *     `PSICO_ENV=prod` is the one that actually happens.
 *
 * Both get the same answer because both leave the same question unanswered, and
 * no authorization variable lifts either. The message distinguishes them only so
 * the operator is pointed at the right fix; the refusal is identical.
 *
 * Deliberately does NOT echo the offending value. Naming it would read as
 * confirmation that the value was seen and considered, and it is one of the very
 * few environment values this code touches at all.
 */
export class DeployedSeedEnvironmentInvalidError extends Error {
  readonly code = "DEPLOYED_SEED_ENVIRONMENT_INVALID" as const;
  constructor(deployed = true) {
    super(
      (deployed
        ? "Refusing to seed: this box is deployed but does not declare a valid posture.\n" +
          "Set PSICO_ENV=production or PSICO_ENV=staging on the RESOURCE, not on the " +
          "command. NODE_ENV is not accepted here — a build sets it for reasons that " +
          "say nothing about safety posture.\n"
        : "Refusing to seed: PSICO_ENV is set to a value this does not recognize.\n" +
          "It must be one of production | staging | development | test. Check it for " +
          'a typo — "prod" and "stage" are not accepted, deliberately, because a ' +
          "value nobody can interpret must not be read as a development machine " +
          "while DATABASE_URL points somewhere real.\n") +
        "No authorization variable lifts this: a posture nobody declared cannot " +
        "be turned into staging by naming staging on the command line.",
    );
    this.name = "DeployedSeedEnvironmentInvalidError";
  }
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
  // A box that will not say what it is gets the same answer as production:
  // refused, and no variable lifts it. Two shapes reach here — an undeclared
  // Coolify or Railway box (which used to be reachable with the deployed-box
  // variable), and ANY box whose PSICO_ENV is an uninterpretable word like
  // `prod`. The second is not conditioned on `isDeployedPlatform`, deliberately:
  // this fixture mints an ADMIN login into whatever DATABASE_URL points at, and
  // a typo'd posture on a laptop pointed at a real database is the same hazard
  // as an undeclared host, not a smaller one.
  if (seedPosture(env) === "invalid") {
    throw new DeployedSeedEnvironmentInvalidError(isDeployedPlatform(env));
  }
  if (!isDeployedEnvironment(env)) return;
  if (isQaUserSeedAuthorized(env)) return;
  throw new QaUserSeedNotAuthorizedError();
}

/**
 * Throws before the seed touches anything. Call it FIRST — ahead of any Prisma
 * client use, so a refusal costs no connection.
 */
/**
 * Throws before the catalog seed touches anything. Call it FIRST — ahead of any
 * Prisma client use, so a refusal costs no connection.
 *
 * Posture-driven, and the order is the policy:
 *
 *   1. invalid (deployed, undeclared or calling itself development) → refuse,
 *      unconditionally. This is the case that used to be reachable: a Railway or
 *      Coolify box with no `PSICO_ENV` read as production, and the production
 *      token then authorized it. A posture nobody stated is not a posture.
 *   2. production → refuse unless `ALLOW_PRODUCTION_BOOTSTRAP_SEED=1`.
 *   3. staging  → refuse unless `ALLOW_STAGING_BOOTSTRAP_SEED=1`. Its own
 *      switch, because our Coolify staging box carries `NODE_ENV=production`
 *      and the old single-signal check read that as production — the false
 *      positive this replaces. Widening the production gate to let staging
 *      through would have loosened production as a side effect.
 *   4. development / test → allow. A local box is the one place this is routine.
 *
 * Neither token substitutes for the other, in either direction.
 */
export function assertSeedAllowed(env: SeedGuardEnv = process.env): void {
  const posture = seedPosture(env);

  if (posture === "invalid") {
    throw new DeployedSeedEnvironmentInvalidError(isDeployedPlatform(env));
  }
  if (posture === "production") {
    if (isSeedAuthorized(env)) return;
    throw new ProductionSeedNotAuthorizedError();
  }
  if (posture === "staging") {
    if (isStagingSeedAuthorized(env)) return;
    throw new StagingSeedNotAuthorizedError();
  }
  // development | test
}
