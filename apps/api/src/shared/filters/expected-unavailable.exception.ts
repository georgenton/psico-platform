import { ServiceUnavailableException } from "@nestjs/common";

/**
 * A 503 that is an ANSWER, not a failure.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * `HttpExceptionFilter` treats every 5xx the same way: a full stack trace in
 * the log and an event to Sentry. That is right for an unhandled error, and
 * wrong for a probe whose whole job is to say «not yet» out loud.
 *
 * The readiness endpoint is the case that made it visible. Its service is
 * careful to log on TRANSITION — its own comment says «a public endpoint
 * being polled while the schema is behind would otherwise write the same
 * error line forever, which buries the one occurrence that mattered» — and
 * then the controller threw a 503 that the filter logged on EVERY request.
 * The defence was written and never applied. During the one incident the
 * probe exists to signal, the log fills with the same stack and Sentry fills
 * with the same event; and since that endpoint is public and rate-limited
 * per IP, a stranger can produce the noise on purpose.
 *
 * ── Why a class and not a list of codes ──────────────────────────────────
 *
 * A list in the filter would put the decision far from the handler that
 * knows it, and it would be a string match: rename the code and the quiet
 * treatment silently stops applying. Throwing this type IS the declaration,
 * it travels with the throw, and the compiler keeps the two in step.
 *
 * ── What it does not change ──────────────────────────────────────────────
 *
 * The response is byte-for-byte the same 503 envelope. Only the operator's
 * side changes: one `warn` line instead of a stack and an alert. Anything
 * that is genuinely unexpected must keep using the ordinary exception, or
 * this becomes a way to hide failures.
 */
export class ExpectedUnavailableException extends ServiceUnavailableException {
  constructor(payload: { code: string; message: string; details?: unknown }) {
    super(payload);
  }
}
