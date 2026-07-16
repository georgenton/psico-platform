import type { PrismaClient } from "@prisma/client";

/**
 * Content Core — CC-4 anchor backfill + dual-read resolver.
 *
 * Re-points user anchors (Highlight/Annotation) from the legacy `ChapterBlock`
 * (`blockId`) to the stable `ContentBlock` (`contentBlockId`), and snapshots the
 * highlight's selected text into `quote`. The legacy `blockId` is left intact —
 * reads keep working through the transition via the dual-read resolver. Idempotent
 * (only touches rows whose `contentBlockId` is still null); never deletes anything.
 *
 * Depends on CC-3 having run first (ContentBlocks carry `legacyBlockId`). See
 * ADR 0016 §D.
 */

export interface AnchorBackfillStats {
  highlights: number;
  annotations: number;
}

export async function backfillAnchors(
  prisma: PrismaClient,
): Promise<AnchorBackfillStats> {
  const stats: AnchorBackfillStats = { highlights: 0, annotations: 0 };

  const highlights = await prisma.highlight.findMany({
    where: { contentBlockId: null },
  });
  for (const h of highlights) {
    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: h.blockId },
    });
    if (!cb) continue; // content not backfilled yet — leave for a later pass

    const legacy = await prisma.chapterBlock.findUnique({
      where: { id: h.blockId },
    });
    const quote = legacy
      ? legacy.content.slice(h.startOffset, h.endOffset)
      : null;

    await prisma.highlight.update({
      where: { id: h.id },
      data: { contentBlockId: cb.id, quote },
    });
    stats.highlights += 1;
  }

  const annotations = await prisma.annotation.findMany({
    where: { contentBlockId: null },
  });
  for (const a of annotations) {
    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: a.blockId },
    });
    if (!cb) continue;

    // Annotations are block-level notes, not a text selection → quote stays null.
    await prisma.annotation.update({
      where: { id: a.id },
      data: { contentBlockId: cb.id },
    });
    stats.annotations += 1;
  }

  return stats;
}

/**
 * Dual-read: resolve an anchor's stable `ContentBlock` id. Prefers the new
 * `contentBlockId`; falls back to the legacy `blockId` → `ContentBlock.legacyBlockId`
 * lookup. Returns null only if neither path resolves (content not yet backfilled).
 */
export async function resolveAnchorContentBlockId(
  prisma: PrismaClient,
  anchor: { contentBlockId: string | null; blockId: string },
): Promise<string | null> {
  if (anchor.contentBlockId) return anchor.contentBlockId;
  const cb = await prisma.contentBlock.findUnique({
    where: { legacyBlockId: anchor.blockId },
  });
  return cb?.id ?? null;
}
