/**
 * FeelVerse Círculos — the shared contract. Types only; no runtime, no I/O.
 *
 * This module is the CONTRACT half of the Circles program (PR1 of the train
 * described in `docs/architecture/circles-v1.md`). It declares what a shared
 * activity IS, who may do what to it, and which state transitions exist. It
 * deliberately contains no Prisma model, no HTTP client, no service and no
 * side effect: every later cut has to conform to what is written here, and a
 * contract that can already talk to a database is not a contract.
 *
 * ── Three things this file is built to make impossible ─────────────────────
 *
 * 1. **A private draft reaching the server.** There is no field anywhere in
 *    this contract for the text a person writes while preparing. `privatePreparation`
 *    describes the FORM a client renders locally — field keys, labels, kinds
 *    and limits — and never carries an answer. What crosses the network is a
 *    deliberately confirmed snapshot, and that shape lives in the domain
 *    (PR3), not here. A ratchet spec asserts no `draftText`-shaped key exists.
 *
 * 2. **A client asserting who it is.** `CircleActor` is server-owned: it is
 *    built from a JWT or from an opaque guest session, never from a request
 *    body. No DTO in this contract accepts `userId`, `participantId` or a role.
 *
 * 3. **Editorial internals crossing the wire.** `source` names a book and a
 *    chapter the way an editor would; `contentUnitId` — Content Core's internal
 *    identity — is absent by construction and asserted absent by test.
 *
 * ── Multi-participant domain, Dúo-only surface ─────────────────────────────
 *
 * `participants` carries min/max/required rather than assuming two, because
 * the domain is Circles and Dúo is its first configuration (ADR-CIR-001). What
 * keeps Familia and groups out of v1 is the `audience` enum having exactly one
 * value and the validator pinning DUO_ADULT to 2/2/2 — not a reshaped schema
 * later.
 */

// ─── Actor ───────────────────────────────────────────────────────────────────

/**
 * Who is acting, as resolved BY THE SERVER.
 *
 * A guest is not a lightweight member: their identity is bound to one activity
 * and one participant row, so an authorization bug cannot widen a guest into
 * "someone with access to the circle". The activity id is part of the actor
 * precisely so that every guest read is scoped by construction rather than by
 * remembering to filter.
 */
export type CircleActor =
  | { readonly kind: "USER"; readonly userId: string }
  | {
      readonly kind: "GUEST";
      readonly guestSessionId: string;
      readonly activityId: string;
      readonly participantId: string;
    };

/** The role a permission question is asked about. */
export type CircleRole =
  /** The authenticated member who created the circle. */
  | "ORGANIZER"
  /** An authenticated member who is not the organizer. */
  | "MEMBER"
  /** Someone participating through an invitation, without an account. */
  | "GUEST"
  /** A global platform admin or the billing payer. Never a content role. */
  | "ADMIN";

export const CIRCLE_ROLES: readonly CircleRole[] = [
  "ORGANIZER",
  "MEMBER",
  "GUEST",
  "ADMIN",
];

// ─── Circle and activity states ──────────────────────────────────────────────

export type CircleKind = "DUO";

export type CircleStatus = "ACTIVE" | "CLOSED";

/**
 * The activity lifecycle.
 *
 * `PREPARING` means the activity is open for participation. It does NOT mean
 * the server holds a draft — preparation is local and the server learns
 * nothing until a snapshot is confirmed (ADR-CIR-004).
 */
export type CircleActivityStatus =
  | "INVITING"
  | "PREPARING"
  | "REVEALED"
  | "FOLLOW_UP"
  | "CLOSED"
  | "CANCELLED";

export const CIRCLE_ACTIVITY_STATUSES: readonly CircleActivityStatus[] = [
  "INVITING",
  "PREPARING",
  "REVEALED",
  "FOLLOW_UP",
  "CLOSED",
  "CANCELLED",
];

/** States an activity can never leave. */
export const CIRCLE_ACTIVITY_TERMINAL_STATUSES: readonly CircleActivityStatus[] =
  ["CLOSED", "CANCELLED"];

export type CircleParticipantStatus =
  | "INVITED"
  | "ACCEPTED"
  | "READY"
  | "WITHDRAWN"
  | "DECLINED";

export const CIRCLE_PARTICIPANT_STATUSES: readonly CircleParticipantStatus[] = [
  "INVITED",
  "ACCEPTED",
  "READY",
  "WITHDRAWN",
  "DECLINED",
];

