import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { learningException } from "./learning-errors";

/**
 * CC-7.3 §2 — the ONLY place learning catalog keys become editorial context.
 *
 * Every command resolves its key here BEFORE anything else: no client-supplied
 * editorial context, no first-match fallback, no partial matching. A key that
 * cannot be related unambiguously to `unit → published revision → edition →
 * book` produces a typed error and ZERO writes:
 *
 *   unknown unit / concept / recall item → 404 (their specific codes)
 *   anything ambiguous, unpublished or editorially incomplete → 422
 *     LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT
 *
 * Privacy: resolution errors never carry the received key or any catalog
 * detail — codes only.
 */

export interface ResolvedUnitContext {
  bookId: string;
  bookSlug: string;
  bookPlan: string;
  editionId: string;
  editionKey: string;
  revisionId: string;
  revisionNumber: number;
  unitId: string;
  unitKey: string;
}

export interface ResolvedConceptContext extends ResolvedUnitContext {
  conceptId: string;
  conceptKey: string;
}

export interface ResolvedExerciseContext extends ResolvedUnitContext {
  exerciseKey: string;
}

export interface ResolvedRecallItemContext extends ResolvedUnitContext {
  itemKey: string;
  conceptId: string | null;
  conceptKey: string | null;
  mode: "objective" | "self_assessed";
  /** Objective items only; empty for self-assessed. */
  optionKeys: string[];
  /** INTERNAL grading datum — never serialized to any response. */
  correctOptionKey: string | null;
}

// ─── strict recall catalog contract (Exercise.type=QUIZ · content JSON) ─────
//
// A QUIZ row is a recall item ONLY when its content EXPLICITLY declares the
// mode. Nothing is deduced: a row without a conforming declaration (legacy
// shapes, missing canonical answer, duplicate option keys…) is an unresolved
// catalog → 422, zero writes. The mode is never inferred from what the client
// sent (ADR 0017 §2).

interface ObjectiveRecallCatalog {
  mode: "objective";
  optionKeys: string[];
  correctOptionKey: string;
  conceptKey: string | null;
}
interface SelfAssessedRecallCatalog {
  mode: "self_assessed";
  conceptKey: string | null;
}
type RecallCatalog = ObjectiveRecallCatalog | SelfAssessedRecallCatalog;

const isStr = (v: unknown): v is string => typeof v === "string";

function hasOnlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

export function parseRecallCatalogContent(
  content: unknown,
): RecallCatalog | null {
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return null;
  }
  const o = content as Record<string, unknown>;
  const conceptKey =
    o.conceptKey === undefined
      ? null
      : isStr(o.conceptKey)
        ? o.conceptKey
        : undefined;
  if (conceptKey === undefined) return null;

  if (o.recallMode === "self_assessed") {
    return hasOnlyKeys(o, ["recallMode", "conceptKey"])
      ? { mode: "self_assessed", conceptKey }
      : null;
  }
  if (o.recallMode === "objective") {
    if (
      !hasOnlyKeys(o, [
        "recallMode",
        "options",
        "correctOptionKey",
        "conceptKey",
      ])
    ) {
      return null;
    }
    if (!Array.isArray(o.options) || o.options.length < 2) return null;
    const optionKeys: string[] = [];
    for (const opt of o.options) {
      if (typeof opt !== "object" || opt === null || Array.isArray(opt))
        return null;
      const oo = opt as Record<string, unknown>;
      // Each option: a mandatory key + an optional display label. Nothing else.
      if (!hasOnlyKeys(oo, ["key", "label"])) return null;
      if (!isStr(oo.key) || oo.key.length === 0) return null;
      if (oo.label !== undefined && !isStr(oo.label)) return null;
      optionKeys.push(oo.key);
    }
    if (new Set(optionKeys).size !== optionKeys.length) return null;
    if (
      !isStr(o.correctOptionKey) ||
      !optionKeys.includes(o.correctOptionKey)
    ) {
      return null;
    }
    return {
      mode: "objective",
      optionKeys,
      correctOptionKey: o.correctOptionKey,
      conceptKey,
    };
  }
  return null;
}

