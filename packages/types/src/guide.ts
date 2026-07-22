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

// ─── CC-7.4D — the PUBLIC HTTP contracts of the five Guide commands ──────────

/**
 * Every Guide request body is CLOSED and minimal. What the client may say is
 * exactly: which command (the route), which idempotency key, which guide
 * version (START only) and which option it chose (recall only).
 *
 * `GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS` /
 * `CLIENT_EDITORIAL_CONTEXT_ALLOWED=false`: editorial context, step kind,
 * completion policy, target keys, order, grading and progress counters are all
 * derived by the SERVER from the pinned `guideKey@guideVersion`. The actor is
 * always the authenticated JWT user — no body ever carries a `userId`.
 */

/** POST /api/guide/sessions */
export interface StartGuideSessionRequestBody {
  idempotencyKey: string;
  guideKey: string;
  /** EXACT version — the surface never resolves a "latest". */
  guideVersion: number;
}

/**
 * POST /api/guide/sessions/:sessionId/steps/:stepKey/complete
 *
 * `sessionId` and `stepKey` travel ONLY as route parameters, never in the body.
 */
export interface CompleteGuideSessionStepRequestBody {
  idempotencyKey: string;
}

/**
 * POST /api/guide/sessions/:sessionId/steps/:stepKey/recall
 *
 * The chosen option and nothing else: `itemKey` comes from the pinned step and
 * `result`/`evaluationSource` are graded by the server. The catalog's correct
 * option is never accepted and never returned.
 */
export interface SubmitGuideStepRecallRequestBody {
  idempotencyKey: string;
  selectedOptionKey: string;
}

/** POST /api/guide/sessions/:sessionId/cancel */
export interface CancelGuideSessionRequestBody {
  idempotencyKey: string;
}

/** POST /api/guide/sessions/:sessionId/complete */
export interface CompleteGuideSessionRequestBody {
  idempotencyKey: string;
}

/**
 * The ONLY session shape a client ever sees. Deliberately excludes every
 * internal anchor and every trace of how progress was decided: editionId,
 * unitId, bookId, revisionId, timestamps, the ledger, receipts, events, the
 * other steps' target keys, the chosen option, the recall result and the
 * catalog's correct option.
 */
export interface GuideSessionView {
  sessionId: string;
  guideKey: string;
  guideVersion: number;
  status: GuideSessionStatus;
  stepsCompleted: number;
  totalSteps: number;
  currentStepKey: string | null;
}

/**
 * The response of all five commands. `created` means this call applied the
 * transition (HTTP 201); `replayed` means an identical prior command already
 * did and nothing ran now (HTTP 200).
 */
export interface GuideCommandResponse {
  created: boolean;
  replayed: boolean;
  session: GuideSessionView;
}

/**
 * Request-shape rejections. These are PARSING failures, a different category
 * from the eight lifecycle codes — a body that never reached the lifecycle.
 */
export type GuideRequestValidationCode =
  | "GUIDE_INVALID_PAYLOAD"
  | "GUIDE_IDEMPOTENCY_KEY_REQUIRED";

/** The eight closed lifecycle codes (ADR 0019) as the wire sees them. */
export type GuideLifecycleErrorCode =
  | "GUIDE_SESSION_NOT_FOUND"
  | "GUIDE_SESSION_INVALID_TRANSITION"
  | "GUIDE_STEP_NOT_CURRENT"
  | "GUIDE_STEP_COMMAND_MISMATCH"
  | "GUIDE_CONTEXT_UNRESOLVED"
  | "GUIDE_CONTEXT_MISMATCH"
  | "GUIDE_FORBIDDEN"
  | "GUIDE_STORAGE_FAILURE";

/** Every code a Guide route can return. */
export type GuideApiErrorCode =
  | GuideRequestValidationCode
  | GuideLifecycleErrorCode;
