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

export interface SeedGuardEnv {
  RAILWAY_ENVIRONMENT_NAME?: string;
  NODE_ENV?: string;
  [SEED_AUTHORIZATION_VAR]?: string;
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

/** Production is either signal saying so — neither is trusted alone. */
export function isProductionEnvironment(env: SeedGuardEnv): boolean {
  return (
    env.RAILWAY_ENVIRONMENT_NAME === "production" ||
    env.NODE_ENV === "production"
  );
}

/**
 * Exactly `"1"`. Not `"true"`, not `"yes"`, not `"01"` — a loose check is how
 * a bypass ends up switched on by a value somebody typed for a different
 * reason.
 */
export function isSeedAuthorized(env: SeedGuardEnv): boolean {
  return env[SEED_AUTHORIZATION_VAR] === "1";
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
