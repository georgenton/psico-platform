import { matchBlock } from "./matcher";
import type { NewBlockInput, PrevBlock } from "./matcher";

/**
 * Content Core — RevisionManifest algorithm + unit ingest plan (CC-1, pure).
 *
 * A Revision is a manifest (RevisionUnit rows) selecting one ContentUnitVersion
 * per ContentUnit, with placement. A new revision copies the previous manifest
 * forward and swaps ONLY the changed unit. See docs/architecture/content-core.md
 * §E and ADR 0016.
 */

export interface ManifestEntry {
  unitKey: string;
  unitVersionId: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
}

export interface UnitPlacement {
  order: number;
  partNumber: number | null;
  partTitle: string | null;
}

/**
 * Copy the previous manifest forward, replacing exactly one unit's entry with a
 * new immutable version. Every OTHER unit keeps its exact `unitVersionId` +
 * placement (referenced, not duplicated). A never-before-seen unit is appended.
 */
export function buildNextManifest(
  prev: ManifestEntry[],
  changedUnitKey: string,
  newUnitVersionId: string,
  placement: UnitPlacement,
): ManifestEntry[] {
  const entry: ManifestEntry = {
    unitKey: changedUnitKey,
    unitVersionId: newUnitVersionId,
    order: placement.order,
    partNumber: placement.partNumber,
    partTitle: placement.partTitle,
  };
  const existed = prev.some((e) => e.unitKey === changedUnitKey);
  const next = prev.map((e) => (e.unitKey === changedUnitKey ? entry : e));
  if (!existed) next.push(entry);
  return next;
}

// ── Per-unit block diff plan ────────────────────────────────────────────────

export type PlannedOrigin = "matched-exact" | "matched-fuzzy" | "new";

export interface PlannedBlock {
  order: number;
  content: string;
  contentHash: string;
  /** Resolved stable identity: a carried key, or a freshly minted one. */
  blockKey: string;
  origin: PlannedOrigin;
}

export interface UnitIngestPlan {
  blocks: PlannedBlock[];
  /** Previous blockKeys with no match in the new content → naturally tombstoned. */
  tombstonedKeys: string[];
}

/**
 * Diff a unit's new blocks against the previous version's blocks. Each previous
 * block matches at most one new block. `mintKey(index)` is INJECTED so the plan
 * is deterministic (no RNG in the pure layer).
 */
export function planUnitIngest(
  prev: PrevBlock[],
  next: Array<NewBlockInput & { order: number }>,
  mintKey: (index: number) => string,
): UnitIngestPlan {
  const usedPrevKeys = new Set<string>();

  const blocks: PlannedBlock[] = next.map((nb, i) => {
    const available = prev.filter((p) => !usedPrevKeys.has(p.blockKey));
    const m = matchBlock(nb, available);
    if (m.kind === "exact-key" || m.kind === "exact-hash") {
      usedPrevKeys.add(m.blockKey);
      return {
        order: nb.order,
        content: nb.content,
        contentHash: nb.contentHash,
        blockKey: m.blockKey,
        origin: "matched-exact",
      };
    }
    if (m.kind === "fuzzy-unique") {
      usedPrevKeys.add(m.blockKey);
      return {
        order: nb.order,
        content: nb.content,
        contentHash: nb.contentHash,
        blockKey: m.blockKey,
        origin: "matched-fuzzy",
      };
    }
    return {
      order: nb.order,
      content: nb.content,
      contentHash: nb.contentHash,
      blockKey: mintKey(i),
      origin: "new",
    };
  });

  const tombstonedKeys = prev
    .filter((p) => !usedPrevKeys.has(p.blockKey))
    .map((p) => p.blockKey);

  return { blocks, tombstonedKeys };
}
