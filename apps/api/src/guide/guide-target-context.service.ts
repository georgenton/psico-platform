import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { GuideDefinition, GuidePin } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  LearningCatalogResolver,
  parseRecallCatalogContent,
  type LearningCatalogDb,
  type ResolvedUnitContext,
} from "../learning/learning-catalog.resolver";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { GuideCatalogError, productionGuideRegistry } from "./guide-catalog";
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

/** The catalog a pin is looked up in. Production unless a test binds otherwise. */
export interface GuidePinRegistry {
  getExact(guideKey: string, guideVersion: number): GuideDefinition;
}

export const GUIDE_PIN_REGISTRY = "GUIDE_PIN_REGISTRY";

@Injectable()
export class GuideTargetContextService {
  constructor(
    private readonly resolver: LearningCatalogResolver,
    /**
     * Fixed at construction, deliberately.
     *
     * An earlier version took the registry as a per-call argument so a spec
     * could supply 25 synthetic pins. That is a production bypass wearing a
     * test's clothes: any caller could have handed this service a catalog of
     * its own and had the answer computed against it. The seam belongs to
     * whoever BUILDS the service, not to whoever calls it.
     */
    @Optional()
    @Inject(GUIDE_PIN_REGISTRY)
    registry?: GuidePinRegistry,
  ) {
    // Assigned in the body rather than as a parameter default: a default on a
    // DECORATED parameter is not emitted identically by every compiler this
    // repo runs (the pg-specs use a different one from the unit specs), and it
    // arrived as `undefined` there — which silently made every pin unknown.
    this.registry = registry ?? productionGuideRegistry;
  }

  private readonly registry: GuidePinRegistry;

  /**
   * Resolve the ONE editorial context of a pinned definition. For the current
   * production guide the result is never null — every failure throws.
   */
  async resolve(
    definition: GuideDefinition,
    db?: LearningCatalogDb,
  ): Promise<ResolvedGuideContext> {
    // ONE implementation of the rule. This used to walk the steps itself; it
    // now delegates to the batch core, so a fast path and a correct path can
    // never be two different things.
    const [result] = await this.resolveDefinitions([definition], db);
    if (!result) return guideFail("GUIDE_CONTEXT_UNRESOLVED");
    if (!result.ok) {
      // The batch's reason IS the reason `resolve` used to raise itself, so
      // the single-pin contract is unchanged for every existing caller.
      // `resolve` receives a definition, so an unknown pin cannot reach here.
      return guideFail(
        result.code === "GUIDE_CONTEXT_MISMATCH"
          ? "GUIDE_CONTEXT_MISMATCH"
          : "GUIDE_CONTEXT_UNRESOLVED",
      );
    }
    return result.context;
  }

  /**
   * The same question for many pins, at a query cost that does not grow with
   * the number of pins.
   *
   * A pin the registry does not have is refused without touching the database.
   */
  async resolveMany(
    pins: readonly GuidePin[],
    db?: LearningCatalogDb,
  ): Promise<TargetContextResult[]> {
    // The catalog is whatever this SERVICE was built with. There is no
    // per-call override: a caller must not be able to hand the authority a
    // registry of its own and have the answer computed against it.
    const defs: (GuideDefinition | null)[] = pins.map((p) => {
      try {
        return this.registry.getExact(p.guideKey, p.guideVersion);
      } catch (error) {
        // ONLY "that exact definition does not exist" is an inert pin. A
        // `TypeError` from a broken registry, a malformed definition, a
        // duplicate — any of those means the catalog itself is wrong, and
        // reading them as "unknown pin" would show a chapter's cards as
        // inapplicable because the BUILD is broken. They propagate.
        if (isExactDefinitionNotFound(error)) return null;
        throw error;
      }
    });
    const known = defs.filter((d): d is GuideDefinition => d !== null);
    const resolved = await this.resolveDefinitions(known, db);
    const byKey = new Map<string, TargetContextResult>();
    for (const r of resolved) byKey.set(pinKeyOf(r.pin), r);
    // Positional alignment: the answer for question `i` is at index `i`,
    // duplicates included, so a caller never has to match on content.
    return pins.map((pin, i) => {
      if (defs[i] === null) {
        return { ok: false, pin, code: "GUIDE_CATALOG_UNKNOWN_DEFINITION" };
      }
      return (
        byKey.get(pinKeyOf(pin)) ?? {
          ok: false,
          pin,
          code: "GUIDE_CONTEXT_UNRESOLVED",
        }
      );
    });
  }

