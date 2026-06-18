// Sentry init for the Next.js browser bundle. Loaded automatically by
// `@sentry/nextjs` for every client component. No-op when
// `NEXT_PUBLIC_SENTRY_DSN` is not set.
//
// Privacy:
//   - `sendDefaultPii: false` — we don't ship IPs or user emails.
//   - The E2E cipher payloads from Diario/Eco only exist in component
//     state, never thrown as errors. Even if a stack trace touches them,
//     Sentry only captures the message + frame, not the captured locals.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    // Session Replay disabled for now — opt in once we validate the
    // privacy model with users (it would record DOM mutations which
    // could include decrypted Diario text in the open composer).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
