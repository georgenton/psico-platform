import { HttpException } from "@nestjs/common";
import {
  GuideCommandIdempotencyConflictError,
  GuideCommandInvalidInputError,
  GuideCommandStorageError,
} from "./guide-command-receipt.repository";
import {
  GuideStepConflictError,
  GuideStepInvalidInputError,
  GuideStepStorageError,
} from "./guide-session-step.repository";
import {
  LearningEventIdempotencyConflictError,
  LearningEventInvalidInputError,
  LearningEventStorageError,
} from "../learning/learning-event.repository";
import { GuideStateError } from "./guide-state-machine";
import { GuideCatalogError } from "./guide-catalog";

/**
 * CC-7.4C — the CLOSED, value-free internal error surface of the Guide
 * lifecycle. CC-7.4D maps these codes to HTTP; nothing here knows about HTTP.
 *
 * A thrown error carries a stable `code` and NOTHING else: never a sessionId,
 * stepKey, catalog key, selectedOptionKey, database id, SQL, or an upstream
 * Prisma/pg message. `cause` is deliberately never set — a serialized cause
 * would leak driver text (and possibly values) into logs.
 */

export type GuideLifecycleErrorCode =
  | "GUIDE_SESSION_NOT_FOUND"
  | "GUIDE_SESSION_INVALID_TRANSITION"
  | "GUIDE_STEP_NOT_CURRENT"
  | "GUIDE_STEP_COMMAND_MISMATCH"
  | "GUIDE_CONTEXT_UNRESOLVED"
  | "GUIDE_CONTEXT_MISMATCH"
  | "GUIDE_FORBIDDEN"
  | "GUIDE_STORAGE_FAILURE";

export class GuideLifecycleError extends Error {
  readonly code: GuideLifecycleErrorCode;
  constructor(code: GuideLifecycleErrorCode) {
    super(code); // message === code — no value ever embedded
    this.name = "GuideLifecycleError";
    this.code = code;
  }
}

export const guideFail = (code: GuideLifecycleErrorCode): never => {
  throw new GuideLifecycleError(code);
};

/**
 * Run a repository call and translate EVERY failure into the closed surface.
 *
 *   - idempotency conflicts (receipt / learning event) and ledger conflicts →
 *     GUIDE_SESSION_INVALID_TRANSITION (the command cannot be applied as sent);
 *   - catalog / state-machine violations → the matching closed code;
 *   - anything else (storage, invalid input, driver, bug) →
 *     GUIDE_STORAGE_FAILURE.
 *
 * A GuideLifecycleError raised by our own code passes through unchanged.
 */
export async function mapGuideErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw translateGuideError(err);
  }
}

/** Synchronous twin of `mapGuideErrors` (pure state-machine calls). */
export function translateGuideError(err: unknown): GuideLifecycleError {
  if (err instanceof GuideLifecycleError) return err;

  // Conflicts: the same idempotency key already means something else, or the
  // step/session moved under us. Either way the command is not applicable.
  if (
    err instanceof GuideCommandIdempotencyConflictError ||
    err instanceof LearningEventIdempotencyConflictError ||
    err instanceof GuideStepConflictError
  ) {
    return new GuideLifecycleError("GUIDE_SESSION_INVALID_TRANSITION");
  }

  // The pure machine rejected the ledger/transition.
  if (err instanceof GuideStateError) {
    switch (err.code) {
      case "GUIDE_STATE_OUT_OF_ORDER":
        return new GuideLifecycleError("GUIDE_STEP_NOT_CURRENT");
      case "GUIDE_STATE_SESSION_CLOSED":
      case "GUIDE_STATE_INCOMPLETE":
        return new GuideLifecycleError("GUIDE_SESSION_INVALID_TRANSITION");
      default:
        // Ledger drifted from the pinned catalog — not a client-fixable state.
        return new GuideLifecycleError("GUIDE_STORAGE_FAILURE");
    }
  }

  // An unknown guideKey@guideVersion is an unresolvable editorial context.
  if (err instanceof GuideCatalogError) {
    return new GuideLifecycleError("GUIDE_CONTEXT_UNRESOLVED");
  }

  // Everything else — storage, sanitized repository failures, invalid inputs
  // that reached a repository, driver errors — is a generic storage failure.
  if (
    err instanceof GuideCommandStorageError ||
    err instanceof GuideCommandInvalidInputError ||
    err instanceof GuideStepStorageError ||
    err instanceof GuideStepInvalidInputError ||
    err instanceof LearningEventStorageError ||
    err instanceof LearningEventInvalidInputError
  ) {
    return new GuideLifecycleError("GUIDE_STORAGE_FAILURE");
  }
  return new GuideLifecycleError("GUIDE_STORAGE_FAILURE");
}

/**
 * Catalog-resolution failures, classified ONCE for every caller that resolves
 * an editorial target (the context service and the per-target resolutions of
 * the step commands).
 *
 * The resolver speaks in `HttpException`s: 404 (the key does not exist) and
 * 422 (an editorial link is broken) are EDITORIAL verdicts → the context is
 * unresolved. Anything else — a Prisma/pg/adapter failure, a bug — is
 * INFRASTRUCTURE and must surface as a storage failure, never as an editorial
 * judgement about content that may be perfectly fine.
 */
export function classifyCatalogError(err: unknown): never {
  if (err instanceof GuideLifecycleError) throw err;
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status >= 404 && status <= 422) {
      return guideFail("GUIDE_CONTEXT_UNRESOLVED");
    }
  }
  return guideFail("GUIDE_STORAGE_FAILURE");
}
