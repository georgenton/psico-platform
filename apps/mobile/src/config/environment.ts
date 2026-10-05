/**
 * The mobile app's environment, resolved and validated in ONE place.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `EXPO_PUBLIC_API_URL` was read in three places —
 * `context/auth.tsx`, `components/dashboard/eco/EcoChat.tsx` and
 * `lib/asset-url.ts` — each with its own `?? ""` and its own trailing-slash
 * strip. Three parses of one fact is three chances to disagree, and the default
 * made the disagreement silent: with the variable unset, `auth.tsx` composed the
 * base URL `"/api"` and `assetUrl("/api/content-assets/x")` returned
 * `"/api/content-assets/x"`. In React Native there is no document origin to
 * resolve a relative URL against, so the app did not fail at boot with "you
 * forgot to configure the API" — it started normally and then every request
 * failed as an opaque network error, which reads like the server being down.
 *
 * So: one module parses, one module validates, and it refuses at import time
 * rather than at first fetch.
 *
 * ── Why the posture is explicit ───────────────────────────────────────────
 *
 * `EXPO_PUBLIC_APP_ENV` is the app's own identity. Sentry previously took its
 * `environment` from `EXPO_PUBLIC_VERCEL_ENV`, which is a deployment detail of a
 * platform this app does not run on and which is now a frozen fallback. A mobile
 * client's identity should not be named after somebody else's infrastructure,
 * and it must not disappear when that infrastructure does.
 */

/** The app's own posture. Not a hosting platform's. */
export type AppEnvironment = "development" | "staging" | "production";

const APP_ENVIRONMENTS: readonly AppEnvironment[] = [
  "development",
  "staging",
  "production",
];

/**
 * Where staging must point. Pinned, not suggested.
 *
 * A staging build that talks to any other host is a misconfiguration we would
 * rather fail on than discover from the data: the whole point of the staging
 * profile is that QA cannot reach production by accident. `apps/api` is the
 * authority for what this host is; see `docs/deploy/coolify-runbook.md`.
 */
export const STAGING_API_ORIGIN = "https://api-staging.feelverse.app";

/** Where staging's web surface lives — Stripe returns, shared links. */
export const STAGING_WEB_ORIGIN = "https://staging.feelverse.app";

/**
 * Hosts a staging or production build must never talk to.
 *
 * Railway and Vercel are deliberately frozen fallbacks (ADR 0024 and the
 * legacy-freeze decision), not destinations. The developer's own
 * `apps/mobile/.env` currently points at the Railway API, which is exactly how
 * a QA session ends up against legacy production without anybody deciding to:
 * you run `start`, it works, and nothing says where it went. Naming the hosts
 * here turns that into a refusal with a reason.
 */
const FROZEN_LEGACY_HOSTS = [/\.up\.railway\.app$/i, /\.vercel\.app$/i];

export interface MobileEnvironment {
  readonly appEnv: AppEnvironment;
  /** Absolute API origin, no trailing slash, no `/api` suffix. */
  readonly apiOrigin: string;
  /** Absolute web origin, no trailing slash. Null when nothing needs one. */
  readonly webOrigin: string | null;
}

export class MobileEnvironmentError extends Error {
  readonly code = "MOBILE_ENVIRONMENT_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "MobileEnvironmentError";
  }
}

type RawEnv = Record<string, string | undefined>;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Normalize and validate an origin.
 *
 * `strict` is what separates a deployed posture from a local one: development
 * may point at `http://192.168.1.5:3001` because that is what a phone on the
 * same Wi-Fi needs, and staging may not, because plaintext tokens over a shared
 * network is a different proposition from plaintext tokens over a cable.
 */
function normalizeOrigin(
  raw: string,
  label: string,
  { strict }: { strict: boolean },
): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MobileEnvironmentError(
      `${label} must be an absolute URL including the scheme (got ${JSON.stringify(raw)}).\n` +
        "React Native has no document origin, so a relative value cannot be " +
        "resolved and would fail later as an opaque network error.",
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new MobileEnvironmentError(
      `${label} must use http or https (got ${JSON.stringify(parsed.protocol)}).`,
    );
  }

  if (strict && parsed.protocol !== "https:") {
    throw new MobileEnvironmentError(
      `${label} must use https outside development (got ${JSON.stringify(raw)}).\n` +
        "Access and refresh tokens travel on this origin.",
    );
  }

  if (strict) {
    for (const frozen of FROZEN_LEGACY_HOSTS) {
      if (frozen.test(parsed.hostname)) {
        throw new MobileEnvironmentError(
          `${label} points at ${parsed.hostname}, which is frozen legacy infrastructure.\n` +
            "Railway and Vercel are kept as a fallback, not as a target — and a " +
            "QA session against legacy production is the accident this check " +
            `exists to prevent. Staging is ${STAGING_API_ORIGIN}.`,
        );
      }
    }
  }

  // A path on an API origin is almost always a duplicated `/api`: the shared
  // client appends that segment itself (`apiClient.configure`), so leaving it
  // here produces `/api/api/...` and a 404 that looks like a missing endpoint.
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path) {
    throw new MobileEnvironmentError(
      `${label} must be an origin with no path (got ${JSON.stringify(path)}).\n` +
        "The /api segment is appended by the shared API client, so including it " +
        "here yields /api/api and a 404 that reads like a missing endpoint.",
    );
  }

  // Normalized: scheme + host (+ port), never a trailing slash. Every consumer
  // can therefore concatenate without stripping anything of its own.
  return parsed.origin;
}

