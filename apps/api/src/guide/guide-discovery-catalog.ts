import { productionGuideRegistry } from "./guide-catalog";
import { flagEnabled } from "../shared/flags";

/**
 * GR-4 — the SERVER-OWNED map from a reading context to its guided readings.
 *
 * The reader knows where it is (`bookSlug` + `chapterOrder`); it must NOT know
 * which guides that implies. Putting that decision in the client would mean a
 * `if (bookSlug === …)` somewhere in the browser, and the pin would then be an
 * argument the client supplies rather than an answer the server gives.
 *
 * Editorial context lives HERE and never inside a `GuideDefinition`: a
 * definition is the pedagogical shape (three targets), and the server derives
 * its content context from those targets
 * (GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS). This catalog only says
 * "a reader standing here is offered these pins, in this order".
 *
 * There is no "latest" fallback and no default guide: an unlisted context has
 * no guide, full stop.
 *
 * ── Why a context now holds a LIST ─────────────────────────────────────────
 *
 * V1 mapped one context to one pin, and the catalog refused a second entry as
 * DUPLICATE_CONTEXT. That was right while a chapter had one guided reading and
 * wrong the moment EEC-C01 got five: the refusal was protecting an assumption
 * about how much a chapter can teach, not an invariant about identity.
 *
 * What stays exact is everything that matters: a pin still names one published
 * definition, a pin still belongs to one context, and the order inside a
 * context is declared rather than inferred from array position — so a
 * reordering is a visible edit, and two entries claiming the same slot fail at
 * boot instead of racing.
 *
 * `getExactContext` is kept as the V1 adapter and returns the FIRST pin, so
 * callers written before this change keep compiling and keep working.
 */

export interface GuidePin {
  readonly guideKey: string;
  readonly guideVersion: number;
}

/**
 * What a reader is offered, and what the card needs to render before any
 * session exists. The copy is editorial and lives here rather than in the
 * client for the same reason the pin does.
 */
export interface GuideDiscoveryEntry {
  readonly bookSlug: string;
  /** PLATFORM chapter order, which is not always the book's own numbering. */
  readonly chapterOrder: number;
  readonly pin: GuidePin;
  /** Position within the chapter's guided route, 1-based and contiguous. */
  readonly order: number;
  readonly title: string;
  readonly description: string;
  /** Human range as the editorial inventory states it, e.g. "7–9". */
  readonly estimatedMinutes: string;
}

/**
 * What the MATERIALIZED V1 binary is answered when it asks a context for "the"
 * guide. Separate from the route on purpose — see `getExactContext`.
 */
export interface GuideLegacyPinEntry {
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly pin: GuidePin;
}

/** One offered guided reading, resolved and ordered. */
export interface GuideDiscoveryItem {
  readonly pin: GuidePin;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: string;
}

export type GuideDiscoveryErrorCode =
  | "GUIDE_DISCOVERY_CATALOG_INVALID"
  | "GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT"
  | "GUIDE_DISCOVERY_CATALOG_DUPLICATE_ORDER"
  | "GUIDE_DISCOVERY_CATALOG_NON_CONTIGUOUS_ORDER"
  | "GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION"
  | "GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN"
  | "GUIDE_DISCOVERY_CATALOG_LEGACY_INVALID"
  | "GUIDE_DISCOVERY_CATALOG_LEGACY_DUPLICATE_CONTEXT"
  | "GUIDE_DISCOVERY_CATALOG_LEGACY_UNKNOWN_DEFINITION";

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
 * Exact context → ordered pins. Validates the WHOLE catalog at construction,
 * so a malformed entry is a boot-time failure rather than a runtime surprise
 * on whichever reader happens to open that chapter first.
 */
export class GuideDiscoveryCatalog {
  private readonly byContext = new Map<string, GuideDiscoveryItem[]>();
  private readonly legacyByContext = new Map<string, GuidePin>();