export const CIRCLE_PARTICIPANT_TERMINAL_STATUSES: readonly CircleParticipantStatus[] =
  ["WITHDRAWN", "DECLINED"];

/**
 * The commands that move an activity. Named after what a person does, not
 * after the row that changes, so an unauthorised command is refused by the
 * same vocabulary the product uses.
 */
export type CircleCommand =
  | "ACCEPT_INVITATION"
  | "DECLINE_INVITATION"
  | "CONFIRM_SHARE"
  | "WITHDRAW"
  | "PROPOSE_ARTIFACT"
  | "CONFIRM_ARTIFACT"
  | "RECORD_FOLLOW_UP"
  | "CLOSE_ACTIVITY";

/** One declared edge of the activity state machine. */
export interface CircleActivityTransition {
  readonly from: CircleActivityStatus;
  readonly to: CircleActivityStatus;
  /**
   * What causes it. `SYSTEM` edges are time or barrier driven: the reveal
   * barrier and the follow-up due date are server decisions, not commands
   * anybody can send.
   */
  readonly trigger: CircleCommand | "SYSTEM";
  readonly note: string;
}

/**
 * The activity state machine, declared exhaustively.
 *
 * An edge that is not here does not exist. The two that matter most are the
 * ones NOT present: there is no edge out of `CLOSED` or `CANCELLED`, so a
 * cancelled Dúo can never be resurrected into a revealed one.
 */
export const CIRCLE_ACTIVITY_TRANSITIONS: readonly CircleActivityTransition[] =
  [
    {
      from: "INVITING",
      to: "PREPARING",
      trigger: "ACCEPT_INVITATION",
      note: "The counterpart accepted; both may now prepare locally.",
    },
    {
      from: "INVITING",
      to: "CANCELLED",
      trigger: "DECLINE_INVITATION",
      note: "Declining is private: the organizer learns the outcome, never a reason.",
    },
    {
      from: "INVITING",
      to: "CANCELLED",
      trigger: "WITHDRAW",
      note: "The organizer retracts a pending invitation. Terminal, silent, and it reveals nothing — the counterpart is never told a reason and never owes one.",
    },
    {
      from: "INVITING",
      to: "CANCELLED",
      trigger: "SYSTEM",
      note: "The invitation expired without being accepted.",
    },
    {
      from: "PREPARING",
      to: "REVEALED",
      trigger: "SYSTEM",
      note: "The reveal barrier: every required participant reached READY in one transaction.",
    },
    {
      from: "PREPARING",
      to: "CANCELLED",
      trigger: "WITHDRAW",
      note: "Withdrawing before reveal cancels the Dúo and destroys pending envelopes.",
    },
    {
      from: "REVEALED",
      to: "FOLLOW_UP",
      trigger: "SYSTEM",
      note: "The follow-up date arrived.",
    },
    {
      from: "REVEALED",
      to: "CLOSED",
      trigger: "CLOSE_ACTIVITY",
      note: "Voluntary close, with or without an agreed artifact.",
    },
    {
      from: "REVEALED",
      to: "CLOSED",
      trigger: "WITHDRAW",
      note: "Leaving after reveal revokes future access; it cannot unsee what was seen.",
    },
    {
      from: "FOLLOW_UP",
      to: "CLOSED",
      trigger: "RECORD_FOLLOW_UP",
      note: "Keep, adjust or close — all three end the activity in v1.",
    },
    {
      from: "FOLLOW_UP",
      to: "CLOSED",
      trigger: "CLOSE_ACTIVITY",
      note: "Closing without recording a decision.",
    },
  ];

/** One declared edge of the participant state machine. */
export interface CircleParticipantTransition {
  readonly from: CircleParticipantStatus;
  readonly to: CircleParticipantStatus;
  readonly trigger: CircleCommand;
  readonly note: string;
}

