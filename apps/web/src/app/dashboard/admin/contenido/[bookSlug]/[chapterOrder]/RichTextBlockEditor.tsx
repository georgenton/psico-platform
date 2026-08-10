"use client";

import { useCallback, useRef, useState } from "react";
import {
  isRangeFullyMarked,
  rebaseInlineMarks,
  safeInlineMarks,
  toInlineSegments,
  toggleInlineMark,
  withInlineMarks,
  type InlineTextMarkType,
} from "@psico/types";

/**
 * A textarea with three formatting buttons. Deliberately not more than that.
 *
 * ── Why the textarea stays ───────────────────────────────────────────────
 *
 * `contentEditable` would let us paint bold text in place, and it would also
 * make the browser the author of the content: it normalises whitespace, invents
 * elements on paste, and turns a blank line into something structural. Chapter
 * text is written by a person who cares where the blank lines are, and Content
 * Studio's whole design has the textarea holding exactly what they typed.
 *
 * The cost is honest: a textarea genuinely cannot show a substring underlined.
 * Rather than fake it, the formatting is shown in a small read-only preview
 * below, drawn with the SAME segmentation the reader uses — so what the editor
 * checks against is not a second interpretation of their marks.
 *
 * ── Selection ────────────────────────────────────────────────────────────
 *
 * Clicking a button blurs the textarea, and the selection is gone by the time
 * the click handler runs. So the selection is remembered on every interaction
 * and the buttons act on the remembered value. `onMouseDown` also prevents
 * default, which stops the blur happening at all in most browsers — belt and
 * braces, because losing the selection silently formats the wrong words.
 */

interface Props {
  content: string;
  meta: Record<string, unknown> | null;
  label: string;
  rows: number;
  onContentChange: (
    content: string,
    nextMeta: Record<string, unknown> | null,
  ) => void;
  onMetaChange: (meta: Record<string, unknown> | null) => void;
}

const BUTTONS: Array<{
  type: InlineTextMarkType;
  glyph: string;
  label: string;
  shortcut: string;
}> = [
  { type: "BOLD", glyph: "B", label: "Negrita", shortcut: "b" },
  { type: "ITALIC", glyph: "I", label: "Cursiva", shortcut: "i" },
  { type: "UNDERLINE", glyph: "U", label: "Subrayado", shortcut: "u" },
];

export function RichTextBlockEditor({
  content,
  meta,
  label,
  rows,
  onContentChange,
  onMetaChange,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  const marks = safeInlineMarks(meta, content);
  const hasSelection = selection.end > selection.start;

  const remember = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setSelection({ start: el.selectionStart, end: el.selectionEnd });
  }, []);

  /**
   * Text changed, so the marks have to move with it.
   *
   * `content` is passed through untouched. A mark is never rescued by editing
   * the text — the text is what a reader reads and what their highlights are
   * anchored to, and formatting is the thing that gives way.
   */
  const handleContent = useCallback(
    (next: string) => {
      const rebased = rebaseInlineMarks(marks, content, next);
      onContentChange(next, withInlineMarks(meta, rebased));
    },
    [content, marks, meta, onContentChange],
  );

  const apply = useCallback(
    (type: InlineTextMarkType) => {
      const { start, end } = selection;
      if (end <= start) return;
      onMetaChange(
        withInlineMarks(meta, toggleInlineMark(marks, type, start, end)),
      );
      // Give the selection back, so a second button applies to the same words.
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
      });
    },
    [marks, meta, onMetaChange, selection],
  );

  const segments = toInlineSegments(content, marks);

  return (
    <div>
      <div
        role="toolbar"
        aria-label={`Formato · ${label}`}
        className="mb-1 flex items-center gap-1"
      >
        {BUTTONS.map((b) => {
          const active =
            hasSelection &&
            isRangeFullyMarked(marks, b.type, selection.start, selection.end);
          return (
            <button
              key={b.type}
              type="button"
              aria-label={b.label}
              aria-pressed={active}
              disabled={!hasSelection}
              title={`${b.label} (⌘/Ctrl+${b.glyph})`}
              // Prevents the blur that would take the selection with it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(b.type)}
              className="h-7 w-7 rounded border text-[13px] disabled:opacity-40"
              style={{
                borderColor: "var(--color-warm-200)",
                background: active
                  ? "var(--color-lavender-100)"
                  : "transparent",
                color: active
                  ? "var(--color-lavender-700)"
                  : "var(--color-warm-700)",
                fontWeight: b.type === "BOLD" ? 700 : 500,
                fontStyle: b.type === "ITALIC" ? "italic" : "normal",
                textDecoration: b.type === "UNDERLINE" ? "underline" : "none",
              }}
            >
              {b.glyph}
            </button>
          );
        })}
        {!hasSelection && (
          <span
            className="ml-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Selecciona texto para darle formato
          </span>
        )}
      </div>

      <textarea
        ref={ref}
        value={content}
        onChange={(e) => handleContent(e.target.value)}
        onSelect={remember}
        onKeyUp={remember}
        onClick={remember}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          const hit = BUTTONS.find((b) => b.shortcut === e.key.toLowerCase());
          if (!hit) return;
          const el = e.currentTarget;
          if (el.selectionEnd <= el.selectionStart) return;
          // Only claim the shortcut when there is actually something to format;
          // otherwise the browser's own behaviour is left alone.
          e.preventDefault();
          setSelection({ start: el.selectionStart, end: el.selectionEnd });
          onMetaChange(
            withInlineMarks(
              meta,
              toggleInlineMark(
                marks,
                hit.type,
                el.selectionStart,
                el.selectionEnd,
              ),
            ),
          );
        }}
        aria-label={label}
        rows={rows}
        className="w-full resize-y rounded-lg border px-3 py-2 text-[14.5px] leading-[1.7]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />

      {marks.length > 0 && (
        <div className="mt-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Vista del formato
          </p>
          <p
            data-testid="format-preview"
            className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-[1.7]"
            style={{ color: "var(--color-warm-700)" }}
          >
            {/* The same segmentation the reader uses. A second interpretation
                here would be a preview that can disagree with the product. */}
            {segments.map((s, i) => (
              <span
                key={i}
                style={{
                  fontWeight: s.bold ? 700 : undefined,
                  fontStyle: s.italic ? "italic" : undefined,
                  textDecoration: s.underline ? "underline" : undefined,
                }}
              >
                {s.text}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
