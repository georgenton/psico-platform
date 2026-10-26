/**
 * The plan for moving Markdown emphasis out of *Emociones en Construcción*.
 *
 * Pure. Takes a snapshot, returns what would be written and what would not —
 * the same shape `catalog/authorship-repair.ts` established, for the same
 * reason: a write over content people may have annotated gets reviewed before
 * it happens, not explained afterwards.
 *
 * ── The two representations move together or not at all ────────────────────
 *
 * A chapter's text exists twice: `ChapterBlock.content` (legacy) and
 * `BlockVersion.content` (Content Core). `backfill-inspect.ts` compares them
 * field by field — `content`, `contentHash`, `meta`, `order`, `kind` — so
 * repairing one and not the other does not produce a half-repaired book, it
 * produces a book the inspector reports as DRIFTED. Every op here therefore
 * carries both sides, and a block whose two sides already disagree is refused
 * rather than reconciled: that is a different defect with a different fix.
 *
 * ── What is preserved, explicitly ──────────────────────────────────────────
 *
 * Identities, all of them. `ChapterBlock.id`, `ContentBlock.id`,
 * `ContentBlock.blockKey` (uuidv5 of the legacy id, so it does not depend on
 * the text), `ContentBlock.legacyBlockId`, `BlockVersion.id`. Nothing is
 * deleted and nothing is recreated — which is not a style preference: a
 * highlight anchors to `blockId`/`contentBlockId`, an annotation to the same,
 * and `ReadingSession.lastBlockId` has no foreign key at all, so a recreated
 * block would leave it pointing at a row that no longer exists.
 *
 * What DOES change: `content` (shorter by the delimiters), `contentHash`
 * (derived from it), `meta.inlineMarks` (the formatting, now beside the text),
 * and the offsets of any `Highlight` on the block.
 */

import { createHash } from "node:crypto";

import {
  canonicalizeInlineMarks,
  readInlineMarks,
  validateInlineMarks,
  type InlineTextMark,
} from "@psico/types";

import {
  blockVersionDrifts,
  expectedBlockVersionFields,
} from "./backfill-inspect";
import { contentHash } from "./lib/content-hash";
import {
  parseEmphasis,
  translateRange,
  type EmphasisBlocker,
  type Removal,
} from "./markdown-emphasis";

export const EMPHASIS_PLAN_FORMAT =
  "feelverse.content-core-emphasis-plan/v1" as const;

/**
 * A digest, never the value.
 *
 * Same construction as the authorship plan's `fieldDigest`: enough to prove at
 * apply time that the row has not moved since the plan was built, without
 * putting a book's prose in a file that travels.
 */
