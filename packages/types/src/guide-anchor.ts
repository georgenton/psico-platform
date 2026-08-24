/**
 * GR-3 — the reader anchor of Guide V1.
 *
 * The passage this guide points at is EDITORIAL identity: a heading and a
 * sentence, both approved by the product owner. It is deliberately NOT a
 * `blockKey`.
 *
 * Content Core derives `blockKey` as a uuidv5 of the legacy `ChapterBlock.id`
 * (CC-1, ADR 0016), so the same paragraph has a DIFFERENT key in every
 * environment where the chapter was ingested. A literal key in this catalog
 * would be true in one database and a lie in the next — it would resolve to
 * nothing, or worse, to somebody else's paragraph.
 *
 * So the catalog says what a human editor can verify by reading the book, and
 * the resolver below turns that into a runtime reference against the blocks the
 * reader was actually served. Fail closed at every step: zero matches or more
 * than one is UNRESOLVED / AMBIGUOUS, never "probably the first one".
 *
 * It lives in the shared package for one reason: the test that ingests the
 * canonical chapter into a real database has to exercise THIS function. A
 * second copy under `apps/api` would prove only that the copy works.
 */

export interface GuideReaderAnchorLocator {
  guideKey: string;
  guideVersion: number;

  bookSlug: string;
  chapterOrder: number;

  /** The section heading, verbatim as the chapter prints it. */
  sourceHeading: string;
  /** The last sentence of the approved passage — its unique fingerprint. */
  passageLastSentence: string;

  /** How many paragraphs may contain the sentence. More than this is a bug. */
  expectedMatchCount: 1;
}

/**
 * The approved anchor (GR3_ANCHOR_CANDIDATE_1_APPROVED_BY_JORGE=true).
 * `docs/product/guided-reading-v1.md` records the editorial decision.
 */
export const GUIDE_READER_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "El cuerpo y la emoción",
  passageLastSentence:
    "Nuestro cuerpo siente antes que nuestra mente entienda.",
  expectedMatchCount: 1,
};

/**
 * The anchor of the Parejas guide — `docs/product/parejas-guide-v1-first-definition.md`.
 *
 * The passage is the paragraph that describes the experiment the guide is
 * about: couples in conflict, ten minutes of silent contact, no apologies and
 * no solutions. That is the CONCEPT, not the practice. The chapter's own
 * activity («Ejercicio 3: El Mapa de las Miradas») is the source of the
 * practice step and is deliberately NOT this anchor: its section contains the
 * numbered instructions and nothing conceptual, so pointing here would scroll
 * the reader to «1. Siéntense frente a frente…» while the panel talked about
 * why sustained contact changes a couple's state.
 *
 * ⚠️  `sourceHeading` is honest about an uncomfortable fact. The edition in
 * production is `OCR_UNFINALIZED` (see the package's own `source-accounting.txt`:
 * ~270 of 1150 blocks land as HEADING because OCR leaves short unpunctuated
 * lines). This chapter has exactly three headings a human would call editorial:
 * two «Ejercicio N» activity titles and one testimony title that OCR printed
 * TWICE. None of them bounds the conceptual passage, so the heading that does
 * is a mangled line — unique, verbatim, and verifiable against the hash-checked
 * package, but not something an editor would recognise from the printed book.
 *
 * It is written down rather than worked around because the alternative is
 * worse: silently anchoring to a practice step, or widening the resolver until
 * it guesses. When the master (non-OCR) edition replaces this one the chapter
 * is re-ingested, and this locator MUST be re-validated — the anchor spec and
 * the pg probe are what will say so, loudly, instead of the guide quietly
 * pointing at the wrong paragraph.
 *
 * Measured against a real PostgreSQL ingestion of the authorised package:
 * `HEADING_MATCH_COUNT=1 · PASSAGE_MATCH_COUNT=1 · STATUS=RESOLVED`.
 */
