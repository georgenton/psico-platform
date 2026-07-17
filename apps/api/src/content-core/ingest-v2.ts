import { BlockKind, type Prisma, type PrismaClient } from "@prisma/client";
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
 * Content Core — CC-5 non-destructive ingest.
 *
 * Replaces the destructive legacy `ingest-chapter-md.mjs` (which cascade-deletes
 * anchors). Mints a NEW revision, copies the manifest forward, and rewrites ONLY
 * the changed unit — never deleting a `ContentBlock` (so user anchors survive) and
 * never deleting a `Highlight`/`Annotation`. Block identity is carried forward by
 * the conservative CC-1 matcher (exact hash/key, unique >= 0.95, else new;
 * removed blocks tombstone). The revision is created DRAFT and PUBLISHED atomically
 * at the end. See docs/architecture/content-core.md §E and ADR 0016.
 *
 * Concurrency: the transaction locks the `Edition` row FOR UPDATE and re-reads the
 * published pointer + manifest AFTER the lock, so concurrent ingests on the same
 * edition serialize and every unit's change survives (none is clobbered). A unit
 * ingest requires an already-published base revision (`INGEST_REQUIRES_BASE_REVISION`)
 * — it never creates the first, partial revision (backfill/publish seeds it).
 */

export interface IngestBlockInput {
  kind: string; // a BlockKind value
  content: string;
  meta?: Prisma.InputJsonValue | null;
}

export interface IngestUnitParams {
  editionId: string;
  unitKey: string;
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  placement: UnitPlacement;
  blocks: IngestBlockInput[];
}

export interface IngestResult {
  revisionNumber: number;
  blocksMatched: number;
  blocksNew: number;
  blocksTombstoned: number;
}

const VALID_BLOCK_KINDS = new Set<string>(Object.values(BlockKind));

export async function ingestUnitV2(
  prisma: PrismaClient,
  params: IngestUnitParams,
): Promise<IngestResult> {
  // Ingest input boundary: reject an invalid block kind explicitly rather than
  // letting `undefined` reach Prisma. Checked before opening the transaction.
  for (const b of params.blocks) {
    if (!VALID_BLOCK_KINDS.has(b.kind)) {
      throw new Error("INGEST_INVALID_BLOCK_KIND");
    }
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialize concurrent ingests on the SAME edition: lock the Edition row
      // FOR UPDATE, THEN read the published pointer + manifest. A racing ingest
      // that just committed is observed here (its manifest is copied forward),
      // never clobbered — under READ COMMITTED the reads after the lock grant
      // see the winner's committed rows.
      const locked = await tx.$queryRaw<
        Array<{ publishedRevisionId: string | null }>
      >`SELECT "publishedRevisionId" FROM "Edition" WHERE "id" = ${params.editionId} FOR UPDATE`;
      if (locked.length === 0) throw new Error("INGEST_EDITION_NOT_FOUND");

      // A unit ingest EDITS an existing published edition — it never creates the
      // first (partial) revision. The base revision is seeded by backfill/publish.
      const publishedRevisionId = locked[0].publishedRevisionId;
      if (!publishedRevisionId) {
        throw new Error("INGEST_REQUIRES_BASE_REVISION");
      }

      const prevRev = await tx.revision.findUnique({
        where: { id: publishedRevisionId },
        include: { units: { include: { unit: true } } },
      });
      if (!prevRev) throw new Error("INGEST_BASE_REVISION_NOT_FOUND");

      const prevManifest: ManifestEntry[] = prevRev.units.map((ru) => ({
        unitKey: ru.unit.unitKey,
        unitVersionId: ru.unitVersionId,
        order: ru.order,
        partNumber: ru.partNumber,
        partTitle: ru.partTitle,
      }));

      // Stable ContentUnit (create if this is the unit's first ingest).
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

      // Previous blocks for THIS unit (from its version in the prev manifest).
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

      const nextNumber = prevRev.number + 1;
      const revision = await tx.revision.create({
        data: {
          editionId: params.editionId,
          number: nextNumber,
          status: "DRAFT",
          note: "ingest-v2",
        },
      });

      // New immutable version for the changed unit.
      const version = await tx.contentUnitVersion.create({
        data: {
          unitId: unit.id,
          title: params.title,
          summary: params.summary ?? null,
          durationMinutes: params.durationMinutes ?? null,
        },
      });

      // Conservative CC-1 diff. New blocks mint a stable key from their content.
      const nextBlocks: Array<NewBlockInput & { order: number }> =
        params.blocks.map((b, i) => ({
          kind: b.kind,
          content: b.content,
          contentHash: contentHash(b.content),
          order: i,
        }));
      // Editorial position is part of the key so two IDENTICAL new blocks in the
      // same unit/revision (same contentHash) get DISTINCT stable keys.
      const mintKey = (i: number) =>
        uuidv5(
          `${params.editionId}:${params.unitKey}:r${nextNumber}:pos${nextBlocks[i].order}:${nextBlocks[i].contentHash}`,
        );
      const plan = planUnitIngest(prev, nextBlocks, mintKey);

      let blocksMatched = 0;
      let blocksNew = 0;
      for (let i = 0; i < plan.blocks.length; i += 1) {
        const pb = plan.blocks[i];
        const original = params.blocks[i];
        const kind = BlockKind[pb.kind as keyof typeof BlockKind];

        // Reuse the stable ContentBlock if the key survives; create if net-new.
        // A ContentBlock is NEVER deleted here — removed blocks simply get no
        // BlockVersion in this revision (they tombstone).
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
      const blocksTombstoned = plan.tombstonedKeys.length;

      // Manifest: copy the prior manifest forward, swap only this unit.
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
            editionId_unitKey: {
              editionId: params.editionId,
              unitKey: e.unitKey,
            },
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

      // Publish atomically — LAST.
      await tx.revision.update({
        where: { id: revision.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      await tx.edition.update({
        where: { id: params.editionId },
        data: { publishedRevisionId: revision.id },
      });

      return {
        revisionNumber: nextNumber,
        blocksMatched,
        blocksNew,
        blocksTombstoned,
      };
    },
    { timeout: 30_000 },
  );
}