function resolveAppEnv(env: RawEnv): AppEnvironment {
  const raw = trimmed(env.EXPO_PUBLIC_APP_ENV).toLowerCase();

  if (!raw) {
    // Absent means a plain `expo start` on a laptop. Defaulting to development
    // is safe because development is the posture with the FEWEST powers here —
    // it is the only one that may use http or a LAN address, and it makes no
    // claim about which database it is talking to. The staging profile sets the
    // variable explicitly, so "unset" can never silently mean "staging".
    return "development";
  }

  if (!APP_ENVIRONMENTS.includes(raw as AppEnvironment)) {
    throw new MobileEnvironmentError(
      `EXPO_PUBLIC_APP_ENV must be one of ${APP_ENVIRONMENTS.join(" | ")} ` +
        `(got ${JSON.stringify(raw)}).`,
    );
  }

  return raw as AppEnvironment;
}

/**
 * Resolve the whole environment, or throw.
 *
 * Exported with an injectable `env` so the matrix is exercised as data instead
 * of by mutating the process and hoping the restore ran — the same reason the
 * seed guards take an `env` parameter.
 */
export function resolveMobileEnvironment(
  env: RawEnv = process.env,
): MobileEnvironment {
  const appEnv = resolveAppEnv(env);
  const deployed = appEnv === "staging" || appEnv === "production";

  const rawApi = trimmed(env.EXPO_PUBLIC_API_URL);
  if (!rawApi) {
    throw new MobileEnvironmentError(
      "EXPO_PUBLIC_API_URL is not set.\n" +
        (appEnv === "development"
          ? "For a local run, point it at your API — for example " +
            "http://localhost:3001, or your machine's LAN address if you are " +
            "testing on a phone."
          : `A ${appEnv} build must declare it explicitly; there is no default.`),
    );
  }

  const apiOrigin = normalizeOrigin(rawApi, "EXPO_PUBLIC_API_URL", {
    strict: deployed,
  });

  if (appEnv === "staging" && apiOrigin !== STAGING_API_ORIGIN) {
    // Pinned rather than merely validated. "Looks like a URL" is not the
    // property we want from a staging build; "is the staging API" is.
    throw new MobileEnvironmentError(
      `A staging build must talk to ${STAGING_API_ORIGIN} (got ${apiOrigin}).\n` +
        "Use the staging profile — `pnpm --filter @psico/mobile start:staging` — " +
        "which declares this for the one invocation instead of editing .env.",
    );
  }

  const rawWeb = trimmed(env.EXPO_PUBLIC_WEB_ORIGIN);
  const webOrigin = rawWeb
    ? normalizeOrigin(rawWeb, "EXPO_PUBLIC_WEB_ORIGIN", { strict: deployed })
    : null;

  if (appEnv === "staging" && webOrigin !== STAGING_WEB_ORIGIN) {
    throw new MobileEnvironmentError(
      `A staging build must use ${STAGING_WEB_ORIGIN} as its web origin ` +
        `(got ${webOrigin ?? "nothing"}).\n` +
        "It is where Stripe returns land, so pointing it elsewhere sends a " +
        "staging checkout to another environment's pages.",
    );
  }

  return { appEnv, apiOrigin, webOrigin };
}

/**
 * The resolved environment, memoized on FIRST USE rather than at import.
 *
 * It was eager at first, and a test caught why that is wrong: resolving at
 * module load means every module that imports this — transitively, so any
 * component test that reaches `assetUrl` — throws at import time when the
 * variable is unset. The failure then has nothing to do with the test's subject.
 *
 * Laziness costs no fail-fast in practice. `context/auth.tsx` calls
 * `apiOrigin()` at ITS module scope to configure the shared client, and that
 * module is on the app's startup path, so a misconfigured build still stops
 * immediately and in the terminal — which is the property §3 asked for. What
 * changed is only that importing the module is no longer the same event as
 * demanding a valid configuration.
 */
let memo: MobileEnvironment | null = null;

function current(): MobileEnvironment {
  if (!memo) memo = resolveMobileEnvironment();
  return memo;
}

export const appEnvironment = (): AppEnvironment => current().appEnv;

/** Absolute API origin — no trailing slash, no `/api`. */
export const apiOrigin = (): string => current().apiOrigin;

/**
 * Absolute web origin, for Stripe returns and shared links.
 *
 * Throws rather than returning a guess: the previous default was a hardcoded
 * `https://psico-platform-web.vercel.app`, which is both frozen legacy and, by
 * now, not even the product's domain.
 */
export function webOrigin(): string {
  const { webOrigin: value } = current();
  if (!value) {
    throw new MobileEnvironmentError(
      "EXPO_PUBLIC_WEB_ORIGIN is not set, and something asked for the web " +
        "origin.\n" +
        "It is used for Stripe return URLs and links out of the app. There is " +
        "no default on purpose — the old one was a hardcoded legacy host.",
    );
  }
  return value;
}
