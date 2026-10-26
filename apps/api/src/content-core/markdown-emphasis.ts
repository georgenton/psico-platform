/**
 * Moving Markdown emphasis out of the text and into `inlineMarks`.
 *
 * ── Why this is a repair and not a migration ───────────────────────────────
 *
 * `inline-marks.ts` states the rule the whole reader depends on: `block.content`
 * is EXACTLY the text a reader sees, and formatting lives beside it as offsets.
 * The ingested chapters of *Emociones en Construcción* break it — 734 blocks
 * carry `**bold**` and `*italic*` inside the string. Today a reader sees the
 * asterisks; and the moment someone highlights a phrase that has markup before
 * it, that highlight points at the wrong words.
 *
 * So the text has to change. That is the part that makes this delicate: a
 * highlight is a pair of UTF-16 offsets into `content`, so removing four
 * characters from the middle of a paragraph moves every mark after them. This
 * module therefore does two things and refuses to do one without the other:
 * it strips the delimiters, and it reports exactly which characters it removed
 * so every offset that pointed into the old string can be carried over.
 *
 * ── What it will and will not translate ────────────────────────────────────
 *
 * Only `**bold**` and `*italic*`, because `InlineTextMark` has exactly three
 * types and Markdown has no underline. Everything else that cannot be
 * represented — a backtick, an `_underscore_`, a `[link](url)` — is a REFUSAL,
 * not a best effort: half-repairing a block would leave markup in the text and
 * a mark beside it, which is worse than leaving the block alone and saying so.
 *
 * Measured against the real corpus before this grammar was written, so the
 * rules below answer the content rather than an imagined version of it:
 * 0 blocks with an odd number of asterisks, 0 with a run of three or more,
 * 0 `_emphasis_`, 0 links, 0 asterisks surrounded by spaces, 288 bullet
 * paragraphs that all use `- ` (never `* `, so no bullet can be read as an
 * italic opener), 1 block with a backtick, and exactly 1 block carrying
 * asterisks whose kind does not accept inline marks.
 *
 * ── The bullets are deliberately left alone ────────────────────────────────
 *
 * 288 blocks begin with `- `. That is a LIST, a block-level structure, and
 * there is no block kind to put it in. Stripping it would delete a character a
 * reader can see with nowhere to record what it meant, so it stays. This module
 * is about emphasis; the bullets are a separate, visible, honest leftover.
 */

import {
  acceptsInlineMarks,
  canonicalizeInlineMarks,
  validateInlineMarks,
  type InlineTextMark,
} from "@psico/types";

/** A span of characters removed from the text, in OLD-text coordinates. */
export interface Removal {
  at: number;
  length: number;
}

export type EmphasisBlocker =
  /** The kind has nowhere to store inline formatting (`acceptsInlineMarks`). */
  | "KIND_NOT_FORMATTABLE"
  /** Backtick, `_emphasis_` or a link: real markup with no mark type for it. */
  | "UNREPRESENTABLE_MARKUP"
  /** `***` or longer: could be bold, italic, both, or a typo. We do not guess. */
  | "DELIMITER_RUN_TOO_LONG"
  /** An opener with no closer, or the reverse. */
  | "UNPAIRED_DELIMITER"
  /** `**a *b** c*` — spans that cross cannot be two nested ranges. */
  | "CROSSED_DELIMITERS"
  /**
   * The block mixes asterisks that ARE markup with at least one that cannot be
   * — a lone `*` between spaces, say. Each reading is defensible on its own,
   * which is exactly why a person has to choose rather than this file.
   */
  | "AMBIGUOUS_LITERAL_ASTERISK"
  /** The delimiters pair, but the result would not survive validation. */
  | "RESULT_NOT_VALID";

export interface EmphasisParse {
  /** The text with every paired delimiter removed. */
  text: string;
  /** Formatting over `text`, in NEW-text coordinates, canonical. */
  marks: InlineTextMark[];
  /** The delimiter runs removed, ascending, non-overlapping. */
  removals: Removal[];
}

