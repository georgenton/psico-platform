import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { blockKeyFromLegacyId } from "../lib/block-key";

/**
 * CC-6C — stable mark storage write resolution (pure).
 *
 * Resolves a mark write target from `{ blockKey?, blockId? }` to the durable
 * anchor, walking the canonical Content Core chain and validating fail-closed:
 *
 *   blockKey → ContentBlock → unit/edition → published revision → BlockVersion
 *
 * For highlights the offsets are validated against the CURRENT published
 * `BlockVersion.content` (NEVER the legacy ChapterBlock) and the exact quote is
 * captured. Pure Content Core blocks (legacyBlockId = null) are allowed — the
 * stored `blockId` is null and `contentBlockId` is the anchor. When a legacy
 * `blockId` is also supplied it must correspond to the ContentBlock, else
 * ANCHOR_IDENTITY_MISMATCH.
 *
 * A book never backfilled to Content Core has no ContentBlock; a legacy-only
 * write (blockId only, no ContentBlock) falls back to validating against the
 * ChapterBlock text so old clients keep working. `blockKey` writes never take
 * this path.
 */

// The Prisma surface this resolver needs — narrow so unit tests can stub it.
type MarkDb = Pick<
  PrismaClient,
  | "contentBlock"
  | "chapterBlock"
  | "contentUnit"
  | "edition"
  | "revision"
  | "revisionUnit"
  | "blockVersion"
>;

export interface HighlightWriteAnchor {
  source: "content-core" | "legacy";
  /** Stable public identity (uuidv5) — the write/read identity for the mark. */
  blockKey: string;
  /** Canonical anchor. Null on the pure-legacy path (block not in Content Core). */
  contentBlockId: string | null;
  /** Legacy ChapterBlock id. Null for a pure Content Core block. */
  blockId: string | null;
  /** Source text version (BlockVersion) the offsets were validated against. */
  blockVersionId: string | null;
  /** Exact selected-text snapshot captured from the validated content. */
  quote: string;
}

export interface AnnotationWriteAnchor {
  source: "content-core" | "legacy";
  blockKey: string;
  contentBlockId: string | null;
  blockId: string | null;
}

type ResolvedContentBlock = {
  id: string;
  legacyBlockId: string | null;
  blockKey: string;
  unitId: string;
};

/**
 * Resolve the ContentBlock from `{ blockKey?, blockId? }`, fail-closed. Returns
 * null only when just a legacy `blockId` was given and no ContentBlock carries
 * it (→ the caller's pure-legacy path).
 */
async function resolveContentBlock(
  db: MarkDb,
  input: { blockKey?: string; blockId?: string },
): Promise<ResolvedContentBlock | null> {
  if (input.blockKey) {
    const cb = await db.contentBlock.findUnique({
      where: { blockKey: input.blockKey },
      select: { id: true, legacyBlockId: true, blockKey: true, unitId: true },
    });
    if (!cb) throw new NotFoundException("BLOCK_NOT_FOUND");
    if (input.blockId && cb.legacyBlockId !== input.blockId) {
      throw new BadRequestException("ANCHOR_IDENTITY_MISMATCH");
    }
    return cb;
  }
  if (input.blockId) {
    return db.contentBlock.findUnique({
      where: { legacyBlockId: input.blockId },
      select: { id: true, legacyBlockId: true, blockKey: true, unitId: true },
    });
  }
  throw new BadRequestException("ANCHOR_MISSING_TARGET");
}

/**
 * Resolve the current published `BlockVersion` for a ContentBlock, fail-closed.
 * Never masks an integrity fault, a retired unit, or a block edited out of the
 * current version.
 */
