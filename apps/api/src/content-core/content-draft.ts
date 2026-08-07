import type { PrismaClient } from "@prisma/client";
import type { UnitPlacement } from "./lib/revision-manifest";
import {
  CONTENT_DRAFT_EDITION_MISMATCH,
  CONTENT_DRAFT_NOT_ACTIVE,
  CONTENT_DRAFT_NOT_FOUND,
  CONTENT_DRAFT_STALE,
  archiveRevisionTx,
  assertUnitInputValid,
  findActiveDraftTx,
  lockEditionTx,
  mintUnitRevisionTx,
  publishRevisionTx,
  type MintUnitRevisionResult,
  type RevisionBlockInput,
} from "./revision-lifecycle";

/**
 * Content Studio (Block A) — editing that does not publish.
 *
 * Two operations, and the gap between them is the whole point: an editor can
 * save a chapter, leave, come back, save again, and only then decide the reader
 * should see it. Until `publishDraftRevision` runs, `Edition.publishedRevisionId`
 * does not move and the reader gets exactly what they got yesterday.
 *
 * A revision stays a SNAPSHOT. Saving twice does not edit r6 — it mints r7 from
 * r6 and archives r6. That keeps every `ContentUnitVersion` and `BlockVersion`
 * immutable, which is what lets an old revision still resolve for anyone pinned
 * to it, and avoids turning Revision into a mutable document.
 */

export interface SaveUnitDraftParams {
  editionId: string;
  unitKey: string;
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  placement: UnitPlacement;
  blocks: RevisionBlockInput[];
}

export type SaveUnitDraftResult = MintUnitRevisionResult;

/**
 * Save one unit into the edition's active draft, creating the draft if there is
 * none.
 *
 * The base is the active draft when one exists, and the published revision
 * otherwise. That is what makes edits ACCUMULATE: saving chapter 2 after chapter
 * 1 keeps chapter 1's edit, because the manifest it copies forward is the draft's,
 * not the published one's.
 */
export async function saveUnitDraft(
  prisma: PrismaClient,
  params: SaveUnitDraftParams,
): Promise<SaveUnitDraftResult> {
  assertUnitInputValid(params);

  return prisma.$transaction(
    async (tx) => {
      const { publishedRevisionId } = await lockEditionTx(tx, params.editionId);
      if (!publishedRevisionId) {
        throw new Error("INGEST_REQUIRES_BASE_REVISION");
      }

      const activeDraft = await findActiveDraftTx(tx, params.editionId);

      // A draft older than what is published was overtaken by an ingest while
      // the editor was away. Building on it would silently drop whatever that
      // ingest shipped, so refuse and change nothing; the editor reloads and
      // starts from the current published content.
      if (activeDraft) {
        const published = await tx.revision.findUnique({
          where: { id: publishedRevisionId },
          select: { number: true },
        });
        if (published && published.number > activeDraft.number) {
          throw new Error(CONTENT_DRAFT_STALE);
        }
      }

      const baseRevisionId = activeDraft?.id ?? publishedRevisionId;
      const minted = await mintUnitRevisionTx(
        tx,
        params,
        baseRevisionId,
        "content-studio",
      );

      // Exactly one active draft per edition: the one just minted.
      if (activeDraft) await archiveRevisionTx(tx, activeDraft.id);

      return minted;
    },
    { timeout: 30_000 },
  );
}

export interface PublishDraftResult {
  revisionId: string;
  revisionNumber: number;
}

/**
 * Publish a specific draft revision.
 *
 * Deliberately takes the revision id rather than "publish whatever is current":
 * an editor publishes the thing they were just looking at, and if the draft moved
 * underneath them they should be told, not have a different version shipped in
 * their name.
 */
export async function publishDraftRevision(
  prisma: PrismaClient,
  editionId: string,
  revisionId: string,
): Promise<PublishDraftResult> {
  return prisma.$transaction(
    async (tx) => {
      const { publishedRevisionId } = await lockEditionTx(tx, editionId);

      const revision = await tx.revision.findUnique({
        where: { id: revisionId },
        select: { id: true, editionId: true, status: true, number: true },
      });
      if (!revision) throw new Error(CONTENT_DRAFT_NOT_FOUND);
      if (revision.editionId !== editionId) {
        throw new Error(CONTENT_DRAFT_EDITION_MISMATCH);
      }
      if (revision.status !== "DRAFT") {
        throw new Error(CONTENT_DRAFT_NOT_ACTIVE);
      }

      // Only the newest draft may be published. An older one has been superseded
      // by a later save, and publishing it would quietly discard that work.
      const activeDraft = await findActiveDraftTx(tx, editionId);
      if (!activeDraft || activeDraft.id !== revision.id) {
        throw new Error(CONTENT_DRAFT_NOT_ACTIVE);
      }

      if (publishedRevisionId) {
        const published = await tx.revision.findUnique({
          where: { id: publishedRevisionId },
          select: { number: true },
        });
        if (published && published.number > revision.number) {
          throw new Error(CONTENT_DRAFT_STALE);
        }
      }

      // The manifest was validated when the revision was minted and has been
      // immutable since; publishing only moves the pointer.
      const unitCount = await tx.revisionUnit.count({
        where: { revisionId: revision.id },
      });
      if (unitCount === 0) throw new Error("INGEST_EMPTY_UNIT");

      await publishRevisionTx(tx, editionId, revision.id);

      return { revisionId: revision.id, revisionNumber: revision.number };
    },
    { timeout: 30_000 },
  );
}
