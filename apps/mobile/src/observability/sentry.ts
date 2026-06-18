/**
 * Sentry init for the mobile app (Sprint 2 del roadmap).
 *
 * Imported and invoked once from `app/_layout.tsx` so the SDK boots
 * before any screen renders. No-op when `EXPO_PUBLIC_SENTRY_DSN` is not
 * set — keeps the dev experience clean without forcing every contributor
 * to provision a Sentry project.
 *
 * Privacy:
 *   - `sendDefaultPii: false` — never ships IPs / device IDs.
 *   - The E2E ciphers from Diario/Eco live in component state, never
 *     thrown as errors. Stack traces only carry messages + frames.
 *   - We do NOT enable session replay or screenshots on errors — they
 *     would record the open Diario composer (decrypted plaintext on
 *     screen) and violate ADR-0007.
 */
import * as Sentry from "@sentry/react-native";

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    initialised = true;
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_VERCEL_ENV ?? "development",
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
    // Hard-off screenshots + view hierarchy — would leak Diario plaintext.
    attachScreenshot: false,
    attachViewHierarchy: false,
    sendDefaultPii: false,
  });
  initialised = true;
}
