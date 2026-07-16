/**
 * Content Core — anchor resolver (CC-1, pure) — FAIL CLOSED on ambiguity.
 *
 * An anchor references a STABLE ContentBlock by `blockKey`. Resolution against the
 * current published revision's live blocks NEVER auto-reanchors to the first
 * occurrence:
 *   - block absent                          → "tombstoned" (never deleted)
 *   - stored offsets still frame `quote`    → "attached"
 *   - `quote` occurs exactly once           → "shifted"    (offsets re-located)
 *   - `quote` does not occur                → "unresolved"
 *   - `quote` occurs more than once         → "ambiguous"  (stored offsets kept)
 *
 * See docs/architecture/content-core.md §9 and ADR 0016.
 */

export type AnchorStatus =
  | "attached"
  | "shifted"
  | "unresolved"
  | "ambiguous"
  | "tombstoned";

export interface LiveBlock {
  blockKey: string;
  content: string;
}

export interface Anchor {
  blockKey: string;
  startOffset: number;
  endOffset: number;
  /** Exact selected text at creation — the durable fallback. */
  quote: string;
}

export interface ResolvedAnchor {
  status: AnchorStatus;
  startOffset: number;
  endOffset: number;
}

/** Count NON-overlapping occurrences of `needle` in `haystack` (with first index). */
function countOccurrences(
  haystack: string,
  needle: string,
): { count: number; first: number } {
  if (needle.length === 0) return { count: 0, first: -1 };
  let count = 0;
  let first = -1;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    if (first < 0) first = idx;
    count += 1;
    from = idx + needle.length;
  }
  return { count, first };
}

export function resolveAnchor(
  anchor: Anchor,
  liveByKey: Map<string, LiveBlock>,
): ResolvedAnchor {
  const stored = {
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
  };

  const block = liveByKey.get(anchor.blockKey);
  if (!block) return { status: "tombstoned", ...stored };

  const framed = block.content.slice(anchor.startOffset, anchor.endOffset);
  if (anchor.quote.length > 0 && framed === anchor.quote) {
    return { status: "attached", ...stored };
  }

  const { count, first } = countOccurrences(block.content, anchor.quote);
  if (count === 0) return { status: "unresolved", ...stored };
  if (count > 1) return { status: "ambiguous", ...stored };

  // Exactly one occurrence → the only case where re-anchoring is unambiguous.
  return {
    status: "shifted",
    startOffset: first,
    endOffset: first + anchor.quote.length,
  };
}
