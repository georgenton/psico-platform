import {
  normalizeBookSlug,
  normalizeChapterOrder,
} from "./guide-discovery-catalog";

/**
 * GR-4 — the pure parser for the discovery route's two path parameters.
 *
 * It exists to keep one distinction sharp, because collapsing it would be a
 * lie to the caller:
 *
 *   - a SYNTACTICALLY invalid parameter is a bad request (400). "chapter zero"
 *     is not a place a reader can stand;
 *   - a CANONICAL context that simply has no guided reading is a fine request
 *     with a negative answer (200 `available:false`).
 *
 * Errors are value-free: the received slug or order never reaches a message or
 * a log line — a path segment is untrusted input and echoing it back is how
 * reflected content ends up in an error surface.
 */

export const GUIDE_DISCOVERY_PARAMS_INVALID = "GUIDE_DISCOVERY_PARAMS_INVALID";

export class GuideDiscoveryParamsError extends Error {
  readonly code = GUIDE_DISCOVERY_PARAMS_INVALID;
  constructor() {
    super(GUIDE_DISCOVERY_PARAMS_INVALID); // message === code, no values
    this.name = "GuideDiscoveryParamsError";
  }
}

export interface GuideDiscoveryParams {
  bookSlug: string;
  chapterOrder: number;
}

/**
 * Parse and normalize. Throws `GuideDiscoveryParamsError` — never returns a
 * partially-valid pair, so a caller cannot accidentally query with a
 * half-parsed context.
 */
export function parseGuideDiscoveryParams(
  rawBookSlug: unknown,
  rawChapterOrder: unknown,
): GuideDiscoveryParams {
  const bookSlug = normalizeBookSlug(rawBookSlug);
  const chapterOrder = normalizeChapterOrder(rawChapterOrder);
  if (bookSlug === null || chapterOrder === null) {
    throw new GuideDiscoveryParamsError();
  }
  return { bookSlug, chapterOrder };
}
