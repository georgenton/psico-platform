import type { PrismaClient } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { ingestUnitExercises } from "./exercise-ingestion";
import {
  conceptLinkId,
  ingestBookConcepts,
  type ConceptIngestStats,
} from "./concept-ingestion";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * Content Core — materialize the LEARNING targets of a book that already
 * exists in production.
 *
 * `bootstrapBook` creates the reading surface (Book/Chapter/ChapterBlock plus
 * Work/Edition/Revision/ContentUnit…) and deliberately stops there: publishing
 * a book and teaching from it are different editorial acts. A Guide, though,
 * resolves its three targets against DB ROWS — `Concept`, `ConceptLink` and two
 * `Exercise`s — so a bootstrapped book can never offer one until something
 * creates them. This is that something.
 *
 * Guarantees:
 *   - ATOMIC — one transaction; any failure leaves zero rows behind;
 *   - IDEMPOTENT — identity comes from catalog keys, so a re-run writes nothing;
 *   - ADDITIVE — no DELETE, no UPDATE of content, and it cannot reach Book,
 *     Chapter, ChapterBlock, Work, Edition, Revision, ContentUnit, or anything
 *     a reader owns (highlights, annotations, sessions, events);
 *   - FAIL-CLOSED — a missing edition, an unpublished revision, a missing unit,
 *     a unit outside the published revision, a missing or ambiguous practice
 *     source, or any drift aborts the whole activation.
 *
 * Errors are value-free: a stable code, never a slug, title or Prisma message
 * (which can carry manuscript text).
 */

export const ACTIVATION_BOOK_NOT_FOUND = "ACTIVATION_BOOK_NOT_FOUND";
export const ACTIVATION_EDITION_NOT_FOUND = "ACTIVATION_EDITION_NOT_FOUND";
export const ACTIVATION_REVISION_NOT_PUBLISHED =
  "ACTIVATION_REVISION_NOT_PUBLISHED";
export const ACTIVATION_UNIT_NOT_FOUND = "ACTIVATION_UNIT_NOT_FOUND";
export const ACTIVATION_UNIT_NOT_IN_REVISION =
  "ACTIVATION_UNIT_NOT_IN_REVISION";
export const ACTIVATION_FORBIDDEN = "ACTIVATION_FORBIDDEN";
export const ACTIVATION_INPUT_INVALID = "ACTIVATION_INPUT_INVALID";
export const ACTIVATION_VERIFICATION_FAILED = "ACTIVATION_VERIFICATION_FAILED";
export const ACTIVATION_INTERNAL_ERROR = "ACTIVATION_INTERNAL_ERROR";

/** Every code this module may surface, plus the ingestion codes it re-raises.
 * Anything outside this set is collapsed to ACTIVATION_INTERNAL_ERROR. */
const KNOWN_CODES = new Set<string>([
  ACTIVATION_BOOK_NOT_FOUND,
  ACTIVATION_EDITION_NOT_FOUND,
  ACTIVATION_REVISION_NOT_PUBLISHED,
  ACTIVATION_UNIT_NOT_FOUND,
  ACTIVATION_UNIT_NOT_IN_REVISION,
  ACTIVATION_FORBIDDEN,
  ACTIVATION_INPUT_INVALID,
  ACTIVATION_VERIFICATION_FAILED,
  "CONCEPT_INGEST_UNIT_MISSING",
  "CONCEPT_INGEST_DRIFT_DETECTED",
  "CONCEPT_INGEST_CATALOG_INVALID",
  "EXERCISE_INGEST_SOURCE_MISSING",
  "EXERCISE_INGEST_SOURCE_AMBIGUOUS",
  "EXERCISE_INGEST_DRIFT_DETECTED",
  "EXERCISE_INGEST_CATALOG_INVALID",
]);

/** Reduce any thrown value to a whitelisted machine code. Never the raw
 * message: a Prisma error can quote the row it choked on, i.e. book text. */
export function sanitizeActivationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return KNOWN_CODES.has(msg) ? msg : ACTIVATION_INTERNAL_ERROR;
}

/** Same allow-flag posture as the book bootstrap: on a deployed box an apply
 * needs an explicit, non-persisted opt-in. */
