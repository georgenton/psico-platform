import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AnnotationSummary, HighlightSummary } from "@psico/types";
import { blockKeyFromLegacyId } from "../lib/block-key";

/**
 * Content Core — CC-6C marks read surface (pure).
 *
 * `readUnitMarks` returns the CURRENT USER's marks (highlights + annotations)
 * for one unit, keyed by the stable `blockKey`. New clients read the chapter
 * TEXT from `/api/content` and the marks from here; the lector envelope keeps
 * serving marks for old clients (legacy `blockId` path).
 *
 * A mark is included when it anchors to any of the unit's ContentBlocks by the
 * canonical `contentBlockId` OR by the legacy `blockId` — so both pure-core and
 * backfilled/legacy marks surface. ContentBlocks persist across edits (tombstone),
 * so a mark captured against an old text version still resolves here.
 */

export interface ContentUnitMarks {
  editionKey: string;
  unitKey: string;
  highlights: HighlightSummary[];
  annotations: AnnotationSummary[];
}

type MarksDb = Pick<
  PrismaClient,
  "edition" | "contentUnit" | "contentBlock" | "highlight" | "annotation"
>;

export async function readUnitMarks(
  db: MarksDb,
  userId: string,
  editionKey: string,
  unitKey: string,
): Promise<ContentUnitMarks> {
  const edition = await db.edition.findUnique({
    where: { editionKey },
    select: { id: true },
  });
  if (!edition) throw new NotFoundException("EDITION_NOT_FOUND");

  const unit = await db.contentUnit.findUnique({
    where: { editionId_unitKey: { editionId: edition.id, unitKey } },
    select: { id: true },
  });
  if (!unit) throw new NotFoundException("UNIT_NOT_FOUND");

  const blocks = await db.contentBlock.findMany({
    where: { unitId: unit.id },
    select: { id: true, blockKey: true, legacyBlockId: true },
  });
  const keyByContentBlockId = new Map(blocks.map((b) => [b.id, b.blockKey]));
  const keyByLegacyBlockId = new Map(
    blocks
      .filter((b) => b.legacyBlockId)
      .map((b) => [b.legacyBlockId!, b.blockKey]),
  );
  const contentBlockIds = blocks.map((b) => b.id);
  const legacyBlockIds = [...keyByLegacyBlockId.keys()];

  // Resolve the public identity for a mark from whichever anchor it carries.
  const blockKeyFor = (m: {
    contentBlockId: string | null;
    blockId: string | null;
  }): string => {
    if (m.contentBlockId)
      return keyByContentBlockId.get(m.contentBlockId) ?? "";
    if (m.blockId) {
      return (
        keyByLegacyBlockId.get(m.blockId) ?? blockKeyFromLegacyId(m.blockId)
      );
    }
    return "";
  };

  const [highlights, annotations] = await Promise.all([
    db.highlight.findMany({
      where: {
        userId,
        OR: [
          { contentBlockId: { in: contentBlockIds } },
          { blockId: { in: legacyBlockIds } },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
    db.annotation.findMany({
      where: {
        userId,
        OR: [
          { contentBlockId: { in: contentBlockIds } },
          { blockId: { in: legacyBlockIds } },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    editionKey,
    unitKey,
    highlights: highlights.map((h) => ({
      id: h.id,
      blockKey: blockKeyFor(h),
      blockId: h.blockId,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      color: h.color,
      note: h.note,
      createdAt: h.createdAt,
    })),
    annotations: annotations.map((a) => ({
      id: a.id,
      blockKey: blockKeyFor(a),
      blockId: a.blockId,
      text: a.text,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  };
}