  constructor(
    entries: readonly GuideDiscoveryEntry[],
    legacyPins: readonly GuideLegacyPinEntry[] = [],
    registry: {
      getExact(k: string, v: number): unknown;
    } = productionGuideRegistry,
  ) {
    const contextsByPin = new Map<string, Set<string>>();
    const ordersByContext = new Map<string, Set<number>>();

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
        pin.guideVersion > 0 &&
        Number.isInteger(entry.order) &&
        entry.order > 0 &&
        typeof entry.title === "string" &&
        entry.title.trim().length > 0 &&
        typeof entry.description === "string" &&
        entry.description.trim().length > 0 &&
        typeof entry.estimatedMinutes === "string" &&
        entry.estimatedMinutes.trim().length > 0;
      if (!shapeOk || slug === null || order === null) {
        throw new GuideDiscoveryCatalogError("GUIDE_DISCOVERY_CATALOG_INVALID");
      }

      const ctx = contextKey(slug, order);

      // Two guided readings may share a context; two may NOT share a slot in
      // it. Without this the route's order would depend on array position,
      // which is exactly the kind of thing a merge reorders by accident.
      const slots = ordersByContext.get(ctx) ?? new Set<number>();
      if (slots.has(entry.order)) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_DUPLICATE_ORDER",
        );
      }
      slots.add(entry.order);
      ordersByContext.set(ctx, slots);

      // The pin must name a definition that really exists. A discovery entry
      // pointing at nothing would offer a guide that cannot start.
      try {
        registry.getExact(pin.guideKey, pin.guideVersion);
      } catch {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION",
        );
      }

      // One pin still serves ONE context: the same guided reading offered from
      // two different chapters would make "where am I" ambiguous for progress,
      // resonance and copy. That invariant is untouched by the list.
      const seen = contextsByPin.get(pinKey(pin)) ?? new Set<string>();
      seen.add(ctx);
      if (seen.size > 1) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN",
        );
      }
      contextsByPin.set(pinKey(pin), seen);

      const list = this.byContext.get(ctx) ?? [];
      // A pin repeated inside one context would offer the same reading twice.
      if (list.some((i) => pinKey(i.pin) === pinKey(pin))) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT",
        );
      }
      list.push({
        pin: { guideKey: pin.guideKey, guideVersion: pin.guideVersion },
        order: entry.order,
        title: entry.title,
        description: entry.description,
        estimatedMinutes: entry.estimatedMinutes,
      });
      this.byContext.set(ctx, list);
    }

    // Sort once, at construction, and demand 1..n with no holes. A route that
    // jumps from 2 to 4 is a deletion somebody forgot to finish, and the
    // reader would silently renumber it into something plausible.
    for (const [ctx, list] of this.byContext) {
      list.sort((a, b) => a.order - b.order);
      const contiguous = list.every((item, i) => item.order === i + 1);
      if (!contiguous) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_NON_CONTIGUOUS_ORDER",
        );
      }
      this.byContext.set(ctx, Object.freeze(list) as GuideDiscoveryItem[]);
    }

    for (const legacy of legacyPins) {
      const slug = normalizeBookSlug(legacy.bookSlug);
      const order = normalizeChapterOrder(legacy.chapterOrder);
      const pin = legacy.pin;
      const ok =
        slug !== null &&
        order !== null &&
        typeof pin?.guideKey === "string" &&
        pin.guideKey.length > 0 &&
        Number.isInteger(pin.guideVersion) &&
        pin.guideVersion > 0;
      if (!ok || slug === null || order === null) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_LEGACY_INVALID",
        );
      }
      const ctx = contextKey(slug, order);
      if (this.legacyByContext.has(ctx)) {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_LEGACY_DUPLICATE_CONTEXT",
        );
      }
      // The old binary will try to bind whatever comes back, so a pin naming a
      // definition this build does not ship would fail at the write instead of
      // at boot — during a rolling deploy, on somebody's draft.
      try {
        registry.getExact(pin.guideKey, pin.guideVersion);
      } catch {
        throw new GuideDiscoveryCatalogError(
          "GUIDE_DISCOVERY_CATALOG_LEGACY_UNKNOWN_DEFINITION",
        );
      }
      this.legacyByContext.set(ctx, {
        guideKey: pin.guideKey,
        guideVersion: pin.guideVersion,
      });
    }
  }

  /**
   * @deprecated COMPATIBILITY ONLY — the pin the materialized V1 binary gets.
   *
   * New code must never call this. Use `listContext` to show the route and
   * `offersPin` to validate a start.
   *
   * ── Why it does not answer with the route's first step ────────────────────
   *
   * The rolling-deploy gate materialises the previous `experience` module and
   * runs it against THIS tree, so the old `createDraft` calls this method and
   * binds whatever it returns. Keeping the signature while changing the answer
   * is compatibility on paper only: measured, it made the old binary reserve,
   * publish and race on MG01 under the pilot's lineage, and the reservation
   * refused it — `EXPERIENCE_LINEAGE_ALREADY_BOUND`, five of seven tests.
   *
   * So the legacy answer is DECLARED, not derived. A context absent from the
   * legacy map returns null, which is the truthful answer for a chapter the old
   * binary never knew: better a "no guide here" than a guide it was never
   * designed to bind.
   */
  getExactContext(bookSlug: string, chapterOrder: number): GuidePin | null {
    const slug = normalizeBookSlug(bookSlug);
    const order = normalizeChapterOrder(chapterOrder);
    if (slug === null || order === null) return null;
    return this.legacyByContext.get(contextKey(slug, order)) ?? null;
  }

  /**
   * The whole guided route for a context, ordered. Empty when unlisted — and
   * empty when the route's kill switch is off.
   *
   * The switch lives HERE rather than at the endpoint so every reader of the
   * route sees the same answer: discovery, the single-pin adapter and the start
   * validation would otherwise be able to disagree, and a chapter that offers a
   * guide it refuses to start is worse than one that offers none.
   *
   * It gates the OFFER only. `getExactContext` is untouched (the V1 binary must
   * keep working through a rollback), the definitions stay registered, and a
   * session already pinned resolves from the registry without ever asking this.
   */
  listContext(
    bookSlug: string,
    chapterOrder: number,
  ): readonly GuideDiscoveryItem[] {
    const slug = normalizeBookSlug(bookSlug);
    const order = normalizeChapterOrder(chapterOrder);
    if (slug === null || order === null) return [];
    const list = this.byContext.get(contextKey(slug, order)) ?? [];
    if (
      slug === "emociones-en-construccion" &&
      order === 1 &&
      !flagEnabled("EEC_C01_GUIDED_SUITE_V1")
    ) {
      return [];
    }
    return list;
  }

  /** Is this exact pin offered at this context? Used to validate a start. */
  offersPin(bookSlug: string, chapterOrder: number, pin: GuidePin): boolean {
    return this.listContext(bookSlug, chapterOrder).some(
      (i) =>
        i.pin.guideKey === pin.guideKey &&
        i.pin.guideVersion === pin.guideVersion,
    );
  }

  /** Number of CONTEXTS, unchanged in meaning from V1. */
  get size(): number {
    return this.byContext.size;
  }

  /** Contexts that answer the V1 adapter. */
  get legacySize(): number {
    return this.legacyByContext.size;
  }

  /** Number of offered guided readings across every context. */
  get entryCount(): number {
    let n = 0;
    for (const list of this.byContext.values()) n += list.length;
    return n;
  }
}

