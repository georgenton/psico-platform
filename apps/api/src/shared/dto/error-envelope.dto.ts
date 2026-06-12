/**
 * Unified error envelope returned by `HttpExceptionFilter` for every 4xx/5xx.
 *
 * Lives as a class (not an interface) so `@nestjs/swagger` reflects it into
 * the OpenAPI document. Controllers should reference it via:
 *
 *   @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
 *   @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
 *   ...etc.
 *
 * Shape must stay in lockstep with `HttpExceptionFilter.normalize()` output.
 * If you add a new field there, add it here too.
 */
export class ErrorEnvelopeDto {
  /** HTTP status code, e.g. 400, 401, 404, 422, 500. */
  statusCode!: number;

  /**
   * Machine-readable error code (SCREAMING_SNAKE_CASE), e.g.
   * `VALIDATION_ERROR`, `AUTH_INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED`.
   * Stable contract — clients branch on this, not `message`.
   */
  code!: string;

  /** Human-readable summary. Safe to surface to end-users. */
  message!: string;

  /**
   * Optional structured detail. For `VALIDATION_ERROR` this is the array of
   * class-validator constraint failures; for other codes it may carry
   * domain-specific context.
   */
  details?: unknown;

  /** ISO-8601 server timestamp at error time. */
  timestamp!: string;

  /** Request path that produced the error, e.g. `/api/auth/login`. */
  path!: string;
}
