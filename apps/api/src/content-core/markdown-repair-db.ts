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
import { removeSpans, restoreSpans } from "./markdown-emphasis";
import {
  metaDigest,
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
    order: number;
    kind: string;
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
      order: true,
      kind: true,
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
          order: v.order,
          kind: v.kind,
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

/**
 * The concurrency strategy, chosen explicitly because the choice is load-bearing.
 *
 * Two layers, and neither is sufficient alone:
 *
 * **1. Compare-and-set inside the transaction.** Every write is conditioned on
 * the values just read — `content` AND `meta` for the two text rows, offsets and
 * quote for each highlight — and an update that matches zero rows aborts. This is
 * the house pattern (`catalog/authorship-repair-apply.ts`) and it closes the case
 * where an edit lands between our read and our write: conditioning only on the id
 * would overwrite it, because in READ COMMITTED the `UPDATE` re-reads the row and
 * would find it by id regardless.
 *
 * **2. An operational window that drains writers.** Required because layer 1
 * cannot close one case, and saying so is more useful than pretending otherwise: a
 * request that already read the old text, validated a selection against it and has
 * not yet inserted its `Highlight` will insert it AFTER our commit, anchored to
 * offsets that no longer describe the text. Nothing inside our transaction can see
 * a row that does not exist yet.
 *
 * An advisory lock would not help, and that is measured rather than assumed:
 * `lector/highlights.service.ts` creates highlights with no lock and no
 * transaction at all, so a lock only this repair takes coordinates with nobody.
 * The window is therefore the mechanism: stop the API from serving, let in-flight
 * requests finish, apply, restore. The runbook carries the exact steps.
 *
 * What layer 1 DOES close, and what the regressions prove: a highlight created
 * between planning and applying — committed, therefore visible — is found and the
 * apply refuses, instead of rewriting the text and leaving that reference pointing
 * at the wrong words.
 */

export interface Preimage {
  chapterBlockId: string;
  contentDigest: string;
  contentLength: number;
  /** The metadata itself, because reverting has to put it back. */
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
/** A reference on the block that the approved plan never accounted for. */
export const UNPLANNED_REFERENCE = "EMPHASIS_REPAIR_UNPLANNED_REFERENCE";
/** A conditional update matched nothing: the row moved under us. */
export const WRITE_LOST = "EMPHASIS_REPAIR_WRITE_LOST";

/**
 * Conditional updates, in SQL.
 *
 * `updateMany` is the house pattern and it is used for the highlights, whose
 * conditions are plain scalars. The two text rows also have to condition on
 * `meta`, a `jsonb` column, and Prisma's JSON filters do not express "equal to
 * this value, including when both are NULL" without `Prisma.DbNull` /
 * `Prisma.JsonNull` bookkeeping leaking into this module. `IS NOT DISTINCT FROM`
 * says it exactly, in one operator, for both cases.
 *
 * The comparison is `jsonb` against `jsonb`, and the cast is load-bearing. The
 * first version compared `meta::text` with `JSON.stringify(meta)` and every
 * successful write refused itself: PostgreSQL renders `jsonb` in its own
 * canonical form — keys sorted, a space after each colon — and
 * `JSON.stringify` does not. Comparing as `jsonb` uses jsonb equality, which is
 * what "the same metadata" means here.
 *
 * And the `coalesce` is load-bearing too, for a subtler reason. Prisma writes
 * JS `null` into a `Json` column as the JSON value `null`, and an omitted field
 * as SQL `NULL` — two different things in SQL that it then READS BACK
 * identically, as `null`. A row written one way and compared the other refuses
 * itself forever. Treating them as equal is not a shortcut: it is what the rest
 * of the system already does, because `blockVersionDrifts` compares
 * `meta ?? null` on both sides, and a check that disagreed with the inspector
 * would be checking something nobody else believes.
 *
 * The SQL is a constant in this file and every value is a positional parameter,
 * so the `Unsafe` in the method name is about the statement being unchecked —
 * which it is, right here, by reading it.
 */
const UPDATE_CHAPTER_BLOCK = `
  UPDATE "ChapterBlock"
     SET content = $1::text, meta = $2::jsonb
   WHERE id = $3::text
     AND content = $4::text
     AND coalesce(meta, 'null'::jsonb) IS NOT DISTINCT FROM coalesce($5::jsonb, 'null'::jsonb)
`;

const UPDATE_BLOCK_VERSION = `
  UPDATE "BlockVersion"
     SET content = $1::text, "contentHash" = $2::text, meta = $3::jsonb
   WHERE id = $4::text
     AND content = $5::text
     AND coalesce(meta, 'null'::jsonb) IS NOT DISTINCT FROM coalesce($6::jsonb, 'null'::jsonb)
`;

interface WriteClient extends SnapshotClient {
  chapterBlock: SnapshotClient["chapterBlock"];
  blockVersion: SnapshotClient["blockVersion"];
  highlight: SnapshotClient["highlight"] & {
    updateMany(args: {
      where: {
        id: string;
        startOffset: number;
        endOffset: number;
      };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
}

const metaText = (meta: unknown): string | null =>
  meta === null || meta === undefined ? null : JSON.stringify(meta);

/**
 * Apply one op, refusing if anything is not what the plan was built against.
 *
 * Checks, in order, because each one makes the next meaningful: the block is
 * the planned block; its native rows are the planned rows, metadata included;
 * the references ON THE BLOCK are exactly the planned references; and then every
 * write re-states those conditions so a change arriving mid-transaction cannot
 * be overwritten.
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
  if (metaDigest(current.meta) !== op.before.metaDigest) {
    throw new Error(
      `${CONCURRENT_CHANGE}: ChapterBlock ${op.chapterBlockId} metadata changed since the plan`,
    );
  }

  const versions = await tx.blockVersion.findMany({
    where: { id: { in: op.versions.map((v) => v.id) } },
    select: {
      id: true,
      contentBlockId: true,
      unitVersionId: true,
      order: true,
      kind: true,
      content: true,
      contentHash: true,
      meta: true,
    },
  });
  if (versions.length !== op.versions.length) {
    throw new Error(`${MISSING_ROW}: BlockVersion for ${op.chapterBlockId}`);
  }
  for (const planned of op.versions) {
    const row = versions.find((v) => v.id === planned.id);
    if (!row) throw new Error(`${MISSING_ROW}: BlockVersion ${planned.id}`);
    if (textDigest(row.content) !== planned.contentDigest) {
      throw new Error(
        `${CONCURRENT_CHANGE}: BlockVersion ${row.id} no longer holds the planned text`,
      );
    }
    if (metaDigest(row.meta) !== planned.metaDigest) {
      throw new Error(
        `${CONCURRENT_CHANGE}: BlockVersion ${row.id} metadata changed since the plan`,
      );
    }
  }

  /**
   * References are looked up BY ANCHOR, never by the ids in the plan.
   *
   * This was the defect: querying `id IN (planned ids)` asks "are the ones I
   * know about still there?", which with an empty plan is `id IN ()` — a query
   * that returns nothing and reassures about nothing. The question that matters
   * is "what is anchored to this block NOW", and anything not in the plan means
   * the plan is stale.
   */
  const anchored = await tx.highlight.findMany({
    where: {
      OR: [
        { blockId: op.chapterBlockId },
        ...(op.contentBlockId ? [{ contentBlockId: op.contentBlockId }] : []),
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
  const plannedIds = new Set(op.highlights.map((h) => h.id));
  const unplanned = anchored.filter((h) => !plannedIds.has(h.id));
  if (unplanned.length > 0) {
    throw new Error(
      `${UNPLANNED_REFERENCE}: ${unplanned.length} highlight(s) on ${op.chapterBlockId} ` +
        `appeared after the plan (${unplanned.map((h) => h.id).join(", ")}). ` +
        "Re-plan: rewriting the text would leave them pointing at other words.",
    );
  }
  for (const planned of op.highlights) {
    const row = anchored.find((r) => r.id === planned.id);
    if (!row) throw new Error(`${MISSING_ROW}: Highlight ${planned.id}`);
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
    meta: current.meta ?? null,
    versions: versions.map((v) => ({
      id: v.id,
      contentHash: v.contentHash,
      contentDigest: textDigest(v.content)!,
      meta: v.meta ?? null,
    })),
    highlights: anchored.map((h) => ({
      id: h.id,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      quote: h.quote,
    })),
  });

  const newContent = removeSpans(current.content, op.removals);
  const newMeta = withMarks(current.meta, op.after.marks);
  const newHash = contentHash(newContent);

  const blockWritten = await tx.$executeRawUnsafe(
    UPDATE_CHAPTER_BLOCK,
    newContent,
    JSON.stringify(newMeta),
    op.chapterBlockId,
    current.content,
    metaText(current.meta),
  );
  if (blockWritten !== 1) {
    throw new Error(
      `${WRITE_LOST}: ChapterBlock ${op.chapterBlockId} changed between the check and the write`,
    );
  }

  for (const v of versions) {
    const written = await tx.$executeRawUnsafe(
      UPDATE_BLOCK_VERSION,
      newContent,
      newHash,
      JSON.stringify(withMarks(v.meta, op.after.marks)),
      v.id,
      v.content,
      metaText(v.meta),
    );
    if (written !== 1) {
      throw new Error(
        `${WRITE_LOST}: BlockVersion ${v.id} changed between the check and the write`,
      );
    }
  }

  for (const h of op.highlights) {
    const { count } = await tx.highlight.updateMany({
      where: {
        id: h.id,
        startOffset: h.from.startOffset,
        endOffset: h.from.endOffset,
      },
      data: {
        startOffset: h.to.startOffset,
        endOffset: h.to.endOffset,
        // The quote is the durable re-anchor fallback (ADR 0016 §9). Leaving a
        // quote with asterisks in it would make that fallback fail against the
        // repaired text, which is the opposite of durable.
        quote: h.quote,
      },
    });
    if (count !== 1) {
      throw new Error(
        `${WRITE_LOST}: Highlight ${h.id} changed between the check and the write`,
      );
    }
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

// ── Reverting ──────────────────────────────────────────────────────────────

const REVERT_CHAPTER_BLOCK = UPDATE_CHAPTER_BLOCK;
const REVERT_BLOCK_VERSION = UPDATE_BLOCK_VERSION;

export const POSTIMAGE_MISMATCH = "EMPHASIS_REVERT_POSTIMAGE_MISMATCH";

/**
 * Undo one op, and refuse if the row is not in the state the apply left it.
 *
 * Symmetric to `applyOp` and for the same reason: a revert that overwrites
 * whatever it finds would discard any editing done after the repair, which is a
 * worse outcome than the asterisks it is putting back.
 *
 * The old text is reconstructed with `restoreSpans(current, op.removals)` rather
 * than read from the preimage — that is why the preimage can carry a digest
 * instead of the prose — and the reconstruction is then checked against that
 * digest before anything is written.
 */
export async function revertOp(
  tx: WriteClient,
  op: EmphasisOp,
  pre: Preimage,
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

  // Is this the state the apply left? If not, something happened in between and
  // this tool is not the one to decide what survives.
  if (textDigest(current.content) !== op.after.contentDigest) {
    throw new Error(
      `${POSTIMAGE_MISMATCH}: ChapterBlock ${op.chapterBlockId} is not the text the repair wrote`,
    );
  }

  const restored = restoreSpans(current.content, op.removals);
  if (textDigest(restored) !== op.before.contentDigest) {
    throw new Error(
      `${POSTIMAGE_MISMATCH}: reconstruction of ${op.chapterBlockId} does not match the preimage digest`,
    );
  }

  const versions = await tx.blockVersion.findMany({
    where: { id: { in: op.versions.map((v) => v.id) } },
    select: {
      id: true,
      contentBlockId: true,
      unitVersionId: true,
      order: true,
      kind: true,
      content: true,
      contentHash: true,
      meta: true,
    },
  });
  if (versions.length !== op.versions.length) {
    throw new Error(`${MISSING_ROW}: BlockVersion for ${op.chapterBlockId}`);
  }
  for (const v of versions) {
    if (textDigest(v.content) !== op.after.contentDigest) {
      throw new Error(
        `${POSTIMAGE_MISMATCH}: BlockVersion ${v.id} is not the text the repair wrote`,
      );
    }
  }

  const blockWritten = await tx.$executeRawUnsafe(
    REVERT_CHAPTER_BLOCK,
    restored,
    metaText(pre.meta),
    op.chapterBlockId,
    current.content,
    metaText(current.meta),
  );
  if (blockWritten !== 1) {
    throw new Error(
      `${WRITE_LOST}: ChapterBlock ${op.chapterBlockId} changed during the revert`,
    );
  }

  for (const v of versions) {
    const was = pre.versions.find((p) => p.id === v.id);
    if (!was)
      throw new Error(`${MISSING_ROW}: preimage for BlockVersion ${v.id}`);
    const written = await tx.$executeRawUnsafe(
      REVERT_BLOCK_VERSION,
      restored,
      was.contentHash,
      metaText(was.meta),
      v.id,
      v.content,
      metaText(v.meta),
    );
    if (written !== 1) {
      throw new Error(
        `${WRITE_LOST}: BlockVersion ${v.id} changed during the revert`,
      );
    }
  }

  for (const h of op.highlights) {
    const was = pre.highlights.find((p) => p.id === h.id);
    if (!was) throw new Error(`${MISSING_ROW}: preimage for Highlight ${h.id}`);
    const { count } = await tx.highlight.updateMany({
      where: {
        id: h.id,
        startOffset: h.to.startOffset,
        endOffset: h.to.endOffset,
      },
      // `quote` goes back exactly as it was, `null` included: a highlight
      // captured before quotes were mandatory had none, and inventing one would
      // be a change the revert was not asked to make.
      data: {
        startOffset: was.startOffset,
        endOffset: was.endOffset,
        quote: was.quote,
      },
    });
    if (count !== 1) {
      throw new Error(
        `${WRITE_LOST}: Highlight ${h.id} changed during the revert`,
      );
    }
  }
}

/** Undo every op, newest first, in one transaction. */
export async function revertEmphasisRepair(
  tx: WriteClient,
  plan: EmphasisPlan,
  preimages: readonly Preimage[],
): Promise<{ opsReverted: number }> {
  const byBlock = new Map(preimages.map((p) => [p.chapterBlockId, p]));
  let reverted = 0;
  for (const op of [...plan.ops].reverse()) {
    const pre = byBlock.get(op.chapterBlockId);
    if (!pre) {
      throw new Error(
        `${MISSING_ROW}: preimage for ChapterBlock ${op.chapterBlockId}`,
      );
    }
    await revertOp(tx, op, pre);
    reverted += 1;
  }
  return { opsReverted: reverted };
}
