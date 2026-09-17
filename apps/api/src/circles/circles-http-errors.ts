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
  /**
   * The ONE answer for every activity a caller may not act on right now:
   * unknown, another circle's, another guest's, a stage that does not accept
   * this command, a seat that already withdrew, a revoked session. Naming the
   * reason would confirm the activity exists.
   */
  | "CIRCLE_ACTIVITY_UNAVAILABLE"
  /** The template cannot be instantiated: unknown, DRAFT or ARCHIVED. */
  | "CIRCLE_TEMPLATE_UNAVAILABLE"
  /** The confirmation does not fit the template that defines the activity. */
  | "CIRCLE_SHARE_INVALID"
  /** Same idempotency key, different request. Never treated as a replay. */
  | "CIRCLE_IDEMPOTENCY_CONFLICT"
  /**
   * Continuing needs at least two people, organiser included.
   *
   * Named rather than folded into the opaque activity answer, and that is a
   * deliberate exception: the caller is the ORGANISER of a room they can
   * already see, so it confirms nothing they do not know, and the screen has
   * to be able to say «todavía no hay suficientes personas» instead of «esta
   * actividad no está disponible», which is the wrong sentence and the bug
   * this block exists to fix.
   */
  | "CIRCLE_GROUP_TOO_SMALL"
  /**
   * The group is not fixed yet, so there is nothing to confirm AGAINST.
   *
   * Also deliberately named, for the same reason and the same audience: a
   * person preparing inside a room that is still taking people in must be
   * told the confirmation is not open yet — not that the activity is gone.
   */
  | "CIRCLE_ONBOARDING_OPEN"
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
  // 404, like the invitation: "there is nothing here for you" is all a caller
  // learns, whatever the real reason.
  CIRCLE_ACTIVITY_UNAVAILABLE: HttpStatus.NOT_FOUND,
  CIRCLE_TEMPLATE_UNAVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CIRCLE_SHARE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CIRCLE_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  // 409: the request is well-formed and the caller is entitled to make it —
  // the room is simply not in a state where it can be honoured yet.
  CIRCLE_GROUP_TOO_SMALL: HttpStatus.CONFLICT,
  CIRCLE_ONBOARDING_OPEN: HttpStatus.CONFLICT,
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