/**
 * The PRODUCTION discovery map.
 *
 * Parejas is keyed by PLATFORM chapterOrder 2 — the book's own chapter 1. The
 * ingest manifest gave order 1 to the preface, so a reader on order 1 gets no
 * guide, which is correct: there is no guided reading for a preface.
 *
 * EEC-C01 offers the five-microguide route. The V1 pilot
 * (`eec-c1-cuerpo-antes-que-mente@1`) is deliberately ABSENT from this map and
 * that is not a deletion: its definition, its sessions and its resonances are
 * untouched, a session already pinned to it still resolves, and only NEW
 * discovery stops offering it. Its editorial anchor no longer resolves against
 * the published chapter anyway — it pointed at a heading the v1.0 text does not
 * contain — so continuing to offer it would send readers at a passage that is
 * not there.
 */
export const PRODUCTION_GUIDE_DISCOVERY_ENTRIES: readonly GuideDiscoveryEntry[] =
  [
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      order: 1,
      pin: { guideKey: "eec-c1-teorias-como-lentes", guideVersion: 1 },
      title: "Las teorías son lentes, no la escena",
      description:
        "Cada teoría responde a ciertas preguntas e ilumina una parte. Revisa una creencia cotidiana separando lo que observas de lo que supones.",
      estimatedMinutes: "7–9",
    },
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      order: 2,
      pin: { guideKey: "eec-c1-rostro-como-pista", guideVersion: 1 },
      title: "El rostro es una pista, no un diccionario",
      description:
        "Una misma expresión cambia de sentido según la persona y la situación. Compara varias lecturas plausibles de una sonrisa.",
      estimatedMinutes: "8–10",
    },
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      order: 3,
      pin: { guideKey: "eec-c1-alarma-antes-del-relato", guideVersion: 1 },
      title: "La alarma antes del relato",
      description:
        "Una respuesta de protección puede empezar antes de que entiendas qué pasa. Ordena la secuencia entre señal, reacción, contexto e interpretación.",
      estimatedMinutes: "8–10",
    },
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      order: 4,
      pin: { guideKey: "eec-c1-emocion-informa-no-manda", guideVersion: 1 },
      title: "La emoción informa; no manda",
      description:
        "Sentir, interpretar, querer hacer y elegir son cosas distintas. Sepáralas en una situación cotidiana y leve.",
      estimatedMinutes: "10–12",
    },
    {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      order: 5,
      pin: {
        guideKey: "eec-c1-construida-no-significa-falsa",
        guideVersion: 1,
      },
      title: "Construida no significa falsa",
      description:
        "Las mismas señales del cuerpo pueden significar cosas distintas según el contexto. Eso no vuelve la emoción irreal ni voluntaria.",
      estimatedMinutes: "9–11",
    },
    {
      bookSlug: "parejas-que-perduran",
      chapterOrder: 2,
      order: 1,
      pin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
      title: "El contacto sostenido en silencio",
      description:
        "Diez minutos de contacto, sin disculpas ni soluciones: qué cambia cuando el cuerpo llega antes que las palabras.",
      estimatedMinutes: "10–12",
    },
  ];

/**
 * What the previous binary is answered, per context.
 *
 * These are NOT startable through the new route — `listContext` does not
 * mention the pilot and `offersPin` refuses it — and they are not derived from
 * the route either. They are the pins the deployed-and-being-replaced code
 * already binds, written down so a rolling deploy keeps meaning what it meant.
 *
 * EEC-C01 keeps the V1 pilot. Parejas keeps its sole pin, which happens to be
 * both its legacy answer and its whole route; stating it twice is the point —
 * the two contracts agree here by coincidence, not by construction.
 *
 * This map shrinks when the compatibility gate stops materialising the V1
 * module, and not before.
 */
export const PRODUCTION_LEGACY_GUIDE_PINS: readonly GuideLegacyPinEntry[] = [
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
  PRODUCTION_LEGACY_GUIDE_PINS,
);
