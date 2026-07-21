import type {
  GuideDefinition,
  GuideSessionProjection,
  GuideSessionStatus,
} from "@psico/types";

/**
 * CC-7.4B — the PURE Guide session state machine (ADR 0019 §6). No Prisma,
 * no Nest, no clocks: functions over (pinned definition, accepted-step
 * ledger rows, status). CC-7.4C's lifecycle transitions will call these
 * inside its transactions; nothing imports them at runtime yet.
 *
 * THE source of every counter is the ledger (`GuideSessionStep` ACCEPTED
 * rows). LearningEvents are never read here — the input type cannot even
 * carry them (GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP).
 */

/** The slice of a ledger row the machine needs. Nothing else exists on it. */
export interface AcceptedStepRow {
  stepKey: string;
  order: number;
}

export type GuideStateErrorCode =
  | "GUIDE_STATE_STEP_NOT_IN_DEFINITION"
  | "GUIDE_STATE_DUPLICATE_STEP"
  | "GUIDE_STATE_ORDER_MISMATCH"
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

/**
 * Validate that a ledger is CONSISTENT with the pinned definition:
 *
 *   - every accepted step exists in `guideKey@guideVersion` (a row for a
 *     step outside the pinned catalog is corruption, not state);
 *   - zero duplicates (mirrors the DB unique `(sessionId, stepKey)`);
 *   - each row's stored `order` matches the catalog's order for that step;
 *   - acceptance is SEQUENTIAL: with V1's strict 1..n order, the accepted
 *     set must be exactly the prefix 1..k — a gap means something was
 *     accepted out of order.
 */
export function assertLedgerConsistent(
  definition: GuideDefinition,
  accepted: readonly AcceptedStepRow[],
): void {
  const orderByKey = new Map<string, number>();
  for (const step of definition.steps) {
    orderByKey.set(step.stepKey, step.order);
  }

  const seen = new Set<string>();
  let maxOrder = 0;
  for (const row of accepted) {
    const catalogOrder = orderByKey.get(row.stepKey);
    if (catalogOrder === undefined) {
      throw new GuideStateError("GUIDE_STATE_STEP_NOT_IN_DEFINITION");
    }
    if (seen.has(row.stepKey)) {
      throw new GuideStateError("GUIDE_STATE_DUPLICATE_STEP");
    }
    seen.add(row.stepKey);
    if (row.order !== catalogOrder) {
      throw new GuideStateError("GUIDE_STATE_ORDER_MISMATCH");
    }
    if (catalogOrder > maxOrder) maxOrder = catalogOrder;
  }
  // Strict sequential prefix: k accepted rows must cover orders 1..k.
  if (seen.size !== maxOrder) {
    throw new GuideStateError("GUIDE_STATE_OUT_OF_ORDER");
  }
}

/**
 * The next step the session expects (first non-accepted by order), or null
 * when every step is accepted. Assumes/validates ledger consistency.
 */
export function nextExpectedStepKey(
  definition: GuideDefinition,
  accepted: readonly AcceptedStepRow[],
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
  accepted: readonly AcceptedStepRow[],
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
  accepted: readonly AcceptedStepRow[],
  status: GuideSessionStatus,
): boolean {
  if (status !== "ACTIVE") return false;
  return nextExpectedStepKey(definition, accepted) === null;
}

/**
 * Derive the V1 public projection EXCLUSIVELY from the ledger:
 *
 *   stepsCompleted = accepted unique stepKeys
 *   totalSteps     = steps of the pinned guideKey@guideVersion
 *   currentStepKey = first non-accepted by order;
 *                    null in COMPLETED/CANCELLED (and in ACTIVE once all
 *                    steps are accepted — awaiting the explicit complete)
 *
 * COMPLETED additionally REQUIRES a full ledger (`stepsCompleted ===
 * totalSteps`) — deriving a COMPLETED projection over an incomplete ledger
 * is an invariant violation, never a value.
 */
export function deriveGuideProjection(
  definition: GuideDefinition,
  accepted: readonly AcceptedStepRow[],
  status: GuideSessionStatus,
): GuideSessionProjection {
  assertLedgerConsistent(definition, accepted);
  const stepsCompleted = new Set(accepted.map((row) => row.stepKey)).size;
  const totalSteps = definition.steps.length;

  if (status === "COMPLETED" && stepsCompleted !== totalSteps) {
    throw new GuideStateError("GUIDE_STATE_INCOMPLETE");
  }

  const currentStepKey =
    status === "ACTIVE" ? nextExpectedStepKey(definition, accepted) : null;

  return { stepsCompleted, totalSteps, currentStepKey };
}
