import { BlockKind, type Prisma } from "@prisma/client";
import { uuidv5 } from "./lib/block-key";
import { contentHash } from "./lib/content-hash";
import {
  buildNextManifest,
  planUnitIngest,
  validateManifest,
  type ManifestEntry,
  type UnitPlacement,
} from "./lib/revision-manifest";
import type { NewBlockInput, PrevBlock } from "./lib/matcher";

/**
 * Content Core — the revision lifecycle primitives (Content Studio, Block A).
 *
 * `ingestUnitV2` already knew how to rewrite one unit without destroying a
 * reader's anchors. What it could not do is STOP: it minted a revision and
 * published it in the same breath, so there was no way for an editor to save,
 * come back tomorrow, look at the result and publish it then.
 *
 * The two halves live here, and both take an open transaction because the
 * `Edition` row lock is what serialises everything:
 *
 *   `mintUnitRevisionTx`  — build the next revision from a BASE revision.
 *   `publishRevisionTx`   — flip a revision to PUBLISHED and move the pointer.
 *
 * `ingestUnitV2` now calls both in one transaction and keeps its exact public
 * behaviour. The CMS calls the first alone, repeatedly, and the second later.
 * There is one implementation of the hard part — the matcher, the manifest copy,
 * the stable-key minting — and it did not move.
 *
 * A revision is a SNAPSHOT. Nothing here ever mutates a `ContentUnitVersion`, a
 * `BlockVersion` or a written manifest; every save mints a new revision and
 * archives the one it superseded.
 */

/** Domain failures. Plain strings, matching the rest of Content Core. */
export const CONTENT_DRAFT_NOT_FOUND = "CONTENT_DRAFT_NOT_FOUND";
export const CONTENT_DRAFT_NOT_ACTIVE = "CONTENT_DRAFT_NOT_ACTIVE";
export const CONTENT_DRAFT_STALE = "CONTENT_DRAFT_STALE";
export const CONTENT_DRAFT_EDITION_MISMATCH = "CONTENT_DRAFT_EDITION_MISMATCH";

export interface RevisionBlockInput {
  kind: string;
  content: string;
  meta?: Prisma.InputJsonValue | null;
}

export interface MintUnitRevisionParams {
  editionId: string;
  unitKey: string;
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  placement: UnitPlacement;
  blocks: RevisionBlockInput[];
}

export interface MintUnitRevisionResult {
  revisionId: string;
  revisionNumber: number;
  blocksMatched: number;
  blocksNew: number;
  blocksTombstoned: number;
}

const VALID_BLOCK_KINDS = new Set<string>(Object.values(BlockKind));

/** Input checks that need no database, so callers can run them before a lock. */
export function assertUnitInputValid(params: {
  blocks: RevisionBlockInput[];
}): void {
  // A published unit with zero blocks is an integrity error the read adapter
  // rejects, so it must never be minted in the first place.
  if (params.blocks.length === 0) throw new Error("INGEST_EMPTY_UNIT");
  for (const b of params.blocks) {
    if (!VALID_BLOCK_KINDS.has(b.kind)) {
      throw new Error("INGEST_INVALID_BLOCK_KIND");
    }
  }
}

/** Lock the edition for the rest of the transaction. Returns its pointer. */
export async function lockEditionTx(
  tx: Prisma.TransactionClient,
  editionId: string,
): Promise<{ publishedRevisionId: string | null }> {
  const locked = await tx.$queryRaw<
    Array<{ publishedRevisionId: string | null }>
  >`SELECT "publishedRevisionId" FROM "Edition" WHERE "id" = ${editionId} FOR UPDATE`;
  if (locked.length === 0) throw new Error("INGEST_EDITION_NOT_FOUND");
  return { publishedRevisionId: locked[0]!.publishedRevisionId };
}

/**
 * The next revision number for an edition.
 *
 * `previousPublished.number + 1` was safe while every revision was published the
 * instant it existed. It is not safe once drafts persist: a draft occupies a
 * number without moving the published pointer, so the next ingest would collide
 * with it on `@@unique([editionId, number])`. Take the MAX across ALL statuses
 * instead, inside the edition lock.
 */