@Injectable()
export class LearningCatalogResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** `unitKey → ContentUnit → published RevisionUnit → Edition → Book`. */
  async resolveUnit(unitKey: string): Promise<ResolvedUnitContext> {
    return this.resolveUnitByWhere({ unitKey }, "LEARNING_EVENT_UNKNOWN_UNIT");
  }

  /**
   * `conceptKey → Concept → owning unit (via unit-scoped ConceptLinks) →
   * published revision → edition → book`. A concept linked to zero units or
   * to MORE THAN ONE distinct unit has no unambiguous owner → 422.
   */
  async resolveConcept(conceptKey: string): Promise<ResolvedConceptContext> {
    const concept = await this.prisma.concept.findUnique({
      where: { conceptKey },
      select: {
        id: true,
        conceptKey: true,
        links: { where: { unitId: { not: null } }, select: { unitId: true } },
      },
    });
    if (!concept) throw learningException("LEARNING_EVENT_UNKNOWN_CONCEPT");
    const unitIds = [...new Set(concept.links.map((l) => l.unitId as string))];
    if (unitIds.length !== 1) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const ctx = await this.resolveUnitByWhere(
      { id: unitIds[0] },
      // The concept EXISTS — an unresolvable owning unit is a context problem.
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    return { ...ctx, conceptId: concept.id, conceptKey: concept.conceptKey };
  }

  /**
   * `exerciseKey (Exercise.id) → Chapter → unit (canonical key bridge) →
   * published revision → edition → book`. A QUIZ is a recall item, not a
   * completable practice — it never resolves here.
   */
  async resolveExercise(exerciseKey: string): Promise<ResolvedExerciseContext> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseKey },
      select: { id: true, type: true, chapterId: true },
    });
    if (!exercise || exercise.type === "QUIZ") {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const ctx = await this.resolveUnitByWhere(
      { unitKey: unitKeyFromLegacyChapterId(exercise.chapterId) },
      // The exercise exists; a missing/unpublished unit is a context problem.
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    return { ...ctx, exerciseKey: exercise.id };
  }

  /**
   * `itemKey (Exercise.id, type=QUIZ) → strict content contract → chapter →
   * unit → published revision → edition → book`, plus the declared concept
   * binding (which must itself resolve in the Concept catalog).
   */
  async resolveRecallItem(itemKey: string): Promise<ResolvedRecallItemContext> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: itemKey },
      select: { id: true, type: true, chapterId: true, content: true },
    });
    if (!exercise || exercise.type !== "QUIZ") {
      throw learningException("LEARNING_EVENT_UNKNOWN_ITEM");
    }
    const catalog = parseRecallCatalogContent(exercise.content);
    if (!catalog) {
      // The row exists but does not DECLARE a verifiable recall contract —
      // an ambiguous catalog is unresolved, never guessed.
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }

    let conceptId: string | null = null;
    let conceptKey: string | null = null;
    if (catalog.conceptKey !== null) {
      const concept = await this.prisma.concept.findUnique({
        where: { conceptKey: catalog.conceptKey },
        select: { id: true, conceptKey: true },
      });
      if (!concept) {
        throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
      }
      conceptId = concept.id;
      conceptKey = concept.conceptKey;
    }

    const ctx = await this.resolveUnitByWhere(
      { unitKey: unitKeyFromLegacyChapterId(exercise.chapterId) },
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
    return {
      ...ctx,
      itemKey: exercise.id,
      conceptId,
      conceptKey,
      mode: catalog.mode,
      optionKeys: catalog.mode === "objective" ? catalog.optionKeys : [],
      correctOptionKey:
        catalog.mode === "objective" ? catalog.correctOptionKey : null,
    };
  }

  /**
   * Shared tail of every chain. `missingCode` distinguishes "the KEY the
   * client sent does not exist" (404) from "an intermediate editorial link is
   * broken" (422) — everything past existence is always 422.
   */
  private async resolveUnitByWhere(
    where: { unitKey: string } | { id: string },
    missingCode:
      | "LEARNING_EVENT_UNKNOWN_UNIT"
      | "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
  ): Promise<ResolvedUnitContext> {
    const units = await this.prisma.contentUnit.findMany({
      where,
      select: {
        id: true,
        unitKey: true,
        edition: {
          select: {
            id: true,
            editionKey: true,
            slug: true,
            publishedRevisionId: true,
          },
        },
      },
    });
    if (units.length === 0) throw learningException(missingCode);
    // The same unitKey living in more than one edition is ambiguous — never
    // pick a "first match".
    if (units.length > 1) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const unit = units[0];

    if (!unit.edition.publishedRevisionId) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const manifestEntry = await this.prisma.revisionUnit.findUnique({
      where: {
        revisionId_unitId: {
          revisionId: unit.edition.publishedRevisionId,
          unitId: unit.id,
        },
      },
      select: { revision: { select: { id: true, number: true } } },
    });
    // A unit outside the PUBLISHED revision's manifest is not servable content.
    if (!manifestEntry) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const book = await this.prisma.book.findUnique({
      where: { slug: unit.edition.slug },
      select: { id: true, slug: true, plan: true },
    });
    if (!book) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    return {
      bookId: book.id,
      bookSlug: book.slug,
      bookPlan: book.plan,
      editionId: unit.edition.id,
      editionKey: unit.edition.editionKey,
      revisionId: manifestEntry.revision.id,
      revisionNumber: manifestEntry.revision.number,
      unitId: unit.id,
      unitKey: unit.unitKey,
    };
  }
}
