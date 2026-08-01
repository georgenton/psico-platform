import { productionGuideRegistry } from "./guide-catalog";

/**
 * GR-4 — the SERVER-OWNED map from a reading context to an exact Guide pin.
 *
 * The reader knows where it is (`bookSlug` + `chapterOrder`); it must NOT know
 * which guide that implies. Putting that decision in the client would mean a
 * `if (bookSlug === …)` somewhere in the browser, and the pin would then be an
 * argument the client supplies rather than an answer the server gives.
 *
 * Editorial context lives HERE and never inside a `GuideDefinition`: a
 * definition is the pedagogical shape (three targets), and the server derives
 * its content context from those targets
 * (GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS). This catalog only says
 * "a reader standing here is offered that pin".
 *
 * There is no "latest" fallback and no default guide: an unlisted context has
 * no guide, full stop.
 */

export interface GuidePin {
  readonly guideKey: string;
  readonly guideVersion: number;
}

export interface GuideDiscoveryEntry {
  readonly bookSlug: string;
  /** PLATFORM chapter order, which is not always the book's own numbering. */
  readonly chapterOrder: number;
  readonly pin: GuidePin;
}

export type GuideDiscoveryErrorCode =
  | "GUIDE_DISCOVERY_CATALOG_INVALID"
  | "GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT"
  | "GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION"
  | "GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN";

/** Value-free catalog failure — a stable code and nothing else. */
export class GuideDiscoveryCatalogError extends Error {
  readonly code: GuideDiscoveryErrorCode;
  constructor(code: GuideDiscoveryErrorCode) {
    super(code);
    this.name = "GuideDiscoveryCatalogError";
    this.code = code;
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize an untrusted slug the same way for writes and lookups. */
export function normalizeBookSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/** A chapter order is a positive integer; anything else is not a context. */
export function normalizeChapterOrder(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function contextKey(bookSlug: string, chapterOrder: number): string {
  return `${bookSlug}#${chapterOrder}`;
}

function pinKey(pin: GuidePin): string {
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/**
 * Exact context → pin registry. Validates the WHOLE catalog at construction,
 * so a malformed entry is a boot-time failure rather than a runtime surprise
 * on whichever reader happens to open that chapter first.
 */
export class GuideDiscoveryCatalog {
  private readonly byContext = new Map<string, GuidePin>();

  constructor(
    entries: readonly GuideDiscoveryEntry[],
    registry: {
      getExact(k: string, v: number): unknown;
    } = productionGuideRegistry,
  ) {
    const contextsByPin = new Map<string, Set<string>>();

    for (const entry of entries) {
      const slug = normalizeBookSlug(entry.bookSlug);
      const order = normalizeChapterOrder(entry.chapterOrder);
      const pin = entry.pin;
      const shapeOk =
        slug !== null &&
        order !== null &&
        typeof pin?.guideKey === "string" &&
        pin.guideKey.length > 0 &&
        Number.isInteger(pin.guideVersion) &&
        pin.guideVersion > 0;
      if (!shapeOk || slug === null || order === null) {
        throw new GuideDiscoveryCatalogError("GUIDE_DISCOVERY_CATALOG_INVALID");
      }

      const ctx = contextKey(slug, order);
      if (this.byContext.has(ctx)) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT",
        );
      }

      // The pin must name a definition that really exists. A discovery entry
      // pointing at nothing would offer a guide that cannot start.
      try {
        registry.getExact(pin.guideKey, pin.guideVersion);
      } catch {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION",
        );
      }

      // One pin may legitimately serve one context only: the same guided
      // reading offered from two different chapters would make "where am I"
      // ambiguous for progress, resonance and copy.
      const seen = contextsByPin.get(pinKey(pin)) ?? new Set<string>();
      if (seen.size > 0) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN",
        );
      }
      seen.add(ctx);
      contextsByPin.set(pinKey(pin), seen);

      this.byContext.set(ctx, {
        guideKey: pin.guideKey,
        guideVersion: pin.guideVersion,
      });
    }
  }

  /**
   * EXACT lookup. Never first-match, never "latest", never a default: an
   * unlisted context returns null and the caller reports unavailable.
   */
  getExactContext(bookSlug: string, chapterOrder: number): GuidePin | null {
    const slug = normalizeBookSlug(bookSlug);
    const order = normalizeChapterOrder(chapterOrder);
    if (slug === null || order === null) return null;
    return this.byContext.get(contextKey(slug, order)) ?? null;
  }

  get size(): number {
    return this.byContext.size;
  }
}

/**
 * The PRODUCTION discovery map.
 *
 * Parejas is keyed by PLATFORM chapterOrder 2 — the book's own chapter 1. The
 * ingest manifest gave order 1 to the preface, so a reader on order 1 gets no
 * guide, which is correct: there is no guided reading for a preface.
 */
export const PRODUCTION_GUIDE_DISCOVERY_ENTRIES: readonly GuideDiscoveryEntry[] =
  [
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      pin: { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 },
    },
    {
      bookSlug: "parejas-que-perduran",
      chapterOrder: 2,
      pin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
    },
  ];

export const productionGuideDiscoveryCatalog = new GuideDiscoveryCatalog(
  PRODUCTION_GUIDE_DISCOVERY_ENTRIES,
);
