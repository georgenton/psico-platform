import type {
  CircleActivityDefinition,
  CircleActivityView,
  CircleFollowUpDecision,
  CircleParticipantStatus,
  CircleRevealedShare,
  CircleSharingMode,
} from "@psico/types";
import type { CircleActivityRow } from "./circle-activity.repository";
import type { CircleParticipantRow } from "./circle-participant.repository";
import { parseShareBody } from "./circles-share";

/**
 * The one projection both audiences read (PR3 · spec §I).
 *
 * A member and a guest get the same function. Two projections would be two
 * places to forget a filter, and the filter is the product's central promise:
 * before the reveal, the other person's selection is not hidden behind a flag —
 * it is ABSENT from the object, so there is no `null` to notice, no key to
 * count and no length to measure.
 *
 * ── Why absence and not `null` ─────────────────────────────────────────────
 *
 * `{ counterpartShare: null }` tells a reader that a counterpart share exists
 * as a concept, that this response is the version without it, and — if the
 * shape ever grows a sibling field — roughly how much there is. None of that is
 * information the other person consented to give. `revealed` is either an
 * object or `null` as a whole; the fields inside it never appear before there
 * is something to put in them.
 *
 * ── What never appears, at any stage, for any role ─────────────────────────
 *
 * `ciphertext`, `nonce`, `keyVersion`, `payloadHash`, `readyAt`, internal
 * participant/member/invitation ids, and `contentUnitId`. `readyAt` is on that
 * list for a reason that is easy to miss: in a two-person activity, the moment
 * somebody confirmed is itself a message.
 */

/** One other seat, with the body the caller was entitled to decrypt. */
export interface ProjectionOther {
  readonly participant: CircleParticipantRow;
  /**
   * The roster position this seat holds, 1-based, counting every seat — the
   * actor's own included. Computed once, by the caller, from the whole roster,
   * so every viewer of the same activity numbers the same seat the same way.
   */
  readonly position: number;
  /** Decrypted body, or `null` when unreadable or not yet readable. */
  readonly body: string | null;
}

export interface ProjectionInput {
  readonly activity: CircleActivityRow;
  readonly definition: CircleActivityDefinition;
  readonly self: CircleParticipantRow;
  /**
   * Every seat that is not the actor's, in roster order.
   *
   * A list rather than a single `counterpart`, because `participants.find(p =>
   * p.id !== self.id)` in a room of six answers "one of the other five" and
   * calls it the counterpart. Empty is legal: a seat can be alone in a group
   * whose other seats were withdrawn.
   */
  readonly others: readonly ProjectionOther[];
  readonly readyCount: number;
  readonly artifact: {
    readonly id: string;
    readonly version: number;
    readonly status: "PROPOSED" | "AGREED" | "SUPERSEDED";
    readonly body: string | null;
    readonly confirmations: number;
    readonly confirmedByYou: boolean;
  } | null;
  /** Decrypted body of the actor's OWN seat. `null` when unreadable. */
  readonly selfBody: string | null;
}

/**
 * A stored envelope becomes what a reader may see, or nothing.
 *
 * `KEEP_PRIVATE` arrives as `sharedNothing: true` and nothing else. The FACT
 * that somebody chose not to share is visible — it has to be, or the other
 * person waits forever for a turn that is not coming — and the reason is not,
 * because the type has no field for one.
 */
function toRevealedShare(body: string | null): CircleRevealedShare | null {
  if (body === null) return null;
  const parsed = parseShareBody(body);
  if (!parsed) return null;
  if (parsed.mode === "KEEP_PRIVATE") {
    return { mode: "KEEP_PRIVATE", sharedNothing: true };
  }
  if (parsed.mode === "EDITED_SUMMARY") {
    return { mode: "EDITED_SUMMARY", summary: parsed.summary };
  }
  return { mode: "SELECTED_FIELDS", fields: parsed.fields };
}

/**
 * Whether this actor is entitled to revealed content.
 *
 * `READY` and nothing else. Two things this closes:
 *
 *   · A WITHDRAWN seat keeps nothing. Withdrawing after the reveal revokes
 *     future access, and "future" includes the next GET. It cannot un-see what
 *     was already read, and the product does not pretend otherwise — but it
 *     does not keep serving it either.
 *
 *   · `ACCEPTED` no longer qualifies. It used to, and after the barrier that
 *     is exactly wrong: the reveal is a trade. `ACCEPTED` means a seat took
 *     part but has no confirmed snapshot — either it never confirmed, or its
 *     envelope was purged when the counterpart withdrew before the reveal. A
 *     seat in that state reading the other person's answer would be receiving
 *     without giving, which is the one thing the barrier exists to prevent.
 *     Before the reveal the question never arises; after it, `READY` is what
 *     "I am in this exchange" means.
 */
