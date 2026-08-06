/**
 * GR-7 — the pure parser for the state route's two query parameters.
 *
 * The same grammar the recovery route enforces, kept as its own module and
 * its own error code so a 400 tells the caller which question was malformed.
 * Reusing the recovery parser would have meant answering
 * `GUIDE_INVALID_RECOVERY_QUERY` to somebody who never asked about recovery.
 *
 * Errors are value-free: the rejected key never reaches a message or a log.
 */

export const GUIDE_INVALID_STATE_QUERY = "GUIDE_INVALID_STATE_QUERY";

export class GuideStateQueryError extends Error {
  readonly code = GUIDE_INVALID_STATE_QUERY;
  constructor() {
    super(GUIDE_INVALID_STATE_QUERY); // message === code, no values
    this.name = "GuideStateQueryError";
  }
}

export interface GuideStateQuery {
  guideKey: string;
  guideVersion: number;
}

/** Same key grammar the catalog enforces — lowercase, bounded, no spaces. */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

export function parseGuideStateQuery(
  guideKey: unknown,
  guideVersion: unknown,
): GuideStateQuery {
  if (typeof guideKey !== "string" || !KEY_RE.test(guideKey)) {
    throw new GuideStateQueryError();
  }
  // Query strings arrive as text; only a canonical positive integer counts —
  // "1.0", " 1", "+1" and "1e0" are rejected rather than coerced.
  if (
    typeof guideVersion !== "string" ||
    !/^[1-9][0-9]{0,8}$/.test(guideVersion)
  ) {
    throw new GuideStateQueryError();
  }
  return { guideKey, guideVersion: Number(guideVersion) };
}