export const CIRCLE_PARTICIPANT_TRANSITIONS: readonly CircleParticipantTransition[] =
  [
    {
      from: "INVITED",
      to: "ACCEPTED",
      trigger: "ACCEPT_INVITATION",
      note: "Acceptance is an explicit, separate command from opening the link.",
    },
    {
      from: "INVITED",
      to: "DECLINED",
      trigger: "DECLINE_INVITATION",
      note: "Declining never carries a reason to the other participant.",
    },
    {
      from: "ACCEPTED",
      to: "READY",
      trigger: "CONFIRM_SHARE",
      note: "The one command that puts content on the server, after an exact preview.",
    },
    {
      from: "ACCEPTED",
      to: "WITHDRAWN",
      trigger: "WITHDRAW",
      note: "Leaving before sharing anything.",
    },
    {
      from: "READY",
      to: "WITHDRAWN",
      trigger: "WITHDRAW",
      note: "Before reveal this destroys the pending envelope; after reveal it revokes future access.",
    },
  ];

// ─── Permission matrix ───────────────────────────────────────────────────────

/**
 * Everything a role can be asked about. Kept as a closed list so a new
 * capability cannot be added to the product without landing in this matrix and
 * in its test.
 */
export type CircleCapability =
  | "CREATE_DUO"
  | "INVITE"
  | "VIEW_TEMPLATE_PREVIEW"
  | "ACCEPT_OR_DECLINE"
  | "PRIVATE_PREPARATION"
  | "CONFIRM_OWN_SELECTION"
  | "VIEW_OTHERS_SELECTION_BEFORE_REVEAL"
  | "VIEW_REVEALED_CONTENT"
  | "PROPOSE_ARTIFACT"
  | "CONFIRM_ARTIFACT"
  | "CLOSE_OR_WITHDRAW"
  | "VIEW_OTHERS_PERSONAL_SURFACES";

export const CIRCLE_CAPABILITIES: readonly CircleCapability[] = [
  "CREATE_DUO",
  "INVITE",
  "VIEW_TEMPLATE_PREVIEW",
  "ACCEPT_OR_DECLINE",
  "PRIVATE_PREPARATION",
  "CONFIRM_OWN_SELECTION",
  "VIEW_OTHERS_SELECTION_BEFORE_REVEAL",
  "VIEW_REVEALED_CONTENT",
  "PROPOSE_ARTIFACT",
  "CONFIRM_ARTIFACT",
  "CLOSE_OR_WITHDRAW",
  "VIEW_OTHERS_PERSONAL_SURFACES",
];

/**
 * The answer to "may this role do this".
 *
 * `DENIED` and `NEVER` both mean no, and the distinction is the point:
 * `DENIED` is a policy decision that a later version could revisit, while
 * `NEVER` is a property the product must not have at any version. A test pins
 * which capabilities are `NEVER`, so relaxing one becomes a visible edit to
 * this file rather than a quiet change in a service.
 */
export type CirclePermission =
  /** Allowed. */
  | "ALLOWED"
  /** Allowed strictly inside the one activity the actor belongs to. */
  | "ALLOWED_OWN_ACTIVITY"
  /** Not allowed in v1; a future policy could revisit it. */
  | "DENIED"
  /** Must never be allowed, at any version. */
  | "NEVER"
  /** Happens on the device. The server neither receives nor stores it. */
  | "LOCAL_ONLY";

/** Whether a permission lets a request through. Only the two ALLOWED do. */
export function permits(permission: CirclePermission): boolean {
  return permission === "ALLOWED" || permission === "ALLOWED_OWN_ACTIVITY";
}

export type CirclePermissionMatrix = Readonly<
  Record<CircleRole, Readonly<Record<CircleCapability, CirclePermission>>>
>;

/**
 * Who may do what — the executable form of the table in
 * `docs/architecture/circles-v1.md` §7.
 *
 * Two rows deserve reading twice:
 *
 *   - `VIEW_OTHERS_SELECTION_BEFORE_REVEAL` is `NEVER` for EVERY role,
 *     organizer and admin included. The reveal barrier is not an access-control
 *     rule that a privileged actor can step around; before it opens, that
 *     content has no reader.
 *   - `VIEW_OTHERS_PERSONAL_SURFACES` is `NEVER` for every role. Joining a
 *     circle, organizing one or paying for the platform grants exactly nothing
 *     in Diario, Eco personal, Mapa or Patrones.
 *
 * ADMIN is present so the answer is written down rather than assumed. A global
 * admin has no content capability here at all: the only thing it may do is
 * look at a public template preview, which is public anyway.
 */
