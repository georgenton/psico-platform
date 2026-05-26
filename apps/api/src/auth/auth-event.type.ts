/**
 * Canonical set of `AuthEvent.type` values.
 *
 * We use a `const` object instead of a TypeScript enum so the Prisma column
 * stays a plain String — no migration is needed when we add a new event type
 * (e.g. PASSWORD_RESET in Sprint S2, OAUTH_LINK in Sprint S2).
 *
 * Why we still want a single source: greppability + autocomplete + a single
 * place to consult when building dashboards in Sprint S25 (Pulso).
 */
export const AuthEventType = {
  /** Successful new account creation. */
  REGISTER: "REGISTER",
  /** Successful login (email + password). */
  LOGIN_OK: "LOGIN_OK",
  /** Failed login attempt — see metadata.reason for the cause. */
  LOGIN_FAIL: "LOGIN_FAIL",
  /** Refresh-token rotated. */
  REFRESH: "REFRESH",
  /**
   * A revoked or expired refresh token was presented. Security signal —
   * may indicate token theft or replay attack. Worth alerting on.
   */
  REFRESH_REUSED: "REFRESH_REUSED",
  /** Explicit logout (refresh token revoked client-side). */
  LOGOUT: "LOGOUT",

  // ── Email flows (Sprint S2) ────────────────────────────────────────────
  /** A password reset email was requested. */
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  /** The reset token was successfully consumed → password rotated. */
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  /** Email verification token consumed → User.emailVerified=true. */
  EMAIL_VERIFIED: "EMAIL_VERIFIED",

  // ── OAuth (Sprint S2) ──────────────────────────────────────────────────
  /** First-time OAuth signup — a new User row was created. */
  OAUTH_REGISTER: "OAUTH_REGISTER",
  /** Returning OAuth login — existing User matched by providerId. */
  OAUTH_LOGIN: "OAUTH_LOGIN",
} as const;

export type AuthEventType = (typeof AuthEventType)[keyof typeof AuthEventType];

/**
 * Structured reasons attached as `AuthEvent.metadata.reason` on LOGIN_FAIL.
 * Helps post-hoc analysis without leaking the cause to the client (the user
 * always sees a generic 401 "Invalid credentials").
 */
export const LoginFailReason = {
  /** Email did not match any account. */
  USER_NOT_FOUND: "USER_NOT_FOUND",
  /** Account exists but password did not match. */
  WRONG_PASSWORD: "WRONG_PASSWORD",
  /** Account exists but `isActive=false` (suspended, deleted, etc.). */
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
} as const;

export type LoginFailReason =
  (typeof LoginFailReason)[keyof typeof LoginFailReason];
