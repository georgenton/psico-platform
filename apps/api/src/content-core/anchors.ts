import type { PrismaClient } from "@prisma/client";

/**
 * Content Core — CC-4 anchor backfill + dual-read (fail-closed).
 *
 * Re-points user anchors (Highlight/Annotation) from the legacy `ChapterBlock`
 * (`blockId`) to the stable `ContentBlock` (`contentBlockId`), and snapshots a
 * highlight's selected text into `quote`. The legacy `blockId` stays intact —
 * reads keep working through the dual-read resolver. Idempotent; never deletes.
 *
 * Fail-closed:
 *  - A quote is captured ONLY when the offsets are valid against the block
 *    content; otherwise `quote` is left null (never a fabricated/partial string).
 *  - If a stable `contentBlockId` and the legacy `blockId` disagree
 *    (`ContentBlock.legacyBlockId != blockId`), the resolver THROWS rather than
 *    silently preferring one — a contradiction is a bug, not a fallback.
 *
 * See ADR 0016 §D.
 */

export interface AnchorBackfillStats {
  highlightsLinked: number;
  annotationsLinked: number;
  quotesCaptured: number;
  alreadyMigrated: number;
  unresolved: number;
  invalidOffsets: number;
}

function offsetsValid(
  startOffset: number,
  endOffset: number,
  contentLength: number,
): boolean {
  return (
    startOffset >= 0 && endOffset > startOffset && endOffset <= contentLength
  );
}

export async function backfillAnchors(
  prisma: PrismaClient,
): Promise<AnchorBackfillStats> {
  const stats: AnchorBackfillStats = {
    highlightsLinked: 0,
    annotationsLinked: 0,
    quotesCaptured: 0,
    alreadyMigrated: 0,
    unresolved: 0,
    invalidOffsets: 0,
  };

  // ── Highlights ──
  const highlights = await prisma.highlight.findMany();
  for (const h of highlights) {
    // Fully migrated already (linked + quote captured) → nothing to do.
    if (h.contentBlockId && h.quote != null) {
      stats.alreadyMigrated += 1;
      continue;
    }

    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: h.blockId },
    });
    if (!cb) {
      stats.unresolved += 1; // content not backfilled — leave the row untouched
      continue;
    }

    const data: { contentBlockId?: string; quote?: string } = {};
    if (!h.contentBlockId) {
      data.contentBlockId = cb.id;
      stats.highlightsLinked += 1;
    }
    if (h.quote == null) {
      const legacy = await prisma.chapterBlock.findUnique({
        where: { id: h.blockId },
      });
      if (
        legacy &&
        offsetsValid(h.startOffset, h.endOffset, legacy.content.length)
      ) {
        data.quote = legacy.content.slice(h.startOffset, h.endOffset);
        stats.quotesCaptured += 1;
      } else {
        stats.invalidOffsets += 1; // leave quote null — never fabricate
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.highlight.update({ where: { id: h.id }, data });
    }
  }

  // ── Annotations (block-level notes — quote stays null) ──
  const annotations = await prisma.annotation.findMany();
  for (const a of annotations) {
    if (a.contentBlockId) {
      stats.alreadyMigrated += 1;
      continue;
    }
    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: a.blockId },
    });
    if (!cb) {
      stats.unresolved += 1;
      continue;
    }
    await prisma.annotation.update({
      where: { id: a.id },
      data: { contentBlockId: cb.id },
    });
    stats.annotationsLinked += 1;
  }

  return stats;
}

export type AnchorResolutionStatus =
  | "stable"
  | "legacy-fallback"
  | "unresolved";

export interface AnchorResolution {
  status: AnchorResolutionStatus;
  contentBlockId: string | null;
}

/**
 * Dual-read: resolve an anchor's stable `ContentBlock` id.
 *  - `contentBlockId` present → verify `ContentBlock.legacyBlockId === blockId`;
 *    on mismatch THROW `ANCHOR_IDENTITY_MISMATCH` (never silently prefer it).
 *    → { status: "stable" }.
 *  - else → look up by legacy `blockId`. Found → { status: "legacy-fallback" };
 *    not found → { status: "unresolved", contentBlockId: null }.
 */
export async function resolveAnchorContentBlockId(
  prisma: PrismaClient,
  anchor: { contentBlockId: string | null; blockId: string },
): Promise<AnchorResolution> {
  if (anchor.contentBlockId) {
    const cb = await prisma.contentBlock.findUnique({
      where: { id: anchor.contentBlockId },
    });
    if (!cb || cb.legacyBlockId !== anchor.blockId) {
      throw new Error("ANCHOR_IDENTITY_MISMATCH");
    }
    return { status: "stable", contentBlockId: anchor.contentBlockId };
  }

  const cb = await prisma.contentBlock.findUnique({
    where: { legacyBlockId: anchor.blockId },
  });
  if (cb) return { status: "legacy-fallback", contentBlockId: cb.id };
  return { status: "unresolved", contentBlockId: null };
}
