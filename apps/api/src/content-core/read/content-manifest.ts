import {
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import { EDITION_KEY_SUFFIX, type ContentSource } from "./content-read";

/**
 * Content Core — CC-6A.1 published-manifest discovery (read-only, fail-closed).
 *
 * Resolves `bookSlug` → the ordered list of units of the published Content Core
 * revision (or the legacy chapters), so clients can map their `(bookSlug,
 * chapterOrder)` navigation onto `(editionKey, unitKey)` WITHOUT computing a
 * uuidv5, knowing Chapter.id, or fabricating `${bookSlug}-1e` themselves.
 *
 * Never writes. Never touches LearningEvent or the Emotional Map.
 *
 * Dual-read (per §3):
 *  - no Core Edition → legacy manifest;
 *  - Core published + valid → content-core;
 *  - Edition exists but has no published revision → CONTENT_CORE_INTEGRITY_ERROR;
 *  - published pointer is DRAFT/ARCHIVED → CONTENT_CORE_INTEGRITY_ERROR;
 *  - the manifest is inconsistent / has duplicate unitKey or order →
 *    CONTENT_CORE_INTEGRITY_ERROR.
 * Corruption is never hidden behind a legacy fallback.
 */

export interface ManifestUnit {
  unitKey: string;
  order: number;
  title: string;
  summary: string | null;
  partNumber: number | null;
  partTitle: string | null;
}

export interface BookManifest {
  bookSlug: string;
  source: ContentSource;
  editionKey: string;
  /** Null when served from the legacy chapters (no revisions there). */
  revisionNumber: number | null;
  units: ManifestUnit[];
}

interface ManifestRevisionUnit {
  unitId: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  unit: { unitKey: string; editionId: string };
  unitVersion: {
    id: string;
    unitId: string;
    title: string;
    summary: string | null;
  } | null;
}

interface ManifestRevision {
  number: number;
  status: string;
  units: ManifestRevisionUnit[];
}

export async function readBookManifest(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<BookManifest> {
  // Content Core is keyed by editionKey = `${bookSlug}-1e` (the backfill
  // convention lives here, on the server — clients never fabricate it).
  const editionKey = `${bookSlug}${EDITION_KEY_SUFFIX}`;
  const edition = await prisma.edition.findUnique({ where: { editionKey } });

  if (edition) {
    // The Edition exists → it MUST resolve to a valid published revision. A
    // missing/DRAFT pointer is corruption, not a reason to fall back to legacy.
    if (!edition.publishedRevisionId) {
      throw new InternalServerErrorException("CONTENT_CORE_INTEGRITY_ERROR");
    }
    const revision = await prisma.revision.findUnique({
      where: { id: edition.publishedRevisionId },
      include: {
        units: {
          include: {
            unit: { select: { unitKey: true, editionId: true } },
            unitVersion: {
              select: {
                id: true,
                unitId: true,
                title: true,
                summary: true,
              },
            },
          },
        },
      },
    });
    if (!revision) {
      throw new InternalServerErrorException("CONTENT_CORE_INTEGRITY_ERROR");
    }
    return buildCoreManifest(bookSlug, editionKey, edition.id, revision);
  }

  return buildLegacyManifest(prisma, bookSlug, editionKey);
}

export function buildCoreManifest(
  bookSlug: string,
  editionKey: string,
  editionId: string,
  revision: ManifestRevision,
): BookManifest {
  const integrity = () =>
    new InternalServerErrorException("CONTENT_CORE_INTEGRITY_ERROR");

  if (revision.status !== "PUBLISHED") throw integrity();

  const seenUnitKeys = new Set<string>();
  const seenOrders = new Set<number>();
  const units: ManifestUnit[] = [];

  for (const ru of revision.units) {
    const version = ru.unitVersion;
    // unit ↔ version ↔ edition consistency.
    if (!version || version.unitId !== ru.unitId) throw integrity();
    if (ru.unit.editionId !== editionId) throw integrity();
    // unitKey + order must be unique across the manifest.
    if (seenUnitKeys.has(ru.unit.unitKey) || seenOrders.has(ru.order)) {
      throw integrity();
    }
    seenUnitKeys.add(ru.unit.unitKey);
    seenOrders.add(ru.order);
    units.push({
      unitKey: ru.unit.unitKey,
      order: ru.order,
      title: version.title,
      summary: version.summary,
      partNumber: ru.partNumber,
      partTitle: ru.partTitle,
    });
  }

  units.sort((a, b) => a.order - b.order);
  return {
    bookSlug,
    source: "content-core",
    editionKey,
    revisionNumber: revision.number,
    units,
  };
}

async function buildLegacyManifest(
  prisma: PrismaClient,
  bookSlug: string,
  editionKey: string,
): Promise<BookManifest> {
  const book = await prisma.book.findUnique({ where: { slug: bookSlug } });
  if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    orderBy: { order: "asc" },
  });

  return {
    bookSlug,
    source: "legacy",
    editionKey,
    revisionNumber: null,
    units: chapters.map((c) => ({
      unitKey: unitKeyFromLegacyChapterId(c.id),
      order: c.order,
      title: c.title,
      summary: c.description ?? null,
      partNumber: c.partNumber,
      partTitle: c.partTitle,
    })),
  };
}
