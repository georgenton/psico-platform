import { HttpException, HttpStatus } from "@nestjs/common";
import type { LearningEventErrorCode } from "@psico/types";
import type { LearningCommandError } from "./learning-command-parser";
import {
  LearningEventIdempotencyConflictError,
  LearningEventInvalidInputError,
} from "./learning-event.repository";

/**
 * CC-7.3 — the single place learning error codes become HTTP responses.
 *
 * Every thrown exception carries ONLY the stable code (as `code` AND as the
 * message): never a received value, a payload, a stack, a Prisma message, an
 * internal catalog detail, or an entitlement reason. The global
 * HttpExceptionFilter serializes `{ statusCode, code, message, … }` from it.
 */

const CODE_STATUS: Record<LearningEventErrorCode, HttpStatus> = {
  LEARNING_EVENT_INVALID_PAYLOAD: HttpStatus.BAD_REQUEST,
  LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  LEARNING_EVENT_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  LEARNING_EVENT_SERVER_OWNED_TYPE: HttpStatus.BAD_REQUEST,
  LEARNING_EVENT_INVALID_TRANSITION: HttpStatus.CONFLICT,
  LEARNING_EVENT_UNKNOWN_UNIT: HttpStatus.NOT_FOUND,
  LEARNING_EVENT_UNKNOWN_CONCEPT: HttpStatus.NOT_FOUND,
  LEARNING_EVENT_UNKNOWN_ITEM: HttpStatus.NOT_FOUND,
  LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT: HttpStatus.UNPROCESSABLE_ENTITY,
  LEARNING_EVENT_FORBIDDEN: HttpStatus.FORBIDDEN,
  GUIDE_SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  GUIDE_SESSION_ALREADY_COMPLETED: HttpStatus.CONFLICT,
};

/** Build the value-free HTTP exception for a learning error code. */
export function learningException(code: LearningEventErrorCode): HttpException {
  return new HttpException({ code, message: code }, CODE_STATUS[code]);
}

/** A CC-7.1 parser rejection → 400 with the parser's own closed code. */
export function mapParserError(error: LearningCommandError): HttpException {
  return learningException(error.code);
}

/**
 * Run a repository call and translate its typed errors to HTTP:
 * idempotency conflict → 409, invalid input → 400. The sanitized
 * `LearningEventStorageError` is deliberately NOT translated — it surfaces
 * as the filter's generic 500 without any storage detail.
 */
export async function mapRepositoryErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LearningEventIdempotencyConflictError) {
      throw learningException("LEARNING_EVENT_IDEMPOTENCY_CONFLICT");
    }
    if (err instanceof LearningEventInvalidInputError) {
      throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
    }
    throw err;
  }
}
