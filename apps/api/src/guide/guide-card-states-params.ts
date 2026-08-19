/**
 * C.1 — the pure parser for the experience card-state batch.
 *
 * Same distinction the recovery and state parsers draw: a syntactically
 * impossible pin is a bad request, while a well-formed pin with no session is
 * a fine request with a `START` answer. Collapsing them would mean answering
 * "not started" to a question nobody asked.
 *
 * The cap is not a performance knob. A chapter shows a list a human reads, and
 * an unbounded batch turns one authenticated request into as much work as the
 * caller likes. Twenty-five is far above any published chapter and far below
 * anything worth worrying about.
 *
 * Duplicates are NOT rejected and NOT deduped here: two experiences may be
 * deliberately bound to the same guide, and they genuinely share a state. The
 * caller gets one answer per requested position, in the requested order.
 *
 * Errors are value-free — a received key never reaches a message or a log line.
 */

export const GUIDE_INVALID_CARD_STATES_BODY = "GUIDE_INVALID_CARD_STATES_BODY";

export class GuideCardStatesBodyError extends Error {
  readonly code = GUIDE_INVALID_CARD_STATES_BODY;
  constructor() {
    super(GUIDE_INVALID_CARD_STATES_BODY); // message === code, no values
    this.name = "GuideCardStatesBodyError";
  }
}

export interface GuideCardStatesQuery {
  pins: Array<{ guideKey: string; guideVersion: number }>;
}

/** Same key grammar the catalog enforces — lowercase, bounded, no spaces. */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

/** A chapter's list, generously bounded. */
export const GUIDE_CARD_STATES_MAX_PINS = 25;

/**
 * Parse and normalize, or throw. Never returns a partially parsed batch, so a
 * caller cannot end up querying with some pins validated and others guessed.
 */
export function parseGuideCardStatesBody(body: unknown): GuideCardStatesQuery {
  if (typeof body !== "object" || body === null) {
    throw new GuideCardStatesBodyError();
  }
  const raw = (body as { pins?: unknown }).pins;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new GuideCardStatesBodyError();
  }
  if (raw.length > GUIDE_CARD_STATES_MAX_PINS) {
    throw new GuideCardStatesBodyError();
  }

  const pins = raw.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new GuideCardStatesBodyError();
    }
    const { guideKey, guideVersion } = entry as {
      guideKey?: unknown;
      guideVersion?: unknown;
    };
    if (typeof guideKey !== "string" || !KEY_RE.test(guideKey)) {
      throw new GuideCardStatesBodyError();
    }
    // JSON carries real numbers, so this is not the query-string case: only a
    // canonical positive integer counts. `1.5`, `-1`, `0` and `1e400` are
    // rejected rather than coerced into something that looks like a version.
    if (
      typeof guideVersion !== "number" ||
      !Number.isInteger(guideVersion) ||
      guideVersion <= 0 ||
      guideVersion > 999_999_999
    ) {
      throw new GuideCardStatesBodyError();
    }
    return { guideKey, guideVersion };
  });

  return { pins };
}
