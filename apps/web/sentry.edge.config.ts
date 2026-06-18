// Sentry init for Next.js Edge runtime (middleware, edge route handlers).
// No-op when SENTRY_DSN is not set.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
    sendDefaultPii: false,
  });
}
