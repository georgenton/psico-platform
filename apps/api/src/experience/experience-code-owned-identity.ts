import type { Prisma } from "@prisma/client";
import type { ChapterExperienceDefinition } from "@psico/types";

import { productionGuideRegistry } from "../guide/guide-catalog";
import { GuideTargetContextService } from "../guide/guide-target-context.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import type { PrismaService } from "../prisma/prisma.service";
import { PRODUCTION_EXPERIENCE_DEFINITIONS } from "./experience-production-catalog";

/**
 * C.3A (#639) — which STABLE chapter a definition the build ships belongs to.
 *
 * ── The contradiction this closes ───────────────────────────────────────────
 *
 * A code-owned definition holds its guide exactly as a stored row does: the
 * hybrid repository serves it to readers today, so a new draft must not be able
 * to take that guide. That claim has to be scoped to a chapter, and until now
 * it was scoped by `(bookSlug, chapterOrder)` — a POSITION — while every stored
 * claim had moved to `contentUnitId`. After a reorder the two halves describe
 * different chapters, and a collision check comparing them compares nothing.
 *
 * Declaring the schema STRUCTURAL while half the claims were positional would
 * have been a claim about the data that the data did not support.
 *
 * ── Where a stable answer comes from ────────────────────────────────────────
 *
 * Not from `bookSlug`/`chapterOrder`, which are the problem. Not from
 * `anchorKey` either — it is a free string with no catalog behind it, and the
 * reader resolves anchors by GUIDE pin rather than by that field. And not by
 * derivation: `ContentUnit.id` is a cuid and `unitKey` is `uuidv5(Chapter.id)`,
 * so neither is a function of anything a definition carries.
 *
 * It comes from the guide the definition PINS. Every definition has a
 * `guidePin`; every guide's steps name catalog targets (`conceptKey`,
 * `exerciseKey`, `itemKey`); and `GuideTargetContextService` already resolves
 * those targets to one editorial context, requiring all of them to agree on
 * `bookId/editionId/revisionId/unitId` and failing closed otherwise. That is
 * the same resolution the Guide discovery path has used in production since
 * GR-4 — reused here rather than re-derived, so a code-owned experience and its
 * own guide can never disagree about which chapter they are in.
 *
 * ── Fail closed, and what that costs ────────────────────────────────────────
 *
 * A shipped definition whose chapter cannot be named is a catalog or ingestion
 * inconsistency, and while one exists no binding write can know whether it
 * collides with something. So resolution failure refuses the operation with a
 * canonical code rather than falling back to the position.
 *
 * The blast radius is worth stating plainly: because the claims are resolved as
 * a set, one unresolvable shipped definition refuses binding writes in EVERY
 * chapter, not only its own. That is deliberate — the alternative is to decide
 * relevance by position, which is the bug — but it does mean an incomplete
 * catalog ingestion presents as a CMS-wide refusal. The code says which.
 */

/** The one code the outside world sees when a shipped claim cannot be placed. */
export const EXPERIENCE_CODE_OWNED_UNRESOLVED =
  "EXPERIENCE_CODE_OWNED_UNRESOLVED";

export class CodeOwnedIdentityError extends Error {
  readonly code = EXPERIENCE_CODE_OWNED_UNRESOLVED;
  constructor(readonly experienceKey: string) {
    // The message IS the code: a refusal carries no editorial content. The key
    // is kept as a field for logs, never for the wire.
    super(EXPERIENCE_CODE_OWNED_UNRESOLVED);
    this.name = "CodeOwnedIdentityError";
  }
}

/** One shipped definition, placed in the chapter its guide's targets name. */
export interface CodeOwnedClaim {
  experienceKey: string;
  guideKey: string;
  contentUnitId: string;
  /** The definition itself, so a reader of this list needs no second lookup. */
  definition: ChapterExperienceDefinition;
}

export interface CodeOwnedCatalog {
  /** Every PUBLISHED definition the build ships, in declared order. */
  readonly definitions: readonly ChapterExperienceDefinition[];
  /** `guideKey@guideVersion` → the pinned guide, or a throw. */
  readonly guideFor: (
    guideKey: string,
    guideVersion: number,
  ) => Parameters<GuideTargetContextService["resolve"]>[0];
}

export const productionCodeOwnedCatalog: CodeOwnedCatalog = {
  definitions: PRODUCTION_EXPERIENCE_DEFINITIONS.filter(
    (d) => d.status === "PUBLISHED",
  ),
  guideFor: (guideKey, guideVersion) =>
    productionGuideRegistry.getExact(guideKey, guideVersion),
};

