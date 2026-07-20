/**
 * Learning Events V1 — shared contracts (CC-7.1).
 *
 * Source of truth: docs/architecture/learning-events.md + ADR 0017.
 *
 * Clients invoke DOMAIN COMMANDS (route + closed body); they never post "an
 * event". The persisted event is an internal effect of a server-side
 * transition, and every persisted payload is reconstructed by the server —
 * no client field reaches storage without a whitelist. There is deliberately
 * NO generic learning-event request contract and NO free-form field anywhere
 * in this file: every string is a catalog key or an enum member.
 */

// ─── Event vocabulary ────────────────────────────────────────────────────────

export type LearningEventTypeV1 =
  | "unit_opened"
  | "unit_completed"
  | "concept_explored"
  | "guide_session_started"
  | "guide_session_completed"
  | "active_recall_attempted"
  | "practice_completed";

export const RECALL_RESULTS = ["correct", "incorrect", "skipped"] as const;
export type RecallResult = (typeof RECALL_RESULTS)[number];

/** Who established the recall result. Server-graded items always "server". */
export type RecallEvaluationSource = "server" | "self_assessed";

// ─── Request bodies (public HTTP wire — closed, idempotencyKey mandatory) ────
//
// Route params (unitKey / conceptKey / exerciseKey / guide session id) travel
// in the URL, never duplicated into the body: the body carries only what the
// route cannot express.

export interface OpenUnitRequestBody {
  idempotencyKey: string;
}

export interface CompleteUnitRequestBody {
  idempotencyKey: string;
}

export interface ExploreConceptRequestBody {
  idempotencyKey: string;
}

/**
 * Exclusive union: an objective attempt carries the chosen option key (the
 * SERVER grades it against the catalog); a self-assessed attempt carries the
 * user's categorical enum. Never both, never neither, and the client can
 * never send `result` or `evaluationSource` — those are server-owned.
 */
export type SubmitRecallAttemptRequestBody =
  | {
      idempotencyKey: string;
      itemKey: string;
      selectedOptionKey: string;
      selfResult?: never;
    }
  | {
      idempotencyKey: string;
      itemKey: string;
      selfResult: RecallResult;
      selectedOptionKey?: never;
    };

export interface CompletePracticeRequestBody {
  idempotencyKey: string;
}

/**
 * Editorial context is all-or-nothing: either the session starts without an
 * anchor, or it anchors a published unit (editionKey AND unitKey together).
 * A partial context is invalid.
 */
export type CreateGuideSessionRequestBody =
  | {
      idempotencyKey: string;
      editionKey?: never;
      unitKey?: never;
    }
  | {
      idempotencyKey: string;
      editionKey: string;
      unitKey: string;
    };

/** `stepsCompleted` is counted by the server from session state — never sent. */
export interface CompleteGuideSessionRequestBody {
  idempotencyKey: string;
}

// ─── Domain commands (route params + body, merged by the pure parsers) ───────

export interface OpenUnitCommand {
  idempotencyKey: string;
  unitKey: string;
}

export interface CompleteUnitCommand {
  idempotencyKey: string;
  unitKey: string;
}

export interface ExploreConceptCommand {
  idempotencyKey: string;
  conceptKey: string;
}

export type SubmitRecallAttemptCommand =
  | {
      idempotencyKey: string;
      itemKey: string;
      kind: "objective";
      selectedOptionKey: string;
    }
  | {
      idempotencyKey: string;
      itemKey: string;
      kind: "self_assessed";
      selfResult: RecallResult;
    };

export interface CompletePracticeCommand {
  idempotencyKey: string;
  exerciseKey: string;
}

export type CreateGuideSessionCommand =
  | {
      idempotencyKey: string;
      context: null;
    }
  | {
      idempotencyKey: string;
      context: { editionKey: string; unitKey: string };
    };

export interface CompleteGuideSessionCommand {
  idempotencyKey: string;
  guideSessionId: string;
}

// ─── Persisted payloads (server-constructed — never read from the wire) ──────

export interface UnitOpenedPayload {
  editionKey: string;
  unitKey: string;
}

export interface UnitCompletedPayload {
  editionKey: string;
  unitKey: string;
  /** The published revision the completion transition ran against. */
  revisionNumber: number;
}

export interface ConceptExploredPayload {
  conceptKey: string;
  /** Resolved by the server from the concept catalog — never client-declared. */
  unitKey: string;
}

export interface GuideSessionStartedPayload {
  guideSessionId: string;
}

export interface GuideSessionCompletedPayload {
  guideSessionId: string;
  /** Counted by the server from session state — never client-declared. */
  stepsCompleted: number;
}

/**
 * CC-7.3 — discriminated by `evaluationSource` so the persisted event keeps
 * the FULL semantics of the attempt:
 *   - server-graded (objective): the CHOSEN option is preserved. Two attempts
 *     with different options are different events even when they derive the
 *     same result — reusing an idempotencyKey across them is a conflict.
 *   - self-assessed: never fakes an option (`selectedOptionKey: null`).
 * The client can never send `result`/`evaluationSource`, and the catalog's
 * correct option is never exposed here.
 */
