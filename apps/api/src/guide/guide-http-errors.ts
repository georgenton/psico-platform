import { HttpException, HttpStatus } from "@nestjs/common";
import type { GuideApiErrorCode } from "@psico/types";
import { GuideLifecycleError } from "./guide-errors";
import type { GuideCommandError } from "./guide-command-parser";

/**
 * CC-7.4D — the single place Guide codes become HTTP responses.
 *
 * The eight lifecycle codes are NOT widened here: this file only decides which
 * status each already-closed code deserves, and adds the two PARSING codes for
 * bodies that never reached the lifecycle. Every exception carries ONLY the
 * stable code (as `code` AND as the message) — never a received value, an id, a
 * catalog detail, an entitlement reason, or a Prisma/pg/Nest/resolver message.
 * The global HttpExceptionFilter serializes the standard envelope from it.
 *
 * A FOREIGN session and a NONEXISTENT one both map to 404 through the same
 * `GUIDE_SESSION_NOT_FOUND` — identical status, code and envelope.
 */
const CODE_STATUS: Record<GuideApiErrorCode, HttpStatus> = {
  // Request shape — the command never ran.
  GUIDE_INVALID_PAYLOAD: HttpStatus.BAD_REQUEST,
  GUIDE_IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,

  // Ownership / access.
  GUIDE_SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  GUIDE_FORBIDDEN: HttpStatus.FORBIDDEN,

  // The command is well-formed but the CURRENT state cannot accept it.
  GUIDE_SESSION_INVALID_TRANSITION: HttpStatus.CONFLICT,
  GUIDE_STEP_NOT_CURRENT: HttpStatus.CONFLICT,
  GUIDE_CONTEXT_MISMATCH: HttpStatus.CONFLICT,

  // The command does not describe this guide / the catalog cannot answer.
  GUIDE_STEP_COMMAND_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  GUIDE_CONTEXT_UNRESOLVED: HttpStatus.UNPROCESSABLE_ENTITY,

  // Infrastructure — never an editorial verdict.
  GUIDE_STORAGE_FAILURE: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Build the value-free HTTP exception for a Guide code. */
export function guideException(code: GuideApiErrorCode): HttpException {
  return new HttpException({ code, message: code }, CODE_STATUS[code]);
}

/** A parser rejection → 400 with the parser's own closed code. */
export function mapGuideParserError(error: GuideCommandError): HttpException {
  return guideException(error.code);
}

/**
 * Run a lifecycle command and translate its closed error into HTTP. Anything
 * that is not a `GuideLifecycleError` is re-thrown untouched so the global
 * filter turns it into the generic 500 — this layer never invents a code for
 * an error it does not recognise.
 */
export async function mapGuideLifecycleErrors<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GuideLifecycleError) {
      throw guideException(err.code);
    }
    throw err;
  }
}
