import type {
  GuideDefinition,
  GuideSessionProjection,
  GuideSessionStatus,
  GuideStepDefinition,
} from "@psico/types";

/**
 * CC-7.4B — the PURE Guide session state machine (ADR 0019 §6, hardened per
 * the PR #590 closure). No Prisma, no Nest, no clocks: functions over
 * (pinned definition, accepted-step ledger rows, status).
 *
 * The machine consumes FULL ledger semantics (`AcceptedGuideStep`), not bare
 * `{stepKey, order}`: a row only counts toward `stepsCompleted` after its
 * kind, completionPolicy and EXACT target are verified against the pinned
 * `GuideStepDefinition`. LearningEvents are never read here — the input type
 * cannot carry them (GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP).
 */

// ─── Accepted-step semantics (mirror of the catalog union) ──────────────────

interface AcceptedStepBase {
  stepKey: string;
  order: number;
}

export interface AcceptedConceptStep extends AcceptedStepBase {
  kind: "CONCEPT_EXPLORATION";
  completionPolicy: "EXPLICIT_CONFIRMATION";
  conceptKey: string;
}

/** Recall carries its CLOSED evidence: the chosen option + the server-graded
 * result — accepted evidence of the attempt, not catalog targets. */
export interface AcceptedRecallStep extends AcceptedStepBase {
  kind: "ACTIVE_RECALL";
  completionPolicy: "OBJECTIVE_RECALL";
  itemKey: string;
  selectedOptionKey: string;
  recallResult: "CORRECT" | "INCORRECT";
}

export interface AcceptedPracticeStep extends AcceptedStepBase {
  kind: "CATALOG_PRACTICE";
  completionPolicy: "CATALOG_PRACTICE_CONFIRMATION";
  exerciseKey: string;
}

export interface AcceptedConfirmationStep extends AcceptedStepBase {
  kind: "EXPLICIT_CONFIRMATION";
  completionPolicy: "EXPLICIT_CONFIRMATION";
  confirmationKey: string;
}

export type AcceptedGuideStep =
  | AcceptedConceptStep
  | AcceptedRecallStep
  | AcceptedPracticeStep
  | AcceptedConfirmationStep;

export type GuideStateErrorCode =
  | "GUIDE_STATE_STEP_NOT_IN_DEFINITION"
  | "GUIDE_STATE_DUPLICATE_STEP"
  | "GUIDE_STATE_ORDER_MISMATCH"
  | "GUIDE_STATE_KIND_MISMATCH"
  | "GUIDE_STATE_POLICY_MISMATCH"
  | "GUIDE_STATE_TARGET_MISMATCH"
  | "GUIDE_STATE_INVALID_ROW"
  | "GUIDE_STATE_OUT_OF_ORDER"
  | "GUIDE_STATE_SESSION_CLOSED"
  | "GUIDE_STATE_INCOMPLETE";

/** Closed internal error — the code IS the message; received values never
 * appear (no stepKey, no counts, no definition content). */
export class GuideStateError extends Error {
  constructor(readonly code: GuideStateErrorCode) {
    super(code);
    this.name = "GuideStateError";
  }
}

const stateFail = (code: GuideStateErrorCode): never => {
  throw new GuideStateError(code);
};

// ─── Row parser — stored Prisma row → AcceptedGuideStep (pure) ──────────────

/** Structural shape of a stored ledger row. Deliberately NOT a Prisma type:
 * the machine stays Prisma-free; the caller passes plain columns. */
export interface StoredGuideStepRow {
  stepKey: string;
  order: number;
  kind: string;
  completionPolicy: string;
  conceptKey: string | null;
  itemKey: string | null;
  exerciseKey: string | null;
  confirmationKey: string | null;
  selectedOptionKey: string | null;
  recallResult: string | null;
}

/**
 * Parse a stored row into the closed union — exact kind→policy→target
 * coupling re-established at runtime (a foreign write that survived the SQL
 * CHECKs would still be rejected here, fail-closed).
 */
