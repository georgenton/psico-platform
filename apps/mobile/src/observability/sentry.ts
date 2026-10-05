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
import { appEnvironment } from "@/config/environment";

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // Still a no-op without a DSN, deliberately: staging has no Sentry project
    // provisioned, and requiring one would make the staging profile unusable
    // for the thing it exists for.
    initialised = true;
    return;
  }
  Sentry.init({
    dsn,
    // The app's OWN posture. This read `EXPO_PUBLIC_VERCEL_ENV` until now — a
    // deployment detail of a platform this client does not run on, and which is
    // a frozen fallback as of ADR 0024. Naming a mobile client's identity after
    // someone else's infrastructure means the identity disappears when that
    // infrastructure does, and until then every mobile event was tagged
    // `development` because the variable was never set on a phone.
    environment: appEnvironment(),
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