  /**
   * The canonical batch core. Four queries, whatever the input size.
   *
   * Sequential on purpose: the recall items' own catalogs have to be READ
   * before their internal concept keys are known, so those keys join the same
   * concept lookup as the steps' own. That ordering is what lets the item's
   * declared binding be verified without a query per item.
   */
  private async resolveDefinitions(
    definitions: readonly GuideDefinition[],
    db?: LearningCatalogDb,
  ): Promise<TargetContextResult[]> {
    if (definitions.length === 0) return [];
    const client = this.resolver.catalogClient(db);

    const uniq = new Map<string, GuideDefinition>();
    for (const d of definitions) uniq.set(pinKeyOf(d), d);

    const exerciseIds = new Set<string>();
    const conceptKeys = new Set<string>();
    for (const def of uniq.values()) {
      const t = stepTargets(def);
      t.conceptKeys.forEach((k) => conceptKeys.add(k));
      t.exerciseKeys.forEach((k) => exerciseIds.add(k));
      t.itemKeys.forEach((k) => exerciseIds.add(k));
    }

    // ── 1. exercises and recall items, WITH their content ───────────────────
    interface ExRow {
      id: string;
      type: string;
      chapterId: string;
      content: unknown;
    }
    const exRows: ExRow[] =
      exerciseIds.size === 0
        ? []
        : ((await client.exercise.findMany({
            where: { id: { in: [...exerciseIds] } },
            select: { id: true, type: true, chapterId: true, content: true },
          })) as unknown as ExRow[]);
    const exercises = new Map<string, ExRow>();
    for (const e of exRows) exercises.set(e.id, e);

    // A QUIZ's own catalog names the concept it claims. Parsed here so the
    // claim can be checked in the SAME concept lookup as everything else —
    // this is the validation the first batch attempt silently dropped.
    const itemCatalog = new Map<
      string,
      { mode: string; conceptKey: string | null }
    >();
    for (const [key, e] of exercises) {
      if (e.type !== "QUIZ") continue;
      const parsed = parseRecallCatalogContent(e.content as never);
      if (!parsed) continue; // no verifiable contract → unresolved below
      itemCatalog.set(key, {
        mode: parsed.mode,
        conceptKey: parsed.conceptKey,
      });
      if (parsed.conceptKey !== null) conceptKeys.add(parsed.conceptKey);
    }

    // ── 2. concepts (steps' own AND the items' declared bindings) ───────────
    const conceptUnit = new Map<string, string | null>();
    if (conceptKeys.size > 0) {
      const rows = await client.concept.findMany({
        where: { conceptKey: { in: [...conceptKeys] } },
        select: {
          conceptKey: true,
          links: { where: { unitId: { not: null } }, select: { unitId: true } },
        },
      });
      for (const c of rows) {
        const ids = [...new Set(c.links.map((l) => l.unitId as string))];
        // Exactly one owning unit, never a first match.
        conceptUnit.set(
          c.conceptKey,
          ids.length === 1 ? (ids[0] as string) : null,
        );
      }
    }

    // ── 3. the units those targets name ─────────────────────────────────────
    const wantedKeys = new Set<string>();
    for (const e of exercises.values()) {
      wantedKeys.add(unitKeyFromLegacyChapterId(e.chapterId));
    }
    const wantedIds = new Set<string>();
    for (const id of conceptUnit.values()) if (id) wantedIds.add(id);

    const units =
      wantedKeys.size + wantedIds.size === 0
        ? []
        : await client.contentUnit.findMany({
            where: {
              OR: [
                ...(wantedIds.size ? [{ id: { in: [...wantedIds] } }] : []),
                ...(wantedKeys.size
                  ? [{ unitKey: { in: [...wantedKeys] } }]
                  : []),
              ],
            },
            select: {
              id: true,
              unitKey: true,
              edition: { select: { publishedRevisionId: true } },
            },
          });
    const byUnitKey = new Map<string, string[]>();
    const known = new Set<string>();
    const keyOfUnit = new Map<string, string>();
    for (const u of units) {
      known.add(u.id);
      keyOfUnit.set(u.id, u.unitKey);
      byUnitKey.set(u.unitKey, [...(byUnitKey.get(u.unitKey) ?? []), u.id]);
    }

    // ── 4. only units inside their edition's PUBLISHED manifest are servable ─
    const published = new Set<string>();
    if (known.size > 0) {
      // Only the revisions those units' editions actually publish. Filtering
      // here rather than after the fact keeps this one bounded query.
      const publishedRevisions = [
        ...new Set(
          units
            .map((u) => u.edition.publishedRevisionId)
            .filter((r): r is string => r !== null),
        ),
      ];
      const rows =
        publishedRevisions.length === 0
          ? []
          : await client.revisionUnit.findMany({
              where: {
                unitId: { in: [...known] },
                revisionId: { in: publishedRevisions },
              },
              select: { unitId: true, revisionId: true },
            });
      const editionPublished = new Map<string, string | null>();
      for (const u of units) {
        editionPublished.set(u.id, u.edition.publishedRevisionId);
      }
      for (const r of rows) {
        // The unit must sit in ITS OWN edition's published revision — not in
        // some other edition's that happens to be in the batch.
        if (editionPublished.get(r.unitId) === r.revisionId)
          published.add(r.unitId);
      }
    }

    const unitByKey = (k: string): string | null => {
      const ids = byUnitKey.get(k) ?? [];
      // The same unitKey in two editions is ambiguous, never guessed.
      if (ids.length !== 1) return null;
      const id = ids[0] as string;
      return published.has(id) ? id : null;
    };
    const unitById = (id: string): string | null =>
      known.has(id) && published.has(id) ? id : null;

    const out: TargetContextResult[] = [];
    const decided: { pin: GuidePin; unitId: string }[] = [];
    for (const def of uniq.values()) {
      const pin: GuidePin = {
        guideKey: def.guideKey,
        guideVersion: def.guideVersion,
      };
      const t = stepTargets(def);
      const seen: string[] = [];
      let failure: GuideContextFailure | null = null;

      for (const k of t.conceptKeys) {
        const owner = conceptUnit.get(k);
        const unit = owner ? unitById(owner) : null;
        if (!unit) {
          failure = "GUIDE_CONTEXT_UNRESOLVED";
          break;
        }
        seen.push(unit);
      }
      if (!failure) {
        for (const k of t.exerciseKeys) {
          const e = exercises.get(k);
          // A QUIZ is a recall item, never a completable practice.
          if (!e || e.type === "QUIZ") {
            failure = "GUIDE_CONTEXT_UNRESOLVED";
            break;
          }
          const unit = unitByKey(unitKeyFromLegacyChapterId(e.chapterId));
          if (!unit) {
            failure = "GUIDE_CONTEXT_UNRESOLVED";
            break;
          }
          seen.push(unit);
        }
      }
      if (!failure) {
        for (const k of t.itemKeys) {
          const e = exercises.get(k);
          if (!e || e.type !== "QUIZ") {
            failure = "GUIDE_CONTEXT_UNRESOLVED";
            break;
          }
          const cat = itemCatalog.get(k);
          // No verifiable recall contract, or the step declares objective
          // recall and the item is self-assessed.
          if (!cat || cat.mode !== "objective") {
            failure = "GUIDE_CONTEXT_UNRESOLVED";
            break;
          }
          const unit = unitByKey(unitKeyFromLegacyChapterId(e.chapterId));
          if (!unit) {
            failure = "GUIDE_CONTEXT_UNRESOLVED";
            break;
          }
          // The item's OWN declared concept must have exactly one owning unit,
          // and it must be the item's unit. Dropping this is what made the
          // first batch wrong.
          if (cat.conceptKey !== null) {
            const owner = conceptUnit.get(cat.conceptKey);
            if (!owner || owner !== unit) {
              failure = "GUIDE_CONTEXT_UNRESOLVED";
              break;
            }
          }
          seen.push(unit);
        }
      }

      if (failure) {
        out.push({ ok: false, pin, code: failure });
        continue;
      }
      // A definition with no editorial target at all anchors to nothing.
      if (seen.length === 0) {
        out.push({ ok: false, pin, code: "GUIDE_CONTEXT_UNRESOLVED" });
        continue;
      }
      const distinct = new Set(seen);
      if (distinct.size !== 1) {
        out.push({ ok: false, pin, code: "GUIDE_CONTEXT_MISMATCH" });
        continue;
      }
      const unitId = [...distinct][0] as string;
      decided.push({ pin, unitId });
    }

    const contexts = await this.contextsForUnits(
      [...new Set(decided.map((d) => d.unitId))],
      client,
    );
    for (const d of decided) {
      const ctx = contexts.get(d.unitId);
      out.push(
        ctx
          ? { ok: true, pin: d.pin, context: ctx }
          : { ok: false, pin: d.pin, code: "GUIDE_CONTEXT_UNRESOLVED" },
      );
    }
    // Deterministic order: the caller indexes by pin key, never by position
    // within this array.
    return out;
  }

