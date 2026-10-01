/**
 * Run configuration for the QA user fixture (`seed-test.ts`).
 *
 * A module of its own, and deliberately free of `dotenv`, Prisma, `pg` and
 * bcrypt, for two reasons:
 *
 *   1. It is what runs BEFORE anything connects, so it must not be able to
 *      drag a client into existence by being imported.
 *   2. The guard tests import it. Importing the fixture itself would execute
 *      `dotenv/config` and mutate `process.env` inside the test runner — a
 *      spec that quietly reconfigures its neighbours is a bad trade for
 *      testing a function that parses strings.
 */

/**
 * The app's own window, from `RegisterDto`: `@MinLength(8) @MaxLength(72)`.
 *
 * The upper bound is not cosmetic — bcrypt silently truncates past 72 bytes,
 * so accepting more here would seed an account whose password cannot be
 * re-entered through any form the app exposes.
 */
export const QA_PASSWORD_MIN_LENGTH = 8;
export const QA_PASSWORD_MAX_LENGTH = 72;

/** No default. Supplying nothing is an error, never a fallback. */
export const QA_PASSWORD_VAR = "QA_USER_PASSWORD";

/**
 * A discriminated union rather than `{ password: string | null }`, so that the
 * "a wipe has no password" rule is enforced by the type checker instead of by
 * a cast at the use site.
 */
export type QaSeedConfig = { wipe: true } | { wipe: false; password: string };

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/**
 * Resolve + VALIDATE the run configuration from argv + env.
 *
 * Pure and side-effect free so it is unit-testable, and — the load-bearing
 * part — so it can run before any client exists. A run missing its password
 * aborts without having addressed a database at all.
 *
 * Throws rather than returning a result object: there is no sensible partial
 * success here, and a thrown error cannot be quietly ignored by a caller that
 * forgot to check a field.
 */
export function resolveQaSeedConfig(io: {
  argv: string[];
  env: Record<string, string | undefined>;
}): QaSeedConfig {
  const args = parseArgs(io.argv);

  // A wipe only deletes the three fixture rows. Demanding a password for it
  // would make the remediation path harder than the hazardous one.
  if (args.wipe === true) return { wipe: true };

  // `--password=…`; a bare `--password` parses to boolean true and is ignored
  // on purpose, so a shell that ate the value fails closed instead of seeding
  // an account whose password is the string "true".
  const password =
    (typeof args.password === "string" && args.password) ||
    io.env[QA_PASSWORD_VAR] ||
    "";

  if (!password) {
    throw new Error(
      "A QA password is required and has no default. Pass --password=… or " +
        `set ${QA_PASSWORD_VAR}. These accounts include an ADMIN login, so ` +
        "the value is a real credential: generate it, keep it in your own " +
        "secret store, and never commit it.",
    );
  }

  // Bounds are reported without echoing the value — the length of a rejected
  // password is already more than a log line needs to know.
  if (password.length < QA_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `The QA password is too short: ${QA_PASSWORD_MIN_LENGTH} characters ` +
        "minimum, matching the app's own RegisterDto.",
    );
  }
  if (password.length > QA_PASSWORD_MAX_LENGTH) {
    throw new Error(
      `The QA password is too long: ${QA_PASSWORD_MAX_LENGTH} characters ` +
        "maximum. bcrypt truncates silently past that, so a longer value " +
        "would seed a password no form in the app could reproduce.",
    );
  }

  return { wipe: false, password };
}
