import type {
  GuideConceptStep,
  GuideConfirmationStep,
  GuideDefinition,
  GuidePracticeStep,
  GuideRecallStep,
  GuideStepDefinition,
} from "@psico/types";

/**
 * CC-7.4B — pure (Nest-free, Prisma-free) runtime validator + exact registry
 * for the Guide catalog (ADR 0019 §2).
 *
 * The type system makes invalid kind/policy combinations inexpressible for
 * TYPED literals, but definitions may arrive as `unknown` (a future authoring
 * surface, a mis-typed constant, a test fixture). This validator is the
 * runtime authority: field-by-field reconstruction, closed key grammar,
 * exact kind→policy→target coupling, contiguous 1..n order — and it returns
 * DEEPLY FROZEN structures without ever mutating its input.
 *
 * The PRODUCTION registry is EMPTY: the audit found no expressly approved
 * Guide V1 product definition (guideKey + version + exact steps + targets),
 * and inventing content is prohibited. Test-only definitions live in specs.
 */

export class GuideCatalogError extends Error {
  constructor(readonly code: GuideCatalogErrorCode) {
    // Codes only — never the received value.
    super(code);
    this.name = "GuideCatalogError";
  }
}

export type GuideCatalogErrorCode =
  | "GUIDE_CATALOG_INVALID_DEFINITION"
  | "GUIDE_CATALOG_DUPLICATE_DEFINITION"
  | "GUIDE_CATALOG_UNKNOWN_DEFINITION";

const fail = (): never => {
  throw new GuideCatalogError("GUIDE_CATALOG_INVALID_DEFINITION");
};

// ─── Key grammar (ADR 0019 §2) ──────────────────────────────────────────────

/**
 * Closed ASCII, catalog-compatible: lowercase alphanumeric start, then
 * `a-z 0-9 . _ : -`, max 200 chars. No whitespace, no controls, no
 * uppercase, no empties — and NO silent case normalization: an uppercase
 * key is rejected, never lowered.
 */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

export function isValidGuideCatalogKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value);
}

// ─── Structural helpers (reject exotic shapes, never mutate) ────────────────

/** A plain object: `Object.prototype` or `null` prototype — nothing else. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Fail on any own key outside the exact allowlist (extra keys = invalid). */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail();
  }
}

function requireKey(value: unknown): string {
  if (!isValidGuideCatalogKey(value)) fail();
  return value as string;
}

// ─── Step reconstruction — one branch per V1 variant, exact coupling ────────

const STEP_BASE_KEYS = ["stepKey", "order", "required"] as const;

interface RebuiltBase {
  stepKey: string;
  order: number;
  required: true;
}

function rebuildBase(obj: Record<string, unknown>): RebuiltBase {
  const stepKey = requireKey(obj.stepKey);
  const order = obj.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    fail();
  }
  // V1 has NO optional steps: `required` must be the literal true.
  if (obj.required !== true) fail();
  return { stepKey, order: order as number, required: true };
}

function rebuildStep(value: unknown): GuideStepDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  const base = rebuildBase(obj);

  switch (obj.kind) {
    case "CONCEPT_EXPLORATION": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "conceptKey",
      ]);
      if (obj.completionPolicy !== "explicit_confirmation") fail();
      const step: GuideConceptStep = {
        ...base,
        kind: "CONCEPT_EXPLORATION",
        completionPolicy: "explicit_confirmation",
        conceptKey: requireKey(obj.conceptKey),
      };
      return step;
    }
    case "ACTIVE_RECALL": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "itemKey",
      ]);
      if (obj.completionPolicy !== "objective_recall") fail();
      const step: GuideRecallStep = {
        ...base,
        kind: "ACTIVE_RECALL",
        completionPolicy: "objective_recall",
        itemKey: requireKey(obj.itemKey),
      };
      return step;
    }
    case "CATALOG_PRACTICE": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "exerciseKey",
      ]);
      if (obj.completionPolicy !== "catalog_practice_confirmation") fail();
      const step: GuidePracticeStep = {
        ...base,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "catalog_practice_confirmation",
        exerciseKey: requireKey(obj.exerciseKey),
      };
      return step;
    }
    case "EXPLICIT_CONFIRMATION": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "confirmationKey",
      ]);
      if (obj.completionPolicy !== "explicit_confirmation") fail();
      const step: GuideConfirmationStep = {
        ...base,
        kind: "EXPLICIT_CONFIRMATION",
        completionPolicy: "explicit_confirmation",
        confirmationKey: requireKey(obj.confirmationKey),
      };
      return step;
    }
    default:
      // SERVER_ACTION (deferred out of V1) and anything else land here.
      return fail();
  }
}

