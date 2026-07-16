/**
 * Content Core — anchor resolver (CC-1, pure).
 *
 * An anchor (highlight/annotation) references a STABLE ContentBlock by `blockKey`.
 * Resolution is against the current published revision's live blocks:
 *   - block present, offsets still frame `quote`     → "attached"
 *   - block present, quote re-located elsewhere      → "shifted"  (offsets updated)
 *   - block present, quote gone but block alive      → "shifted"  (stale offsets; UI shows quote)
 *   - block absent (no version in this revision)     → "tombstoned" (NEVER deleted)
 *
 * See docs/architecture/content-core.md §9 and ADR 0016.
 */

export type AnchorStatus = "attached" | "shifted" | "tombstoned";

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

export function resolveAnchor(
  anchor: Anchor,
  liveByKey: Map<string, LiveBlock>,
): ResolvedAnchor {
  const block = liveByKey.get(anchor.blockKey);
  if (!block) {
    return {
      status: "tombstoned",
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    };
  }

  const framed = block.content.slice(anchor.startOffset, anchor.endOffset);
  if (framed === anchor.quote) {
    return {
      status: "attached",
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    };
  }

  const idx =
    anchor.quote.length > 0 ? block.content.indexOf(anchor.quote) : -1;
  if (idx >= 0) {
    return {
      status: "shifted",
      startOffset: idx,
      endOffset: idx + anchor.quote.length,
    };
  }

  // Block identity survives but the quoted text is gone → shifted with stale
  // offsets. The block is NOT tombstoned (it still exists), and the mark is never
  // dropped; the UI renders the preserved quote.
  return {
    status: "shifted",
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
  };
}
