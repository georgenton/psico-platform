/**
 * Reading the snapshot, and writing the repair.
 *
 * Split from the planner so the planner stays pure and from the CLI so the
 * write can be tested against a real PostgreSQL without going through argument
 * parsing. The client is a structural type rather than `PrismaClient`: it names
 * exactly the six reads and four writes this repair performs, which is also the
 * most honest summary of its blast radius.
 */

import { INLINE_MARKS_META_KEY, type InlineTextMark } from "@psico/types";

import { contentHash } from "./lib/content-hash";
import { removeSpans } from "./markdown-emphasis";
import {
  textDigest,
  type BlockSnapshot,
  type EmphasisOp,
  type EmphasisPlan,
  type EmphasisSnapshot,
} from "./markdown-repair";

interface FindMany<T> {
  findMany(args: unknown): Promise<T[]>;
}

export interface SnapshotClient {
  chapterBlock: FindMany<{
    id: string;
    order: number;
    kind: string;
    content: string;
    meta: unknown;
    chapter: { order: number } | null;
  }>;
  contentBlock: FindMany<{
    id: string;
    blockKey: string;
    legacyBlockId: string | null;
  }>;
  blockVersion: FindMany<{
    id: string;
    contentBlockId: string;
    unitVersionId: string;
    content: string;
    contentHash: string;
    meta: unknown;
  }>;
  highlight: FindMany<{
    id: string;
    blockId: string | null;
    contentBlockId: string | null;
    startOffset: number;
    endOffset: number;
    quote: string | null;
    blockVersionId: string | null;
  }>;
  annotation: FindMany<{
    id: string;
    blockId: string | null;
    contentBlockId: string | null;
  }>;
  readingSession: FindMany<{ lastBlockId: string | null }>;
}

/**
 * Everything the plan needs, in six bulk reads.
 *
 * Per-block queries over 3 385 blocks would be 20 000 round trips for a
 * read-only plan, which is the kind of cost that discourages running the plan
 * again — and a plan nobody re-runs is a plan that goes stale.
 */