export function parseAcceptedGuideStepRow(
  row: StoredGuideStepRow,
): AcceptedGuideStep {
  const base = { stepKey: row.stepKey, order: row.order };
  switch (row.kind) {
    case "CONCEPT_EXPLORATION":
      if (
        row.completionPolicy !== "EXPLICIT_CONFIRMATION" ||
        row.conceptKey === null ||
        row.itemKey !== null ||
        row.exerciseKey !== null ||
        row.confirmationKey !== null ||
        row.selectedOptionKey !== null ||
        row.recallResult !== null
      ) {
        stateFail("GUIDE_STATE_INVALID_ROW");
      }
      return {
        ...base,
        kind: "CONCEPT_EXPLORATION",
        completionPolicy: "EXPLICIT_CONFIRMATION",
        conceptKey: row.conceptKey as string,
      };
    case "ACTIVE_RECALL":
      if (
        row.completionPolicy !== "OBJECTIVE_RECALL" ||
        row.itemKey === null ||
        row.selectedOptionKey === null ||
        (row.recallResult !== "CORRECT" && row.recallResult !== "INCORRECT") ||
        row.conceptKey !== null ||
        row.exerciseKey !== null ||
        row.confirmationKey !== null
      ) {
        stateFail("GUIDE_STATE_INVALID_ROW");
      }
      return {
        ...base,
        kind: "ACTIVE_RECALL",
        completionPolicy: "OBJECTIVE_RECALL",
        itemKey: row.itemKey as string,
        selectedOptionKey: row.selectedOptionKey as string,
        recallResult: row.recallResult as "CORRECT" | "INCORRECT",
      };
    case "CATALOG_PRACTICE":
      if (
        row.completionPolicy !== "CATALOG_PRACTICE_CONFIRMATION" ||
        row.exerciseKey === null ||
        row.conceptKey !== null ||
        row.itemKey !== null ||
        row.confirmationKey !== null ||
        row.selectedOptionKey !== null ||
        row.recallResult !== null
      ) {
        stateFail("GUIDE_STATE_INVALID_ROW");
      }
      return {
        ...base,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "CATALOG_PRACTICE_CONFIRMATION",
        exerciseKey: row.exerciseKey as string,
      };
    case "EXPLICIT_CONFIRMATION":
      if (
        row.completionPolicy !== "EXPLICIT_CONFIRMATION" ||
        row.confirmationKey === null ||
        row.conceptKey !== null ||
        row.itemKey !== null ||
        row.exerciseKey !== null ||
        row.selectedOptionKey !== null ||
        row.recallResult !== null
      ) {
        stateFail("GUIDE_STATE_INVALID_ROW");
      }
      return {
        ...base,
        kind: "EXPLICIT_CONFIRMATION",
        completionPolicy: "EXPLICIT_CONFIRMATION",
        confirmationKey: row.confirmationKey as string,
      };
    default:
      return stateFail("GUIDE_STATE_INVALID_ROW");
  }
}

// ─── Full semantic validation against the pinned definition ─────────────────

/** The EXACT match of one accepted row against its catalog definition:
 * kind, policy and target must all agree — recall additionally matches the
 * definition's itemKey (its option/result are accepted evidence, whose SHAPE
 * the parser already validated, not catalog targets). */
function matchesDefinition(
  step: AcceptedGuideStep,
  def: GuideStepDefinition,
): void {
  if (step.kind !== def.kind) stateFail("GUIDE_STATE_KIND_MISMATCH");
  // Policies differ only in casing convention (DB enum vs catalog literal);
  // compare canonically:
  if (step.completionPolicy.toLowerCase() !== def.completionPolicy) {
    stateFail("GUIDE_STATE_POLICY_MISMATCH");
  }
  switch (def.kind) {
    case "CONCEPT_EXPLORATION":
      if (
        step.kind !== "CONCEPT_EXPLORATION" ||
        step.conceptKey !== def.conceptKey
      ) {
        stateFail("GUIDE_STATE_TARGET_MISMATCH");
      }
      return;
    case "ACTIVE_RECALL":
      if (step.kind !== "ACTIVE_RECALL" || step.itemKey !== def.itemKey) {
        stateFail("GUIDE_STATE_TARGET_MISMATCH");
      }
      return;
    case "CATALOG_PRACTICE":
      if (
        step.kind !== "CATALOG_PRACTICE" ||
        step.exerciseKey !== def.exerciseKey
      ) {
        stateFail("GUIDE_STATE_TARGET_MISMATCH");
      }
      return;
    case "EXPLICIT_CONFIRMATION":
      if (
        step.kind !== "EXPLICIT_CONFIRMATION" ||
        step.confirmationKey !== def.confirmationKey
      ) {
        stateFail("GUIDE_STATE_TARGET_MISMATCH");
      }
      return;
  }
}

