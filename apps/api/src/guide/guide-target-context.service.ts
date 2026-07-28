import { Injectable } from "@nestjs/common";
import type { GuideDefinition } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  LearningCatalogResolver,
  type LearningCatalogDb,
  type ResolvedUnitContext,
} from "../learning/learning-catalog.resolver";
import { classifyCatalogError, guideFail } from "./guide-errors";

/**
 * CC-7.4C — GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS.
 *
 * A GuideDefinition carries NO editorial context and NO database ids
 * (CLIENT_EDITORIAL_CONTEXT_ALLOWED=false). The server derives the context by
 * resolving EVERY editorial target of the pinned definition through the real
 * `LearningCatalogResolver` and requiring that they all land on exactly the
 * SAME `bookId` / `editionId` / `revisionId` / `unitId`.
 *
 * Per step kind:
 *   CONCEPT_EXPLORATION  → resolveConcept
 *   CATALOG_PRACTICE     → resolveExercise (a QUIZ never resolves here)
 *   ACTIVE_RECALL        → resolveRecallItem, REQUIRING mode = "objective"
 *   EXPLICIT_CONFIRMATION→ contributes no editorial context
 *
 * `db` threads the CALLER's transaction client through every query, so the
 * context, the entitlement and the writes that follow observe ONE snapshot.
 *
 * Fails closed, before any write: unresolved / unpublished / wrong modality →
 * GUIDE_CONTEXT_UNRESOLVED; divergent targets → GUIDE_CONTEXT_MISMATCH. Errors
 * are value-free — no key, id, title or option ever appears.
 *
 * Error classification is deliberate: an EDITORIAL problem (the catalog says
 * no) and an INFRASTRUCTURE problem (the database says nothing) are different
 * facts and must not collapse into the same code.
 */

export interface ResolvedGuideContext {
  editionId: string;
  unitId: string;
  editionKey: string;
  unitKey: string;
  bookId: string;
  bookSlug: string;
  bookPlan: string;
  revisionId: string;
  revisionNumber: number;
}

function toGuideContext(ctx: ResolvedUnitContext): ResolvedGuideContext {
  return {
    editionId: ctx.editionId,
    unitId: ctx.unitId,
    editionKey: ctx.editionKey,
    unitKey: ctx.unitKey,
    bookId: ctx.bookId,
    bookSlug: ctx.bookSlug,
    bookPlan: ctx.bookPlan,
    revisionId: ctx.revisionId,
    revisionNumber: ctx.revisionNumber,
  };
}

/** The four identity columns every target must agree on. */
function sameEditorialIdentity(
  a: ResolvedGuideContext,
  b: ResolvedUnitContext,
): boolean {
  return (
    a.bookId === b.bookId &&
    a.editionId === b.editionId &&
    a.revisionId === b.revisionId &&
    a.unitId === b.unitId
  );
}

@Injectable()
export class GuideTargetContextService {
  constructor(private readonly resolver: LearningCatalogResolver) {}

  /**
   * Resolve the ONE editorial context of a pinned definition. For the current
   * production guide the result is never null — every failure throws.
   */
  async resolve(
    definition: GuideDefinition,
    db?: LearningCatalogDb,
  ): Promise<ResolvedGuideContext> {
    let context: ResolvedGuideContext | null = null;

    for (const step of definition.steps) {
      const resolved = await this.resolveStep(step, db);
      // EXPLICIT_CONFIRMATION contributes no editorial anchor.
      if (resolved === null) continue;
      if (context === null) {
        context = toGuideContext(resolved);
        continue;
      }
      if (!sameEditorialIdentity(context, resolved)) {
        guideFail("GUIDE_CONTEXT_MISMATCH");
      }
    }

    // A definition whose steps carry no editorial target at all has no
    // derivable context — fail closed rather than anchor a session to nothing.
    if (context === null) guideFail("GUIDE_CONTEXT_UNRESOLVED");
    return context as ResolvedGuideContext;
  }

  /** Resolve one step's target, or null when the kind carries no context. */
  private async resolveStep(
    step: GuideDefinition["steps"][number],
    db?: LearningCatalogDb,
  ): Promise<ResolvedUnitContext | null> {
    try {
      switch (step.kind) {
        case "CONCEPT_EXPLORATION":
          return await this.resolver.resolveConcept(step.conceptKey, db);
        case "CATALOG_PRACTICE":
          return await this.resolver.resolveExercise(step.exerciseKey, db);
        case "ACTIVE_RECALL": {
          const item = await this.resolver.resolveRecallItem(step.itemKey, db);
          // The step declares `objective_recall`: a self-assessed item can
          // never satisfy it.
          if (item.mode !== "objective") {
            guideFail("GUIDE_CONTEXT_UNRESOLVED");
          }
          return item;
        }
        case "EXPLICIT_CONFIRMATION":
          return null;
      }
    } catch (err) {
      return classifyCatalogError(err);
    }
  }
}