export async function readEmphasisSnapshot(
  prisma: SnapshotClient,
  bookSlug: string,
): Promise<EmphasisSnapshot> {
  const blocks = await prisma.chapterBlock.findMany({
    where: { chapter: { book: { slug: bookSlug } } },
    select: {
      id: true,
      order: true,
      kind: true,
      content: true,
      meta: true,
      chapter: { select: { order: true } },
    },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
  });
  const legacyIds = blocks.map((b) => b.id);

  const contentBlocks = await prisma.contentBlock.findMany({
    where: { legacyBlockId: { in: legacyIds } },
    select: { id: true, blockKey: true, legacyBlockId: true },
  });
  const byLegacy = new Map(
    contentBlocks.map((cb) => [cb.legacyBlockId!, cb] as const),
  );
  const nativeIds = contentBlocks.map((cb) => cb.id);

  const versions = await prisma.blockVersion.findMany({
    where: { contentBlockId: { in: nativeIds } },
    select: {
      id: true,
      contentBlockId: true,
      unitVersionId: true,
      content: true,
      contentHash: true,
      meta: true,
    },
  });
  const versionsByBlock = groupBy(versions, (v) => v.contentBlockId);

  const highlights = await prisma.highlight.findMany({
    where: {
      OR: [
        { blockId: { in: legacyIds } },
        { contentBlockId: { in: nativeIds } },
      ],
    },
    select: {
      id: true,
      blockId: true,
      contentBlockId: true,
      startOffset: true,
      endOffset: true,
      quote: true,
      blockVersionId: true,
    },
  });

  const annotations = await prisma.annotation.findMany({
    where: {
      OR: [
        { blockId: { in: legacyIds } },
        { contentBlockId: { in: nativeIds } },
      ],
    },
    select: { id: true, blockId: true, contentBlockId: true },
  });

  const sessions = await prisma.readingSession.findMany({
    where: { lastBlockId: { in: legacyIds } },
    select: { lastBlockId: true },
  });
  const sessionsByBlock = new Map<string, number>();
  for (const s of sessions) {
    if (s.lastBlockId === null) continue;
    sessionsByBlock.set(
      s.lastBlockId,
      (sessionsByBlock.get(s.lastBlockId) ?? 0) + 1,
    );
  }

  const out: BlockSnapshot[] = blocks.map((b) => {
    const native = byLegacy.get(b.id) ?? null;
    // A mark can anchor by either identity, so both have to be collected or a
    // highlight on the native id would be invisible to the plan — and invisible
    // is precisely how an offset ends up pointing at the wrong words.
    const mine = <
      T extends { blockId: string | null; contentBlockId: string | null },
    >(
      rows: T[],
    ) =>
      rows.filter(
        (r) =>
          r.blockId === b.id ||
          (native !== null && r.contentBlockId === native.id),
      );

    return {
      chapterBlockId: b.id,
      chapterOrder: b.chapter?.order ?? 0,
      order: b.order,
      kind: b.kind,
      content: b.content,
      meta: b.meta,
      contentBlockId: native?.id ?? null,
      blockKey: native?.blockKey ?? null,
      versions: (native ? (versionsByBlock.get(native.id) ?? []) : []).map(
        (v) => ({
          id: v.id,
          unitVersionId: v.unitVersionId,
          content: v.content,
          contentHash: v.contentHash,
          meta: v.meta,
        }),
      ),
      highlights: mine(highlights).map((h) => ({
        id: h.id,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        quote: h.quote,
        blockVersionId: h.blockVersionId,
      })),
      annotations: mine(annotations).length,
      readingSessions: sessionsByBlock.get(b.id) ?? 0,
    };
  });

  return { bookSlug, blocks: out };
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

// ── Writing ────────────────────────────────────────────────────────────────

export interface Preimage {
  chapterBlockId: string;
  contentDigest: string;
  contentLength: number;
  meta: unknown;
  versions: {
    id: string;
    contentHash: string;
    contentDigest: string;
    meta: unknown;
  }[];
  highlights: {
    id: string;
    startOffset: number;
    endOffset: number;
    quote: string | null;
  }[];
}

export const CONCURRENT_CHANGE = "EMPHASIS_REPAIR_CONCURRENT_CHANGE";
export const MISSING_ROW = "EMPHASIS_REPAIR_MISSING_ROW";

interface WriteClient extends SnapshotClient {
  chapterBlock: SnapshotClient["chapterBlock"] & {
    update(args: unknown): Promise<unknown>;
  };
  blockVersion: SnapshotClient["blockVersion"] & {
    update(args: unknown): Promise<unknown>;
  };
  highlight: SnapshotClient["highlight"] & {
    update(args: unknown): Promise<unknown>;
  };
}

/**
 * Apply one op, refusing if the row is not the row the plan was built against.
 *
 * The digest comparison is the whole concurrency story: between planning and
 * applying, an editor may have saved the same block. Writing the planned text
 * over theirs would silently discard an edit, so a mismatch aborts — the
 * transaction rolls back and the plan is re-made against the new state.
 */
export async function applyOp(
  tx: WriteClient,
  op: EmphasisOp,
  record: (pre: Preimage) => void,
): Promise<void> {
  const rows = await tx.chapterBlock.findMany({
    where: { id: op.chapterBlockId },
    select: {
      id: true,
      order: true,
      kind: true,
      content: true,
      meta: true,
      chapter: { select: { order: true } },
    },
  });
  const current = rows[0];
  if (!current) {
    throw new Error(`${MISSING_ROW}: ChapterBlock ${op.chapterBlockId}`);
  }
  if (textDigest(current.content) !== op.before.contentDigest) {
    throw new Error(
      `${CONCURRENT_CHANGE}: ChapterBlock ${op.chapterBlockId} no longer holds the planned text`,
    );
  }

  const versions = await tx.blockVersion.findMany({
    where: { id: { in: op.versionIds } },
    select: {
      id: true,
      contentBlockId: true,
      unitVersionId: true,
      content: true,
      contentHash: true,
      meta: true,
    },
  });
  if (versions.length !== op.versionIds.length) {
    throw new Error(`${MISSING_ROW}: BlockVersion for ${op.chapterBlockId}`);
  }
  for (const v of versions) {
    if (textDigest(v.content) !== op.before.contentDigest) {
      throw new Error(
        `${CONCURRENT_CHANGE}: BlockVersion ${v.id} no longer holds the planned text`,
      );
    }
  }

  const highlightRows = await tx.highlight.findMany({
    where: { id: { in: op.highlights.map((h) => h.id) } },
    select: {
      id: true,
      blockId: true,
      contentBlockId: true,
      startOffset: true,
      endOffset: true,
      quote: true,
      blockVersionId: true,
    },
  });
  if (highlightRows.length !== op.highlights.length) {
    throw new Error(`${MISSING_ROW}: Highlight for ${op.chapterBlockId}`);
  }
  for (const planned of op.highlights) {
    const row = highlightRows.find((r) => r.id === planned.id)!;
    if (
      row.startOffset !== planned.from.startOffset ||
      row.endOffset !== planned.from.endOffset
    ) {
      throw new Error(
        `${CONCURRENT_CHANGE}: Highlight ${row.id} moved since the plan`,
      );
    }
  }

  // The preimage goes out BEFORE the first write, so a reversal exists even if
  // the process dies between statements.
  record({
    chapterBlockId: op.chapterBlockId,
    contentDigest: op.before.contentDigest,
    contentLength: current.content.length,
    meta: current.meta,
    versions: versions.map((v) => ({
      id: v.id,
      contentHash: v.contentHash,
      contentDigest: textDigest(v.content)!,
      meta: v.meta,
    })),
    highlights: highlightRows.map((h) => ({
      id: h.id,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      quote: h.quote,
    })),
  });

  const newContent = removeSpans(current.content, op.removals);
  const newMeta = withMarks(current.meta, op.after.marks);

  await tx.chapterBlock.update({
    where: { id: op.chapterBlockId },
    data: { content: newContent, meta: newMeta },
  });

  for (const v of versions) {
    await tx.blockVersion.update({
      where: { id: v.id },
      data: {
        content: newContent,
        contentHash: contentHash(newContent),
        // The same `meta` on both sides: `blockVersionDrifts` compares it.
        meta: withMarks(v.meta, op.after.marks),
      },
    });
  }

  for (const h of op.highlights) {
    await tx.highlight.update({
      where: { id: h.id },
      data: {
        startOffset: h.to.startOffset,
        endOffset: h.to.endOffset,
        // The quote is the durable re-anchor fallback (ADR 0016 §9). Leaving a
        // quote with asterisks in it would make that fallback fail against the
        // repaired text, which is the opposite of durable.
        quote: h.quote,
      },
    });
  }
}

/**
 * Marks into metadata, without `withInlineMarks`'s empty-object subtlety.
 *
 * `withInlineMarks` returns `{}` for a block whose formatting was removed and
 * `null` for one that never had any. Here marks are always being ADDED, so the
 * only shape needed is "the rest of the metadata, plus the marks".
 */
function withMarks(
  meta: unknown,
  marks: readonly InlineTextMark[],
): Record<string, unknown> {
  const rest =
    typeof meta === "object" && meta !== null && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  rest[INLINE_MARKS_META_KEY] = marks;
  return rest;
}

export interface ApplyResult {
  opsApplied: number;
  preimages: Preimage[];
}

/** Every op in one transaction: a half-repaired chapter is not a state to have. */
export async function applyEmphasisRepair(
  tx: WriteClient,
  plan: EmphasisPlan,
  record: (pre: Preimage) => void,
): Promise<ApplyResult> {
  const preimages: Preimage[] = [];
  for (const op of plan.ops) {
    await applyOp(tx, op, (pre) => {
      preimages.push(pre);
      record(pre);
    });
  }
  return { opsApplied: plan.ops.length, preimages };
}
