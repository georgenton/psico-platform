// Expo replaces EXPO_PUBLIC_* at build time via Babel.
// This declaration satisfies TypeScript without pulling in @types/node.
//
// Everything here is PUBLIC by construction — these values are inlined into the
// shipped bundle, so none of them may hold a secret.
//
// Read them through `src/config/environment.ts`, not directly: it is the one
// place that parses and validates, and reading `process.env` here again is how
// the app ended up with three disagreeing ideas of where its API lives.
declare const process: {
  readonly env: {
    /** development | staging | production. The app's own posture. */
    readonly EXPO_PUBLIC_APP_ENV?: string;
    /** Absolute API origin, no path. Pinned for staging. */
    readonly EXPO_PUBLIC_API_URL?: string;
    /** Absolute web origin — Stripe returns, links out of the app. */
    readonly EXPO_PUBLIC_WEB_ORIGIN?: string;
    /** Absent is a deliberate no-op; staging has no Sentry project yet. */
    readonly EXPO_PUBLIC_SENTRY_DSN?: string;
    readonly EXPO_PUBLIC_SENTRY_RELEASE?: string;
    readonly [key: string]: string | undefined;
  };
};
