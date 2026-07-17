import {
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "../lib/block-key";

/**
 * Content Core — CC-6A read adapter (read-only, fail-closed dual-read).
 *
 * Resolves a single content unit for `(editionKey, unitKey)`, preferring the
 * published Content Core revision and falling back to the legacy Book/Chapter
 * tables per WHOLE unit. Never writes. Never touches LearningEvent or the
 * Emotional Map. Never mixes core and legacy blocks inside one unit, and never
 * hides Content Core corruption behind a legacy fallback.
 *
 * Per-unit decision:
 *  - the edition is published AND contains the unit → source = "content-core"
 *    (after an integrity check; a malformed core unit throws
 *    CONTENT_CORE_INTEGRITY_ERROR — it is NOT silently served from legacy);
 *  - the edition is absent / not backfilled / does not contain the unit →
 *    source = "legacy";
 *  - neither core nor legacy has it → EDITION_NOT_FOUND / UNIT_NOT_FOUND.
 *
 * See docs/architecture/content-core.md and ADR 0016.
 */

export type ContentSource = "content-core" | "legacy";

export interface ReadBlock {
  blockKey: string;
  kind: string;
  order: number;
  content: string;
  meta: unknown | null;
}

export interface ReadUnit {
  editionKey: string;
  /** Null when the unit is served from the legacy tables (no revisions there). */
  revisionNumber: number | null;
  unitKey: string;
  title: string;
  summary: string | null;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  source: ContentSource;
  blocks: ReadBlock[];
}

export const EDITION_KEY_SUFFIX = "-1e";

export async function readContentUnit(
  prisma: PrismaClient,
  editionKey: string,
  unitKey: string,
): Promise<ReadUnit> {
  const edition = await prisma.edition.findUnique({ where: { editionKey } });

  // Content Core is authoritative only when the edition is published AND the
  // unit is present in that published revision's manifest.
  if (edition?.publishedRevisionId) {
    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId: edition.publishedRevisionId, unit: { unitKey } },
      include: {
        unit: true,
        // status is validated in buildCoreRead — the pointer must reference a
        // truly PUBLISHED revision, not merely be non-null.
        revision: { select: { number: true, status: true } },
        unitVersion: {
          include: {
            blockVersions: {
              orderBy: { order: "asc" },
              include: { contentBlock: true },
            },
          },
        },
      },
    });
    if (ru) {
      return buildCoreRead(editionKey, unitKey, ru);
    }

    // The unit is NOT in the published manifest. Distinguish two cases:
    //  A. no ContentUnit for this key yet → not migrated → legacy fallback OK;
    //  B. a ContentUnit EXISTS in this edition but was retired from the manifest
    //     → UNIT_NOT_FOUND. Never resurrect retired content from legacy.
    const existingUnit = await prisma.contentUnit.findUnique({
      where: { editionId_unitKey: { editionId: edition.id, unitKey } },
    });
    if (existingUnit) {
      throw new NotFoundException("UNIT_NOT_FOUND");
    }
    // else: not yet in core → fall through to legacy.
  }

  return buildLegacyRead(prisma, editionKey, unitKey);
}

interface CoreRevisionUnit {
  unitId: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  unit: { unitKey: string };
  revision: { number: number; status: string };
  unitVersion: {
    id: string;
    unitId: string;
    title: string;
    summary: string | null;
    blockVersions: Array<{
      unitVersionId: string;
      order: number;
      kind: string;
      content: string;
      meta: unknown;
      contentBlock: { blockKey: string; unitId: string };
    }>;
  } | null;
}

function buildCoreRead(
  editionKey: string,
  unitKey: string,
  ru: CoreRevisionUnit,
): ReadUnit {
  const version = ru.unitVersion;
  const blockVersions = version?.blockVersions ?? [];

  // Integrity — never hide corruption behind a legacy fallback; refuse loudly.
  // The pointed revision must be PUBLISHED (a DRAFT/ARCHIVED pointer is corrupt),
  // the version must belong to the unit, and the blocks must be non-empty, own
  // by the unit, and uniquely ordered.
  const orders = blockVersions.map((bv) => bv.order);
  const integrityOk =
    ru.revision.status === "PUBLISHED" &&
    version != null &&
    version.unitId === ru.unitId &&
    blockVersions.length > 0 &&
    blockVersions.every(
      (bv) =>
        bv.unitVersionId === version.id && bv.contentBlock.unitId === ru.unitId,
    ) &&
    new Set(orders).size === orders.length;
  if (!integrityOk || version == null) {
    throw new InternalServerErrorException("CONTENT_CORE_INTEGRITY_ERROR");
  }

  return {
    editionKey,
    revisionNumber: ru.revision.number,
    unitKey,
    title: version.title,
    summary: version.summary,
    order: ru.order,
    partNumber: ru.partNumber,
    partTitle: ru.partTitle,
    source: "content-core",
    blocks: blockVersions.map((bv) => ({
      blockKey: bv.contentBlock.blockKey,
      kind: bv.kind,
      order: bv.order,
      content: bv.content,
      meta: bv.meta ?? null,
    })),
  };
}

async function buildLegacyRead(
  prisma: PrismaClient,
  editionKey: string,
  unitKey: string,
): Promise<ReadUnit> {
  if (!editionKey.endsWith(EDITION_KEY_SUFFIX)) {
    throw new NotFoundException("EDITION_NOT_FOUND");
  }
  const slug = editionKey.slice(0, -EDITION_KEY_SUFFIX.length);
  const book = await prisma.book.findUnique({ where: { slug } });
  if (!book) throw new NotFoundException("EDITION_NOT_FOUND");

  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    orderBy: { order: "asc" },
  });
  const chapter = chapters.find(
    (c) => unitKeyFromLegacyChapterId(c.id) === unitKey,
  );
  if (!chapter) throw new NotFoundException("UNIT_NOT_FOUND");

  const blocks = await prisma.chapterBlock.findMany({
    where: { chapterId: chapter.id },
    orderBy: { order: "asc" },
  });

  return {
    editionKey,
    revisionNumber: null,
    unitKey,
    title: chapter.title,
    summary: null,
    order: chapter.order,
    partNumber: chapter.partNumber,
    partTitle: chapter.partTitle,
    source: "legacy",
    blocks: blocks.map((b) => ({
      blockKey: blockKeyFromLegacyId(b.id),
      kind: b.kind,
      order: b.order,
      content: b.content,
      meta: b.meta ?? null,
    })),
  };
}