export type EmphasisResult =
  | { ok: true; parse: EmphasisParse }
  | { ok: false; blocker: EmphasisBlocker; detail: string };

/** Nothing to repair: no asterisk pair anywhere. */
export function hasEmphasisSyntax(content: string): boolean {
  return /\*/.test(content);
}

/**
 * Markup we can see but cannot store.
 *
 * Checked only on blocks we would otherwise rewrite: a block with a backtick
 * and no emphasis needs nothing from this module, and calling that a blocker
 * would invent work.
 */
function unrepresentable(content: string): string | null {
  if (content.includes("`")) return "backtick";
  if (/(^|[^_])_[^_\s][^_]*_([^_]|$)/.test(content))
    return "underscore emphasis";
  if (/\[[^\]]+\]\([^)]+\)/.test(content)) return "link";
  return null;
}

interface Run {
  at: number;
  length: number;
  canOpen: boolean;
  canClose: boolean;
}

/**
 * Runs of asterisks, each tagged with whether it could open or close.
 *
 * The flanking test is CommonMark's, reduced to what this corpus needs: a run
 * can open when a non-space follows it and can close when a non-space precedes
 * it. That is what keeps `2 * 3` and a `* ` bullet from being read as emphasis
 * — and it is a rule about the text, so it keeps holding if the corpus changes.
 */
function scanRuns(content: string): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < content.length; ) {
    if (content[i] !== "*") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < content.length && content[j] === "*") j += 1;
    const before = i > 0 ? content[i - 1]! : "";
    const after = j < content.length ? content[j]! : "";
    runs.push({
      at: i,
      length: j - i,
      canOpen: after !== "" && !/\s/.test(after),
      canClose: before !== "" && !/\s/.test(before),
    });
    i = j;
  }
  return runs;
}

const typeFor = (length: number): "BOLD" | "ITALIC" | null =>
  length === 2 ? "BOLD" : length === 1 ? "ITALIC" : null;

/**
 * Strip the paired emphasis delimiters and return the formatting they meant.
 *
 * Refuses rather than guesses. Every refusal names what it saw, because the
 * caller has to put it in a plan a person will read before approving a write.
 */
