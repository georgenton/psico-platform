import type { Prisma } from "@prisma/client";
import { blockKeyFromLegacyId } from "./lib/block-key";
import {
  EXERCISE_INGESTION_CATALOG,
  type ObjectiveRecallDefinition,
  type UnitExerciseDefinitions,
} from "./exercise-ingestion-catalog";

/**
 * CC-7.4B.2 — materialize the editorially-approved Exercise rows INSIDE the
 * Content Core backfill's per-Book transaction (`backfill.ts`). Runs after the
 * ContentBlocks and Concepts of a Book have been created, so the practice can
 * resolve its canonical block and the recall's concept shares the unit.
 *
 * Fail-closed contract (there is NO partial skip for an approved production
 * definition):
 *   - a Book ABSENT from the catalog contributes zero rows — the ONLY allowed
 *     no-op;
 *   - a Book PRESENT in the catalog requires, for every declared pair, a real
 *     chapter, its unit, exactly ONE `HEADING` ChapterBlock matching the
 *     approved editorial heading, and a canonical ContentBlock in that unit.
 *     Any absence, ambiguity or inconsistency THROWS and rolls the Book
 *     transaction back;
 *   - deterministic + idempotent: stable ids, no CUIDs, reruns are no-ops;
 *   - drift (same id, different semantics) THROWS — never a silent rewrite.
 *
 * Errors are value-free (a stable `code`, message === code): no slug, title,
 * question, answer or received key ever appears in a thrown/loggable error.
 *
 * Privacy: an Exercise row is public catalog content. `correctOptionKey` is
 * stored (grading is server-side) but is INTERNAL — the resolver never
 * serializes it (CC-7.3). No user data, no free text, no open metadata.
 */

export type ExerciseIngestErrorCode =
  | "EXERCISE_INGEST_SOURCE_MISSING"
  | "EXERCISE_INGEST_SOURCE_AMBIGUOUS"
  | "EXERCISE_INGEST_DRIFT_DETECTED"
  | "EXERCISE_INGEST_CATALOG_INVALID";

/** Value-free ingestion failure — carries a stable code and nothing else. */
export class ExerciseIngestError extends Error {
  readonly code: ExerciseIngestErrorCode;
  constructor(code: ExerciseIngestErrorCode) {
    super(code); // message === code — no editorial value ever embedded
    this.name = "ExerciseIngestError";
    this.code = code;
  }
}

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

/**
 * Pure catalog-coherence guard — turns the duplication between the practice and
 * the recall (which each declare their own book/chapter/type) into a checked
 * invariant, BEFORE any DB access. Nothing from `recall.bookSlug`,
 * `recall.chapterOrder`, `practice.type` or `recall.type` is silently ignored.
 */
export function assertPairValid(
  bookSlug: string,
  pair: UnitExerciseDefinitions,
): void {
  const { practice, recall } = pair;
  const shapeOk =
    practice.bookSlug === bookSlug &&
    recall.bookSlug === bookSlug &&
    practice.chapterOrder === recall.chapterOrder &&
    practice.type === "REFLECTION" &&
    recall.type === "QUIZ" &&
    practice.order > 0 &&
    recall.order > 0 &&
    practice.order !== recall.order &&
    practice.exerciseKey !== recall.exerciseKey &&
    recall.content.recallMode === "objective" &&
    Array.isArray(recall.content.options) &&
    recall.content.options.length >= 2;
  if (!shapeOk)
    throw new ExerciseIngestError("EXERCISE_INGEST_CATALOG_INVALID");

  const keys = recall.content.options.map((o) => o.key);
  const uniqueKeys = new Set(keys).size === keys.length;
  const correctInOptions = keys.includes(recall.content.correctOptionKey);
  if (!uniqueKeys || !correctInOptions) {
    throw new ExerciseIngestError("EXERCISE_INGEST_CATALOG_INVALID");
  }
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
  if (!identical)
    throw new ExerciseIngestError("EXERCISE_INGEST_DRIFT_DETECTED");
  // exact match → idempotent replay, nothing to write.
}

/**
 * Resolve the ONE `HEADING` ChapterBlock that anchors a practice and return its
 * stable Content Core `blockKey`. Always returns a string or throws:
 *   0 HEADING matches → SOURCE_MISSING (never fabricate);
 *   >1 matches         → SOURCE_AMBIGUOUS (never first-match);
 *   canonical block absent / not round-tripping / in the wrong unit →
 *   SOURCE_MISSING.
 * A `PARAGRAPH`/`QUOTE`/`EXERCISE` block with the same text is NOT a valid
 * source — the kind is part of the where-clause.
 */
async function resolvePracticeSourceBlockKey(
  tx: ExerciseIngestDb,
  chapterId: string,
  unitId: string,
  sourceHeading: string,
): Promise<string> {
  const blocks = await tx.chapterBlock.findMany({
    where: { chapterId, kind: "HEADING", content: sourceHeading },
    select: { id: true },
  });
  if (blocks.length === 0) {
    throw new ExerciseIngestError("EXERCISE_INGEST_SOURCE_MISSING");
  }
  if (blocks.length > 1) {
    throw new ExerciseIngestError("EXERCISE_INGEST_SOURCE_AMBIGUOUS");
  }

  const legacyBlockId = blocks[0].id;
  const sourceBlockKey = blockKeyFromLegacyId(legacyBlockId);
  const canonical = await tx.contentBlock.findUnique({
    where: { blockKey: sourceBlockKey },
    select: { unitId: true, legacyBlockId: true },
  });
  // The canonical ContentBlock must exist, round-trip to the SAME legacy block,
  // and sit in the expected unit (the unit the concept/recall belong to).
  if (
    !canonical ||
    canonical.legacyBlockId !== legacyBlockId ||
    canonical.unitId !== unitId
  ) {
    throw new ExerciseIngestError("EXERCISE_INGEST_SOURCE_MISSING");
  }
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
 * chapter loop; `tx` is the Book's transaction so any failure rolls the whole
 * Book back.
 */
export async function ingestUnitExercises(
  tx: ExerciseIngestDb,
  bookSlug: string,
  chapterIdByOrder: ReadonlyMap<number, string>,
  unitIdByOrder: ReadonlyMap<number, string>,
): Promise<void> {
  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug];
  if (!pairs) return; // book not in the catalog → the ONLY allowed no-op

  for (const pair of pairs) {
    assertPairValid(bookSlug, pair); // pure, before any DB touch
    const { practice, recall } = pair;

    const chapterId = chapterIdByOrder.get(practice.chapterOrder);
    const unitId = unitIdByOrder.get(practice.chapterOrder);
    // An approved production definition whose chapter/unit is absent is an
    // inconsistency — fail closed, never a silent skip.
    if (!chapterId || !unitId) {
      throw new ExerciseIngestError("EXERCISE_INGEST_SOURCE_MISSING");
    }

    const sourceBlockKey = await resolvePracticeSourceBlockKey(
      tx,
      chapterId,
      unitId,
      practice.sourceHeading,
    );

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