export function assertLearningActivationAllowed(env: {
  PSICO_ENV?: string;
  NODE_ENV?: string;
  RAILWAY_ENVIRONMENT_NAME?: string;
  ALLOW_BOOK_LEARNING_ACTIVATION?: string;
}): void {
  const deployed =
    (env.PSICO_ENV ?? env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? "") !==
      "" &&
    ["production", "staging"].includes(
      env.PSICO_ENV ?? env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? "",
    );
  if (!deployed) return;
  if (env.ALLOW_BOOK_LEARNING_ACTIVATION !== "on") {
    throw new Error(ACTIVATION_FORBIDDEN);
  }
}

export type ActivationAction = "CREATE" | "VERIFY" | "CONFLICT";

export interface LearningActivationPlan {
  book_exists: boolean;
  edition_exists: boolean;
  published_revision_exists: boolean;
  catalog_concept_count: number;
  catalog_exercise_count: number;
  chapter_order: number | null;
  chapter_exists: boolean;
  unit_exists: boolean;
  source_heading_match_count: number;
  concept_action: ActivationAction;
  concept_link_action: ActivationAction;
  practice_action: ActivationAction;
  recall_action: ActivationAction;
  activation_safe: boolean;
  writes: 0;
}

export interface LearningActivationStats {
  conceptsCreated: number;
  conceptLinksCreated: number;
  exercisesCreated: number;
  conceptsVerified: number;
  conceptLinksVerified: number;
  exercisesVerified: number;
}

/** Resolved Content Core context for a book — the read half both the planner
 * and the activator need. Throws a whitelisted code when anything is missing. */
async function resolveContext(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<{
  chapterIdByOrder: Map<number, string>;
  unitIdByOrder: Map<number, string>;
}> {
  if (typeof bookSlug !== "string" || bookSlug.trim().length === 0) {
    throw new Error(ACTIVATION_INPUT_INVALID);
  }

  const book = await prisma.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true },
  });
  if (!book) throw new Error(ACTIVATION_BOOK_NOT_FOUND);

  const edition = await prisma.edition.findUnique({
    where: { slug: bookSlug },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition) throw new Error(ACTIVATION_EDITION_NOT_FOUND);
  if (!edition.publishedRevisionId) {
    throw new Error(ACTIVATION_REVISION_NOT_PUBLISHED);
  }

  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });

  const chapterIdByOrder = new Map<number, string>();
  const unitIdByOrder = new Map<number, string>();

  for (const ch of chapters) {
    chapterIdByOrder.set(ch.order, ch.id);

    const unitKey = unitKeyFromLegacyChapterId(ch.id);
    const unit = await prisma.contentUnit.findUnique({
      where: { editionId_unitKey: { editionId: edition.id, unitKey } },
      select: { id: true },
    });
    if (!unit) throw new Error(ACTIVATION_UNIT_NOT_FOUND);

    // The unit must be part of the revision readers actually see — otherwise
    // the Guide would resolve targets against content nobody is reading.
    const inRevision = await prisma.revisionUnit.findUnique({
      where: {
        revisionId_unitId: {
          revisionId: edition.publishedRevisionId,
          unitId: unit.id,
        },
      },
      select: { id: true },
    });
    if (!inRevision) throw new Error(ACTIVATION_UNIT_NOT_IN_REVISION);

    unitIdByOrder.set(ch.order, unit.id);
  }

  return { chapterIdByOrder, unitIdByOrder };
}

/**
 * READ-ONLY inspection of what an activation would do. Performs no writes and
 * opens no transaction — it is not a rehearsal-and-rollback, which would take
 * write locks and could still leave sequence side effects.
 */
