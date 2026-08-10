/**
 * Editorial inline formatting — bold, italic, underline, and nothing else.
 *
 * ── The one rule everything else follows from ────────────────────────────
 *
 * `block.content` stays EXACTLY the text a reader sees. Formatting is stored
 * beside it as offsets, never inside it as syntax.
 *
 *   content:      "Este texto es importante"
 *   inlineMarks:  [{ type: "UNDERLINE", startOffset: 11, endOffset: 23 }]
 *
 * Not `"<u>…</u>"`. Not `"__…__"`. The reason is not taste: a reader's
 * Highlight is a pair of character offsets into `content`, and Content Core
 * derives block identity from the text itself. Put four characters of markup in
 * front of a highlighted phrase and every highlight after it silently points at
 * the wrong words — on content people have already annotated. Formatting is the
 * newer, smaller concern; it is the one that has to bend.
 *
 * ── Offsets ──────────────────────────────────────────────────────────────
 *
 * Plain JavaScript string indices — UTF-16 code units — because that is what
 * `Highlight.startOffset` already means and what `content.slice()` already
 * does. An emoji outside the BMP counts as two. That is not ideal in the
 * abstract, but two indexing conventions in one string is far worse than one
 * imperfect convention, so this deliberately matches what exists.
 *
 * ── Ranges ───────────────────────────────────────────────────────────────
 *
 * Half-open, `[startOffset, endOffset)`. Same-type ranges are merged when they
 * touch or overlap; different types overlap freely, which is how bold+underline
 * on partially different spans works.
 *
 * Everything here is pure: no React, no DOM. Web and mobile consume the same
 * functions so a mark cannot mean one thing in a browser and another on a
 * phone.
 */

export const INLINE_MARK_TYPES = ["BOLD", "ITALIC", "UNDERLINE"] as const;

export type InlineTextMarkType = (typeof INLINE_MARK_TYPES)[number];

export interface InlineTextMark {
  type: InlineTextMarkType;
  startOffset: number;
  endOffset: number;
}

/** Where formatting lives on a block. Not a column, not a table. */
export const INLINE_MARKS_META_KEY = "inlineMarks";

function isSupportedType(value: unknown): value is InlineTextMarkType {
  return (
    typeof value === "string" &&
    (INLINE_MARK_TYPES as readonly string[]).includes(value)
  );
}

/**
 * A real, finite, whole number.
 *
 * `Number.isInteger` already rejects NaN and both infinities, and a numeric
 * string is not a number — an offset that arrived as `"5"` is a client that
 * lost track of its own types, and coercing it would hide that.
 */
function isOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Read marks out of arbitrary stored metadata.
 *
 * Returns `null` when the value is absent, and throws only through
 * `assertValidInlineMarks`. Readers call this and fall back to plain text;
 * writers call the strict assertion. Same grammar, two postures — a reader
 * refusing to draw a chapter because one mark is malformed would turn a
 * cosmetic defect into a missing chapter.
 */
export function readInlineMarks(
  meta: Record<string, unknown> | null | undefined,
): InlineTextMark[] | null {
  if (!meta) return null;
  const raw = meta[INLINE_MARKS_META_KEY];
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;

  const marks: InlineTextMark[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (!isSupportedType(e.type)) return null;
    if (!isOffset(e.startOffset) || !isOffset(e.endOffset)) return null;
    if (e.endOffset <= e.startOffset) return null;
    marks.push({
      type: e.type,
      startOffset: e.startOffset,
      endOffset: e.endOffset,
    });
  }
  return marks;
}

/**
 * The reader's posture: whatever is usable, nothing that throws.
 *
 * Out-of-bounds ranges are clamped and empty ones dropped rather than rejecting
 * the block, because the failure this guards against is a chapter that will not
 * render at all.
 */
