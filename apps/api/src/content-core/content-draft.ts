import type { PrismaClient } from "@prisma/client";
import type { UnitPlacement } from "./lib/revision-manifest";
import {
  CONTENT_DRAFT_CONFLICT,
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
  /**
   * The revision the editor loaded and is editing FROM.
   *
   * The edition lock serialises writes, but it cannot tell that a browser is
   * looking at yesterday's text. This can: if the base moved — another tab,
   * another admin, a maintenance ingest — the save is refused instead of
   * silently overwriting work the editor never saw.
   */
  expectedRevisionId: string;
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

      // Optimistic concurrency, checked INSIDE the lock so the answer cannot go
      // stale between the check and the write. No merge engine: an editor whose
      // base moved reloads and decides for themselves.
      if (params.expectedRevisionId !== baseRevisionId) {
        throw new Error(CONTENT_DRAFT_CONFLICT);
      }

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

/** One unit whose content differs between the published revision and the draft. */
export interface ChangedUnit {
  unitKey: string;
}

/**
 * Which units an active draft would actually change, and the draft itself.
 *
 * Derived by comparing `unitVersionId` per unit between the published manifest
 * and the draft's — no new column, no bookkeeping to drift. A draft that touched
 * a chapter and then restored it byte-for-byte still counts as changed, because
 * the matcher minted a new unit version; that is a conservative answer in the
 * safe direction.
 */
export async function describeEditionDraft(
  prisma: PrismaClient,
  editionId: string,
): Promise<{
  publishedRevisionId: string | null;
  publishedRevisionNumber: number | null;
  draftRevisionId: string | null;
  draftRevisionNumber: number | null;
  changedUnitKeys: string[];
}> {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: { publishedRevisionId: true },
  });
  if (!edition) throw new Error("INGEST_EDITION_NOT_FOUND");

  const draft = await prisma.revision.findFirst({
    where: { editionId, status: "DRAFT" },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });

  const published = edition.publishedRevisionId
    ? await prisma.revision.findUnique({
        where: { id: edition.publishedRevisionId },
        select: { id: true, number: true },
      })
    : null;

  if (!draft || !published) {
    return {
      publishedRevisionId: published?.id ?? null,
      publishedRevisionNumber: published?.number ?? null,
      draftRevisionId: draft?.id ?? null,
      draftRevisionNumber: draft?.number ?? null,
      changedUnitKeys: [],
    };
  }

  const [publishedUnits, draftUnits] = await Promise.all([
    prisma.revisionUnit.findMany({
      where: { revisionId: published.id },
      include: { unit: { select: { unitKey: true } } },
    }),
    prisma.revisionUnit.findMany({
      where: { revisionId: draft.id },
      include: { unit: { select: { unitKey: true } } },
    }),
  ]);

  const publishedByKey = new Map(
    publishedUnits.map((ru) => [ru.unit.unitKey, ru.unitVersionId]),
  );
  const changedUnitKeys = draftUnits
    .filter((ru) => publishedByKey.get(ru.unit.unitKey) !== ru.unitVersionId)
    .map((ru) => ru.unit.unitKey)
    .sort();

  return {
    publishedRevisionId: published.id,
    publishedRevisionNumber: published.number,
    draftRevisionId: draft.id,
    draftRevisionNumber: draft.number,
    changedUnitKeys,
  };
}

/** One unit's content as of an EXACT revision — the preview read. */
export async function readUnitAtRevision(
  prisma: PrismaClient,
  revisionId: string,
  unitKey: string,
): Promise<{
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  blocks: Array<{
    blockKey: string;
    kind: string;
    content: string;
    meta: unknown;
    order: number;
  }>;
} | null> {
  const ru = await prisma.revisionUnit.findFirst({
    where: { revisionId, unit: { unitKey } },
    include: { unitVersion: true },
  });
  if (!ru) return null;

  const bvs = await prisma.blockVersion.findMany({
    where: { unitVersionId: ru.unitVersionId },
    include: { contentBlock: { select: { blockKey: true } } },
    orderBy: { order: "asc" },
  });

  return {
    title: ru.unitVersion.title,
    summary: ru.unitVersion.summary,
    durationMinutes: ru.unitVersion.durationMinutes,
    blocks: bvs.map((bv) => ({
      blockKey: bv.contentBlock.blockKey,
      kind: bv.kind,
      content: bv.content,
      meta: bv.meta ?? null,
      order: bv.order,
    })),
  };
}
