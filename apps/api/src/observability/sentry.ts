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
import { sanitizeSentryEvent as redactEvent } from "@psico/types";

/**
 * The last privacy boundary before an event leaves the process.
 *
 * The rule itself lives in `@psico/types/observability-redaction`, shared with
 * the Web's three Sentry runtimes. It used to live here, and the Web had
 * nothing — which is backwards: the Web is where `/i#<token>` is opened, so it
 * is the runtime whose URLs carry a one-shot invitation.
 *
 * What it does, in one line each: redacts the sensitive headers whatever their
 * casing (now including `x-circle-guest-session` and `x-client-attestation`,
 * which are credentials in their own right), drops the raw request URL, query
 * and body outright, cleans the same fields out of breadcrumbs, and reduces
 * any surviving URL to a route shape with its ids replaced.
 *
 * The value ops actually needs for triage — the matched route template —
 * already travels as `contexts.custom.path`, put there by
 * `HttpExceptionFilter` via `safeRequestPath()`.
 */
export function sanitizeSentryEvent<E extends Sentry.Event>(event: E): E {
  return redactEvent(event as never) as E;
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