export function safeInlineMarks(
  meta: Record<string, unknown> | null | undefined,
  content: string,
): InlineTextMark[] {
  const parsed = readInlineMarks(meta);
  if (parsed === null) return [];
  const clamped = parsed
    .map((m) => ({
      type: m.type,
      startOffset: Math.min(m.startOffset, content.length),
      endOffset: Math.min(m.endOffset, content.length),
    }))
    .filter((m) => m.endOffset > m.startOffset);
  return canonicalizeInlineMarks(clamped);
}

export type InlineMarksProblem =
  | "NOT_AN_ARRAY"
  | "NOT_AN_OBJECT"
  | "UNSUPPORTED_TYPE"
  | "OFFSET_NOT_INTEGER"
  | "NEGATIVE_OFFSET"
  | "EMPTY_RANGE"
  | "OUT_OF_BOUNDS";

/**
 * The writer's posture: say exactly what is wrong, and refuse.
 *
 * Returns the problem rather than a message. The caller decides what an editor
 * should read; a validator that writes copy ends up leaking its own vocabulary
 * into someone's screen.
 */
export function validateInlineMarks(
  raw: unknown,
  content: string,
): InlineMarksProblem | null {
  if (!Array.isArray(raw)) return "NOT_AN_ARRAY";
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return "NOT_AN_OBJECT";
    const e = entry as Record<string, unknown>;
    if (!isSupportedType(e.type)) return "UNSUPPORTED_TYPE";
    for (const key of ["startOffset", "endOffset"] as const) {
      const v = e[key];
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        !Number.isInteger(v)
      ) {
        return "OFFSET_NOT_INTEGER";
      }
      if (v < 0) return "NEGATIVE_OFFSET";
    }
    const start = e.startOffset as number;
    const end = e.endOffset as number;
    if (end <= start) return "EMPTY_RANGE";
    if (end > content.length) return "OUT_OF_BOUNDS";
  }
  return null;
}

/**
 * Deterministic ordering, with same-type ranges merged when they touch.
 *
 * Determinism is not cosmetic here: these marks are persisted in `meta`, and
 * two orderings of the same formatting would look like an editorial change to
 * anything that compares revisions.
 */
export function canonicalizeInlineMarks(
  marks: readonly InlineTextMark[],
): InlineTextMark[] {
  const out: InlineTextMark[] = [];

  for (const type of INLINE_MARK_TYPES) {
    const ofType = marks
      .filter((m) => m.type === type && m.endOffset > m.startOffset)
      .sort(
        (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset,
      );

    let current: InlineTextMark | null = null;
    for (const m of ofType) {
      if (current && m.startOffset <= current.endOffset) {
        // Touching or overlapping: `[0,5)` and `[5,10)` describe one run of
        // bold text, and storing them apart would be a difference with no
        // meaning.
        current.endOffset = Math.max(current.endOffset, m.endOffset);
        continue;
      }
      current = { ...m };
      out.push(current);
    }
  }

  return out.sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      a.endOffset - b.endOffset ||
      INLINE_MARK_TYPES.indexOf(a.type) - INLINE_MARK_TYPES.indexOf(b.type),
  );
}