// ─── Definition reconstruction ──────────────────────────────────────────────

/**
 * Validate an unknown value as a GuideDefinition and return a NEW, deeply
 * frozen structure (the input is never mutated and never aliased):
 *
 *   - guideVersion: positive integer;
 *   - at least one step; unique stepKeys; unique, CONTIGUOUS 1..n order;
 *   - the stored array is IN order;
 *   - every step passes the exact variant reconstruction above.
 */
export function validateGuideDefinition(value: unknown): GuideDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["guideKey", "guideVersion", "steps"]);

  const guideKey = requireKey(obj.guideKey);
  const guideVersion = obj.guideVersion;
  if (
    typeof guideVersion !== "number" ||
    !Number.isInteger(guideVersion) ||
    guideVersion < 1
  ) {
    fail();
  }

  const rawSteps: unknown = obj.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) fail();

  const steps = (rawSteps as unknown[]).map(rebuildStep);

  const seenKeys = new Set<string>();
  for (const step of steps) {
    if (seenKeys.has(step.stepKey)) fail();
    seenKeys.add(step.stepKey);
  }
  // Unique AND contiguous from 1, and the array itself is stored in order.
  steps.forEach((step: GuideStepDefinition, index: number) => {
    if (step.order !== index + 1) fail();
  });

  const definition: GuideDefinition = {
    guideKey,
    guideVersion: guideVersion as number,
    steps,
  };
  for (const step of definition.steps) Object.freeze(step);
  Object.freeze(definition.steps);
  return Object.freeze(definition);
}

// ─── Exact registry (no first-match, no "latest" for sessions) ──────────────

export class GuideCatalogRegistry {
  private readonly byExactVersion = new Map<string, GuideDefinition>();
  private readonly versionsByGuide = new Map<string, number[]>();

  constructor(definitions: readonly unknown[]) {
    for (const raw of definitions) {
      const def = validateGuideDefinition(raw);
      const exact = `${def.guideKey}@${def.guideVersion}`;
      if (this.byExactVersion.has(exact)) {
        throw new GuideCatalogError("GUIDE_CATALOG_DUPLICATE_DEFINITION");
      }
      this.byExactVersion.set(exact, def);
      const versions = this.versionsByGuide.get(def.guideKey) ?? [];
      versions.push(def.guideVersion);
      versions.sort((a, b) => a - b);
      this.versionsByGuide.set(def.guideKey, versions);
    }
  }

  /**
   * EXACT lookup by `guideKey@guideVersion` — a session pins its version at
   * start and always resolves against that pin. No fallback of any kind.
   */
  getExact(guideKey: string, guideVersion: number): GuideDefinition {
    const def = this.byExactVersion.get(`${guideKey}@${guideVersion}`);
    if (!def) throw new GuideCatalogError("GUIDE_CATALOG_UNKNOWN_DEFINITION");
    return def;
  }

  /**
   * Discovery helper for STARTING a new session only (ADR 0019 §2): the
   * highest published version of a guide, or null. NEVER used to resolve an
   * already-created session — those call `getExact` with their pinned pair.
   */
  latestStartableVersion(guideKey: string): number | null {
    const versions = this.versionsByGuide.get(guideKey);
    if (!versions || versions.length === 0) return null;
    return versions[versions.length - 1];
  }

  get size(): number {
    return this.byExactVersion.size;
  }
}

/**
 * The PRODUCTION registry — EMPTY by audit (2026-07-20): no expressly
 * approved Guide V1 definition exists (guideKey + version + exact step
 * sequence + targets). Content is NOT invented here; publishing the first
 * real guide is a deliberate, reviewed change to this array
 * (CC7_4C_STATUS=BLOCKED_GUIDE_DEFINITION_REQUIRED until then).
 */
export const PRODUCTION_GUIDE_DEFINITIONS: readonly GuideDefinition[] = [];

export const productionGuideRegistry = new GuideCatalogRegistry(
  PRODUCTION_GUIDE_DEFINITIONS,
);
