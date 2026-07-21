/**
 * CC-7.4B — Guide V1 catalog types (ADR 0019 §2, approved via PR #589).
 *
 * The catalog is a CLOSED DISCRIMINATED UNION: every variant couples its
 * `kind` to exactly one `completionPolicy` and exactly one target, so an
 * invalid kind/policy combination is INEXPRESSIBLE by construction — the
 * type system IS the validity matrix. Runtime validation (structural, for
 * objects arriving as `unknown`) lives server-side in
 * `apps/api/src/guide/guide-catalog.ts`; these types are the shared contract.
 *
 * Deliberately absent (ADR 0019):
 *   - `SERVER_ACTION` — deferred out of V1 until a concrete backend
 *     operation exists (SERVER_ACTION_V1=DEFERRED);
 *   - optional steps — `required` is the LITERAL `true`
 *     (GUIDE_V1_OPTIONAL_STEPS_SUPPORTED=false); optional steps would need a
 *     posterior ADR with explicit skip semantics;
 *   - free-form fields — no payload, no Record, no text, no UI copy, no
 *     emotion, no duration.
 */

/** A curated guided intervention, versioned. Published versions are
 * IMMUTABLE: changing a step means publishing a NEW `guideVersion`. */
export interface GuideDefinition {
  guideKey: string;
  guideVersion: number;
  /** Stored in `order` (1..n, contiguous — validated server-side). */
  steps: GuideStepDefinition[];
}

/** V1 base: every step is required (literal type — not configurable). */
export interface GuideStepBase {
  stepKey: string;
  order: number;
  required: true;
}

/**
 * CONCEPT_EXPLORATION — self-report over a catalog Concept. Acceptance means
 * "you marked that you explored this concept"; it never claims comprehension.
 */
export interface GuideConceptStep extends GuideStepBase {
  kind: "CONCEPT_EXPLORATION";
  completionPolicy: "explicit_confirmation";
  conceptKey: string;
}

/**
 * ACTIVE_RECALL — an objective item (Exercise type QUIZ with a declared
 * contract, CC-7.3). Only the dedicated recall command completes it; the
 * SERVER grades `selectedOptionKey` against the canonical answer.
 */
export interface GuideRecallStep extends GuideStepBase {
  kind: "ACTIVE_RECALL";
  completionPolicy: "objective_recall";
  itemKey: string;
}

/**
 * CATALOG_PRACTICE — an exact catalog practice. Acceptance is an explicit
 * self-report (a completed breathing is not server-verifiable, ADR 0017).
 */
export interface GuidePracticeStep extends GuideStepBase {
  kind: "CATALOG_PRACTICE";
  completionPolicy: "catalog_practice_confirmation";
  exerciseKey: string;
}

/**
 * EXPLICIT_CONFIRMATION — the user confirms an action performed outside the
 * system. `confirmationKey` belongs to a CLOSED catalog — never free text,
 * never client-authored.
 */
export interface GuideConfirmationStep extends GuideStepBase {
  kind: "EXPLICIT_CONFIRMATION";
  completionPolicy: "explicit_confirmation";
  confirmationKey: string;
}

export type GuideStepDefinition =
  | GuideConceptStep
  | GuideRecallStep
  | GuidePracticeStep
  | GuideConfirmationStep;

export type GuideStepKind = GuideStepDefinition["kind"];
export type GuideStepCompletionPolicy = GuideStepDefinition["completionPolicy"];

/** Session lifecycle states (ADR 0019 §6). */
export type GuideSessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

/**
 * The V1 public projection — DERIVED exclusively from the accepted-step
 * ledger (`GuideSessionStep`), never from LearningEvents, never from a
 * client counter (ADR 0019 §3):
 *
 *   - `stepsCompleted` — accepted, unique `stepKey`s of the session;
 *   - `totalSteps` — steps of the PINNED `guideKey@guideVersion`;
 *   - `currentStepKey` — first non-accepted step by `order`; `null` when all
 *     steps are accepted and in COMPLETED/CANCELLED.
 */
export interface GuideSessionProjection {
  stepsCompleted: number;
  totalSteps: number;
  currentStepKey: string | null;
}