/** Is every character of `[start, end)` already carrying this mark? */
export function isRangeFullyMarked(
  marks: readonly InlineTextMark[],
  type: InlineTextMarkType,
  start: number,
  end: number,
): boolean {
  if (end <= start) return false;
  let cursor = start;
  for (const m of canonicalizeInlineMarks(marks)) {
    if (m.type !== type) continue;
    if (m.startOffset > cursor) break;
    if (m.endOffset > cursor) cursor = m.endOffset;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

/**
 * Apply or remove one mark type over a selection.
 *
 * "Already fully covered" means remove, which is what a toggle button implies
 * and what every editor a person has used does. Removing from the middle of a
 * run splits it, which is why this subtracts intervals rather than deleting
 * whole marks.
 */
export function toggleInlineMark(
  marks: readonly InlineTextMark[],
  type: InlineTextMarkType,
  start: number,
  end: number,
): InlineTextMark[] {
  if (end <= start) return canonicalizeInlineMarks(marks);

  const others = marks.filter((m) => m.type !== type);
  const same = canonicalizeInlineMarks(marks.filter((m) => m.type === type));

  if (isRangeFullyMarked(same, type, start, end)) {
    const remaining: InlineTextMark[] = [];
    for (const m of same) {
      // Left leftover.
      if (m.startOffset < start) {
        remaining.push({
          type,
          startOffset: m.startOffset,
          endOffset: Math.min(m.endOffset, start),
        });
      }
      // Right leftover.
      if (m.endOffset > end) {
        remaining.push({
          type,
          startOffset: Math.max(m.startOffset, end),
          endOffset: m.endOffset,
        });
      }
    }
    return canonicalizeInlineMarks([
      ...others,
      ...remaining.filter((m) => m.endOffset > m.startOffset),
    ]);
  }

  return canonicalizeInlineMarks([
    ...others,
    ...same,
    { type, startOffset: start, endOffset: end },
  ]);
}

// ── Rebasing marks across a text edit ──────────────────────────────────────

/**
 * The single splice between two strings, from the longest common prefix and
 * suffix.
 *
 * Enough for a person typing in a textarea, which is the only editor that
 * exists here. It is NOT a diff algorithm and does not pretend to be: two edits
 * far apart in one keystroke batch collapse into one wide splice, which the
 * rebase below then handles conservatively.
 */
export function singleSplice(
  oldText: string,
  newText: string,
): { start: number; removed: number; inserted: number } {
  if (oldText === newText) return { start: 0, removed: 0, inserted: 0 };

  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix += 1;

  let suffix = 0;
  const maxSuffix = Math.min(oldText.length - prefix, newText.length - prefix);
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] ===
      newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    start: prefix,
    removed: oldText.length - prefix - suffix,
    inserted: newText.length - prefix - suffix,
  };
}

/**
 * Move marks so they still describe the same words after the text changed.
 *
 * The rule when it is genuinely ambiguous — an edit straddling a mark's
 * boundary — is to TRIM rather than guess. Formatting that quietly wandered
 * onto neighbouring words is worse than formatting that shrank: one is wrong
 * and invisible, the other is visible and easy to reapply.
 *
 * `content` is never touched to rescue a mark. The text is the authority.
 */
export function rebaseInlineMarks(
  marks: readonly InlineTextMark[],
  oldContent: string,
  newContent: string,
): InlineTextMark[] {
  if (oldContent === newContent) return canonicalizeInlineMarks(marks);

  const { start, removed, inserted } = singleSplice(oldContent, newContent);
  const end = start + removed;
  const delta = inserted - removed;

  const moved: InlineTextMark[] = [];
  for (const m of marks) {
    // Entirely before the edit: untouched.
    if (m.endOffset <= start) {
      moved.push({ ...m });
      continue;
    }
    // Entirely after: shifts wholesale.
    if (m.startOffset >= end) {
      moved.push({
        type: m.type,
        startOffset: m.startOffset + delta,
        endOffset: m.endOffset + delta,
      });
      continue;
    }
    // The edit happened strictly inside the mark: it grows or shrinks with the
    // text it wraps, which is the case that makes typing inside a bold phrase
    // behave the way anyone expects.
    if (m.startOffset <= start && m.endOffset >= end) {
      const nextEnd = m.endOffset + delta;
      if (nextEnd > m.startOffset) {
        moved.push({
          type: m.type,
          startOffset: m.startOffset,
          endOffset: nextEnd,
        });
      }
      // Otherwise every marked character is gone, and so is the mark.
      continue;
    }
    // Ambiguous: the edit crosses a boundary. Keep only the part that is
    // demonstrably still the original text, and drop the mark if nothing is.
    if (m.startOffset < start) {
      moved.push({
        type: m.type,
        startOffset: m.startOffset,
        endOffset: start,
      });
      continue;
    }
    if (m.endOffset > end) {
      const nextStart = start + inserted;
      const nextEnd = m.endOffset + delta;
      if (nextEnd > nextStart) {
        moved.push({
          type: m.type,
          startOffset: nextStart,
          endOffset: nextEnd,
        });
      }
    }
  }

  return canonicalizeInlineMarks(
    moved
      .map((m) => ({
        type: m.type,
        startOffset: Math.max(0, Math.min(m.startOffset, newContent.length)),
        endOffset: Math.max(0, Math.min(m.endOffset, newContent.length)),
      }))
      .filter((m) => m.endOffset > m.startOffset),
  );
}

