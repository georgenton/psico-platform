import { ApiError } from "@psico/api-client";

/**
 * CC-7.5 — the closed error surface of the Guide player.
 *
 * Nothing the API returns is rendered: not `error.message`, not the body, not
 * an id, a stepKey, a sessionId, a stack or a URL. The mapper takes the HTTP
 * status plus the stable code and returns one of a fixed set of sentences.
 * An unrecognised failure falls to the generic retry copy — a new backend
 * code can never leak through as raw text.
 *
 * (The Guide envelope's public `message` IS its code, by contract: the API
 * never puts a Prisma/pg/Nest string there. We read it as a code and discard
 * it either way.)
 */

export type GuideErrorKind =
  /** Retrying the same command with the same key is safe and expected. */
  | "retryable"
  /** The server state moved; recover by replaying START. */
  | "resync"
  /** Nothing to retry — the run cannot continue from here. */
  | "terminal"
  /** The session is gone; only an explicit fresh start makes sense. */
  | "gone"
  /** The browser session expired. */
  | "unauthenticated";

export interface GuideUiError {
  kind: GuideErrorKind;
  message: string;
}

const RETRY_MESSAGE =
  "No pudimos guardar este paso. Puedes reintentarlo sin perder tu avance.";

const BY_CODE: Record<string, GuideUiError> = {
  GUIDE_FORBIDDEN: {
    kind: "terminal",
    message: "Esta guía no está disponible con tu acceso actual.",
  },
  GUIDE_SESSION_NOT_FOUND: {
    kind: "gone",
    message: "No pudimos recuperar esta sesión.",
  },
  GUIDE_SESSION_INVALID_TRANSITION: {
    kind: "resync",
    message: "El estado cambió. Estamos recuperando tu progreso.",
  },
  GUIDE_STEP_NOT_CURRENT: {
    kind: "resync",
    message: "El estado cambió. Estamos recuperando tu progreso.",
  },
  GUIDE_STEP_COMMAND_MISMATCH: {
    kind: "terminal",
    message: "Esta guía no está disponible temporalmente.",
  },
  GUIDE_CONTEXT_UNRESOLVED: {
    kind: "terminal",
    message: "Esta guía no está disponible temporalmente.",
  },
  GUIDE_CONTEXT_MISMATCH: {
    kind: "terminal",
    message: "Esta guía no está disponible temporalmente.",
  },
  GUIDE_STORAGE_FAILURE: { kind: "retryable", message: RETRY_MESSAGE },
};

/** The one place an API failure becomes something a person reads. */
export function toGuideUiError(error: unknown): GuideUiError {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return {
        kind: "unauthenticated",
        message: "Tu sesión caducó. Recarga la página para continuar.",
      };
    }
    const known = BY_CODE[error.message];
    if (known) return known;
    // A 4xx we do not have copy for is not retryable — retrying an identical
    // rejected command would just fail identically.
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return {
        kind: "terminal",
        message: "Esta guía no está disponible temporalmente.",
      };
    }
    return { kind: "retryable", message: RETRY_MESSAGE };
  }

  // Network failure, abort, or anything non-HTTP: the command may or may not
  // have applied, which is exactly what the stored idempotency key is for.
  return { kind: "retryable", message: RETRY_MESSAGE };
}
