/**
 * GR-5 — the pure parser for the recovery route's two query parameters.
 *
 * Same distinction the discovery parser draws, for the same reason: a
 * syntactically impossible pin is a bad request, while a well-formed pin with
 * no session is a fine request with a negative answer. Collapsing them would
 * mean answering "no session" to a question nobody actually asked.
 *
 * Errors are value-free — the received key never reaches a message or a log
 * line.
 */

export const GUIDE_INVALID_RECOVERY_QUERY = "GUIDE_INVALID_RECOVERY_QUERY";

export class GuideRecoveryQueryError extends Error {
  readonly code = GUIDE_INVALID_RECOVERY_QUERY;
  constructor() {
    super(GUIDE_INVALID_RECOVERY_QUERY); // message === code, no values
    this.name = "GuideRecoveryQueryError";
  }
}

export interface GuideRecoveryQuery {
  guideKey: string;
  guideVersion: number;
}

/** Same key grammar the catalog enforces — lowercase, bounded, no spaces. */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

/**
 * Parse and normalize, or throw. Never returns a half-valid pin, so a caller
 * cannot accidentally query with one field parsed and the other guessed.
 */
export function parseGuideRecoveryQuery(
  guideKey: unknown,
  guideVersion: unknown,
): GuideRecoveryQuery {
  if (typeof guideKey !== "string" || !KEY_RE.test(guideKey)) {
    throw new GuideRecoveryQueryError();
  }
  // Query strings arrive as text; only a canonical positive integer counts —
  // "1.0", " 1", "+1" and "1e0" are all rejected rather than coerced.
  if (
    typeof guideVersion !== "string" ||
    !/^[1-9][0-9]{0,8}$/.test(guideVersion)
  ) {
    throw new GuideRecoveryQueryError();
  }
  return { guideKey, guideVersion: Number(guideVersion) };
}