export const PAREJAS_READER_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
  bookSlug: "parejas-que-perduran",
  // The book's chapter 1 is PLATFORM order 2 — the ingest manifest gave order 1
  // to the preface. Keying this by 1 would search the preface and fail closed.
  chapterOrder: 2,
  sourceHeading:
    "Suran no solo las o pende xn - Escribió el Poeta Rumi: A lo demás», y a Veces",
  passageLastSentence:
    "La hormona no requería consenso, solo presencia (Scheele et al., 2016).",
  expectedMatchCount: 1,
};

/** The shape a registry lookup is keyed by: one immutable guide definition. */
export interface GuideAnchorPin {
  guideKey: string;
  guideVersion: number;
}

/**
 * GR-4 — one anchor per pin, looked up exactly.
 *
 * The registry exists so a second book cannot be served the first book's
 * passage. Three absences are the whole point:
 *
 *   - no "latest version": a pin this build does not know is `null`, never the
 *     nearest one. A version bump is an editorial change, and answering a v2
 *     request with the v1 passage would scroll the reader somewhere the new
 *     definition never approved;
 *   - no fallback to the first registered anchor. An unknown guide has no
 *     passage, and the reader must refuse to run rather than borrow one;
 *   - no `blockKey`. Content Core derives it per environment (CC-1), so a
 *     literal here would be true in one database and a lie in the next.
 *
 * Registration is validated at construction: a malformed pin, a duplicate pin,
 * an empty heading or sentence is a programming error worth crashing on at
 * import time, not a `null` discovered by a reader mid-chapter.
 */
export class GuideAnchorRegistry {
  private readonly byPin = new Map<string, GuideReaderAnchorLocator>();

  constructor(anchors: readonly GuideReaderAnchorLocator[]) {
    for (const a of anchors) {
      const key = anchorPinKey(a);
      if (!key) {
        throw new Error(
          `GuideAnchorRegistry: malformed pin for "${a.guideKey}"`,
        );
      }
      if (this.byPin.has(key)) {
        throw new Error(`GuideAnchorRegistry: duplicate anchor for ${key}`);
      }
      if (!a.sourceHeading.trim() || !a.passageLastSentence.trim()) {
        throw new Error(`GuideAnchorRegistry: empty locator field in ${key}`);
      }
      if (!a.bookSlug.trim() || !Number.isInteger(a.chapterOrder)) {
        throw new Error(`GuideAnchorRegistry: invalid context in ${key}`);
      }
      this.byPin.set(key, a);
    }
  }

  /** The anchor for EXACTLY this pin, or `null`. Never a nearby one. */
  getExact(pin: GuideAnchorPin): GuideReaderAnchorLocator | null {
    const key = anchorPinKey(pin);
    if (!key) return null;
    return this.byPin.get(key) ?? null;
  }
}

