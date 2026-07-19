import type { Prisma } from "@prisma/client";
import { BlockKind } from "@prisma/client";
import { contentHash } from "./lib/content-hash";

/**
 * Content Core — shared create-or-verify expectations (CC-6F).
 *
 * ONE definition of "what the backfill would write" and "does an existing row
 * drift from it", consumed by BOTH `backfillContentCore` (the apply) and
 * `dryRunTargetedBackfill` (the read-only preview). This is a pure,
 * behavior-preserving extraction of the comparisons the approved CC-3 library
 * performed inline — the fields and semantics are IDENTICAL, so a dry-run can
 * never declare `backfill_safe=true` for a book the apply would reject with
 * BACKFILL_DRIFT_DETECTED, and vice versa.
 *
 * Never add a comparison here without the pg-spec drift matrix covering it.
 */

// ── ContentUnitVersion (backfill section 4) ─────────────────────────────────

export interface UnitVersionExpectation {
  unitId: string;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
}

export function expectedUnitVersionFields(
  ch: {
    title: string;
    description: string | null;
    durationMinutes: number | null;
  },
  unitId: string,
): UnitVersionExpectation {
  return {
    unitId,
    title: ch.title,
    summary: ch.description ?? null,
    durationMinutes: ch.durationMinutes ?? null,
  };
}

export function unitVersionDrifts(
  existing: UnitVersionExpectation,
  expected: UnitVersionExpectation,
): boolean {
  return (
    existing.unitId !== expected.unitId ||
    existing.title !== expected.title ||
    existing.summary !== expected.summary ||
    existing.durationMinutes !== expected.durationMinutes
  );
}

// ── ContentBlock identity (backfill section 5) ──────────────────────────────

export function contentBlockDrifts(
  existing: { unitId: string; legacyBlockId: string | null },
  expected: { unitId: string; legacyBlockId: string },
): boolean {
  return (
    existing.unitId !== expected.unitId ||
    existing.legacyBlockId !== expected.legacyBlockId
  );
}

// ── BlockVersion (backfill section 6) ───────────────────────────────────────

export interface BlockVersionExpectation {
  order: number;
  kind: BlockKind;
  content: string;
  contentHash: string;
  meta: Prisma.JsonValue | null;
}

export function expectedBlockVersionFields(b: {
  order: number;
  kind: string;
  content: string;
  meta: Prisma.JsonValue | null;
}): BlockVersionExpectation {
  return {
    order: b.order,
    kind: BlockKind[b.kind as keyof typeof BlockKind],
    content: b.content,
    contentHash: contentHash(b.content),
    meta: b.meta ?? null,
  };
}

export function blockVersionDrifts(
  existing: {
    order: number;
    kind: BlockKind;
    content: string;
    contentHash: string;
    meta: Prisma.JsonValue | null;
  },
  expected: BlockVersionExpectation,
): boolean {
  const metaSame =
    JSON.stringify(existing.meta ?? null) ===
    JSON.stringify(expected.meta ?? null);
  return (
    existing.order !== expected.order ||
    existing.kind !== expected.kind ||
    existing.content !== expected.content ||
    existing.contentHash !== expected.contentHash ||
    !metaSame
  );
}

// ── RevisionUnit / manifest placement (backfill section 7) ──────────────────

export interface RevisionUnitExpectation {
  unitVersionId: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
}

export function expectedRevisionUnitFields(
  ch: { order: number; partNumber: number | null; partTitle: string | null },
  unitVersionId: string,
): RevisionUnitExpectation {
  return {
    unitVersionId,
    order: ch.order,
    partNumber: ch.partNumber ?? null,
    partTitle: ch.partTitle ?? null,
  };
}

export function revisionUnitDrifts(
  existing: RevisionUnitExpectation,
  expected: RevisionUnitExpectation,
): boolean {
  return (
    existing.unitVersionId !== expected.unitVersionId ||
    existing.order !== expected.order ||
    existing.partNumber !== expected.partNumber ||
    existing.partTitle !== expected.partTitle
  );
}
