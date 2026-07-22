/**
 * Sentry initialization for API + worker.
 *
 * Both entry points (apps/api/src/main.ts and apps/api/src/worker.ts) call
 * `initSentry()` BEFORE NestFactory boots. The init must happen first so
 * Sentry's auto-instrumentation can patch http / pg / undici modules
 * before any user code requires them.
 *
 * Init is a no-op when SENTRY_DSN is not set — keeps dev/test workflows
 * silent without forcing every contributor to provision a Sentry project.
 *
 * Privacy: `sendDefaultPii: false`. Combined with the E2E encryption on
 * Diario/Eco bodies (ADR-0007), this means no diary text, eco messages,
 * or auth credentials can reach Sentry. Stack traces + a SANITIZED route
 * only — enough to triage prod bugs without leaking user content.
 */
import * as Sentry from "@sentry/node";

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "stripe-signature",
]);

/**
 * The last privacy boundary before an event leaves the process.
 *
 * Sentry's HTTP instrumentation attaches `request.url` (and, depending on the
 * integration, `query_string` and `data`) from the RAW request. Those carry
 * real session ids, catalog keys, tokens and bodies — exactly what the error
 * envelope and the log lines were sanitized to avoid. Redacting headers is not
 * enough: the URL is the leak.
 *
 * So the raw request fields are DROPPED outright. The value ops actually needs
 * for triage — the matched route template — already travels as
 * `contexts.custom.path`, put there by `HttpExceptionFilter` via
 * `safeRequestPath()`. Rebuilding the template here is impossible anyway: by
 * `beforeSend` there is no Express context left to match against.
 *
 * Pure: takes an event, returns the same object with the unsafe fields gone.
 */
export function sanitizeSentryEvent<E extends Sentry.Event>(event: E): E {
  const request = event.request;
  if (!request) return event;

  // Auth-bearing headers. Sentry's default scrubbing covers `authorization`
  // already, but we also want stripe-signature (carries our webhook secret)
  // and any custom x-api-key forwarders.
  const headers = request.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (REDACTED_HEADERS.has(key.toLowerCase())) {
        headers[key] = "[REDACTED]";
      }
    }
  }

  // Client-controlled, unsanitized, and redundant with contexts.custom.path.
  delete request.url;
  delete request.query_string;
  delete request.data;

  return event;
}

let initialised = false;
// Tracks whether `Sentry.init` was actually called with a DSN — not just
// whether `initSentry` ran. Without this we couldn't distinguish "init
// completed as no-op" from "init wired up the SDK", and `captureException`
// would forward to a no-op SDK instead of returning early.
let sentryEnabled = false;

export function initSentry(): void {
  // Idempotent: both main.ts and the worker call this, and our test harness
  // imports the module multiple times during a Vitest run.
  if (initialised) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    initialised = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    // Performance traces sampled at 10% in prod — enough to surface slow
    // endpoints without blowing up the Sentry quota when traffic scales.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend: sanitizeSentryEvent,
  });
  initialised = true;
  sentryEnabled = true;
}

/**
 * Capture an exception to Sentry. No-op when Sentry was never wired
 * to a real DSN (e.g. dev without env var). Safe to call from anywhere
 * in the codebase.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setContext("custom", context);
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/** Exposed for tests so they can assert init status without poking the SDK. */
export function isSentryInitialised(): boolean {
  return initialised;
}

/** Reset state — TESTING ONLY. */
export function _resetSentryForTests(): void {
  initialised = false;
  sentryEnabled = false;
}