/**
 * The resolver, built FROM the caller's transaction.
 *
 * `LearningCatalogResolver` picks `db ?? this.prisma` per query, so handing it
 * the transaction as both means every read lands on the caller's snapshot with
 * no second client to fall back to. Constructing one process-wide instance
 * around the ambient Prisma would leave a fallback that silently reads outside
 * the transaction the moment a call site forgot to pass `db`.
 */
function contextResolver(
  db: Prisma.TransactionClient,
): GuideTargetContextService {
  return new GuideTargetContextService(
    new LearningCatalogResolver(db as unknown as PrismaService),
  );
}

/**
 * The one resolution: an EXACT guide pin → the stable chapter it lives in.
 *
 * Both callers that need a chapter from a pin go through here — the shipped
 * catalog below, and the C.3B backfill for stored rows. Two copies of this walk
 * would be two chances to drift, and the whole point is that an experience and
 * its own guide can never disagree about which chapter they are in.
 *
 * `guideVersion` is part of the question, not decoration. Two versions of one
 * guide can name different targets, so resolving by `guideKey` alone would
 * answer about a guide nobody pinned.
 *
 * Returns `null` rather than throwing. The two callers want different things
 * from a failure — the shipped catalog refuses every chapter, the backfill
 * records one anomaly and keeps classifying — and a shared helper should not
 * pick one of those for them.
 */
export async function resolveUnitForGuidePin(
  db: Prisma.TransactionClient,
  pin: { guideKey: string; guideVersion: number },
  catalog: CodeOwnedCatalog = productionCodeOwnedCatalog,
): Promise<{ unitId: string; editionId: string } | null> {
  try {
    const guide = catalog.guideFor(pin.guideKey, pin.guideVersion);
    const ctx = await contextResolver(db).resolve(guide, db);
    return { unitId: ctx.unitId, editionId: ctx.editionId };
  } catch {
    // Includes GUIDE_CONTEXT_UNRESOLVED (targets not ingested),
    // GUIDE_CONTEXT_MISMATCH (targets in different units) and an unknown pin.
    // All three mean the same thing to a caller: this pin names no chapter.
    return null;
  }
}

/**
 * Every shipped claim, indexed by the stable chapter it belongs to.
 *
 * Resolved inside the caller's transaction, against the manifest that
 * transaction can see — the same snapshot the rest of the binding decision is
 * made on. Nothing is memoised across transactions: a cached placement would
 * outlive the reorder that moved it.
 */
export async function codeOwnedClaimsByUnit(
  db: Prisma.TransactionClient,
  catalog: CodeOwnedCatalog = productionCodeOwnedCatalog,
): Promise<Map<string, CodeOwnedClaim[]>> {
  const byUnit = new Map<string, CodeOwnedClaim[]>();
  for (const definition of catalog.definitions) {
    const placed = await resolveUnitForGuidePin(
      db,
      definition.guidePin,
      catalog,
    );
    if (placed === null)
      throw new CodeOwnedIdentityError(definition.experienceKey);
    const contentUnitId = placed.unitId;
    const claims = byUnit.get(contentUnitId) ?? [];
    claims.push({
      experienceKey: definition.experienceKey,
      guideKey: definition.guidePin.guideKey,
      contentUnitId,
      definition,
    });
    byUnit.set(contentUnitId, claims);
  }
  return byUnit;
}

/** The shipped claims that belong to ONE stable chapter. */
export async function codeOwnedClaimsForUnit(
  db: Prisma.TransactionClient,
  contentUnitId: string,
  catalog: CodeOwnedCatalog = productionCodeOwnedCatalog,
): Promise<CodeOwnedClaim[]> {
  return (await codeOwnedClaimsByUnit(db, catalog)).get(contentUnitId) ?? [];
}

/**
 * The seam.
 *
 * Resolving a shipped claim walks the guide registry and three catalog tables,
 * which is exactly right in production and is a great deal of database for a
 * unit test about lifecycle rules to have to impersonate. Injecting the
 * resolver lets those tests state what the shipped catalog says without
 * pretending to be Content Core — and lets a pg-spec describe a chapter with a
 * claim that would otherwise need a second editorial guide.
 *
 * The DEFAULT is production. A test that supplies nothing gets the real thing.
 */
export type CodeOwnedClaimResolver = (
  db: Prisma.TransactionClient,
  contentUnitId: string,
) => Promise<CodeOwnedClaim[]>;

export const EXPERIENCE_CODE_OWNED_CLAIMS = "EXPERIENCE_CODE_OWNED_CLAIMS";

export const productionCodeOwnedClaims: CodeOwnedClaimResolver = (
  db,
  contentUnitId,
) => codeOwnedClaimsForUnit(db, contentUnitId);
