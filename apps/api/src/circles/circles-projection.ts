import type {
  CircleActivityDefinition,
  CircleActivityView,
  CircleFollowUpDecision,
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

export interface ProjectionInput {
  readonly activity: CircleActivityRow;
  readonly definition: CircleActivityDefinition;
  readonly self: CircleParticipantRow;
  readonly counterpart: CircleParticipantRow | null;
  readonly readyCount: number;
  readonly artifact: {
    readonly id: string;
    readonly version: number;
    readonly status: "PROPOSED" | "AGREED" | "SUPERSEDED";
    readonly body: string | null;
    readonly confirmations: number;
    readonly confirmedByYou: boolean;
  } | null;
  /** Decrypted bodies, supplied by the service. `null` when unreadable. */
  readonly selfBody: string | null;
  readonly counterpartBody: string | null;
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

export function projectActivity(input: ProjectionInput): CircleActivityView {
  const { activity, definition, self, counterpart } = input;
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
  const counterpartShare = mayReadRevealed
    ? toRevealedShare(input.counterpartBody)
    : null;

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

    // Exactly one bit about the other person before the reveal: have they
    // finished. Not what, not how much, not when.
    counterpart: { status: counterpart?.status ?? "INVITED" },

    revealed: counterpartShare ? { counterpart: counterpartShare } : null,

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
