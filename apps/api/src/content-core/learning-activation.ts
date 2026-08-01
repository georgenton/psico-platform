import type { Prisma, PrismaClient } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { resolveEnvironment } from "../shared/psico-environment";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import {
  assertBookExerciseCatalogValid,
  compareStoredJson,
  ingestUnitExercises,
  inspectPracticeSource,
  practiceContentFor,
  recallContentFor,
} from "./exercise-ingestion";
import {
  assertConceptCatalogValid,
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
 *   - FAIL-CLOSED — a missing edition, a revision that is not genuinely
 *     PUBLISHED for this edition, a missing unit, a unit outside the published
 *     revision, a missing or ambiguous practice source, or any drift aborts.
 *
 * Plan/apply parity is a hard invariant: the planner READS through the same
 * helpers the ingestion WRITES through, so `PLAN_VERIFY ⇔ APPLY_WOULD_VERIFY`
 * and `PLAN_CONFLICT ⇔ APPLY_WOULD_THROW_DRIFT`. A plan that says "safe" while
 * the apply throws is worse than no plan at all.
 *
 * The plan is nonetheless only INFORMATIVE. The apply re-resolves its whole
 * context inside the transaction, so nothing that moved between the two
 * decisions gets acted on stale.
 *
 * Errors are value-free: a stable code, never a slug, title or Prisma message
 * (which can carry manuscript text).
 */

export const ACTIVATION_BOOK_NOT_FOUND = "ACTIVATION_BOOK_NOT_FOUND";
export const ACTIVATION_EDITION_NOT_FOUND = "ACTIVATION_EDITION_NOT_FOUND";
export const ACTIVATION_REVISION_NOT_PUBLISHED =
  "ACTIVATION_REVISION_NOT_PUBLISHED";
export const ACTIVATION_CHAPTER_NOT_FOUND = "ACTIVATION_CHAPTER_NOT_FOUND";
export const ACTIVATION_UNIT_NOT_FOUND = "ACTIVATION_UNIT_NOT_FOUND";
export const ACTIVATION_UNIT_NOT_IN_REVISION =
  "ACTIVATION_UNIT_NOT_IN_REVISION";
export const ACTIVATION_FORBIDDEN = "ACTIVATION_FORBIDDEN";
export const ACTIVATION_INPUT_INVALID = "ACTIVATION_INPUT_INVALID";
export const ACTIVATION_VERIFICATION_FAILED = "ACTIVATION_VERIFICATION_FAILED";
export const ACTIVATION_INTERNAL_ERROR = "ACTIVATION_INTERNAL_ERROR";

/** Every code this module may surface, plus the ingestion codes it re-raises.
 * Anything outside this set collapses to ACTIVATION_INTERNAL_ERROR. */
const KNOWN_CODES = new Set<string>([
  ACTIVATION_BOOK_NOT_FOUND,
  ACTIVATION_EDITION_NOT_FOUND,
  ACTIVATION_REVISION_NOT_PUBLISHED,
  ACTIVATION_CHAPTER_NOT_FOUND,
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

/**
 * An apply on a deployed box needs an explicit operator opt-in.
 *
 * Posture comes from the CANONICAL resolver, never a local reimplementation: a
 * Railway box that does not declare `PSICO_ENV`, or declares `development` /
 * `test`, is refused rather than treated as local — precisely the failure that
 * resolver exists to prevent. A second copy of those rules here would be one
 * more place for it to drift back in.
 *
 * The resolver throws a descriptive Error on a misconfigured box. That IS a
 * refusal, so it surfaces as ACTIVATION_FORBIDDEN and stays inside the
 * whitelist the CLI is allowed to print.
 */
export function assertLearningActivationAllowed(env: {
  ALLOW_BOOK_LEARNING_ACTIVATION?: string;
}): void {
  let environment: string;
  try {
    environment = resolveEnvironment();
  } catch {
    throw new Error(ACTIVATION_FORBIDDEN);
  }
  const deployed = environment === "production" || environment === "staging";
  if (deployed && env.ALLOW_BOOK_LEARNING_ACTIVATION !== "on") {
    throw new Error(ACTIVATION_FORBIDDEN);
  }
}

/** The model slice both the planner (on PrismaClient) and the apply (on the
 * transaction client) read through. */
export type ActivationDb = Pick<
  Prisma.TransactionClient,
  | "book"
  | "edition"
  | "revision"
  | "chapter"
  | "contentUnit"
  | "revisionUnit"
  | "concept"
  | "conceptLink"
  | "exercise"
  | "chapterBlock"
  | "contentBlock"
>;

export interface TargetCounts {
  create: number;
  verify: number;
  conflict: number;
}

export interface LearningActivationPlan {
  book_exists: boolean;
  edition_exists: boolean;
  published_revision_exists: boolean;
  catalog_valid: boolean;
  catalog_concept_count: number;
  catalog_exercise_count: number;
  /** Catalogued chapter orders — the ONLY ones this activator needs. */
  catalog_chapter_orders: string;
  chapter_missing_count: number;
  unit_missing_count: number;
  unit_not_in_revision_count: number;

  source_pair_count: number;
  source_exact_match_pair_count: number;
  source_missing_pair_count: number;
  source_ambiguous_pair_count: number;
  /** Informative total. NOT the safety authority — the per-pair counts are. */
  source_heading_match_count: number;

  concept_create_count: number;
  concept_verify_count: number;
  concept_conflict_count: number;
  concept_link_create_count: number;
  concept_link_verify_count: number;
  concept_link_conflict_count: number;
  practice_create_count: number;
  practice_verify_count: number;
  practice_conflict_count: number;
  recall_create_count: number;
  recall_verify_count: number;
  recall_conflict_count: number;

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

/**
 * The chapter orders this activator cares about: the union of what the two
 * catalogs declare. A legacy chapter nobody catalogued is none of its business,
 * so it can neither help nor block. Planner and apply use the SAME set — a
 * scope difference is exactly how a plan says safe and an apply fails.
 */
export function catalogChapterOrders(bookSlug: string): number[] {
  const orders = new Set<number>();
  for (const k of Object.keys(CHAPTER_CONCEPTS[bookSlug] ?? {})) {
    orders.add(Number(k));
  }
  for (const p of EXERCISE_INGESTION_CATALOG[bookSlug] ?? []) {
    orders.add(p.practice.chapterOrder);
  }
  return [...orders].sort((a, b) => a - b);
}

interface ResolvedContext {
  editionId: string;
  publishedRevisionId: string;
  chapterIdByOrder: Map<number, string>;
  unitIdByOrder: Map<number, string>;
}

interface ContextResolution {
  ctx: ResolvedContext | null;
  bookExists: boolean;
  editionExists: boolean;
  publishedRevisionExists: boolean;
  chapterMissing: number;
  unitMissing: number;
  unitNotInRevision: number;
}

/**
 * Resolve the edition, its genuinely-published revision and the CATALOGUED
 * chapters' units. Runs on a plain client for the planner and on the
 * transaction client for the apply, so the apply's authority is re-read under
 * the same lock that writes.
 *
 * `strict` is the only difference: the planner REPORTS what is wrong, the apply
 * REFUSES. Both walk identical checks in identical order.
 */
async function resolveActivationContext(
  db: ActivationDb,
  bookSlug: string,
  strict: boolean,
): Promise<ContextResolution> {
  const miss: ContextResolution = {
    ctx: null,
    bookExists: false,
    editionExists: false,
    publishedRevisionExists: false,
    chapterMissing: 0,
    unitMissing: 0,
    unitNotInRevision: 0,
  };

  const book = await db.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true },
  });
  if (!book) {
    if (strict) throw new Error(ACTIVATION_BOOK_NOT_FOUND);
    return miss;
  }

  const edition = await db.edition.findUnique({
    where: { slug: bookSlug },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition) {
    if (strict) throw new Error(ACTIVATION_EDITION_NOT_FOUND);
    return { ...miss, bookExists: true };
  }

  // A non-null pointer is not proof. Read the row it points at and require that
  // it really is THIS edition's PUBLISHED revision — a pointer left on a DRAFT,
  // or on another edition's revision, would otherwise pass silently and the
  // Guide would resolve against content no reader can see.
  const revision = edition.publishedRevisionId
    ? await db.revision.findUnique({
        where: { id: edition.publishedRevisionId },
        select: { id: true, editionId: true, status: true },
      })
    : null;
  const published =
    revision !== null &&
    revision.id === edition.publishedRevisionId &&
    revision.editionId === edition.id &&
    revision.status === "PUBLISHED";
  if (!published || !revision) {
    if (strict) throw new Error(ACTIVATION_REVISION_NOT_PUBLISHED);
    return { ...miss, bookExists: true, editionExists: true };
  }

  const chapterIdByOrder = new Map<number, string>();
  const unitIdByOrder = new Map<number, string>();
  let chapterMissing = 0;
  let unitMissing = 0;
  let unitNotInRevision = 0;

  for (const order of catalogChapterOrders(bookSlug)) {
    const chapter = await db.chapter.findFirst({
      where: { bookId: book.id, order },
      select: { id: true },
    });
    if (!chapter) {
      if (strict) throw new Error(ACTIVATION_CHAPTER_NOT_FOUND);
      chapterMissing += 1;
      continue;
    }
    chapterIdByOrder.set(order, chapter.id);

    const unit = await db.contentUnit.findUnique({
      where: {
        editionId_unitKey: {
          editionId: edition.id,
          unitKey: unitKeyFromLegacyChapterId(chapter.id),
        },
      },
      select: { id: true },
    });
    if (!unit) {
      if (strict) throw new Error(ACTIVATION_UNIT_NOT_FOUND);
      unitMissing += 1;
      continue;
    }

    const inRevision = await db.revisionUnit.findUnique({
      where: {
        revisionId_unitId: { revisionId: revision.id, unitId: unit.id },
      },
      select: { id: true },
    });
    if (!inRevision) {
      if (strict) throw new Error(ACTIVATION_UNIT_NOT_IN_REVISION);
      unitNotInRevision += 1;
      continue;
    }

    unitIdByOrder.set(order, unit.id);
  }

  return {
    ctx: {
      editionId: edition.id,
      publishedRevisionId: revision.id,
      chapterIdByOrder,
      unitIdByOrder,
    },
    bookExists: true,
    editionExists: true,
    publishedRevisionExists: true,
    chapterMissing,
    unitMissing,
    unitNotInRevision,
  };
}

function bump(c: TargetCounts, kind: keyof TargetCounts): void {
  c[kind] += 1;
}

/**
 * READ-ONLY inspection of what an activation would do. Performs no writes and
 * opens no transaction — it is not a rehearsal-and-rollback, which would take
 * write locks for a command whose whole point is to write nothing.
 */
export async function planBookLearningActivation(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<LearningActivationPlan> {
  const concepts = CHAPTER_CONCEPTS[bookSlug] ?? {};
  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];

  const conceptC: TargetCounts = { create: 0, verify: 0, conflict: 0 };
  const linkC: TargetCounts = { create: 0, verify: 0, conflict: 0 };
  const practiceC: TargetCounts = { create: 0, verify: 0, conflict: 0 };
  const recallC: TargetCounts = { create: 0, verify: 0, conflict: 0 };

  const plan: LearningActivationPlan = {
    book_exists: false,
    edition_exists: false,
    published_revision_exists: false,
    catalog_valid: false,
    catalog_concept_count: Object.keys(concepts).length,
    catalog_exercise_count: pairs.length * 2,
    catalog_chapter_orders: catalogChapterOrders(bookSlug).join("|") || "none",
    chapter_missing_count: 0,
    unit_missing_count: 0,
    unit_not_in_revision_count: 0,
    source_pair_count: pairs.length,
    source_exact_match_pair_count: 0,
    source_missing_pair_count: 0,
    source_ambiguous_pair_count: 0,
    source_heading_match_count: 0,
    concept_create_count: 0,
    concept_verify_count: 0,
    concept_conflict_count: 0,
    concept_link_create_count: 0,
    concept_link_verify_count: 0,
    concept_link_conflict_count: 0,
    practice_create_count: 0,
    practice_verify_count: 0,
    practice_conflict_count: 0,
    recall_create_count: 0,
    recall_verify_count: 0,
    recall_conflict_count: 0,
    activation_safe: false,
    writes: 0,
  };

  // A malformed catalog must never reach a transaction — decide it here, from
  // pure data, before a single row is read.
  try {
    assertConceptCatalogValid();
    assertBookExerciseCatalogValid(bookSlug);
    plan.catalog_valid = true;
  } catch {
    return plan; // activation_safe stays false
  }

  const resolved = await resolveActivationContext(prisma, bookSlug, false);
  plan.book_exists = resolved.bookExists;
  plan.edition_exists = resolved.editionExists;
  plan.published_revision_exists = resolved.publishedRevisionExists;
  plan.chapter_missing_count = resolved.chapterMissing;
  plan.unit_missing_count = resolved.unitMissing;
  plan.unit_not_in_revision_count = resolved.unitNotInRevision;
  if (!resolved.ctx) return plan;

  const { chapterIdByOrder, unitIdByOrder } = resolved.ctx;

  // ── Concept + link ────────────────────────────────────────────────────────
  for (const [orderStr, concept] of Object.entries(concepts)) {
    const unitId = unitIdByOrder.get(Number(orderStr));
    const existing = await prisma.concept.findUnique({
      where: { conceptKey: concept.key },
      select: { id: true, label: true },
    });
    if (!existing) bump(conceptC, "create");
    else if (existing.label !== concept.label) bump(conceptC, "conflict");
    else bump(conceptC, "verify");

    const link = await prisma.conceptLink.findUnique({
      where: { id: conceptLinkId(concept.key) },
      select: {
        conceptId: true,
        unitId: true,
        contentBlockId: true,
        role: true,
      },
    });
    if (!link) bump(linkC, "create");
    else if (
      !unitId ||
      link.unitId !== unitId ||
      link.contentBlockId !== null ||
      link.role !== "PRIMARY" ||
      (existing !== null && link.conceptId !== existing.id)
    ) {
      bump(linkC, "conflict");
    } else bump(linkC, "verify");
  }

  // ── Practice + recall, compared on the FULL stored semantics ──────────────
  for (const pair of pairs) {
    const order = pair.practice.chapterOrder;
    const chapterId = chapterIdByOrder.get(order);
    const unitId = unitIdByOrder.get(order);

    // Per pair, never a global sum: one pair with 0 matches and another with 2
    // would total the pair count and read as safe.
    let sourceBlockKey: string | null = null;
    if (chapterId && unitId) {
      const found = await inspectPracticeSource(
        prisma,
        chapterId,
        unitId,
        pair.practice.sourceHeading,
      );
      plan.source_heading_match_count += found.matchCount;
      if (found.matchCount > 1) plan.source_ambiguous_pair_count += 1;
      else if (!found.sourceBlockKey) plan.source_missing_pair_count += 1;
      else {
        plan.source_exact_match_pair_count += 1;
        sourceBlockKey = found.sourceBlockKey;
      }
    } else {
      plan.source_missing_pair_count += 1;
    }

    const practice = await prisma.exercise.findUnique({
      where: { id: pair.practice.exerciseKey },
      select: {
        chapterId: true,
        order: true,
        title: true,
        type: true,
        content: true,
      },
    });
    if (!practice) bump(practiceC, "create");
    else if (
      practice.chapterId !== chapterId ||
      practice.order !== pair.practice.order ||
      practice.title !== pair.practice.title ||
      practice.type !== "REFLECTION" ||
      // Content is part of the identity the apply enforces: `practiceKind` and
      // the anchored `sourceBlockKey` both count as drift.
      sourceBlockKey === null ||
      !compareStoredJson(
        practice.content,
        practiceContentFor(pair.practice, sourceBlockKey),
      )
    ) {
      bump(practiceC, "conflict");
    } else bump(practiceC, "verify");

    const recall = await prisma.exercise.findUnique({
      where: { id: pair.recall.exerciseKey },
      select: {
        chapterId: true,
        order: true,
        title: true,
        type: true,
        content: true,
      },
    });
    if (!recall) bump(recallC, "create");
    else if (
      recall.chapterId !== chapterId ||
      recall.order !== pair.recall.order ||
      recall.title !== pair.recall.title ||
      recall.type !== "QUIZ" ||
      // recallMode, conceptKey, every option and the correct key.
      !compareStoredJson(recall.content, recallContentFor(pair.recall))
    ) {
      bump(recallC, "conflict");
    } else bump(recallC, "verify");
  }

  plan.concept_create_count = conceptC.create;
  plan.concept_verify_count = conceptC.verify;
  plan.concept_conflict_count = conceptC.conflict;
  plan.concept_link_create_count = linkC.create;
  plan.concept_link_verify_count = linkC.verify;
  plan.concept_link_conflict_count = linkC.conflict;
  plan.practice_create_count = practiceC.create;
  plan.practice_verify_count = practiceC.verify;
  plan.practice_conflict_count = practiceC.conflict;
  plan.recall_create_count = recallC.create;
  plan.recall_verify_count = recallC.verify;
  plan.recall_conflict_count = recallC.conflict;

  plan.activation_safe =
    plan.catalog_valid &&
    plan.book_exists &&
    plan.edition_exists &&
    plan.published_revision_exists &&
    plan.chapter_missing_count === 0 &&
    plan.unit_missing_count === 0 &&
    plan.unit_not_in_revision_count === 0 &&
    plan.catalog_concept_count > 0 &&
    plan.source_exact_match_pair_count === plan.source_pair_count &&
    plan.source_missing_pair_count === 0 &&
    plan.source_ambiguous_pair_count === 0 &&
    conceptC.conflict === 0 &&
    linkC.conflict === 0 &&
    practiceC.conflict === 0 &&
    recallC.conflict === 0;

  return plan;
}

/**
 * Materialize the catalog's learning rows for an existing book, atomically.
 *
 * The whole context is re-resolved INSIDE the transaction: a plan taken a
 * moment ago is informative, not authoritative, and acting on a stale map is
 * exactly how a "safe" activation ends up writing against content that moved.
 */
export async function activateBookLearningCatalog(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<LearningActivationStats> {
  if (typeof bookSlug !== "string" || bookSlug.trim().length === 0) {
    throw new Error(ACTIVATION_INPUT_INVALID);
  }
  // Pure catalog validation before opening anything.
  assertConceptCatalogValid();
  assertBookExerciseCatalogValid(bookSlug);

  const pairs = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];
  const concepts = CHAPTER_CONCEPTS[bookSlug] ?? {};
  const exerciseKeys = pairs.flatMap((p) => [
    p.practice.exerciseKey,
    p.recall.exerciseKey,
  ]);

  let conceptStats: ConceptIngestStats = {
    conceptsCreated: 0,
    conceptsVerified: 0,
    conceptLinksCreated: 0,
    conceptLinksVerified: 0,
    conceptsSkippedMissingUnit: 0,
  };
  let exercisesCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1-3. Authority, re-read under the transaction.
      const resolved = await resolveActivationContext(tx, bookSlug, true);
      const ctx = resolved.ctx;
      if (!ctx) throw new Error(ACTIVATION_VERIFICATION_FAILED);

      const before = new Set<string>();
      for (const id of exerciseKeys) {
        const row = await tx.exercise.findUnique({
          where: { id },
          select: { id: true },
        });
        if (row) before.add(id);
      }

      // 4-5. Materialize.
      conceptStats = await ingestBookConcepts(
        tx,
        bookSlug,
        ctx.unitIdByOrder,
        "throw", // an operator named this book: every approved target must exist
      );
      await ingestUnitExercises(
        tx,
        bookSlug,
        ctx.chapterIdByOrder,
        ctx.unitIdByOrder,
      );

      // 6. Verify INSIDE the transaction: if the expected rows are not all
      // there, roll back rather than report a success we cannot substantiate.
      for (const [orderStr, concept] of Object.entries(concepts)) {
        const link = await tx.conceptLink.findUnique({
          where: { id: conceptLinkId(concept.key) },
          select: { unitId: true, concept: { select: { conceptKey: true } } },
        });
        if (
          !link ||
          link.unitId !== ctx.unitIdByOrder.get(Number(orderStr)) ||
          link.concept.conceptKey !== concept.key
        ) {
          throw new Error(ACTIVATION_VERIFICATION_FAILED);
        }
      }

      for (const pair of pairs) {
        const chapterId = ctx.chapterIdByOrder.get(pair.practice.chapterOrder);
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

      exercisesCreated = exerciseKeys.filter((id) => !before.has(id)).length;
    },
    { timeout: 30_000 },
  );

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