export const CIRCLE_PERMISSION_MATRIX: CirclePermissionMatrix = {
  ORGANIZER: {
    CREATE_DUO: "ALLOWED",
    INVITE: "ALLOWED",
    VIEW_TEMPLATE_PREVIEW: "ALLOWED",
    // The organizer's own acceptance is implicit in creating the circle.
    ACCEPT_OR_DECLINE: "DENIED",
    PRIVATE_PREPARATION: "LOCAL_ONLY",
    CONFIRM_OWN_SELECTION: "ALLOWED",
    VIEW_OTHERS_SELECTION_BEFORE_REVEAL: "NEVER",
    VIEW_REVEALED_CONTENT: "ALLOWED",
    PROPOSE_ARTIFACT: "ALLOWED",
    CONFIRM_ARTIFACT: "ALLOWED",
    CLOSE_OR_WITHDRAW: "ALLOWED",
    VIEW_OTHERS_PERSONAL_SURFACES: "NEVER",
  },
  MEMBER: {
    CREATE_DUO: "DENIED",
    // Whether a non-organizer member may invite is a future policy question.
    INVITE: "DENIED",
    VIEW_TEMPLATE_PREVIEW: "ALLOWED",
    ACCEPT_OR_DECLINE: "ALLOWED",
    PRIVATE_PREPARATION: "LOCAL_ONLY",
    CONFIRM_OWN_SELECTION: "ALLOWED",
    VIEW_OTHERS_SELECTION_BEFORE_REVEAL: "NEVER",
    VIEW_REVEALED_CONTENT: "ALLOWED",
    PROPOSE_ARTIFACT: "ALLOWED",
    CONFIRM_ARTIFACT: "ALLOWED",
    CLOSE_OR_WITHDRAW: "ALLOWED",
    VIEW_OTHERS_PERSONAL_SURFACES: "NEVER",
  },
  GUEST: {
    CREATE_DUO: "DENIED",
    INVITE: "DENIED",
    VIEW_TEMPLATE_PREVIEW: "ALLOWED",
    ACCEPT_OR_DECLINE: "ALLOWED_OWN_ACTIVITY",
    PRIVATE_PREPARATION: "LOCAL_ONLY",
    CONFIRM_OWN_SELECTION: "ALLOWED_OWN_ACTIVITY",
    VIEW_OTHERS_SELECTION_BEFORE_REVEAL: "NEVER",
    VIEW_REVEALED_CONTENT: "ALLOWED_OWN_ACTIVITY",
    PROPOSE_ARTIFACT: "ALLOWED_OWN_ACTIVITY",
    CONFIRM_ARTIFACT: "ALLOWED_OWN_ACTIVITY",
    CLOSE_OR_WITHDRAW: "ALLOWED_OWN_ACTIVITY",
    VIEW_OTHERS_PERSONAL_SURFACES: "NEVER",
  },
  ADMIN: {
    CREATE_DUO: "DENIED",
    INVITE: "DENIED",
    // Only as a member of the public: the preview carries no circle state.
    VIEW_TEMPLATE_PREVIEW: "ALLOWED",
    ACCEPT_OR_DECLINE: "DENIED",
    PRIVATE_PREPARATION: "NEVER",
    CONFIRM_OWN_SELECTION: "NEVER",
    VIEW_OTHERS_SELECTION_BEFORE_REVEAL: "NEVER",
    VIEW_REVEALED_CONTENT: "NEVER",
    PROPOSE_ARTIFACT: "NEVER",
    CONFIRM_ARTIFACT: "NEVER",
    CLOSE_OR_WITHDRAW: "DENIED",
    VIEW_OTHERS_PERSONAL_SURFACES: "NEVER",
  },
};

/**
 * Capabilities that must read `NEVER` for every role, forever.
 *
 * This is the shortest statement of what Círculos promises. A change to this
 * list is a change to the product's contract with the people using it, and it
 * fails a test rather than passing review unnoticed.
 */
export const CIRCLE_NEVER_CAPABILITIES: readonly CircleCapability[] = [
  "VIEW_OTHERS_SELECTION_BEFORE_REVEAL",
  "VIEW_OTHERS_PERSONAL_SURFACES",
];

// ─── Activity template contract ──────────────────────────────────────────────

export type CircleTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** The only audience v1 enables. Familia and groups are schema-ready, not exposed. */
export type CircleAudience = "DUO_ADULT";

export type CirclePreparationFieldKind = "SHORT_TEXT" | "LONG_TEXT" | "CHOICE";