async function resolvePublishedBlockVersion(
  db: MarkDb,
  contentBlockId: string,
  unitId: string,
): Promise<{ blockVersionId: string; content: string }> {
  const unit = await db.contentUnit.findUnique({
    where: { id: unitId },
    select: { editionId: true },
  });
  if (!unit) throw new NotFoundException("BLOCK_NOT_FOUND");

  const edition = await db.edition.findUnique({
    where: { id: unit.editionId },
    select: { publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) {
    throw new NotFoundException("CONTENT_CORE_INTEGRITY_ERROR");
  }

  const revision = await db.revision.findUnique({
    where: { id: edition.publishedRevisionId },
    select: { status: true },
  });
  if (!revision || revision.status !== "PUBLISHED") {
    throw new NotFoundException("CONTENT_CORE_INTEGRITY_ERROR");
  }

  const revisionUnit = await db.revisionUnit.findUnique({
    where: {
      revisionId_unitId: {
        revisionId: edition.publishedRevisionId,
        unitId,
      },
    },
    select: { unitVersionId: true },
  });
  // The block's unit is not in the published manifest (retired) — fail closed.
  if (!revisionUnit)
    throw new NotFoundException("UNIT_NOT_IN_PUBLISHED_MANIFEST");

  const blockVersion = await db.blockVersion.findUnique({
    where: {
      unitVersionId_contentBlockId: {
        unitVersionId: revisionUnit.unitVersionId,
        contentBlockId,
      },
    },
    select: { id: true, content: true },
  });
  // The block was edited out of the current published version — fail closed.
  if (!blockVersion)
    throw new NotFoundException("BLOCK_NOT_IN_PUBLISHED_VERSION");

  return { blockVersionId: blockVersion.id, content: blockVersion.content };
}

/**
 * Validate a highlight's offsets against `content` and return the exact quote.
 * Offsets are UTF-16 code units (same origin as DOM `Range` offsets).
 */
function captureQuote(
  content: string,
  startOffset: number,
  endOffset: number,
): string {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    throw new BadRequestException("OFFSET_INVALID");
  }
  if (
    startOffset < 0 ||
    startOffset >= endOffset ||
    endOffset > content.length
  ) {
    throw new BadRequestException("OFFSET_OUT_OF_RANGE");
  }
  return content.slice(startOffset, endOffset);
}

/**
 * Resolve + validate a highlight write (CC-6C).
 *
 * A Content Core write (`blockKey`) binds the mark to the EXACT text version the
 * user read: the client sends `blockVersionId`, and the offsets validate against
 * — and the quote is captured from — THAT BlockVersion. We deliberately do NOT
 * re-resolve the currently-published version at POST time (a concurrent publish
 * must not silently re-anchor the mark to different text). The version must
 * belong to the same ContentBlock AND the same unit.
 *
 * A legacy `blockId`-only write stays compatible without a version — its offsets
 * validate against the ChapterBlock text.
 */
export async function resolveHighlightWriteAnchor(
  db: MarkDb,
  input: {
    blockKey?: string;
    blockId?: string;
    blockVersionId?: string;
    startOffset: number;
    endOffset: number;
  },
): Promise<HighlightWriteAnchor> {
  if (input.blockKey) {
    const cb = await db.contentBlock.findUnique({
      where: { blockKey: input.blockKey },
      select: { id: true, legacyBlockId: true, blockKey: true, unitId: true },
    });
    if (!cb) throw new NotFoundException("BLOCK_NOT_FOUND");
    if (input.blockId && cb.legacyBlockId !== input.blockId) {
      throw new BadRequestException("ANCHOR_IDENTITY_MISMATCH");
    }
    if (!input.blockVersionId) {
      throw new BadRequestException("SOURCE_BLOCK_VERSION_REQUIRED");
    }
    const bv = await db.blockVersion.findUnique({
      where: { id: input.blockVersionId },
      select: {
        id: true,
        content: true,
        contentBlockId: true,
        unitVersion: { select: { unitId: true } },
      },
    });
    // The version must exist AND belong to this exact block + unit.
    if (
      !bv ||
      bv.contentBlockId !== cb.id ||
      bv.unitVersion.unitId !== cb.unitId
    ) {
      throw new BadRequestException("SOURCE_BLOCK_VERSION_MISMATCH");
    }
    const quote = captureQuote(bv.content, input.startOffset, input.endOffset);
    return {
      source: "content-core",
      blockKey: cb.blockKey,
      contentBlockId: cb.id,
      blockId: cb.legacyBlockId,
      blockVersionId: bv.id,
      quote,
    };
  }

  // Legacy `blockId`-only write — validate against the ChapterBlock text, no
  // version recorded, so old clients keep working.
  if (input.blockId) {
    const legacy = await db.chapterBlock.findUnique({
      where: { id: input.blockId },
      select: { content: true },
    });
    if (!legacy) throw new NotFoundException("BLOCK_NOT_FOUND");
    const quote = captureQuote(
      legacy.content,
      input.startOffset,
      input.endOffset,
    );
    return {
      source: "legacy",
      blockKey: blockKeyFromLegacyId(input.blockId),
      contentBlockId: null,
      blockId: input.blockId,
      blockVersionId: null,
      quote,
    };
  }

  throw new BadRequestException("ANCHOR_MISSING_TARGET");
}

/**
 * Resolve an annotation write. Block-level (no offsets/quote). On the Content
 * Core path the block must still be live in the published manifest (fail-closed);
 * pure-legacy annotations validate the ChapterBlock exists.
 */
export async function resolveAnnotationWriteAnchor(
  db: MarkDb,
  input: { blockKey?: string; blockId?: string },
): Promise<AnnotationWriteAnchor> {
  const cb = await resolveContentBlock(db, input);
  if (cb) {
    // Assert liveness in the published edition — never annotate a retired block.
    await resolvePublishedBlockVersion(db, cb.id, cb.unitId);
    return {
      source: "content-core",
      blockKey: cb.blockKey,
      contentBlockId: cb.id,
      blockId: cb.legacyBlockId,
    };
  }

  const legacy = await db.chapterBlock.findUnique({
    where: { id: input.blockId as string },
    select: { id: true },
  });
  if (!legacy) throw new NotFoundException("BLOCK_NOT_FOUND");
  return {
    source: "legacy",
    blockKey: blockKeyFromLegacyId(input.blockId as string),
    contentBlockId: null,
    blockId: input.blockId as string,
  };
}

/**
 * Resolve the public blockKey of an already-stored mark (CC-6C). NEVER returns
 * an empty string: a core-anchored row resolves via its ContentBlock, a
 * legacy-only row via the deterministic uuidv5, and an anchorless row (which the
 * CHECK forbids at rest) throws MARK_IDENTITY_INTEGRITY_ERROR. Used on updates,
 * where the write anchor isn't re-resolved but the response must still carry the
 * stable identity so the client keeps the mark bucketed.
 */
export async function resolveStoredMarkBlockKey(
  db: Pick<PrismaClient, "contentBlock">,
  mark: { contentBlockId: string | null; blockId: string | null },
): Promise<string> {
  if (mark.contentBlockId) {
    const cb = await db.contentBlock.findUnique({
      where: { id: mark.contentBlockId },
      select: { blockKey: true },
    });
    if (!cb) {
      throw new InternalServerErrorException("MARK_IDENTITY_INTEGRITY_ERROR");
    }
    return cb.blockKey;
  }
  if (mark.blockId) return blockKeyFromLegacyId(mark.blockId);
  throw new InternalServerErrorException("MARK_IDENTITY_INTEGRITY_ERROR");
}
