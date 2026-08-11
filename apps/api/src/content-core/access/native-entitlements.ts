import { BadRequestException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { lockEditionTx } from "../revision-lifecycle";
import { isFreePreviewByPosition } from "./content-access";

/**
 * #580 — adopting an edition into native entitlement ownership, and keeping it
 * there.
 *
 * ── The one-way rule ──────────────────────────────────────────────────────
 *
 * Legacy is the BOOTSTRAP SOURCE, never an ongoing authority. An edition moves
 * through exactly one transition:
 *
 *     accessPlan IS NULL   → legacy decides (Book.plan, Chapter.order)
 *          ↓ adopt, once
 *     accessPlan IS NOT NULL → Content Core decides, and legacy cannot take it back
 *
 * That direction matters more than it looks. Once Content Studio can designate
 * a different preview unit, a later `backfillContentCore` run that "re-derived"
 * the plan from `Book.plan` and the preview from chapter 1 would silently undo
 * an editor's decision — and the claim that Content Core is the authority would
 * be false. So adoption checks first and returns untouched if it already
 * happened.
 *
 * Nothing here is an entitlement framework. Two functions: adopt an edition
 * once, and move the designation within one.
 */

/** The narrow client both helpers need — satisfied by a transaction client. */
type Tx = Prisma.TransactionClient | PrismaClient;

export interface AdoptionResult {
  /** False when the edition was already native-owned and nothing was written. */
  adopted: boolean;
  accessPlan: string | null;
  /** The unit left carrying the designation, if any. */
  previewUnitId: string | null;
}

/**
 * Give an edition its own entitlement metadata, deriving it from legacy truth
 * exactly once.
 *
 * Idempotent by inspection, not by luck: an edition that already has an
 * `accessPlan` is returned as-is, with `adopted: false`, and neither the plan
 * nor any designation is touched.
 *
 * Must run inside a transaction that holds the edition lock — designation is a
 * per-edition singleton, so two concurrent adoptions of the same edition have
 * to serialize.
 */
export async function adoptLegacyEntitlementsTx(
  tx: Tx,
  editionId: string,
): Promise<AdoptionResult> {
  const edition = await tx.edition.findUnique({
    where: { id: editionId },
    select: { id: true, slug: true, accessPlan: true },
  });
  if (!edition) throw new BadRequestException("EDITION_NOT_FOUND");

  if (edition.accessPlan !== null) {
    // Already native-owned. This is the branch that makes the whole model
    // trustworthy: re-running adoption is a read, not a rewrite.
    const existing = await tx.contentUnit.findFirst({
      where: { editionId, isFreePreview: true },
      select: { id: true },
    });
    return {
      adopted: false,
      accessPlan: edition.accessPlan,
      previewUnitId: existing?.id ?? null,
    };
  }

  // The plan the legacy Book currently carries. Read once, then owned here.
  const book = await tx.book.findUnique({
    where: { slug: edition.slug },
    select: { plan: true },
  });
  if (!book) {
    // No legacy book to derive from and no native plan yet — adopting would
    // mean inventing an entitlement. Refuse rather than guess a tier.
    throw new BadRequestException("EDITION_HAS_NO_LEGACY_PLAN");
  }

  // Which unit is free TODAY. `RevisionUnit.order` equals `Chapter.order` by
  // construction in the backfill (drift throws), so reading the manifest gives
  // the same answer as reading the chapter — without needing a Chapter row.
  const previewUnitId = await currentPreviewUnitIdTx(tx, editionId);

  await tx.edition.update({
    where: { id: editionId },
    data: { accessPlan: book.plan },
  });
  if (previewUnitId) {
    await setSoleDesignationTx(tx, editionId, previewUnitId);
  }

  return { adopted: true, accessPlan: book.plan, previewUnitId };
}

/**
 * Move the free-preview designation to one unit.
 *
 * AT MOST ONE unit per edition may carry it — the product contract is "which
 * unit is free", singular. Clearing and setting happen in the same transaction
 * under the edition lock, so two concurrent designations cannot interleave into
 * a state where two units are free.
 *
 * The server owns this. There is deliberately no path that lets a caller set
 * the boolean directly on an arbitrary unit.
 */
export async function designateFreePreviewUnitTx(
  tx: Tx,
  editionId: string,
  unitId: string,
): Promise<void> {
  const unit = await tx.contentUnit.findUnique({
    where: { id: unitId },
    select: { editionId: true },
  });
  // A unit from another edition would otherwise make one edition's preview
  // decision visible from another's gate.
  if (!unit || unit.editionId !== editionId) {
    throw new BadRequestException("UNIT_NOT_IN_EDITION");
  }
  await setSoleDesignationTx(tx, editionId, unitId);
}

/** Clear every designation in the edition, then set exactly one. */
async function setSoleDesignationTx(
  tx: Tx,
  editionId: string,
  unitId: string,
): Promise<void> {
  await tx.contentUnit.updateMany({
    where: { editionId, isFreePreview: true, NOT: { id: unitId } },
    data: { isFreePreview: false },
  });
  await tx.contentUnit.update({
    where: { id: unitId },
    data: { isFreePreview: true },
  });
}

/**
 * The unit a reader can currently open for free, read from the manifest.
 *
 * Used ONLY at adoption time, to carry the legacy answer across the boundary.
 * After adoption nothing derives the preview from a position again — that is
 * the whole point, and `resolveUnitTarget` has no positional fallback.
 */
async function currentPreviewUnitIdTx(
  tx: Tx,
  editionId: string,
): Promise<string | null> {
  const edition = await tx.edition.findUnique({
    where: { id: editionId },
    select: { publishedRevisionId: true },
  });
  // An edition with nothing published yet has no reader-visible answer to
  // preserve; the first publish will place its units.
  const revisionId =
    edition?.publishedRevisionId ??
    (
      await tx.revision.findFirst({
        where: { editionId },
        orderBy: { number: "desc" },
        select: { id: true },
      })
    )?.id;
  if (!revisionId) return null;

  const entries = await tx.revisionUnit.findMany({
    where: { revisionId },
    select: { unitId: true, order: true },
  });
  const first = entries.find((e) => isFreePreviewByPosition(e.order));
  return first?.unitId ?? null;
}

/**
 * Adopt an edition in its own transaction, holding the edition lock.
 *
 * The entry point for operational promotion and, later, for the authoring
 * precondition. Callers already inside a transaction should use
 * `adoptLegacyEntitlementsTx` so they keep their own lock.
 */
export async function adoptLegacyEntitlements(
  prisma: PrismaClient,
  editionId: string,
): Promise<AdoptionResult> {
  return prisma.$transaction(async (tx) => {
    await lockEditionTx(tx, editionId);
    return adoptLegacyEntitlementsTx(tx, editionId);
  });
}