export function textDigest(value: string | null): string | null {
  if (value === null) return null;
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * A digest of stored metadata.
 *
 * `JSON.stringify` and not a canonicalising serializer, deliberately: that is
 * exactly what `blockVersionDrifts` compares, so using anything cleverer here
 * would make this check and the inspector's disagree about what "the same
 * metadata" means — and the inspector is the one that decides whether the book
 * reads as drifted.
 */
export function metaDigest(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return textDigest(JSON.stringify(value));
}

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface HighlightSnapshot {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string | null;
  blockVersionId: string | null;
}

export interface BlockVersionSnapshot {
  id: string;
  unitVersionId: string;
  /** Compared too: `blockVersionDrifts` looks at all five fields, so we read all five. */
  order: number;
  kind: string;
  content: string;
  contentHash: string;
  meta: unknown;
}

export interface BlockSnapshot {
  chapterBlockId: string;
  chapterOrder: number;
  order: number;
  kind: string;
  content: string;
  meta: unknown;
  /** Null for a block Content Core never bridged. */
  contentBlockId: string | null;
  blockKey: string | null;
  versions: BlockVersionSnapshot[];
  highlights: HighlightSnapshot[];
  /** Block-level notes. They carry no offsets, so they only need counting. */
  annotations: number;
  /** Reading sessions whose `lastBlockId` is this block. Identity only. */
  readingSessions: number;
}

export interface EmphasisSnapshot {
  bookSlug: string;
  blocks: BlockSnapshot[];
}

export interface HighlightMove {
  id: string;
  from: { startOffset: number; endOffset: number };
  to: { startOffset: number; endOffset: number };
  /** The text it selects, before and after. Equal by construction. */
  quote: string;
  /** An endpoint had to be clamped out of a delimiter that no longer exists. */
  clamped: boolean;
  /** The stored `quote` carried delimiters and will be rewritten. */
  quoteRewritten: boolean;
}

export interface EmphasisOp {
  chapterBlockId: string;
  contentBlockId: string | null;
  chapterOrder: number;
  order: number;
  kind: string;
  before: {
    contentDigest: string;
    contentLength: number;
    marks: InlineTextMark[] | null;
    /**
     * Digest of the whole stored metadata, not just the marks read out of it.
     *
     * The repair writes `meta` as "everything that was there, plus the marks",
     * so the apply has to prove the "everything that was there" part has not
     * changed either. Comparing only the marks would let a concurrent edit to
     * some other key in the same JSON be overwritten silently.
     */
    metaDigest: string | null;
  };
  after: {
    contentDigest: string;
    contentLength: number;
    contentHash: string;
    marks: InlineTextMark[];
  };
  removals: Removal[];
  /**
   * The native rows to rewrite, each with the state the plan expects to find.
   *
   * Identity alone was not enough: a `BlockVersion` whose text matches but
   * whose `meta` carries a mark the legacy block does not have would have had
   * that mark replaced by the legacy-derived result — destroying editorial
   * formatting that only existed on the native side.
   */
  versions: { id: string; contentDigest: string; metaDigest: string | null }[];
  highlights: HighlightMove[];
  /** Carried through untouched; listed so the review can see the exposure. */
  annotations: number;
  readingSessions: number;
}

export type PlanBlockerReason =
  | EmphasisBlocker
  /** Legacy and native already disagree: reconcile that first, separately. */
  | "NATIVE_DRIFT"
  /** A stored `inlineMarks` entry could not be carried over verbatim. */
  | "EXISTING_MARK_NOT_PRESERVED"
  /** A highlight could not be carried over verbatim. */
  | "HIGHLIGHT_NOT_PRESERVED"
  /** The stored `quote` does not match the text it points at, already. */
  | "HIGHLIGHT_QUOTE_MISMATCH"
  /** The block's own metadata is not readable as marks. */
  | "META_MARKS_UNREADABLE";

export interface PlanBlocker {
  chapterBlockId: string;
  chapterOrder: number;
  order: number;
  kind: string;
  reason: PlanBlockerReason;
  detail: string;
}

export interface EmphasisPlan {
  format: typeof EMPHASIS_PLAN_FORMAT;
  bookSlug: string;
  ops: EmphasisOp[];
  blockers: PlanBlocker[];
  /** Blocks with nothing to repair. Counted, not listed: there are thousands. */
  untouched: number;
  stats: {
    blocksSeen: number;
    blocksToRewrite: number;
    delimiterRunsRemoved: number;
    charactersRemoved: number;
    marksCreated: number;
    highlightsMoved: number;
    highlightsClamped: number;
    annotationsOnRewrittenBlocks: number;
    readingSessionsOnRewrittenBlocks: number;
    nativeVersionsRewritten: number;
  };
}

/** The hash a frozen plan is identified by. Order-independent by sorting. */
export function computeEmphasisPlanHash(plan: {
  bookSlug: string;
  ops: EmphasisOp[];
  blockers: PlanBlocker[];
}): string {
  const canonical = JSON.stringify({
    format: EMPHASIS_PLAN_FORMAT,
    bookSlug: plan.bookSlug,
    ops: [...plan.ops]
      .sort((a, b) => a.chapterBlockId.localeCompare(b.chapterBlockId))
      .map((o) => ({
        chapterBlockId: o.chapterBlockId,
        before: o.before.contentDigest,
        after: o.after.contentDigest,
        marks: o.after.marks,
        beforeMeta: o.before.metaDigest,
        versions: [...o.versions]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((v) => ({
            id: v.id,
            contentDigest: v.contentDigest,
            metaDigest: v.metaDigest,
          })),
        highlights: [...o.highlights]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((h) => ({ id: h.id, to: h.to })),
      })),
    blockers: [...plan.blockers]
      .sort((a, b) => a.chapterBlockId.localeCompare(b.chapterBlockId))
      .map((b) => ({ id: b.chapterBlockId, reason: b.reason })),
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

const emptyStats = (): EmphasisPlan["stats"] => ({
  blocksSeen: 0,
  blocksToRewrite: 0,
  delimiterRunsRemoved: 0,
  charactersRemoved: 0,
  marksCreated: 0,
  highlightsMoved: 0,
  highlightsClamped: 0,
  annotationsOnRewrittenBlocks: 0,
  readingSessionsOnRewrittenBlocks: 0,
  nativeVersionsRewritten: 0,
});

/**
 * What the repair would do, and what it refuses to do.
 *
 * One rule governs the whole function: a block is rewritten only if EVERY
 * reference on it survives verbatim. A single highlight that cannot be carried
 * over blocks its block — because the alternative is to fix formatting by
 * moving somebody's underline onto different words, which is the exact failure
 * `inline-marks.ts` was written to prevent.
 */
export function planEmphasisRepair(snapshot: EmphasisSnapshot): EmphasisPlan {
  const ops: EmphasisOp[] = [];
  const blockers: PlanBlocker[] = [];
  const stats = emptyStats();
  let untouched = 0;

  for (const block of snapshot.blocks) {
    stats.blocksSeen += 1;
    const where = {
      chapterBlockId: block.chapterBlockId,
      chapterOrder: block.chapterOrder,
      order: block.order,
      kind: block.kind,
    };

    const parsed = parseEmphasis(block.content, block.kind);
    if (!parsed.ok) {
      blockers.push({
        ...where,
        reason: parsed.blocker,
        detail: parsed.detail,
      });
      continue;
    }
    if (parsed.parse.removals.length === 0) {
      untouched += 1;
      continue;
    }

    const { text: newContent, marks: newMarks, removals } = parsed.parse;

    // The native side must currently agree with the legacy side, by the
    // inspector's OWN comparison and not a subset of it.
    //
    // This used to compare `content` alone, and that was a hole with teeth: a
    // `BlockVersion` whose text matched but whose `meta` carried a mark the
    // legacy block did not have would pass, and then the apply — which writes
    // the legacy-derived marks to both sides — would delete that mark. Using
    // `blockVersionDrifts` means every field the repair writes is also a field
    // it refuses to write over: `order`, `kind`, `content`, `contentHash` and
    // `meta`.
    const drifted = block.versions.find((v) =>
      blockVersionDrifts(
        {
          order: v.order,
          kind: v.kind as never,
          content: v.content,
          contentHash: v.contentHash,
          meta: (v.meta ?? null) as never,
        },
        expectedBlockVersionFields({
          order: block.order,
          kind: block.kind,
          content: block.content,
          meta: (block.meta ?? null) as never,
        }),
      ),
    );
    if (drifted) {
      blockers.push({
        ...where,
        reason: "NATIVE_DRIFT",
        detail:
          `BlockVersion ${drifted.id} already differs from the legacy block ` +
          `(content ${drifted.content === block.content ? "same" : "DIFFERENT"}, ` +
          `meta ${sameJson(drifted.meta, block.meta) ? "same" : "DIFFERENT"}, ` +
          `order ${drifted.order === block.order ? "same" : "DIFFERENT"}, ` +
          `kind ${drifted.kind === block.kind ? "same" : "DIFFERENT"}). ` +
          "Reconciling an already-drifted block is a different repair.",
      });
      continue;
    }

    // Existing editorial formatting, if any, has to survive the same way a
    // highlight does.
    const metaRecord = asRecord(block.meta);
    const existing = readInlineMarks(metaRecord);
    if (
      metaRecord !== null &&
      metaRecord.inlineMarks !== undefined &&
      metaRecord.inlineMarks !== null &&
      existing === null
    ) {
      blockers.push({
        ...where,
        reason: "META_MARKS_UNREADABLE",
        detail: "meta.inlineMarks is present but not valid marks",
      });
      continue;
    }

    const carried: InlineTextMark[] = [];
    let markFailure: string | null = null;
    for (const m of existing ?? []) {
      const t = translateRange(
        block.content,
        newContent,
        removals,
        m.startOffset,
        m.endOffset,
      );
      if (!t.ok) {
        markFailure = `${m.type} [${m.startOffset},${m.endOffset}): ${t.reason} — ${t.detail}`;
        break;
      }
      carried.push({
        type: m.type,
        startOffset: t.startOffset,
        endOffset: t.endOffset,
      });
    }
    if (markFailure !== null) {
      blockers.push({
        ...where,
        reason: "EXISTING_MARK_NOT_PRESERVED",
        detail: markFailure,
      });
      continue;
    }

    const highlights: HighlightMove[] = [];
    let highlightFailure: PlanBlocker | null = null;
    for (const h of block.highlights) {
      const was = block.content.slice(h.startOffset, h.endOffset);
      if (h.quote !== null && h.quote !== was) {
        highlightFailure = {
          ...where,
          reason: "HIGHLIGHT_QUOTE_MISMATCH",
          detail: `highlight ${h.id} stores ${JSON.stringify(h.quote)} but its offsets read ${JSON.stringify(was)}`,
        };
        break;
      }
      const t = translateRange(
        block.content,
        newContent,
        removals,
        h.startOffset,
        h.endOffset,
      );
      if (!t.ok) {
        highlightFailure = {
          ...where,
          reason: "HIGHLIGHT_NOT_PRESERVED",
          detail: `highlight ${h.id}: ${t.reason} — ${t.detail}`,
        };
        break;
      }
      highlights.push({
        id: h.id,
        from: { startOffset: h.startOffset, endOffset: h.endOffset },
        to: { startOffset: t.startOffset, endOffset: t.endOffset },
        quote: t.quote,
        clamped: t.clamped,
        quoteRewritten: h.quote !== null && h.quote !== t.quote,
      });
    }
    if (highlightFailure !== null) {
      blockers.push(highlightFailure);
      continue;
    }

    const finalMarks = canonicalizeInlineMarks([...carried, ...newMarks]);
    const problem = validateInlineMarks(finalMarks, newContent);
    if (problem !== null) {
      blockers.push({
        ...where,
        reason: "RESULT_NOT_VALID",
        detail: `merged marks would not validate: ${problem}`,
      });
      continue;
    }

    ops.push({
      ...where,
      contentBlockId: block.contentBlockId,
      before: {
        contentDigest: textDigest(block.content)!,
        contentLength: block.content.length,
        marks: existing,
        metaDigest: metaDigest(block.meta),
      },
      after: {
        contentDigest: textDigest(newContent)!,
        contentLength: newContent.length,
        contentHash: contentHash(newContent),
        marks: finalMarks,
      },
      removals,
      versions: block.versions.map((v) => ({
        id: v.id,
        contentDigest: textDigest(v.content)!,
        metaDigest: metaDigest(v.meta),
      })),
      highlights,
      annotations: block.annotations,
      readingSessions: block.readingSessions,
    });

    stats.blocksToRewrite += 1;
    stats.delimiterRunsRemoved += removals.length;
    stats.charactersRemoved += removals.reduce((n, r) => n + r.length, 0);
    stats.marksCreated += finalMarks.length;
    stats.highlightsMoved += highlights.length;
    stats.highlightsClamped += highlights.filter((h) => h.clamped).length;
    stats.annotationsOnRewrittenBlocks += block.annotations;
    stats.readingSessionsOnRewrittenBlocks += block.readingSessions;
    stats.nativeVersionsRewritten += block.versions.length;
  }

  return {
    format: EMPHASIS_PLAN_FORMAT,
    bookSlug: snapshot.bookSlug,
    ops,
    blockers,
    untouched,
    stats,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A plan a person reads before approving a write. */
export function describeEmphasisPlan(plan: EmphasisPlan): string {
  const s = plan.stats;
  const lines: string[] = [
    `plan: ${plan.format}`,
    `libro: ${plan.bookSlug}`,
    `hash: ${computeEmphasisPlanHash(plan)}`,
    "",
    `bloques vistos:            ${s.blocksSeen}`,
    `  a reescribir:            ${s.blocksToRewrite}`,
    `  sin nada que reparar:    ${plan.untouched}`,
    `  bloqueados:              ${plan.blockers.length}`,
    "",
    `delimitadores eliminados:  ${s.delimiterRunsRemoved} (${s.charactersRemoved} caracteres)`,
    `marcas resultantes:        ${s.marksCreated}`,
    `versiones nativas:         ${s.nativeVersionsRewritten}`,
    "",
    `subrayados trasladados:    ${s.highlightsMoved} (${s.highlightsClamped} con un extremo ajustado)`,
    `anotaciones afectadas:     ${s.annotationsOnRewrittenBlocks} (sin desplazamientos: intactas)`,
    `sesiones de lectura:       ${s.readingSessionsOnRewrittenBlocks} (anclan al bloque, no al texto)`,
  ];

  if (plan.blockers.length > 0) {
    const byReason = new Map<string, number>();
    for (const b of plan.blockers) {
      byReason.set(b.reason, (byReason.get(b.reason) ?? 0) + 1);
    }
    lines.push("", "bloqueados, por motivo:");
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${reason.padEnd(28)} ${n}`);
    }
    lines.push("", "detalle de los bloqueados:");
    for (const b of plan.blockers.slice(0, 40)) {
      lines.push(
        `  cap ${b.chapterOrder} · bloque ${b.order} · ${b.kind} · ${b.reason}`,
        `    ${b.detail}`,
      );
    }
    if (plan.blockers.length > 40) {
      lines.push(`  …y ${plan.blockers.length - 40} más`);
    }
  }

  return lines.join("\n");
}
