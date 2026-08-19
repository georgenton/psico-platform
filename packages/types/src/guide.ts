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
 * GR-5 — the answer to "am I already in the middle of this guide?".
 *
 * A closed two-branch union so the client cannot read a half-populated shape:
 * either there is a recoverable session and `session` is the same public view
 * every command returns, or there is not and `session` is `null`.
 *
 * "Not recoverable" is deliberately one answer for several situations — no
 * active session, an active session pinned to a different guide, a version
 * that left the registry. Distinguishing them would let a caller enumerate
 * what somebody else is doing.
 *
 * This carries the CHECKPOINT, not the panel. The Player derives which scene
 * to open from `currentStepKey`, which is why no scene is ever stored.
 */
export type RecoverableGuideSessionResponse =
  | { recoverable: false; session: null }
  | { recoverable: true; session: GuideSessionView };

/**
 * GR-7 — what a finished experience can be told about itself, after a reload.
 *
 * Counts and verdicts, nothing that identifies a row. The recall entries carry
 * the PUBLIC outcome only: an internal `INCORRECT` surfaces as `REVIEW`,
 * because "there is something here to look at again" is what the reader needs
 * and "you got it wrong" is not the same claim. The chosen option and the
 * correct one are both absent — naming either at the end would undo the point
 * of having asked.
 */
export interface GuideCompletionSummaryView {
  conceptsExplored: number;
  practicesConfirmed: number;
  recalls: Array<{ outcome: GuideRecallOutcome }>;
}

/**
 * GR-7 — where this actor stands in ONE exact experience.
 *
 * The gap this closes: an ACTIVE run survived a reload because
 * `/sessions/recoverable` could see it, and a COMPLETED one did not, so a
 * finished journey read as «Empezar» the next morning. The fix is a read, not
 * a client-side memory — a browser saying "I completed this" is a claim about
 * the ledger that the browser has no standing to make.
 *
 * A CANCELLED session presents as `NOT_STARTED`. Cancellation is the reader
 * withdrawing, and reporting it back is telling them about a decision they
 * already made rather than about where they are.
 */
export type GuideExperienceStateResponse =
  | { state: "NOT_STARTED"; session: null; summary: null }
  | { state: "ACTIVE"; session: GuideSessionView; summary: null }
  | {
      state: "COMPLETED";
      session: GuideSessionView;
      summary: GuideCompletionSummaryView;
    };

/**
 * C.1 — where the reader stands in ONE experience, decided by the server.
 *
 * Three questions used to be one, and collapsing them is what made two
 * experiences in a chapter share a state (#639):
 *
 *   - which guide a NEW run of this experience starts — its published pin;
 *   - whether a run of that LINEAGE is open — `(userId, guideKey)`, whatever
 *     version it was pinned to;
 *   - whether the PUBLISHED pin exactly was finished — completion never
 *     crosses versions, so finishing `A@v1` says nothing about `A@v2`.
 *
 * Precedence, in this order and no other:
 *
 *   1. an ACTIVE session of the same `guideKey` → `CONTINUE`, on that
 *      session's own immutable pin;
 *   2. otherwise a COMPLETED session of the exact published pin → `COMPLETED`;
 *   3. otherwise → `START`, on the published pin.
 *
 * Rule 1 outranks rule 3 deliberately: a reader who left `A@v1` running is
 * offered the run they are in, not a fresh `A@v2` that would strand it.
 */
export type GuideExperienceCardStatus = "START" | "CONTINUE" | "COMPLETED";

export interface GuideExperienceCardState {
  /** The PUBLISHED pin this answer is about — echoed so a batch can be keyed. */
  guidePin: { guideKey: string; guideVersion: number };
  status: GuideExperienceCardStatus;
  /**
   * The session behind the verdict: the open run for `CONTINUE`, the finished
   * one for `COMPLETED`, `null` for `START`. Its pin may differ from
   * `guidePin` — that is the whole point of rule 1.
   */
  session: GuideSessionView | null;
  /**
   * The pin a click should actually run: the session's own pin when there is
   * one to continue, the published pin otherwise. A session is NEVER migrated
   * to another version.
   */
  resumePin: { guideKey: string; guideVersion: number };
}

/**
 * A batch, because a chapter shows a LIST.
 *
 * One request per card would grow with the catalog and would make the list's
 * cost the reader's problem. The response echoes the requested order so the
 * client never has to sort, and repeats an answer for repeated pins rather
 * than deduping silently — two experiences deliberately bound to the same
 * guide DO share their state, and hiding that would fake independence the
 * data does not have.
 */
export interface GuideExperienceCardStatesRequest {
  pins: Array<{ guideKey: string; guideVersion: number }>;
}

export interface GuideExperienceCardStatesResponse {
  items: GuideExperienceCardState[];
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
 * GR-3 — what the person is told after an objective recall.
 *
 * `REVIEW` rather than `INCORRECT` on purpose. The ledger keeps the graded
 * fact (CORRECT/INCORRECT) because that is what was measured; the public
 * vocabulary is an invitation to look again, not a verdict on the reader. No
 * score, no percentage, and never the catalog's correct option.
 */
export type GuideRecallOutcome = "CORRECT" | "REVIEW";

/**
 * The recall command's response — the only one of the five that carries more
 * than the session. The outcome is READ BACK from the accepted ledger row, so
 * a replay of the same command with the same key returns the same outcome by
 * construction rather than by a second grading.
 */
export interface SubmitGuideStepRecallResponse extends GuideCommandResponse {
  feedback: {
    outcome: GuideRecallOutcome;
  };
}

/**
 * CC-7.R1 — the availability decision for a controlled pilot rollout.
 *
 * A single boolean, deliberately opaque: it never reveals WHY it is false (the
 * mode `off|pilot|on`, the pilot allowlist, or whether this actor is on it).
 * The server owns the decision; the client only learns whether the surface is
 * on for it right now.
 */
export interface GuideAvailabilityResponse {
  available: boolean;
}

/**
 * GR-4 — an exact guided-reading pin. `guideKey@guideVersion` is immutable:
 * a session pins its version at start and always resolves against that pair.
 */
export interface GuidePin {
  guideKey: string;
  guideVersion: number;
}

/**
 * GR-4 — the answer to "standing in this chapter, is there a guided reading
 * for me?".
 *
 * A CLOSED union on purpose. The unavailable arm carries NO pin, so a client
 * cannot read a guide key out of a negative answer and start something the
 * server did not offer; the available arm carries the pin and nothing else.
 *
 * Deliberately absent from both arms: the requested context (bookSlug /
 * chapterOrder), any internal id (editionId, unitId, revisionId), the guide's
 * target keys, the rollout mode and the reason a negative answer was negative.
 * The negative is OPAQUE by design — telling a reader WHY would turn this into
 * a way to enumerate the catalog or to learn they sit outside a pilot.
 */
export type GuideDiscoveryResponse =
  | { available: false }
  | {
      available: true;
      guideKey: string;
      guideVersion: number;
    };

/**
 * CC-7.R1 — the rollout gate's only public code. A 503 that says "not on for
 * you right now" and nothing more; it is NOT one of the eight lifecycle codes
 * and never widens them.
 */
export type GuideRolloutErrorCode = "GUIDE_UNAVAILABLE";

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
  | GuideLifecycleErrorCode
  | GuideRolloutErrorCode;