export type ActiveRecallAttemptedPayload =
  | {
      /** Resolved by the server from the item catalog. */
      unitKey: string;
      itemKey: string;
      /** From the item catalog, or null when the item has no concept binding. */
      conceptKey: string | null;
      evaluationSource: "server";
      selectedOptionKey: string;
      /** Graded by the server against the catalog's canonical answer. */
      result: "correct" | "incorrect";
    }
  | {
      unitKey: string;
      itemKey: string;
      conceptKey: string | null;
      evaluationSource: "self_assessed";
      selectedOptionKey: null;
      /** The user's own categorical assessment (never a server claim). */
      result: RecallResult;
    };

export interface PracticeCompletedPayload {
  exerciseKey: string;
  /** Resolved by the server from the exercise catalog — never client-declared. */
  unitKey: string;
}

/**
 * Exhaustive type→payload map. The typechecker enforces exact coverage of the
 * seven V1 types: adding an event type without its payload (or vice versa)
 * fails to compile, and `LearningEventRecord` below derives its discriminated
 * union from this single source.
 */
export interface LearningEventPayloadByType {
  unit_opened: UnitOpenedPayload;
  unit_completed: UnitCompletedPayload;
  concept_explored: ConceptExploredPayload;
  guide_session_started: GuideSessionStartedPayload;
  guide_session_completed: GuideSessionCompletedPayload;
  active_recall_attempted: ActiveRecallAttemptedPayload;
  practice_completed: PracticeCompletedPayload;
}

export type LearningEventPayload =
  LearningEventPayloadByType[LearningEventTypeV1];

// ─── Public record (what the API returns — the actor is the JWT, never here) ─

interface LearningEventRecordBase {
  id: string;
  schemaVersion: 1;
  /** Server clock, ISO-8601. Clients cannot date events. */
  occurredAt: string;
  editionId: string | null;
  unitId: string | null;
  conceptId: string | null;
  guideSessionId: string | null;
}

/**
 * Discriminated union coupling `type` to its exact payload: a
 * `unit_opened` record can only carry a `UnitOpenedPayload`, and narrowing on
 * `record.type` narrows `record.payload` accordingly.
 */
export type LearningEventRecord<
  T extends LearningEventTypeV1 = LearningEventTypeV1,
> = {
  [K in T]: LearningEventRecordBase & {
    type: K;
    payload: LearningEventPayloadByType[K];
  };
}[T];

// ─── Error codes (closed union; CC-7.1 only produces the two pure ones) ──────

export type LearningEventErrorCode =
  | "LEARNING_EVENT_INVALID_PAYLOAD"
  | "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED"
  | "LEARNING_EVENT_IDEMPOTENCY_CONFLICT"
  | "LEARNING_EVENT_SERVER_OWNED_TYPE"
  | "LEARNING_EVENT_INVALID_TRANSITION"
  | "LEARNING_EVENT_UNKNOWN_UNIT"
  | "LEARNING_EVENT_UNKNOWN_CONCEPT"
  | "LEARNING_EVENT_UNKNOWN_ITEM"
  | "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT"
  | "LEARNING_EVENT_FORBIDDEN"
  | "GUIDE_SESSION_NOT_FOUND"
  | "GUIDE_SESSION_ALREADY_COMPLETED";

/** The subset a pure parser can produce (no IO, no transitions in CC-7.1). */
export type LearningCommandValidationCode =
  | "LEARNING_EVENT_INVALID_PAYLOAD"
  | "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED";

// ─── CC-7.3 · HTTP responses (commands + derived progress) ──────────────────

/**
 * Every domain command returns the same closed shape. `created` ⇒ HTTP 201;
 * an exact idempotent replay ⇒ HTTP 200 with the ORIGINAL event.
 */
export interface LearningCommandResponse {
  created: boolean;
  replayed: boolean;
  event: LearningEventRecord;
}

/** Completion dominates opened; multiple opens collapse to one `opened`. */
export type LearningUnitProgressState = "not_started" | "opened" | "completed";

export interface LearningUnitProgressItem {
  unitKey: string;
  state: LearningUnitProgressState;
  /** Server clock of the FIRST unit_opened, ISO-8601. Null when never opened. */
  openedAt: string | null;
  /** Server clock of the unit_completed transition. Null when not completed. */
  completedAt: string | null;
  /** The published revision the completion ran against. Null when not completed. */
  completedRevisionNumber: number | null;
}

/**
 * Derived EXCLUSIVELY from V1 LearningEvents (schemaVersion=1) over the
 * published revision's ordered units. Units the caller cannot access are
 * excluded entirely — absent from the list AND the counts, never leaked.
 */
export interface LearningProgressResponse {
  bookSlug: string;
  editionKey: string;
  revisionNumber: number;
  units: LearningUnitProgressItem[];
  openedCount: number;
  completedCount: number;
  totalCount: number;
}