  /**
   * The full editorial context of a unit already proven servable.
   *
   * One lookup, reached only after the targets agree — so the shape callers
   * expect (`editionKey`, `bookSlug`, `revisionNumber`…) is unchanged.
   */
  private async contextsForUnits(
    unitIds: readonly string[],
    db: LearningCatalogDb,
  ): Promise<Map<string, ResolvedGuideContext>> {
    // `LearningCatalogDb` is a Pick of model delegates; the batched tail is one
    // join, which the model API cannot express in a single round trip.
    const raw = db as unknown as Prisma.TransactionClient;
    const out = new Map<string, ResolvedGuideContext>();
    if (unitIds.length === 0) return out;
    // ONE query for every unit the batch landed on. Calling the single-unit
    // resolver per unit would have made the tail O(units) — which is what the
    // fixed-cost test caught, and why it counts queries instead of trusting a
    // comment.
    const rows = await raw.$queryRaw<
      Array<{
        unitId: string;
        unitKey: string;
        editionId: string;
        editionKey: string;
        bookId: string;
        bookSlug: string;
        bookPlan: string;
        revisionId: string;
        revisionNumber: number;
      }>
    >`
      SELECT u."id"          AS "unitId",
             u."unitKey"     AS "unitKey",
             e."id"          AS "editionId",
             e."editionKey"  AS "editionKey",
             b."id"          AS "bookId",
             b."slug"        AS "bookSlug",
             b."plan"::text  AS "bookPlan",
             r."id"          AS "revisionId",
             r."number"      AS "revisionNumber"
        FROM "ContentUnit" u
        JOIN "Edition" e ON e."id" = u."editionId"
        JOIN "Revision" r ON r."id" = e."publishedRevisionId"
        JOIN "RevisionUnit" ru ON ru."revisionId" = r."id" AND ru."unitId" = u."id"
        JOIN "Book" b ON b."slug" = e."slug"
       WHERE u."id" IN (${Prisma.join([...unitIds])})`;
    for (const r of rows) {
      out.set(r.unitId, {
        bookId: r.bookId,
        bookSlug: r.bookSlug,
        bookPlan: r.bookPlan,
        editionId: r.editionId,
        editionKey: r.editionKey,
        revisionId: r.revisionId,
        revisionNumber: r.revisionNumber,
        unitId: r.unitId,
        unitKey: r.unitKey,
      });
    }
    return out;
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

/**
 * ── The batch core (C.3R, #639) ─────────────────────────────────────────────
 *
 * `resolve` answers for one definition and costs several queries; a chapter's
 * worth of cards would make that O(N). `resolveMany` answers for up to 25 pins
 * in a FIXED number of queries.
 *
 * The rule is implemented ONCE. `resolveMany` holds the canonical batch
 * implementation and `resolve` delegates to it, so there is no second, faster,
 * slightly-wrong copy to drift. That mattered concretely: the first attempt at
 * a batch lived in the applicability service and silently skipped the recall
 * item's internal concept binding, which would have let a pin whose own catalog
 * contradicts itself read as applicable while `resolve` refused it.
 *
 * Every rule survives: the exercise/chapter bridge, ACTIVE_RECALL requiring
 * `objective` mode, the recall item's declared concept having exactly one
 * owning unit AND that unit being the item's own, EXPLICIT_CONFIRMATION
 * contributing nothing, all targets converging on one unit, and membership of
 * the edition's PUBLISHED revision.
 *
 * Editorial failure and infrastructure failure stay different facts: a pin the
 * catalog cannot place comes back as a per-pin `failure`, while a query that
 * throws propagates and fails the whole batch. An unreachable database must
 * never read as "this guide does not apply here".
 */

/** One pin's outcome — resolved, or refused with the reason `resolve` would give. */
export type TargetContextResult =
  | { ok: true; pin: GuidePin; context: ResolvedGuideContext }
  | { ok: false; pin: GuidePin; code: GuideContextFailure };

export type GuideContextFailure =
  | "GUIDE_CONTEXT_UNRESOLVED"
  | "GUIDE_CONTEXT_MISMATCH"
  | "GUIDE_CATALOG_UNKNOWN_DEFINITION";

/**
 * Is this the ONE error that means "no such exact definition"?
 *
 * Matched by class and canonical code. Never by message or regex: a message is
 * prose, and a predicate that reads prose turns any rewording into a silent
 * behaviour change.
 */
function isExactDefinitionNotFound(error: unknown): boolean {
  return (
    error instanceof GuideCatalogError &&
    error.code === "GUIDE_CATALOG_UNKNOWN_DEFINITION"
  );
}

const pinKeyOf = (p: { guideKey: string; guideVersion: number }): string =>
  `${p.guideKey}@${p.guideVersion}`;

interface StepTargets {
  conceptKeys: string[];
  exerciseKeys: string[];
  itemKeys: string[];
}

function stepTargets(def: GuideDefinition): StepTargets {
  const conceptKeys: string[] = [];
  const exerciseKeys: string[] = [];
  const itemKeys: string[] = [];
  for (const step of def.steps) {
    switch (step.kind) {
      case "CONCEPT_EXPLORATION":
        conceptKeys.push(step.conceptKey);
        break;
      case "CATALOG_PRACTICE":
        exerciseKeys.push(step.exerciseKey);
        break;
      case "ACTIVE_RECALL":
        itemKeys.push(step.itemKey);
        break;
      default:
        // EXPLICIT_CONFIRMATION contributes no editorial anchor.
        break;
    }
  }
  return { conceptKeys, exerciseKeys, itemKeys };
}