export async function planBookLearningActivation(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<LearningActivationPlan> {
  const concepts = CHAPTER_CONCEPTS[bookSlug] ?? {};
  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];

  const plan: LearningActivationPlan = {
    book_exists: false,
    edition_exists: false,
    published_revision_exists: false,
    catalog_concept_count: Object.keys(concepts).length,
    catalog_exercise_count: pairs.length * 2,
    chapter_order: pairs[0]?.practice.chapterOrder ?? null,
    chapter_exists: false,
    unit_exists: false,
    source_heading_match_count: 0,
    concept_action: "VERIFY",
    concept_link_action: "VERIFY",
    practice_action: "VERIFY",
    recall_action: "VERIFY",
    activation_safe: false,
    writes: 0,
  };

  const book = await prisma.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true },
  });
  if (!book) return plan;
  plan.book_exists = true;

  const edition = await prisma.edition.findUnique({
    where: { slug: bookSlug },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition) return plan;
  plan.edition_exists = true;
  plan.published_revision_exists = edition.publishedRevisionId !== null;
  if (!edition.publishedRevisionId) return plan;

  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, order: true },
  });
  const chapterIdByOrder = new Map(chapters.map((c) => [c.order, c.id]));

  // Every catalogued chapter needs a unit inside the published revision.
  const neededOrders = new Set<number>([
    ...Object.keys(concepts).map(Number),
    ...pairs.map((p) => p.practice.chapterOrder),
  ]);
  let allUnitsPresent = neededOrders.size > 0;
  const unitIdByOrder = new Map<number, string>();
  for (const order of neededOrders) {
    const chapterId = chapterIdByOrder.get(order);
    if (!chapterId) {
      allUnitsPresent = false;
      continue;
    }
    const unit = await prisma.contentUnit.findUnique({
      where: {
        editionId_unitKey: {
          editionId: edition.id,
          unitKey: unitKeyFromLegacyChapterId(chapterId),
        },
      },
      select: { id: true },
    });
    const inRevision = unit
      ? await prisma.revisionUnit.findUnique({
          where: {
            revisionId_unitId: {
              revisionId: edition.publishedRevisionId,
              unitId: unit.id,
            },
          },
          select: { id: true },
        })
      : null;
    if (!unit || !inRevision) {
      allUnitsPresent = false;
      continue;
    }
    unitIdByOrder.set(order, unit.id);
  }

  const focusOrder = plan.chapter_order;
  if (focusOrder != null) {
    plan.chapter_exists = chapterIdByOrder.has(focusOrder);
    plan.unit_exists = unitIdByOrder.has(focusOrder);
  }

  // Concept + link.
  for (const [orderStr, concept] of Object.entries(concepts)) {
    const unitId = unitIdByOrder.get(Number(orderStr));
    const existing = await prisma.concept.findUnique({
      where: { conceptKey: concept.key },
      select: { id: true, label: true },
    });
    if (!existing) plan.concept_action = "CREATE";
    else if (existing.label !== concept.label) plan.concept_action = "CONFLICT";

    const link = await prisma.conceptLink.findUnique({
      where: { id: conceptLinkId(concept.key) },
      select: {
        conceptId: true,
        unitId: true,
        contentBlockId: true,
        role: true,
      },
    });
    if (!link) {
      if (plan.concept_link_action !== "CONFLICT") {
        plan.concept_link_action = "CREATE";
      }
    } else if (
      !unitId ||
      link.unitId !== unitId ||
      link.contentBlockId !== null ||
      link.role !== "PRIMARY" ||
      (existing && link.conceptId !== existing.id)
    ) {
      plan.concept_link_action = "CONFLICT";
    }
  }

  // Practice + recall, and the editorial source the practice anchors to.
  for (const pair of pairs) {
    const chapterId = chapterIdByOrder.get(pair.practice.chapterOrder);
    if (chapterId) {
      plan.source_heading_match_count += await prisma.chapterBlock.count({
        where: {
          chapterId,
          kind: "HEADING",
          content: pair.practice.sourceHeading,
        },
      });
    }

    const practice = await prisma.exercise.findUnique({
      where: { id: pair.practice.exerciseKey },
      select: { chapterId: true, order: true, title: true, type: true },
    });
    if (!practice) plan.practice_action = "CREATE";
    else if (
      practice.chapterId !== chapterId ||
      practice.order !== pair.practice.order ||
      practice.title !== pair.practice.title ||
      practice.type !== "REFLECTION"
    ) {
      plan.practice_action = "CONFLICT";
    }

    const recall = await prisma.exercise.findUnique({
      where: { id: pair.recall.exerciseKey },
      select: { chapterId: true, order: true, title: true, type: true },
    });
    if (!recall) plan.recall_action = "CREATE";
    else if (
      recall.chapterId !== chapterId ||
      recall.order !== pair.recall.order ||
      recall.title !== pair.recall.title ||
      recall.type !== "QUIZ"
    ) {
      plan.recall_action = "CONFLICT";
    }
  }

  const noConflict = (
    [
      plan.concept_action,
      plan.concept_link_action,
      plan.practice_action,
      plan.recall_action,
    ] as ActivationAction[]
  ).every((a) => a !== "CONFLICT");

  plan.activation_safe =
    plan.book_exists &&
    plan.edition_exists &&
    plan.published_revision_exists &&
    allUnitsPresent &&
    plan.catalog_concept_count > 0 &&
    plan.source_heading_match_count === pairs.length &&
    noConflict;

  return plan;
}

