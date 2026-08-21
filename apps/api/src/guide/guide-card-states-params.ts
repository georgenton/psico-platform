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
 * Unknown properties are REFUSED, at the root and inside every pin. Ignoring
 * them is the friendlier-looking choice and the worse one: a caller that sends
 * `guideVerison` gets a confident answer about a guide it never asked about,
 * and a field this endpoint does not implement — `userId`, `force`,
 * `includeSession` — reads as accepted. Silence about an unread field is a
 * promise nobody made.
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
  /**
   * Where the reader is. Navigation plus an environment-local token — never
   * `contentUnitId`, which this endpoint refuses to accept from a client.
   */
  reader: { bookSlug: string; chapterOrder: number; unitKey: string };
}

/**
 * Same key grammar the catalog enforces — lowercase, bounded, no spaces.
 *
 * Exported as the pattern STRING because three surfaces must agree on it: this
 * parser, the OpenAPI document, and the API client that validates before it
 * spends a round trip. A ratchet compares the three; the constant is what makes
 * that comparison possible instead of a promise in a comment.
 */
export const GUIDE_CARD_STATES_KEY_PATTERN = "^[a-z0-9][a-z0-9._:-]{0,199}$";
const KEY_RE = new RegExp(GUIDE_CARD_STATES_KEY_PATTERN);

/** A chapter's list, generously bounded. */
export const GUIDE_CARD_STATES_MAX_PINS = 25;

/** The largest version a pin may name — a version, not an identifier. */
export const GUIDE_CARD_STATES_MAX_VERSION = 999_999_999;

const ROOT_KEYS = ["pins", "reader"] as const;
const READER_KEYS = ["bookSlug", "chapterOrder", "unitKey"] as const;

/** A book slug: the same key grammar, since it is one. */
const SLUG_RE = KEY_RE;
/**
 * A `unitKey` is a uuidv5 in this build, but the parser bounds SHAPE rather
 * than format: it is an environment-local token the server re-resolves, so
 * pinning a uuid grammar here would refuse a future ingest for no safety gain.
 * What matters is that it is a bounded, non-empty, printable string.
 */
const UNIT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/** Chapter numbering is 1-based and generously bounded. */
const MAX_CHAPTER_ORDER = 10_000;
const PIN_KEYS = ["guideKey", "guideVersion"] as const;

/**
 * Refuse anything this endpoint does not read.
 *
 * `Object.keys` only walks own enumerable string keys, which is exactly the
 * surface `JSON.parse` produces — so a prototype-polluted payload cannot smuggle
 * a field past here, and a symbol nobody can send is not treated as a violation.
 */
function onlyKeys(value: object, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new GuideCardStatesBodyError();
  }
}

/**
 * Parse and normalize, or throw. Never returns a partially parsed batch, so a
 * caller cannot end up querying with some pins validated and others guessed.
 */
export function parseGuideCardStatesBody(body: unknown): GuideCardStatesQuery {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new GuideCardStatesBodyError();
  }
  onlyKeys(body, ROOT_KEYS);
  const raw = (body as { pins?: unknown }).pins;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new GuideCardStatesBodyError();
  }
  if (raw.length > GUIDE_CARD_STATES_MAX_PINS) {
    throw new GuideCardStatesBodyError();
  }

  const pins = raw.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new GuideCardStatesBodyError();
    }
    onlyKeys(entry, PIN_KEYS);
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
      guideVersion > GUIDE_CARD_STATES_MAX_VERSION
    ) {
      throw new GuideCardStatesBodyError();
    }
    return { guideKey, guideVersion };
  });

  const readerRaw = (body as { reader?: unknown }).reader;
  if (
    typeof readerRaw !== "object" ||
    readerRaw === null ||
    Array.isArray(readerRaw)
  ) {
    throw new GuideCardStatesBodyError();
  }
  onlyKeys(readerRaw, READER_KEYS);
  const { bookSlug, chapterOrder, unitKey } = readerRaw as {
    bookSlug?: unknown;
    chapterOrder?: unknown;
    unitKey?: unknown;
  };
  if (typeof bookSlug !== "string" || !SLUG_RE.test(bookSlug)) {
    throw new GuideCardStatesBodyError();
  }
  if (typeof unitKey !== "string" || !UNIT_KEY_RE.test(unitKey)) {
    throw new GuideCardStatesBodyError();
  }
  if (
    typeof chapterOrder !== "number" ||
    !Number.isInteger(chapterOrder) ||
    chapterOrder <= 0 ||
    chapterOrder > MAX_CHAPTER_ORDER
  ) {
    throw new GuideCardStatesBodyError();
  }

  return { pins, reader: { bookSlug, chapterOrder, unitKey } };
}