/** Same grammar the web's pin module enforces: kebab-case key, positive int. */
const ANCHOR_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function anchorPinKey(pin: GuideAnchorPin): string | null {
  if (typeof pin?.guideKey !== "string" || !ANCHOR_KEY_RE.test(pin.guideKey)) {
    return null;
  }
  if (!Number.isInteger(pin.guideVersion) || pin.guideVersion <= 0) return null;
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/** The anchors this build ships. Adding a guide means adding a line here. */
export const guideAnchorRegistry = new GuideAnchorRegistry([
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
]);

/** The shape the resolver needs from a reader block. Structural on purpose:
 * it accepts the reader's projected block without importing its whole type. */
export interface AnchorCandidateBlock {
  /** The id the reader renders (`legacyBlockId ?? blockKey`) — the DOM anchor. */
  id: string;
  kind: string;
  content: string;
  /** Content Core identity. Absent on legacy blocks ⇒ UNRESOLVED. */
  blockKey?: string;
  blockVersionId?: string | null;
}

/**
 * The runtime reference, at BLOCK granularity.
 *
 * Deliberately no character offsets. The reader points at the paragraph — it
 * scrolls to it, focuses it and tints the whole block — so offsets would be a
 * field nobody reads, and one that cannot always be computed honestly: the
 * match runs on normalized text (collapsed whitespace, NFC, case-folded) while
 * offsets would have to describe the RAW string. When a line break sits inside
 * the sentence those two disagree, and a contract that says "characters 0 to
 * 57" while meaning "the whole paragraph" is worse than not saying it.
 */
export type GuideAnchorResolution =
  | {
      status: "RESOLVED";
      blockKey: string;
      blockVersionId: string;
      /** The DOM id to scroll to and focus. */
      renderBlockId: string;
    }
  | { status: "UNRESOLVED" | "AMBIGUOUS" };

const UNRESOLVED = { status: "UNRESOLVED" } as const;
const AMBIGUOUS = { status: "AMBIGUOUS" } as const;

/**
 * Compare the way a reader would, not the way a byte stream does: NFC so
 * composed and decomposed accents match, collapsed whitespace so a line break
 * in the source is the same word gap, and case-insensitive so a heading in
 * small caps still matches. Nothing here strips accents — «esta» and «está»
 * are different words and must stay different.
 */
function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

/**
 * Resolve the editorial anchor against the blocks this reader was served.
 *
 * 1. find the heading, exactly (normalized);
 * 2. bound the search at the NEXT heading — a sentence that also appears in a
 *    later section is not this anchor;
 * 3. find exactly one paragraph containing the approved sentence;
 * 4. require the Content Core identity — a legacy block cannot be anchored.
 */
export function resolveGuideAnchor(
  blocks: readonly AnchorCandidateBlock[],
  locator: GuideReaderAnchorLocator = GUIDE_READER_ANCHOR,
): GuideAnchorResolution {
  const heading = normalize(locator.sourceHeading);
  const headingIndex = blocks.findIndex(
    (b) => b.kind === "HEADING" && normalize(b.content) === heading,
  );
  if (headingIndex === -1) return UNRESOLVED;

  const nextHeading = blocks.findIndex(
    (b, i) => i > headingIndex && b.kind === "HEADING",
  );
  const section = blocks.slice(
    headingIndex + 1,
    nextHeading === -1 ? blocks.length : nextHeading,
  );

  const needle = normalize(locator.passageLastSentence);
  const matches = section.filter((b) => normalize(b.content).includes(needle));
  if (matches.length === 0) return UNRESOLVED;
  if (matches.length > locator.expectedMatchCount) return AMBIGUOUS;

  const block = matches[0] as AnchorCandidateBlock;
  // Without the stable identity we cannot say WHICH text this is; anchoring a
  // legacy block would tie the guide to an id that changes when it is edited.
  if (!block.blockKey || !block.blockVersionId) return UNRESOLVED;

  return {
    status: "RESOLVED",
    blockKey: block.blockKey,
    blockVersionId: block.blockVersionId,
    renderBlockId: block.id,
  };
}

/**
 * C.3R (#639) — `anchorAppliesTo` was deleted here, deliberately.
 *
 * It answered "does this guide belong to the chapter on screen?" by comparing
 * the anchor's `(bookSlug, chapterOrder)` with the reader's. That is placement
 * compared against placement: after an editorial reorder the guide followed the
 * NUMBER, so it appeared over whichever unit inherited it and vanished from the
 * unit it is actually about.
 *
 * The question now belongs to the server, which resolves the guide's editorial
 * target and the reader's unit to internal ids inside one snapshot and compares
 * THOSE — see `GuideReaderApplicabilityService`. Neither id crosses the wire;
 * what arrives is a closed word (`APPLIES` | `UNAVAILABLE`).
 *
 * It is deleted rather than deprecated because a positional fallback is exactly
 * what must not be reachable: a caller that could still ask would get a
 * confident wrong answer on a reordered book, and "we also have a server
 * verdict" is no defence if a browser can decide without it.
 *
 * What stays here is `resolveGuideAnchor`, which answers a different question:
 * WHERE in these blocks the approved passage is. That is about the text served,
 * not about which chapter it belongs to.
 */
