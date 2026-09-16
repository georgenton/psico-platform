// Sentry init for Next.js Edge runtime (middleware, edge route handlers).
// No-op when SENTRY_DSN is not set.
import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent, sanitizeBreadcrumb } from "@psico/types";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
    sendDefaultPii: false,
    // The Web is where `/i#<token>` and `/compartir/<id>` are opened, so it is
    // the runtime whose URLs are credentials. `sendDefaultPii: false` does not
    // cover them: it governs what Sentry ADDS, not what its integrations
    // already collected. Same redactor as the API, from one shared list.
    beforeSend: sanitizeSentryEvent,
    beforeSendTransaction: sanitizeSentryEvent,
    beforeBreadcrumb: sanitizeBreadcrumb,
  });
}