export async function nextRevisionNumberTx(
  tx: Prisma.TransactionClient,
  editionId: string,
): Promise<number> {
  const highest = await tx.revision.findFirst({
    where: { editionId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (highest?.number ?? 0) + 1;
}

/** The newest revision an editor may still build on, or null. */
export async function findActiveDraftTx(
  tx: Prisma.TransactionClient,
  editionId: string,
): Promise<{ id: string; number: number } | null> {
  return tx.revision.findFirst({
    where: { editionId, status: "DRAFT" },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
}

async function manifestOfTx(
  tx: Prisma.TransactionClient,
  revisionId: string,
): Promise<ManifestEntry[]> {
  const rev = await tx.revision.findUnique({
    where: { id: revisionId },
    include: { units: { include: { unit: true } } },
  });
  if (!rev) throw new Error("INGEST_BASE_REVISION_NOT_FOUND");
  return rev.units.map((ru) => ({
    unitKey: ru.unit.unitKey,
    unitVersionId: ru.unitVersionId,
    order: ru.order,
    partNumber: ru.partNumber,
    partTitle: ru.partTitle,
  }));
}

/**
 * Build the next revision for one edited unit, from `baseRevisionId`.
 *
 * Always DRAFT on the way out. Whether it then gets published in the same
 * transaction is the caller's decision, and that is the entire difference
 * between an ingest and an editorial save.
 *
 * The caller MUST already hold the edition lock.
 */
export async function mintUnitRevisionTx(
  tx: Prisma.TransactionClient,
  params: MintUnitRevisionParams,
  baseRevisionId: string,
  note: string,
): Promise<MintUnitRevisionResult> {
  const prevManifest = await manifestOfTx(tx, baseRevisionId);

  // Stable ContentUnit (created on this unit's first ingest).
  let unit = await tx.contentUnit.findUnique({
    where: {
      editionId_unitKey: {
        editionId: params.editionId,
        unitKey: params.unitKey,
      },
    },
  });
  if (!unit) {
    unit = await tx.contentUnit.create({
      data: { editionId: params.editionId, unitKey: params.unitKey },
    });
  }

  // The unit's blocks AS OF the base revision — which is the active draft when
  // there is one, so a second save diffs against the first rather than against
  // whatever is published.
  const prevEntry = prevManifest.find((e) => e.unitKey === params.unitKey);
  let prev: PrevBlock[] = [];
  if (prevEntry) {
    const bvs = await tx.blockVersion.findMany({
      where: { unitVersionId: prevEntry.unitVersionId },
      include: { contentBlock: true },
      orderBy: { order: "asc" },
    });
    prev = bvs.map((bv) => ({
      blockKey: bv.contentBlock.blockKey,
      kind: bv.kind,
      contentHash: bv.contentHash,
      content: bv.content,
    }));
  }

  const nextNumber = await nextRevisionNumberTx(tx, params.editionId);
  const revision = await tx.revision.create({
    data: {
      editionId: params.editionId,
      number: nextNumber,
      status: "DRAFT",
      note,
    },
  });

  const version = await tx.contentUnitVersion.create({
    data: {
      unitId: unit.id,
      title: params.title,
      summary: params.summary ?? null,
      durationMinutes: params.durationMinutes ?? null,
    },
  });

  const nextBlocks: Array<NewBlockInput & { order: number }> =
    params.blocks.map((b, i) => ({
      kind: b.kind,
      content: b.content,
      contentHash: contentHash(b.content),
      order: i,
    }));
  // Editorial position is part of the key so two IDENTICAL new blocks in the
  // same unit/revision get DISTINCT stable keys.
  const mintKey = (i: number) =>
    uuidv5(
      `${params.editionId}:${params.unitKey}:r${nextNumber}:pos${nextBlocks[i]!.order}:${nextBlocks[i]!.contentHash}`,
    );
  const plan = planUnitIngest(prev, nextBlocks, mintKey);

  let blocksMatched = 0;
  let blocksNew = 0;
  for (let i = 0; i < plan.blocks.length; i += 1) {
    const pb = plan.blocks[i]!;
    const original = params.blocks[i]!;
    const kind = BlockKind[pb.kind as keyof typeof BlockKind];

    // A ContentBlock is NEVER deleted: a removed block simply gets no
    // BlockVersion in this revision, which is what keeps a reader's highlight
    // pointing at something that still exists.
    let cb = await tx.contentBlock.findUnique({
      where: { blockKey: pb.blockKey },
    });
    if (!cb) {
      cb = await tx.contentBlock.create({
        data: { blockKey: pb.blockKey, unitId: unit.id },
      });
      blocksNew += 1;
    } else {
      blocksMatched += 1;
    }

    const metaInput = original.meta == null ? {} : { meta: original.meta };
    await tx.blockVersion.create({
      data: {
        contentBlockId: cb.id,
        unitVersionId: version.id,
        order: pb.order,
        kind,
        content: pb.content,
        contentHash: pb.contentHash,
        ...metaInput,
      },
    });
  }

  const nextManifest = buildNextManifest(
    prevManifest,
    params.unitKey,
    version.id,
    params.placement,
  );
  validateManifest(nextManifest);

  for (const e of nextManifest) {
    const u = await tx.contentUnit.findUnique({
      where: {
        editionId_unitKey: { editionId: params.editionId, unitKey: e.unitKey },
      },
    });
    if (!u) throw new Error("INGEST_UNIT_NOT_FOUND");
    await tx.revisionUnit.create({
      data: {
        revisionId: revision.id,
        unitId: u.id,
        unitVersionId: e.unitVersionId,
        order: e.order,
        partNumber: e.partNumber,
        partTitle: e.partTitle,
      },
    });
  }

  return {
    revisionId: revision.id,
    revisionNumber: nextNumber,
    blocksMatched,
    blocksNew,
    blocksTombstoned: plan.tombstonedKeys.length,
  };
}

/**
 * Publish a revision: status first, edition pointer LAST.
 *
 * Cheap on purpose — the content was already built when the revision was minted,
 * so publishing decides nothing about what the content is. That ordering is also
 * what makes a crash mid-publish harmless: a PUBLISHED revision nobody points at
 * is invisible, whereas a pointer to an unpublished revision would not be.
 *
 * The caller MUST already hold the edition lock.
 */
export async function publishRevisionTx(
  tx: Prisma.TransactionClient,
  editionId: string,
  revisionId: string,
): Promise<void> {
  await tx.revision.update({
    where: { id: revisionId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await tx.edition.update({
    where: { id: editionId },
    data: { publishedRevisionId: revisionId },
  });
}

/**
 * Retire a draft that can no longer be published correctly.
 *
 * Archiving rather than deleting: the rows are a record of what an editor wrote,
 * and something that was never public is not something to erase on their behalf.
 */
export async function archiveRevisionTx(
  tx: Prisma.TransactionClient,
  revisionId: string,
): Promise<void> {
  await tx.revision.update({
    where: { id: revisionId },
    data: { status: "ARCHIVED" },
  });
}
