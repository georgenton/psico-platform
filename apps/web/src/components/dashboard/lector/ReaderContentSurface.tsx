"use client";

import type { ChapterBlockSummary, HighlightSummary } from "@psico/types";
import { BlockRenderer } from "./BlockRenderer";

/**
 * ReaderContentSurface — the chapter's blocks, and nothing else.
 *
 * There is exactly one block renderer in this product, and this is how two very
 * different callers share it:
 *
 *   the reader — lifecycle around it (heartbeat, marks, guide) → this surface
 *   Content Studio — a draft preview with no lifecycle at all → this surface
 *
 * The alternative was a `mode="preview"` flag threaded through `LectorShell`,
 * which would have put "am I real?" checks next to every write it performs. One
 * missed check is a preview that starts a reading session; the shape here makes
 * that impossible, because the writes are simply not in scope.
 *
 * It renders a FRAGMENT, not a container. The reader's typography wrapper, its
 * notices and its activities section stay exactly where they were, so adopting
 * this changed no DOM in the live reader.
 *
 * Everything about marks is optional. Omitted, the surface is pure: no
 * highlights, no annotation badges, no refs handed out, no callbacks — which is
 * precisely what a preview of unpublished text should be.
 */

interface Props {
  blocks: ChapterBlockSummary[];
  /** Highlights per block, keyed by `blockKey` when present, else block id. */
  highlightsByBlock?: Map<string, HighlightSummary[]>;
  /** Annotation counts, keyed the same way. */
  annotationsByBlock?: Map<string, number>;
  onAnnotateBlock?: (blockId: string) => void;
  registerRef?: (blockId: string, el: HTMLElement | null) => void;
  /** GR-3 — a passing highlight from the guided panel. Never persisted. */
  flashBlockId?: string | null;
}

/** Handed to the renderer when nobody is observing. Stable, so it never re-runs. */
const NO_REF = () => {};
const NO_HIGHLIGHTS: HighlightSummary[] = [];

export function ReaderContentSurface({
  blocks,
  highlightsByBlock,
  annotationsByBlock,
  onAnnotateBlock,
  registerRef,
  flashBlockId,
}: Props) {
  return (
    <>
      {blocks.map((b) => {
        const markKey = b.blockKey ?? b.id;
        return (
          <BlockRenderer
            key={b.id}
            block={b}
            highlights={highlightsByBlock?.get(markKey) ?? NO_HIGHLIGHTS}
            annotationCount={annotationsByBlock?.get(markKey) ?? 0}
            onAnnotateClick={onAnnotateBlock}
            registerRef={registerRef ?? NO_REF}
            flash={flashBlockId === b.id}
          />
        );
      })}
    </>
  );
}