/**
 * One field of the LOCAL preparation form.
 *
 * This describes what a client renders. It never carries an answer, and there
 * is deliberately no sibling type that does: what the server receives is a
 * confirmed snapshot, defined by the domain in a later cut.
 */
export interface CirclePreparationField {
  readonly fieldKey: string;
  readonly label: string;
  readonly kind: CirclePreparationFieldKind;
  readonly maxLength?: number;
}

/**
 * How a person may answer the question "what, if anything, do I share?".
 *
 * `KEEP_PRIVATE` and `WITHDRAW` are not failure modes; they are answers. The
 * validator requires every template to offer at least one of them, so no
 * activity can be authored in which the only way out is to share.
 */
export type CircleSharingMode =
  | "SELECTED_FIELDS"
  | "EDITED_SUMMARY"
  | "KEEP_PRIVATE"
  | "WITHDRAW";

export const CIRCLE_SHARING_MODES: readonly CircleSharingMode[] = [
  "SELECTED_FIELDS",
  "EDITED_SUMMARY",
  "KEEP_PRIVATE",
  "WITHDRAW",
];

/** Modes that mean "I am not putting my preparation on the table". */
export const CIRCLE_OPT_OUT_SHARING_MODES: readonly CircleSharingMode[] = [
  "KEEP_PRIVATE",
  "WITHDRAW",
];

export type CircleOutcomeKind =
  | "AGREEMENT"
  | "REQUEST"
  | "RECOGNITION"
  | "NONE";

export type CircleSafetyLevel = "LOW" | "REINFORCED";

/** What Eco may do with this activity. `SHARED_ONLY` still requires consent. */
export type CircleEcoMode = "NONE" | "SHARED_ONLY";

/**
 * Where an activity comes from editorially.
 *
 * A book slug and a printed chapter order — what an editor can verify by
 * reading. `contentUnitId` is Content Core's internal identity and is resolved
 * SERVER-SIDE; it is absent from this contract by construction and asserted
 * absent by test, because an internal id on the wire is an id somebody can
 * probe.
 */
export interface CircleTemplateSource {
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly experiencePin?: {
    readonly experienceKey: string;
    readonly experienceVersion: number;
  };
}

export interface CircleActivityDefinition {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly status: CircleTemplateStatus;
  readonly audience: CircleAudience;
  readonly title: string;
  readonly summary: string;
  readonly estimatedMinutes: number;
  readonly source: CircleTemplateSource;
  readonly participants: {
    readonly min: number;
    readonly max: number;
    readonly required: number;
  };
  readonly privatePreparation: readonly CirclePreparationField[];
  readonly sharing: { readonly allowedModes: readonly CircleSharingMode[] };
  /** `ALL_CONFIRMED` is the only strategy v1 accepts — see ADR-CIR-005. */
  readonly reveal: { readonly strategy: "ALL_CONFIRMED" };
  readonly conversation: { readonly turns: readonly string[] };
  readonly outcome: { readonly kind: CircleOutcomeKind };
  readonly followUp?: { readonly afterHours: number };
  readonly safety: {
    readonly level: CircleSafetyLevel;
    readonly privateGateRequired: boolean;
    readonly doNotSuggestWhen: readonly string[];
  };
  readonly ecoMode: CircleEcoMode;
}

/**
 * The public preview of a template.
 *
 * What `/actividades/[templateKey]` may show: enough to decide whether to do
 * this with someone, and nothing about any instance. No roster, no state, no
 * participant, no activity id, no editorial internals. The type exists so the
 * absence is checkable rather than a habit.
 */
export interface CircleTemplatePreview {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly estimatedMinutes: number;
  readonly audience: CircleAudience;
  readonly participants: { readonly required: number };
  readonly outcomeKind: CircleOutcomeKind;
  readonly safetyLevel: CircleSafetyLevel;
  /** The turns a reader can see before deciding. Copy, never answers. */
  readonly conversationTurns: readonly string[];
}

/**
 * The projector lives in `circles-catalog.ts`, next to the refusal it raises.
 *
 * `toCircleTemplatePreview` does not merely narrow a definition: it enforces
 * that only a PUBLISHED template can be shown to the public, and it throws
 * `CIRCLE_CATALOG_NOT_PUBLISHED` otherwise. That makes it part of the catalog
 * boundary rather than a shape helper, and it keeps this module free of the
 * error class — which would otherwise import back from the catalog and close a
 * cycle.
 */
