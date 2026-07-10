"use client";

import type { HighlightColor } from "@psico/types";

interface Props {
  /** Anchor position in viewport coordinates (selection's bounding rect). */
  x: number;
  y: number;
  onPick: (color: HighlightColor) => void;
  onAnnotate: () => void;
  /** Sprint B — take the selected passage to Eco to explore it. */
  onAskEco: () => void;
  onDismiss: () => void;
}

const COLORS: Array<{ color: HighlightColor; bg: string; label: string }> = [
  { color: "YELLOW", bg: "rgba(252, 211, 77, 0.85)", label: "Amarillo" },
  { color: "BLUE", bg: "rgba(125, 211, 252, 0.85)", label: "Azul" },
  { color: "PINK", bg: "rgba(244, 114, 182, 0.85)", label: "Rosa" },
];

/**
 * HighlightPopover — floating menu shown above the user's text selection.
 *
 * Three swatch buttons (YELLOW/BLUE/PINK) create a highlight on click.
 * The annotation button opens the side panel composer with the selection
 * already captured. Click outside (or pressing Escape) dismisses.
 *
 * Position
 * --------
 * We position with `position: fixed` and align by the selection's bounding
 * rect, with a small upward offset. Going `position: absolute` over the
 * scroller would chase the page on scroll; fixed plus a `selectionchange`
 * listener that updates the rect handles the common case.
 */
export function HighlightPopover({
  x,
  y,
  onPick,
  onAnnotate,
  onAskEco,
  onDismiss,
}: Props) {
  return (
    <div
      role="dialog"
      aria-label="Acciones de selección"
      className="reader-popover fixed z-50 flex items-center gap-1 rounded-full px-2 py-1.5 shadow-lg"
      style={{
        left: x,
        top: y,
        background: "var(--color-warm-900)",
        color: "var(--color-warm-50)",
        transform: "translate(-50%, -100%) translateY(-8px)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {COLORS.map((c) => (
        <button
          key={c.color}
          type="button"
          onClick={() => onPick(c.color)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ background: c.bg }}
          aria-label={`Subrayar en ${c.label}`}
        />
      ))}
      <span
        aria-hidden
        className="mx-1 h-5 w-px"
        style={{ background: "rgba(255,255,255,0.2)" }}
      />
      <button
        type="button"
        onClick={onAnnotate}
        className="rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{ background: "var(--color-lavender-500)", color: "white" }}
      >
        ✎ Nota
      </button>
      <button
        type="button"
        onClick={onAskEco}
        className="rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{ background: "var(--color-sage-400)", color: "white" }}
      >
        🌿 Eco
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar"
        className="ml-1 rounded-full px-2 text-[14px]"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        ×
      </button>
    </div>
  );
}
