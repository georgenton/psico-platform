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

/** Whether this reader screen is the one the anchor belongs to. */
export function anchorAppliesTo(
  bookSlug: string,
  chapterOrder: number,
  locator: GuideReaderAnchorLocator = GUIDE_READER_ANCHOR,
): boolean {
  return bookSlug === locator.bookSlug && chapterOrder === locator.chapterOrder;
}