// ── Segmentation, shared by every renderer ─────────────────────────────────

export interface InlineTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * Cut `content` at every point where formatting changes.
 *
 * The invariant that makes this safe to render anywhere:
 *
 *   segments.map(s => s.text).join("") === content
 *
 * Always, for any marks, valid or not. A renderer built on this cannot invent,
 * drop or reorder a character, which is what keeps the rendered DOM's
 * `textContent` equal to the stored text and keeps highlight offsets meaningful.
 */
export function toInlineSegments(
  content: string,
  marks: readonly InlineTextMark[],
): InlineTextSegment[] {
  if (content.length === 0) return [];

  const usable = canonicalizeInlineMarks(
    marks
      .map((m) => ({
        type: m.type,
        startOffset: Math.max(0, Math.min(m.startOffset, content.length)),
        endOffset: Math.max(0, Math.min(m.endOffset, content.length)),
      }))
      .filter((m) => m.endOffset > m.startOffset),
  );

  if (usable.length === 0) {
    return [{ text: content, bold: false, italic: false, underline: false }];
  }

  // Every boundary any mark introduces, plus the ends of the string.
  const cuts = new Set<number>([0, content.length]);
  for (const m of usable) {
    cuts.add(m.startOffset);
    cuts.add(m.endOffset);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: InlineTextSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;
    if (to <= from) continue;
    const covers = (type: InlineTextMarkType) =>
      usable.some(
        (m) => m.type === type && m.startOffset <= from && m.endOffset >= to,
      );
    segments.push({
      text: content.slice(from, to),
      bold: covers("BOLD"),
      italic: covers("ITALIC"),
      underline: covers("UNDERLINE"),
    });
  }
  return segments;
}

/**
 * Segment a sub-range, with marks re-based onto it.
 *
 * The web reader needs this: it splits content into highlighted and
 * unhighlighted chunks first, so that one persisted Highlight stays one `<mark>`
 * element even when editorial formatting changes partway through it, and then
 * formats inside each chunk.
 */
export function toInlineSegmentsForRange(
  content: string,
  marks: readonly InlineTextMark[],
  from: number,
  to: number,
): InlineTextSegment[] {
  const slice = content.slice(from, to);
  const shifted = marks
    .map((m) => ({
      type: m.type,
      startOffset: Math.max(0, m.startOffset - from),
      endOffset: Math.min(to - from, m.endOffset - from),
    }))
    .filter((m) => m.endOffset > m.startOffset);
  return toInlineSegments(slice, shifted);
}

/** Write marks back into a block's metadata, leaving everything else alone. */
export function withInlineMarks(
  meta: Record<string, unknown> | null | undefined,
  marks: readonly InlineTextMark[],
): Record<string, unknown> | null {
  const rest = { ...(meta ?? {}) };
  const canonical = canonicalizeInlineMarks(marks);
  if (canonical.length === 0) {
    // No formatting means the key is absent, not an empty array: a block that
    // was never formatted and one whose formatting was removed should be
    // indistinguishable in storage.
    delete rest[INLINE_MARKS_META_KEY];
    return Object.keys(rest).length === 0 ? (meta ? {} : null) : rest;
  }
  rest[INLINE_MARKS_META_KEY] = canonical;
  return rest;
}

/** The textual kinds Content Studio lets an editor format. */
export const INLINE_FORMATTABLE_KINDS = [
  "PARAGRAPH",
  "HEADING",
  "QUOTE",
  "PAUSE",
] as const;

export function acceptsInlineMarks(kind: string): boolean {
  return (INLINE_FORMATTABLE_KINDS as readonly string[]).includes(kind);
}
