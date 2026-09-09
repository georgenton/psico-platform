import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * The single place Círculos codes become HTTP responses (PR2).
 *
 * Two properties matter more than the list itself.
 *
 * **Uniformity.** An invitation that never existed, one that was mistyped, one
 * that expired, one already used and one revoked all produce the SAME status,
 * the SAME code and the SAME body: `CIRCLE_INVITATION_UNUSABLE`. There is no
 * variant that says "expired" — telling somebody their guess was structurally
 * right but late is telling them their guess was structurally right. The same
 * rule covers guest sessions: unknown, expired and revoked are one answer.
 *
 * **Value-freedom.** Every exception carries ONLY the stable code, as `code`
 * and as `message`. Never a token, never a code, never an id, never a rollout
 * mode or allowlist, never a Prisma/pg message. The global `HttpExceptionFilter`
 * serializes the standard envelope from it.
 */
export type CirclesApiErrorCode =
  /** Rollout gate. Opaque by design: it never says the mode or the reason. */
  | "CIRCLES_UNAVAILABLE"
  /** Request shape — the command never ran. */
  | "CIRCLE_INVALID_PAYLOAD"
  /**
   * The ONE answer for every unusable invitation: nonexistent, malformed,
   * expired, consumed, declined or revoked.
   */
  | "CIRCLE_INVITATION_UNUSABLE"
  /** The ONE answer for every unusable guest session. */
  | "CIRCLE_GUEST_SESSION_INVALID"
  /** A resolved actor that may not act on this resource. */
  | "CIRCLE_FORBIDDEN"
  /** Infrastructure — never an editorial or authorization verdict. */
  | "CIRCLE_STORAGE_FAILURE";

const CODE_STATUS: Record<CirclesApiErrorCode, HttpStatus> = {
  CIRCLES_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  CIRCLE_INVALID_PAYLOAD: HttpStatus.BAD_REQUEST,
  // 404, not 401/410: "there is nothing here for you" is the only thing an
  // unauthenticated caller learns, whatever the real reason.
  CIRCLE_INVITATION_UNUSABLE: HttpStatus.NOT_FOUND,
  CIRCLE_GUEST_SESSION_INVALID: HttpStatus.UNAUTHORIZED,
  CIRCLE_FORBIDDEN: HttpStatus.FORBIDDEN,
  CIRCLE_STORAGE_FAILURE: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Build the value-free HTTP exception for a Círculos code. */
export function circlesException(code: CirclesApiErrorCode): HttpException {
  return new HttpException({ code, message: code }, CODE_STATUS[code]);
}

/**
 * A domain failure that has not yet been given a status. Thrown by the service
 * and the repositories; the controller boundary maps it. `cause` is never set —
 * a driver message can embed the very value this layer exists to keep out.
 */
export class CirclesError extends Error {
  constructor(readonly code: CirclesApiErrorCode) {
    super(code);
    this.name = "CirclesError";
  }
}

/**
 * Run a command and translate its closed error into HTTP. Anything that is not
 * a `CirclesError` is re-thrown untouched, so the global filter turns it into
 * the generic 500: this layer never invents a code for an error it does not
 * recognise.
 */
export async function mapCirclesErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CirclesError) throw circlesException(err.code);
    throw err;
  }
}