/**
 * Validate that a ledger is CONSISTENT with the pinned definition:
 *
 *   - every accepted step exists in `guideKey@guideVersion`;
 *   - zero duplicates (mirrors the DB unique `(sessionId, stepKey)`);
 *   - each row's stored `order` matches the catalog's for that step;
 *   - kind, completionPolicy and EXACT target match the definition — a row
 *     that drifted from the catalog can never increment the counter;
 *   - acceptance is SEQUENTIAL: the accepted set must be exactly the prefix
 *     1..k (a gap means something was accepted out of order).
 */
export function assertLedgerConsistent(
  definition: GuideDefinition,
  accepted: readonly AcceptedGuideStep[],
): void {
  const defByKey = new Map<string, GuideStepDefinition>();
  for (const step of definition.steps) {
    defByKey.set(step.stepKey, step);
  }

  const seen = new Set<string>();
  let maxOrder = 0;
  for (const row of accepted) {
    const def = defByKey.get(row.stepKey);
    if (def === undefined) {
      stateFail("GUIDE_STATE_STEP_NOT_IN_DEFINITION");
      return;
    }
    if (seen.has(row.stepKey)) {
      stateFail("GUIDE_STATE_DUPLICATE_STEP");
    }
    seen.add(row.stepKey);
    if (row.order !== def.order) {
      stateFail("GUIDE_STATE_ORDER_MISMATCH");
    }
    matchesDefinition(row, def);
    if (def.order > maxOrder) maxOrder = def.order;
  }
  // Strict sequential prefix: k accepted rows must cover orders 1..k.
  if (seen.size !== maxOrder) {
    stateFail("GUIDE_STATE_OUT_OF_ORDER");
  }
}

/**
 * The next step the session expects (first non-accepted by order), or null
 * when every step is accepted. Assumes/validates ledger consistency.
 */
export function nextExpectedStepKey(
  definition: GuideDefinition,
  accepted: readonly AcceptedGuideStep[],
): string | null {
  assertLedgerConsistent(definition, accepted);
  const acceptedKeys = new Set(accepted.map((row) => row.stepKey));
  for (const step of definition.steps) {
    if (!acceptedKeys.has(step.stepKey)) return step.stepKey;
  }
  return null;
}

/**
 * Whether `stepKey` is the transition the machine will accept NOW: it must
 * be the current expected step (strict order — an already-accepted step or a
 * future step is not acceptable). Closed sessions accept nothing.
 */
export function canAcceptStep(
  definition: GuideDefinition,
  accepted: readonly AcceptedGuideStep[],
  stepKey: string,
  status: GuideSessionStatus,
): boolean {
  if (status !== "ACTIVE") return false;
  return nextExpectedStepKey(definition, accepted) === stepKey;
}

/**
 * Whether the explicit SESSION_COMPLETE command may run: every step of the
 * pinned version accepted, session still ACTIVE. (An ACTIVE session with all
 * steps accepted is legal — it WAITS for the explicit complete command.)
 */
export function canCompleteSession(
  definition: GuideDefinition,
  accepted: readonly AcceptedGuideStep[],
  status: GuideSessionStatus,
): boolean {
  if (status !== "ACTIVE") return false;
  return nextExpectedStepKey(definition, accepted) === null;
}

/**
 * Derive the V1 public projection EXCLUSIVELY from the ledger — a row only
 * counts after its FULL semantics (kind + policy + exact target) matched the
 * pinned catalog:
 *
 *   stepsCompleted = accepted, catalog-matched, unique stepKeys
 *   totalSteps     = steps of the pinned guideKey@guideVersion
 *   currentStepKey = first non-accepted by order;
 *                    null in COMPLETED/CANCELLED (and in ACTIVE once all
 *                    steps are accepted — awaiting the explicit complete)
 *
 * COMPLETED additionally REQUIRES a full ledger; CANCELLED retains the
 * accepted count with no cursor.
 */
export function deriveGuideProjection(
  definition: GuideDefinition,
  accepted: readonly AcceptedGuideStep[],
  status: GuideSessionStatus,
): GuideSessionProjection {
  assertLedgerConsistent(definition, accepted);
  const stepsCompleted = new Set(accepted.map((row) => row.stepKey)).size;
  const totalSteps = definition.steps.length;

  if (status === "COMPLETED" && stepsCompleted !== totalSteps) {
    stateFail("GUIDE_STATE_INCOMPLETE");
  }

  const currentStepKey =
    status === "ACTIVE" ? nextExpectedStepKey(definition, accepted) : null;

  return { stepsCompleted, totalSteps, currentStepKey };
}
