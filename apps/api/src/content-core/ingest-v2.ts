import type { Prisma, PrismaClient } from "@prisma/client";
import type { UnitPlacement } from "./lib/revision-manifest";
import {
  archiveRevisionTx,
  assertUnitInputValid,
  findActiveDraftTx,
  lockEditionTx,
  mintUnitRevisionTx,
  publishRevisionTx,
} from "./revision-lifecycle";

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
 *
 * Content Studio (Block A) moved the mint/publish steps into
 * `revision-lifecycle.ts` so an editor can hold a draft between them. Nothing
 * about THIS entry point changed: one call still means "publish this content
 * now", and it still builds from what is PUBLISHED rather than from whatever an
 * editor happens to be drafting — an ingest is maintenance, not a review of
 * someone's unfinished work.
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

export async function ingestUnitV2(
  prisma: PrismaClient,
  params: IngestUnitParams,
): Promise<IngestResult> {
  // Checked before opening the transaction, as before.
  assertUnitInputValid(params);

  return prisma.$transaction(
    async (tx) => {
      const { publishedRevisionId } = await lockEditionTx(tx, params.editionId);

      // A unit ingest EDITS an existing published edition — it never creates the
      // first (partial) revision. The base revision is seeded by backfill/publish.
      if (!publishedRevisionId) {
        throw new Error("INGEST_REQUIRES_BASE_REVISION");
      }

      // Look for the editor's draft BEFORE minting. Afterwards the highest
      // numbered draft is this ingest's own revision, and we would archive
      // nothing.
      const staleDraft = await findActiveDraftTx(tx, params.editionId);

      const minted = await mintUnitRevisionTx(
        tx,
        params,
        publishedRevisionId,
        "ingest-v2",
      );

      // An editorial draft built on the OLD published revision cannot be
      // published on top of this one without silently dropping what we just
      // shipped, so it is retired here rather than left to fail later. Archived,
      // never deleted: the editor's work stays readable.
      if (staleDraft) await archiveRevisionTx(tx, staleDraft.id);

      // Publish atomically — LAST.
      await publishRevisionTx(tx, params.editionId, minted.revisionId);

      return {
        revisionNumber: minted.revisionNumber,
        blocksMatched: minted.blocksMatched,
        blocksNew: minted.blocksNew,
        blocksTombstoned: minted.blocksTombstoned,
      };
    },
    { timeout: 30_000 },
  );
}