export function parseEmphasis(content: string, kind: string): EmphasisResult {
  if (!hasEmphasisSyntax(content)) {
    return {
      ok: true,
      parse: { text: content, marks: [], removals: [] },
    };
  }

  if (!acceptsInlineMarks(kind)) {
    return {
      ok: false,
      blocker: "KIND_NOT_FORMATTABLE",
      detail: `kind ${kind} has no place to store inline marks`,
    };
  }

  const bad = unrepresentable(content);
  if (bad !== null) {
    return {
      ok: false,
      blocker: "UNREPRESENTABLE_MARKUP",
      detail: `${bad} present; no mark type can carry it`,
    };
  }

  const runs = scanRuns(content);
  const tooLong = runs.find((r) => r.length >= 3);
  if (tooLong) {
    return {
      ok: false,
      blocker: "DELIMITER_RUN_TOO_LONG",
      detail: `run of ${tooLong.length} asterisks at ${tooLong.at}`,
    };
  }

  // Pair with a stack. A closer must match the run on top, which is precisely
  // what rejects crossed spans: in `**a *b** c*` the `**` closer meets a `*`
  // opener on top, and there is no pair of nested ranges that means that.
  const stack: Run[] = [];
  const pairs: { open: Run; close: Run }[] = [];
  const literals: Run[] = [];

  for (const run of runs) {
    const top = stack[stack.length - 1];
    if (run.canClose && stack.some((s) => s.length === run.length)) {
      if (top && top.length === run.length) {
        stack.pop();
        pairs.push({ open: top, close: run });
        continue;
      }
      // It closes something that is not on top: the spans cross, and no pair
      // of nested ranges can mean that.
      return {
        ok: false,
        blocker: "CROSSED_DELIMITERS",
        detail: `run of ${run.length} at ${run.at} crosses a run of ${top?.length} at ${top?.at}`,
      };
    }
    if (run.canOpen) {
      stack.push(run);
      continue;
    }
    // Neither: a literal asterisk as far as the text can tell.
    literals.push(run);
  }

  if (stack.length > 0) {
    const left = stack[0]!;
    return {
      ok: false,
      blocker: "UNPAIRED_DELIMITER",
      detail: `run of ${left.length} at ${left.at} is never closed`,
    };
  }

  if (pairs.length === 0) {
    // Asterisks, but none of them is emphasis — `2 * 3`, or a dangling marker
    // nobody can resolve. Nothing to repair, and inventing a repair here would
    // delete a character a reader can see.
    return { ok: true, parse: { text: content, marks: [], removals: [] } };
  }

  if (literals.length > 0) {
    const l = literals[0]!;
    return {
      ok: false,
      blocker: "AMBIGUOUS_LITERAL_ASTERISK",
      detail: `run of ${l.length} at ${l.at} is neither opener nor closer, while ${pairs.length} pair(s) in the same block are`,
    };
  }

  const removals: Removal[] = pairs
    .flatMap(({ open, close }) => [
      { at: open.at, length: open.length },
      { at: close.at, length: close.length },
    ])
    .sort((a, b) => a.at - b.at);

  const text = removeSpans(content, removals);

  const marks: InlineTextMark[] = [];
  for (const { open, close } of pairs) {
    const type = typeFor(open.length);
    if (type === null) {
      return {
        ok: false,
        blocker: "DELIMITER_RUN_TOO_LONG",
        detail: `run of ${open.length} at ${open.at}`,
      };
    }
    const start = shift(open.at + open.length, removals);
    const end = shift(close.at, removals);
    if (end <= start) {
      return {
        ok: false,
        blocker: "RESULT_NOT_VALID",
        detail: `empty ${type} span at ${open.at}`,
      };
    }
    marks.push({ type, startOffset: start, endOffset: end });
  }

  const canonical = canonicalizeInlineMarks(marks);
  const problem = validateInlineMarks(canonical, text);
  if (problem !== null) {
    return {
      ok: false,
      blocker: "RESULT_NOT_VALID",
      detail: `marks would not validate: ${problem}`,
    };
  }

  return { ok: true, parse: { text, marks: canonical, removals } };
}

/** Delete the given spans from `text`. Spans must not overlap. */
export function removeSpans(
  text: string,
  removals: readonly Removal[],
): string {
  if (removals.length === 0) return text;
  const ordered = [...removals].sort((a, b) => a.at - b.at);
  let out = "";
  let cursor = 0;
  for (const r of ordered) {
    out += text.slice(cursor, r.at);
    cursor = r.at + r.length;
  }
  return out + text.slice(cursor);
}

/**
 * Put the delimiters back, exactly where they were.
 *
 * The inverse of `removeSpans`, and the reason the recovery procedure does not
 * need the old prose stored anywhere: `removals` says where each run was and
 * how long it was, every removed character is an asterisk, and re-inserting
 * them in ascending order reproduces the original string. A preimage can
 * therefore carry a DIGEST of the old text instead of the text — enough to
 * prove the reconstruction is the right one, without putting a book's prose in
 * a file that travels between machines.
 *
 * `markdown-emphasis.spec.ts` round-trips this against every shape in the
 * corpus; a repair whose inverse is only asserted in prose is not reversible.
 */
export function restoreSpans(
  text: string,
  removals: readonly Removal[],
): string {
  if (removals.length === 0) return text;
  const ordered = [...removals].sort((a, b) => a.at - b.at);
  let out = "";
  let cursor = 0;
  let removed = 0;
  for (const r of ordered) {
    // `r.at` is an OLD coordinate; the text we hold is the new one.
    const cut = r.at - removed;
    out += text.slice(cursor, cut) + "*".repeat(r.length);
    cursor = cut;
    removed += r.length;
  }
  return out + text.slice(cursor);
}

