/**
 * Next.js instrumentation hook (Sprint 2 del roadmap).
 *
 * Runs once when the Next runtime boots, BEFORE any request handler.
 * We route the Sentry init from here based on which runtime ("nodejs"
 * for Server Components / Route Handlers, "edge" for middleware).
 *
 * Init is a no-op when `SENTRY_DSN` (server-side) is not set. The client
 * SDK is initialised separately from `sentry.client.config.ts`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
