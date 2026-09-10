/**
 * FeelVerse Círculos — the participation contract (PR3).
 *
 * PR1 declared what an activity IS and who may do what to it. This declares
 * what crosses the network while two people actually do one: the confirmed
 * share, the filtered view each side receives, and the follow-up decision.
 *
 * Three absences carry over from PR1 and are re-asserted by ratchet here:
 *
 *   1. **No private draft.** `CircleShareConfirmation` is a closed union of
 *      exactly THREE answers — `SELECTED_FIELDS`, `EDITED_SUMMARY` and
 *      `KEEP_PRIVATE`. (An earlier version of this comment said four, which
 *      was wrong: `WITHDRAW` is a `CircleSharingMode` a template may OFFER as
 *      an exit, and it is deliberately not a member of this union. Leaving is
 *      not a kind of sharing — it has its own route, and a database
 *      constraint refuses to store it as a `sharingMode`.) The two variants
 *      that carry content carry a SELECTION the person previewed — never a
 *      keystroke, never a draft, and there is no variant that could hold one.
 *   2. **No client-asserted identity.** Nothing in this file has `userId`,
 *      `participantId`, `circleId` or a role. The actor is server-resolved.
 *   3. **No editorial internals.** `contentUnitId` is absent by construction.
 *
 * ── Why the view is one type for two audiences ─────────────────────────────
 *
 * A member and a guest read the same `CircleActivityView`. Two shapes would be
 * two places to forget a filter, and the filter is the product promise: before
 * the reveal, the other person's selection is not merely hidden — the property
 * is ABSENT from the serialized object, so there is no `null` to notice, no key
 * to count and no size to measure.
 */

import type {
  CircleActivityStatus,
  CircleOutcomeKind,
  CircleParticipantStatus,
  CircleSharingMode,
} from "./circles";

// ─── The confirmed share ─────────────────────────────────────────────────────

/**
 * What a person confirms, as a closed discriminated union.
 *
 * `WITHDRAW` is deliberately NOT a member of this union even though it is a
 * `CircleSharingMode`. Withdrawing is not a kind of sharing; it is the command
 * that ends participation, and it has its own route so that "I am leaving" can
 * never be typed into the same field as "here is what I share". A DTO that
 * accepted both would let a validation slip turn one into the other.
 */
export type CircleShareConfirmation =
  | {
      readonly mode: "SELECTED_FIELDS";
      /**
       * The fields the person chose, with the text they previewed. Keys must
       * exist in the template, must not repeat, and must respect its limits.
       */
      readonly fields: readonly CircleConfirmedField[];
    }
  | {
      readonly mode: "EDITED_SUMMARY";
      /** One bounded passage the person wrote and re-read before confirming. */
      readonly summary: string;
    }
  | {
      readonly mode: "KEEP_PRIVATE";
      /**
       * Nothing. Not an empty string, not an empty array — the variant has no
       * payload at all, so there is nowhere for a reason to be smuggled. "I am
       * not sharing this" is an answer, and answers do not owe explanations.
       */
    };

export interface CircleConfirmedField {
  readonly fieldKey: string;
  readonly value: string;
}

/** The modes a confirmation may carry. `WITHDRAW` is not one of them. */
export const CIRCLE_CONFIRMABLE_MODES: readonly CircleSharingMode[] = [
  "SELECTED_FIELDS",
  "EDITED_SUMMARY",
  "KEEP_PRIVATE",
];

/** Bounds the API enforces regardless of what a template asks for. */
export const CIRCLE_SHARE_LIMITS = {
  /** Per field. A template may be stricter; it may not be looser. */
  maxFieldLength: 2000,
  maxSummaryLength: 4000,
  maxFields: 12,
} as const;

// ─── Follow-up ───────────────────────────────────────────────────────────────

export type CircleFollowUpDecision = "KEEP" | "ADJUST" | "CLOSE";

export const CIRCLE_FOLLOW_UP_DECISIONS: readonly CircleFollowUpDecision[] = [
  "KEEP",
  "ADJUST",
  "CLOSE",
];

// ─── The filtered view ───────────────────────────────────────────────────────

/**
 * What the actor knows about the OTHER participant before the reveal.
 *
 * Exactly one bit: have they finished. Not what they chose, not how many
 * fields, not how long it is, not when — `readyAt` would leak the moment
 * somebody confirmed, which in a two-person activity is a message of its own.
 */
export interface CircleCounterpartStatus {
  readonly status: CircleParticipantStatus;
}

/**
 * A revealed snapshot, as the other person confirmed it.
 *
 * Only ever present after the activity is `REVEALED`. `KEEP_PRIVATE` arrives as
 * `sharedNothing: true` and nothing else: the fact that somebody chose not to
 * share is visible — it has to be, or the other person waits forever — and the
 * reason is not, because there is no field for one.
 */
export type CircleRevealedShare =
  | {
      readonly mode: "SELECTED_FIELDS";
      readonly fields: readonly CircleConfirmedField[];
    }
  | { readonly mode: "EDITED_SUMMARY"; readonly summary: string }
  | { readonly mode: "KEEP_PRIVATE"; readonly sharedNothing: true };

export interface CircleArtifactView {
  readonly artifactId: string;
  readonly version: number;
  readonly status: "PROPOSED" | "AGREED" | "SUPERSEDED";
  readonly kind: CircleOutcomeKind;
  readonly body: string;
  /** Whether THIS actor has confirmed this exact artifact and version. */
  readonly confirmedByYou: boolean;
  readonly confirmationCount: number;
}

/**
 * The activity, as one actor may see it.
 *
 * Deliberately absent, at every stage and for every role: `ciphertext`,
 * `nonce`, `keyVersion`, `payloadHash`, `contentUnitId`, any internal id of the
 * other participant, and any counter derived from their content.
 */
export interface CircleActivityView {
  readonly activityId: string;
  readonly status: CircleActivityStatus;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly conversationTurns: readonly string[];
  readonly outcomeKind: CircleOutcomeKind;
  readonly requiredParticipants: number;
  readonly readyCount: number;
  readonly revealedAt: string | null;
  readonly followUpDueAt: string | null;

  /** This actor's own seat. Always present. */
  readonly you: {
    readonly status: CircleParticipantStatus;
    readonly sharingMode: CircleSharingMode | null;
    /** The actor's OWN confirmed selection, readable back before the reveal. */
    readonly confirmed: CircleRevealedShare | null;
    readonly followUpDecision: CircleFollowUpDecision | null;
  };

  /** The other seat, reduced to what may be known at this stage. */
  readonly counterpart: CircleCounterpartStatus;

  /** Present only once `REVEALED`, and only for participants still in it. */
  readonly revealed: {
    readonly counterpart: CircleRevealedShare;
  } | null;

  readonly artifact: CircleArtifactView | null;
}

/**
 * Keys that must never appear in a serialized `CircleActivityView`, at any
 * stage. Exported so the ratchet and the projection cannot drift apart: the
 * test walks the response and this list says what it is walking for.
 */
export const CIRCLE_VIEW_FORBIDDEN_KEYS: readonly string[] = [
  "ciphertext",
  "nonce",
  "keyVersion",
  "payloadHash",
  "contentUnitId",
  "memberId",
  "invitationId",
  "participantId",
  "userId",
  "tokenHash",
  "codeHash",
  "readyAt",
];