function mayReadRevealedContent(self: CircleParticipantRow): boolean {
  return self.status === "READY";
}

/**
 * The seat label every viewer agrees on.
 *
 * Positional, 1-based over the whole roster, so seat 3 is «Participante 3» for
 * all five people in the room and on every request. Not a name, not an
 * initial, not an arrival order.
 */
function seatLabel(position: number): string {
  return `Participante ${position}`;
}

/**
 * The room's status, as one value.
 *
 * The LEAST ADVANCED of the other seats: a room that is still waiting reads as
 * waiting. `WITHDRAWN` ranks last rather than first — a seat that left is not a
 * seat the room is waiting for, and reporting the room as `WITHDRAWN` because
 * one person stepped out would tell everybody else that somebody did.
 *
 * Empty (no other seats at all) reads `INVITED`, the same answer the Dúo gave
 * when its counterpart row did not exist yet: nothing has happened.
 */
const STATUS_RANK: Record<string, number> = {
  INVITED: 0,
  DECLINED: 1,
  ACCEPTED: 2,
  READY: 3,
  WITHDRAWN: 4,
};

function roomStatus(
  others: readonly ProjectionOther[],
): CircleParticipantStatus {
  let worst: CircleParticipantStatus | null = null;
  for (const other of others) {
    const status = other.participant.status as CircleParticipantStatus;
    if (
      worst === null ||
      (STATUS_RANK[status] ?? 0) < (STATUS_RANK[worst] ?? 0)
    ) {
      worst = status;
    }
  }
  return worst ?? "INVITED";
}

export function projectActivity(input: ProjectionInput): CircleActivityView {
  const { activity, definition, self, others } = input;
  const revealedStage =
    activity.status === "REVEALED" ||
    activity.status === "FOLLOW_UP" ||
    (activity.status === "CLOSED" && activity.revealedAt !== null);

  // Decided HERE, from the seat's own row — not from whether the caller
  // supplied a body.
  //
  // The service already refuses to decrypt for an unentitled seat, so in
  // practice `counterpartBody` arrives `null`. That is a property of today's
  // caller, and this function is the last thing between a decrypted sentence
  // and the network: if a future caller — a batch read, a new surface, a
  // refactor that hoists the decryption — hands over bodies it should not
  // have, the answer must still be no. Two independent checks, and the one
  // closest to the response wins.
  const mayReadRevealed = revealedStage && mayReadRevealedContent(self);
  const revealedParticipants = mayReadRevealed
    ? others.flatMap((other) => {
        const share = toRevealedShare(other.body);
        return share ? [{ label: seatLabel(other.position), share }] : [];
      })
    : [];

  return {
    activityId: activity.id,
    status: activity.status,
    templateKey: activity.templateKey,
    templateVersion: activity.templateVersion,
    title: definition.title,
    summary: definition.summary,
    conversationTurns: definition.conversation.turns,
    outcomeKind: definition.outcome.kind,
    requiredParticipants: activity.requiredParticipants,
    readyCount: input.readyCount,
    revealedAt: activity.revealedAt ? activity.revealedAt.toISOString() : null,
    followUpDueAt: activity.followUpDueAt
      ? activity.followUpDueAt.toISOString()
      : null,

    you: {
      status: self.status,
      sharingMode: (self.sharingMode as CircleSharingMode | null) ?? null,
      // A person may always read back what they themselves confirmed — before
      // the reveal included. It is theirs; the barrier is about the other
      // person's, not about their own.
      confirmed: toRevealedShare(input.selfBody),
      followUpDecision:
        (self.followUpDecision as CircleFollowUpDecision | null) ?? null,
    },

    // Exactly one bit about the rest of the room before the reveal: has
    // everybody finished. Not who, not what, not how much, not when — and one
    // value for the room rather than one per seat, so a group cannot be read
    // as a list of who is late.
    counterpart: { status: roomStatus(others) },

    revealed:
      revealedParticipants.length > 0
        ? {
            // `counterpart` only when there IS one other seat. In a room of
            // six there is no counterpart, and naming one of the five would be
            // inventing a protagonist.
            ...(revealedParticipants.length === 1
              ? { counterpart: revealedParticipants[0]!.share }
              : {}),
            participants: revealedParticipants,
          }
        : null,

    // The shared result is revealed content too. It is built FROM both
    // people's answers, so a seat that may not read the reveal may not read
    // the artifact either — and `mayReadRevealed` is the same gate, applied
    // to the same row, for the same reason.
    artifact:
      mayReadRevealed && input.artifact && input.artifact.body !== null
        ? {
            artifactId: input.artifact.id,
            version: input.artifact.version,
            status: input.artifact.status,
            kind: definition.outcome.kind,
            body: input.artifact.body,
            confirmedByYou: input.artifact.confirmedByYou,
            confirmationCount: input.artifact.confirmations,
          }
        : null,
  };
}
