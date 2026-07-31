/**
 * Content Core — test-edition chapter parser (pure).
 *
 * Turns one chapter file into ordered block inputs for `bootstrapBook`. It is
 * deliberately dumb and deterministic: this parses TEST editions (OCR dumps,
 * rough manuscripts), not the final editorial master, which arrives as a proper
 * revision through `ingestUnitV2`.
 *
 * The one invariant that matters: NO non-empty line is ever dropped. When the
 * shape is ambiguous, text becomes a PARAGRAPH rather than disappearing — a
 * silently discarded paragraph is far worse than a mis-typed one, because the
 * reader has no way to notice the absence.
 *
 * Handles both conventions the sources actually arrive in:
 *   • Markdown — `# H1` (chapter title), `## H2` (HEADING), `> quote` (QUOTE),
 *     and `:::pausa` / `:::ejercicio` / `:::video` fences.
 *   • Plain prose / OCR — first line is the title when it looks like one; short
 *     lines without terminal punctuation read as headings; the rest are prose.
 *
 * Identity is NOT computed here. `blockKey` / `unitKey` come from the legacy row
 * ids via the CC-1 helpers (see block-key.ts) — this file never invents one.
 */

/** A block kind this parser can emit. A subset of Prisma's `BlockKind`. */
export type TestEditionBlockKind =
  | "PARAGRAPH"
  | "HEADING"
  | "QUOTE"
  | "EXERCISE"
  | "PAUSE"
  | "VIDEO";

export interface ParsedBlock {
  kind: TestEditionBlockKind;
  content: string;
  meta?: Record<string, unknown> | null;
}

export interface ParsedChapter {
  /** Title taken from the source, or null when none could be identified. */
  title: string | null;
  blocks: ParsedBlock[];
}

/**
 * A heading candidate is short and does not end like a sentence. Prose that
 * merely lacks a final period stays prose as long as it is long enough — the
 * length bound is what keeps OCR line-wrap artifacts out of the heading path.
 */
const HEADING_MAX_CHARS = 90;
const TITLE_MAX_CHARS = 120;
const SENTENCE_END = /[.!?;:,]$/;

const FENCE_KIND: Record<string, TestEditionBlockKind> = {
  pausa: "PAUSE",
  pause: "PAUSE",
  ejercicio: "EXERCISE",
  exercise: "EXERCISE",
  actividad: "EXERCISE",
  video: "VIDEO",
};

function looksLikeHeading(line: string): boolean {
  return line.length <= HEADING_MAX_CHARS && !SENTENCE_END.test(line);
}

/** Split on blank lines; every group keeps its internal line breaks collapsed. */
function paragraphs(source: string): string[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Parse one chapter source into a title + ordered blocks.
 *
 * `fallbackTitle` is used when the source carries no identifiable title — the
 * caller supplies a neutral, non-editorial placeholder rather than letting the
 * parser invent a title it cannot know.
 */
export function parseTestEditionChapter(
  source: string,
  fallbackTitle: string,
): ParsedChapter {
  const groups = paragraphs(source);
  const blocks: ParsedBlock[] = [];
  let title: string | null = null;

  // Fenced specials are matched across the whole group, so a fence body may
  // itself contain blank lines only if the file keeps it in one group. Simple on
  // purpose: the fence syntax is ours, not the OCR's.
  for (const group of groups) {
    const fence = group.match(
      /^:::\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ]+)\s*([^\n]*)\n?([\s\S]*?)\n?:::$/,
    );
    if (fence) {
      const kind = FENCE_KIND[fence[1].toLowerCase()] ?? "EXERCISE";
      const arg = fence[2].trim();
      const body = fence[3].trim();
      const content = body.length > 0 ? body : arg;
      if (content.length === 0) continue; // an empty fence carries no text to lose
      blocks.push({
        kind,
        content,
        meta: kind === "VIDEO" && arg.length > 0 ? { videoUrl: arg } : null,
      });
      continue;
    }

    // A markdown H1 is the chapter title, but only the FIRST one — a second `#`
    // is a section, and demoting it to HEADING keeps its text in the chapter.
    const h1 = group.match(/^#\s+(.+)$/);
    if (h1) {
      const text = h1[1].trim();
      if (title === null && text.length <= TITLE_MAX_CHARS) {
        title = text;
      } else {
        blocks.push({ kind: "HEADING", content: text });
      }
      continue;
    }

    const h2 = group.match(/^#{2,6}\s+(.+)$/);
    if (h2) {
      blocks.push({ kind: "HEADING", content: h2[1].trim() });
      continue;
    }

    if (group.startsWith(">")) {
      const quote = group
        .split("\n")
        .map((l) => l.replace(/^>\s?/, "").trim())
        .join(" ")
        .trim();
      if (quote.length > 0) blocks.push({ kind: "QUOTE", content: quote });
      continue;
    }

    const flattened = group.split("\n").join(" ").replace(/\s+/g, " ").trim();

    // Plain-prose title: the very first group, short, unpunctuated, and nothing
    // emitted yet. Anything else with that shape mid-file is a section heading.
    if (
      title === null &&
      blocks.length === 0 &&
      flattened.length <= TITLE_MAX_CHARS &&
      !SENTENCE_END.test(flattened)
    ) {
      title = flattened;
      continue;
    }

    blocks.push({
      kind: looksLikeHeading(flattened) ? "HEADING" : "PARAGRAPH",
      content: flattened,
    });
  }

  return { title: title ?? fallbackTitle, blocks };
}

/** Rough reading time, used only for catalog display. Never zero for a chapter with text. */
export function estimateDurationMinutes(blocks: ParsedBlock[]): number {
  const words = blocks.reduce(
    (n, b) => n + b.content.split(/\s+/).filter(Boolean).length,
    0,
  );
  return Math.max(1, Math.round(words / 200));
}