/**
 * An old offset in new-text coordinates, for an offset that is NOT inside a
 * removed span. Used while building marks, where that is guaranteed.
 */
function shift(offset: number, removals: readonly Removal[]): number {
  let removed = 0;
  for (const r of removals) {
    if (r.at + r.length <= offset) removed += r.length;
  }
  return offset - removed;
}

export type OffsetFate =
  /** Mapped cleanly: the character at this offset still exists. */
  | { kind: "moved"; offset: number }
  /**
   * The offset pointed INTO a delimiter that no longer exists. Clamped to
   * where the delimiter began — the nearest position that still means
   * something — and flagged, because a caller translating a user's selection
   * has to know it was not an exact carry-over.
   */
  | { kind: "clamped"; offset: number };

/**
 * Where an offset into the old text lands in the new one.
 *
 * Half-open ranges make the two ends behave differently and that is correct: a
 * start offset points AT a character, an end offset points just PAST one.
 */
export function mapOffset(
  offset: number,
  removals: readonly Removal[],
): OffsetFate {
  let removed = 0;
  for (const r of removals) {
    if (r.at + r.length <= offset) {
      removed += r.length;
      continue;
    }
    if (r.at < offset && offset < r.at + r.length) {
      return { kind: "clamped", offset: r.at - removed };
    }
  }
  return { kind: "moved", offset: offset - removed };
}

export type RangeTranslation =
  | {
      ok: true;
      startOffset: number;
      endOffset: number;
      /** The text the range selects, after the delimiters are gone. */
      quote: string;
      /** True when an endpoint had to be clamped out of a delimiter. */
      clamped: boolean;
    }
  | { ok: false; reason: "COLLAPSED" | "TEXT_NOT_PRESERVED"; detail: string };

/**
 * Carry a `[start, end)` range over to the repaired text.
 *
 * The acceptance test is not "the arithmetic worked" but "the range still
 * selects the same words": whatever the translation produces must equal the old
 * selection with its delimiters stripped. That is checked here, on every range,
 * and a range that fails is REFUSED rather than written — which in turn blocks
 * the block, because repairing text under somebody's highlight and moving the
 * highlight somewhere else is the defect this whole exercise exists to avoid.
 */
export function translateRange(
  oldText: string,
  newText: string,
  removals: readonly Removal[],
  startOffset: number,
  endOffset: number,
): RangeTranslation {
  const s = mapOffset(startOffset, removals);
  const e = mapOffset(endOffset, removals);
  const clamped = s.kind === "clamped" || e.kind === "clamped";

  if (e.offset <= s.offset) {
    return {
      ok: false,
      reason: "COLLAPSED",
      detail: `[${startOffset},${endOffset}) maps to [${s.offset},${e.offset})`,
    };
  }

  // What the selection SHOULD read afterwards: the old selection minus the
  // delimiter characters that fell inside it.
  const inside = removals
    .filter((r) => r.at >= startOffset && r.at + r.length <= endOffset)
    .map((r) => ({ at: r.at - startOffset, length: r.length }));
  const expected = removeSpans(oldText.slice(startOffset, endOffset), inside)
    // An endpoint clamped out of a delimiter also drops the partial delimiter
    // characters on that edge, which `inside` cannot express.
    .replace(/^\*+/, "")
    .replace(/\*+$/, "");

  const actual = newText.slice(s.offset, e.offset);
  if (actual !== expected) {
    return {
      ok: false,
      reason: "TEXT_NOT_PRESERVED",
      detail: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    };
  }

  return {
    ok: true,
    startOffset: s.offset,
    endOffset: e.offset,
    quote: actual,
    clamped,
  };
}
