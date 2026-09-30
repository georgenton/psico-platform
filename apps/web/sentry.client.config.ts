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
import { sanitizeSentryEvent, sanitizeBreadcrumb } from "@psico/types";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    // `NEXT_PUBLIC_PSICO_ENV` primero, y `NEXT_PUBLIC_VERCEL_ENV` como respaldo
    // mientras Vercel siga encendido (ADR 0024). Tiene que ser una variable
    // `NEXT_PUBLIC_*`: esto corre en el navegador, así que el valor se inlinea en
    // el bundle durante el build. Sin ninguna de las dos, todos los errores de
    // producción se reportarían como «development» y el panel perdería la
    // separación entre entornos.
    environment:
      process.env.NEXT_PUBLIC_PSICO_ENV ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    // Session Replay disabled for now — opt in once we validate the
    // privacy model with users (it would record DOM mutations which
    // could include decrypted Diario text in the open composer).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
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
