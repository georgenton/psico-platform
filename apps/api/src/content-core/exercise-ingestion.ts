import type { Prisma } from "@prisma/client";
import { blockKeyFromLegacyId } from "./lib/block-key";
import {
  EXERCISE_INGESTION_CATALOG,
  type ObjectiveRecallDefinition,
  type PracticeExerciseDefinition,
} from "./exercise-ingestion-catalog";

/**
 * CC-7.4B.2 — materialize the editorially-approved Exercise rows INSIDE the
 * Content Core backfill's per-Book transaction (`backfill.ts`). Runs after the
 * ContentBlocks and Concepts of a Book have been created, so the practice can
 * resolve its canonical block and the recall's concept shares the unit.
 *
 * Guarantees (ADR-driven, mirrors the create-or-verify discipline of the rest
 * of the backfill):
 *   - deterministic + idempotent: stable ids, no CUIDs, reruns are no-ops;
 *   - fail-closed on drift: an existing row with the SAME id but different
 *     semantics THROWS (rolls the Book transaction back) — never a silent
 *     rewrite of a published answer;
 *   - never first-match: the practice's source heading must resolve to EXACTLY
 *     one ChapterBlock. Zero → the DB lacks this editorial target, skip the
 *     pair (nothing is fabricated). More than one → ambiguous, fail closed;
 *   - a book absent from the catalog contributes zero rows.
 *
 * Privacy: an Exercise row is public catalog content. `correctOptionKey` is
 * stored (grading is server-side) but is INTERNAL — the resolver never
 * serializes it (CC-7.3). No user data, no free text, no open metadata.
 */

const DRIFT = "EXERCISE_INGEST_DRIFT_DETECTED";

/** The transaction-client slice this ingestion touches. */
export type ExerciseIngestDb = Pick<
  Prisma.TransactionClient,
  "exercise" | "chapterBlock" | "contentBlock"
>;

/** Structural JSON equality — order-independent for objects, positional for
 * arrays. Enough for the closed Exercise.content shapes (no Dates/Maps). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => jsonEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(bo, k) && jsonEqual(ao[k], bo[k]),
    );
  }
  return false;
}

interface ExerciseRow {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  type: "REFLECTION" | "QUIZ";
  content: Record<string, unknown>;
}

/**
 * Create-or-verify one Exercise row by its stable id:
 *   absent → insert; present + identical (chapterId, order, title, type,
 *   content) → no-op replay; present + any difference → throw DRIFT.
 */
async function upsertExerciseClosed(
  tx: ExerciseIngestDb,
  row: ExerciseRow,
): Promise<void> {
  const existing = await tx.exercise.findUnique({
    where: { id: row.id },
    select: {
      chapterId: true,
      order: true,
      title: true,
      type: true,
      content: true,
    },
  });
  if (!existing) {
    await tx.exercise.create({
      data: {
        id: row.id,
        chapterId: row.chapterId,
        order: row.order,
        title: row.title,
        type: row.type,
        content: row.content as Prisma.InputJsonValue,
      },
    });
    return;
  }
  const identical =
    existing.chapterId === row.chapterId &&
    existing.order === row.order &&
    existing.title === row.title &&
    existing.type === row.type &&
    jsonEqual(existing.content, row.content);
  if (!identical) throw new Error(DRIFT);
  // exact match → idempotent replay, nothing to write.
}

/**
 * Resolve the ONE ChapterBlock that anchors a practice, then return its stable
 * Content Core `blockKey` — or `null` when the editorial target is absent from
 * this DB (caller skips the pair). Throws DRIFT on ambiguity or a block that is
 * not canonicalized into the expected unit.
 */
async function resolvePracticeSourceBlockKey(
  tx: ExerciseIngestDb,
  chapterId: string,
  unitId: string,
  def: PracticeExerciseDefinition,
): Promise<string | null> {
  const blocks = await tx.chapterBlock.findMany({
    where: { chapterId, content: def.sourceHeading },
    select: { id: true },
  });
  if (blocks.length === 0) return null; // target not present → never fabricate
  if (blocks.length > 1) throw new Error(DRIFT); // ambiguous → never first-match

  const sourceBlockKey = blockKeyFromLegacyId(blocks[0].id);
  const canonical = await tx.contentBlock.findUnique({
    where: { blockKey: sourceBlockKey },
    select: { unitId: true },
  });
  // Exactly one canonical block, in the SAME unit as the concept/recall.
  if (!canonical || canonical.unitId !== unitId) throw new Error(DRIFT);
  return sourceBlockKey;
}

function recallContent(
  def: ObjectiveRecallDefinition,
): Record<string, unknown> {
  // Reconstruct explicitly so no stray key can reach storage.
  return {
    recallMode: def.content.recallMode,
    conceptKey: def.content.conceptKey,
    options: def.content.options.map((o) => ({ key: o.key, label: o.label })),
    correctOptionKey: def.content.correctOptionKey,
  };
}

/**
 * Ingest the catalog's Exercise rows for one Book, using the units already
 * resolved by the backfill. `chapterIdByOrder` / `unitIdByOrder` come from the
 * chapter loop; `tx` is the Book's transaction so any DRIFT rolls the whole
 * Book back.
 */
export async function ingestUnitExercises(
  tx: ExerciseIngestDb,
  bookSlug: string,
  chapterIdByOrder: ReadonlyMap<number, string>,
  unitIdByOrder: ReadonlyMap<number, string>,
): Promise<void> {
  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug];
  if (!pairs) return;

  for (const { practice, recall } of pairs) {
    const chapterId = chapterIdByOrder.get(practice.chapterOrder);
    const unitId = unitIdByOrder.get(practice.chapterOrder);
    // The targeted chapter/unit is not present in this DB → nothing to ingest.
    if (!chapterId || !unitId) continue;

    const sourceBlockKey = await resolvePracticeSourceBlockKey(
      tx,
      chapterId,
      unitId,
      practice,
    );
    // Editorial target block absent → skip the whole pair (never fabricate a
    // practice, and keep the pair coupled to the same real unit).
    if (sourceBlockKey === null) continue;

    await upsertExerciseClosed(tx, {
      id: practice.exerciseKey,
      chapterId,
      order: practice.order,
      title: practice.title,
      type: "REFLECTION",
      content: { practiceKind: practice.practiceKind, sourceBlockKey },
    });

    await upsertExerciseClosed(tx, {
      id: recall.exerciseKey,
      chapterId,
      order: recall.order,
      title: recall.title,
      type: "QUIZ",
      content: recallContent(recall),
    });
  }
}