/**
 * Materialize the catalog's learning rows for an existing book, atomically.
 * Reads and validation happen first, so the transaction stays short and only
 * ever contains the writes themselves plus their verification.
 */
export async function activateBookLearningCatalog(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<LearningActivationStats> {
  const { chapterIdByOrder, unitIdByOrder } = await resolveContext(
    prisma,
    bookSlug,
  );

  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];
  const concepts = CHAPTER_CONCEPTS[bookSlug] ?? {};

  let conceptStats: ConceptIngestStats = {
    conceptsCreated: 0,
    conceptsVerified: 0,
    conceptLinksCreated: 0,
    conceptLinksVerified: 0,
    conceptsSkippedMissingUnit: 0,
  };

  const exerciseIdsBefore = new Set<string>();
  for (const pair of pairs) {
    for (const id of [pair.practice.exerciseKey, pair.recall.exerciseKey]) {
      const existing = await prisma.exercise.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing) exerciseIdsBefore.add(id);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      conceptStats = await ingestBookConcepts(
        tx,
        bookSlug,
        unitIdByOrder,
        "throw", // an operator named this book: every approved target must exist
      );
      await ingestUnitExercises(tx, bookSlug, chapterIdByOrder, unitIdByOrder);

      // Verify INSIDE the transaction: if the expected rows are not all there,
      // roll back rather than report a success we cannot substantiate.
      for (const [orderStr, concept] of Object.entries(concepts)) {
        const link = await tx.conceptLink.findUnique({
          where: { id: conceptLinkId(concept.key) },
          select: { unitId: true, concept: { select: { conceptKey: true } } },
        });
        if (
          !link ||
          link.unitId !== unitIdByOrder.get(Number(orderStr)) ||
          link.concept.conceptKey !== concept.key
        ) {
          throw new Error(ACTIVATION_VERIFICATION_FAILED);
        }
      }

      for (const pair of pairs) {
        const chapterId = chapterIdByOrder.get(pair.practice.chapterOrder);
        for (const def of [pair.practice, pair.recall]) {
          const row = await tx.exercise.findUnique({
            where: { id: def.exerciseKey },
            select: { chapterId: true, type: true },
          });
          if (!row || row.chapterId !== chapterId || row.type !== def.type) {
            throw new Error(ACTIVATION_VERIFICATION_FAILED);
          }
        }
      }
    },
    { timeout: 30_000 },
  );

  const exerciseKeys = pairs.flatMap((p) => [
    p.practice.exerciseKey,
    p.recall.exerciseKey,
  ]);
  const exercisesCreated = exerciseKeys.filter(
    (id) => !exerciseIdsBefore.has(id),
  ).length;

  return {
    conceptsCreated: conceptStats.conceptsCreated,
    conceptLinksCreated: conceptStats.conceptLinksCreated,
    exercisesCreated,
    conceptsVerified: conceptStats.conceptsVerified,
    conceptLinksVerified: conceptStats.conceptLinksVerified,
    exercisesVerified: exerciseKeys.length - exercisesCreated,
  };
}

/** Metrics-only serialization for CLI stdout. */
export function serializeActivationPlan(plan: LearningActivationPlan): string {
  return Object.entries(plan)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");
}
