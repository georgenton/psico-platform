"use client";

import type {
  ChapterBlockSummary,
  HighlightColor,
  HighlightSummary,
} from "@psico/types";
import { videoBlockInfo } from "@psico/types";
import { VideoBlock } from "./VideoBlock";

interface Props {
  block: ChapterBlockSummary;
  /** Highlights anchored to this block. */
  highlights: HighlightSummary[];
  /** Annotation icon click handler — opens the side panel scrolled to that block. */
  onAnnotateClick?: (blockId: string) => void;
  /** Annotation count for this block (renders a small badge). */
  annotationCount: number;
  /** Receives a ref to the block element so the heartbeat hook can observe its intersection. */
  registerRef: (blockId: string, el: HTMLElement | null) => void;
}

/**
 * BlockRenderer — renders a single ChapterBlock per its `kind`.
 *
 * Each block gets a `data-block-id` so we can:
 *   1. Use IntersectionObserver to detect which block is currently
 *      "active" in the viewport (for `lastBlockId` in the heartbeat).
 *   2. Hit-test text selection back to a block when the user creates
 *      a highlight.
 *
 * The renderer is intentionally simple — markdown-style for prose and
 * dedicated wrappers for the four "special" kinds (HEADING, QUOTE, PAUSE,
 * EXERCISE). When we add IMAGE/AUDIO support, those go here too.
 *
 * Highlights overlay
 * ------------------
 * For each highlight on this block, we split the content into segments
 * and wrap the highlighted range in a `<mark>` with color from
 * `HighlightColor`. We sort highlights by `startOffset` then by `endOffset
 * desc` to render the longest one first when they overlap; overlapping
 * highlights without proper interval merging would render as garbage.
 */
const COLOR_BG: Record<HighlightColor, string> = {
  YELLOW: "rgba(252, 211, 77, 0.45)",
  BLUE: "rgba(125, 211, 252, 0.45)",
  PINK: "rgba(244, 114, 182, 0.45)",
};

export function BlockRenderer({
  block,
  highlights,
  onAnnotateClick,
  annotationCount,
  registerRef,
}: Props) {
  // Video capsule (VIDEO kind, or a legacy 🎬 EXERCISE mock). Rendered by a
  // dedicated player; no highlight/annotation overlay applies.
  const video = videoBlockInfo(block);
  if (video) return <VideoBlock info={video} blockId={block.id} />;

  const isQuote = block.kind === "QUOTE";
  const isHeading = block.kind === "HEADING";
  const isPause = block.kind === "PAUSE";
  const isExercise = block.kind === "EXERCISE";

  // Rendered content with highlights overlaid.
  const rendered = renderWithHighlights(block.content, highlights);

  const baseProps = {
    "data-block-id": block.id,
    "data-block-kind": block.kind,
    ref: (el: HTMLElement | null) => registerRef(block.id, el),
  };

  // Annotation indicator — small button in the gutter for blocks that have
  // existing annotations. Click opens the side panel; create-flow lives in
  // a separate button shown after a selection (see HighlightLayer).
  const annotationBadge = annotationCount > 0 && (
    <button
      type="button"
      onClick={() => onAnnotateClick?.(block.id)}
      className="ml-3 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        background: "var(--color-lavender-100)",
        color: "var(--color-lavender-700)",
      }}
      aria-label={`Ver ${annotationCount} nota(s) en este bloque`}
    >
      {annotationCount}
    </button>
  );

  if (isHeading) {
    return (
      <h2
        {...baseProps}
        className="reader-block reader-block-heading mt-10 mb-4 text-[24px] font-bold leading-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        <span className="reader-text">{rendered}</span>
        {annotationBadge}
      </h2>
    );
  }

  if (isQuote) {
    return (
      <blockquote
        {...baseProps}
        className="reader-block reader-block-quote my-6 border-l-[3px] pl-5 italic"
        style={{
          borderColor: "var(--color-lavender-300)",
          color: "var(--color-warm-700)",
        }}
      >
        <span className="reader-text">{rendered}</span>
        {annotationBadge}
      </blockquote>
    );
  }

  if (isPause) {
    return (
      <aside
        {...baseProps}
        className="reader-block reader-block-pause my-6 rounded-2xl px-5 py-4 text-[14px]"
        style={{
          background: "var(--color-sage-50)",
          border: "1.5px solid var(--color-sage-200)",
          color: "var(--color-sage-800)",
        }}
      >
        <div
          className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-sage-700)" }}
        >
          🌿 Pausa
        </div>
        <span className="reader-text">{rendered}</span>
        {annotationBadge}
      </aside>
    );
  }

  if (isExercise) {
    return (
      <aside
        {...baseProps}
        className="reader-block reader-block-exercise my-6 rounded-2xl px-5 py-4"
        style={{
          background: "var(--color-lavender-50)",
          border: "1.5px solid var(--color-lavender-200)",
        }}
      >
        <div
          className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ✎ Ejercicio
        </div>
        <span
          className="reader-text text-[14px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          {rendered}
        </span>
        {annotationBadge}
      </aside>
    );
  }

  // Default: PARAGRAPH.
  return (
    <p
      {...baseProps}
      className="reader-block reader-block-paragraph my-4 leading-[1.7]"
      style={{ color: "var(--color-warm-800)" }}
    >
      <span className="reader-text">{rendered}</span>
      {annotationBadge}
    </p>
  );
}

// ── Highlight overlay ────────────────────────────────────────────────────

function renderWithHighlights(
  content: string,
  highlights: HighlightSummary[],
): React.ReactNode {
  if (highlights.length === 0) return content;

  // Sort by start; we walk left-to-right and skip overlapping ranges (v1
  // tolerates partial overlaps by ignoring the second one — proper interval
  // merging arrives in a follow-up sprint).
  const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.startOffset < cursor || h.endOffset > content.length) continue;
    if (h.startOffset > cursor) {
      out.push(content.slice(cursor, h.startOffset));
    }
    out.push(
      <mark
        key={h.id}
        data-highlight-id={h.id}
        style={{
          background: COLOR_BG[h.color],
          color: "inherit",
          borderRadius: "2px",
          padding: "0 1px",
        }}
        title={h.note ?? undefined}
      >
        {content.slice(h.startOffset, h.endOffset)}
      </mark>,
    );
    cursor = h.endOffset;
  }
  if (cursor < content.length) {
    out.push(content.slice(cursor));
  }
  return out;
}
