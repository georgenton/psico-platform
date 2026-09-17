import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { circleSizeIsAllowed } from "@psico/types";
import type {
  CircleActivityDefinition,
  CircleActor,
  CircleFollowUpDecision,
  CircleShareConfirmation,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { CircleStorageError } from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { lockActivityAccessRows } from "./circles-activity-locks";
import { participatingSize } from "./circle-group-size";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleActivityRepository } from "./circle-activity.repository";
import type { CircleActivityRow } from "./circle-activity.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleParticipantRepository } from "./circle-participant.repository";
import type { CircleParticipantRow } from "./circle-participant.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleArtifactRepository } from "./circle-artifact.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleMemberRepository } from "./circle-member.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { guestSessionIsLive } from "./circle-guest-session.repository";
import { CirclesError } from "./circles-http-errors";
import {
  CIRCLES_CIPHER,
  CirclesCryptoError,
  type CircleEnvelopeContext,
  type CirclesCipherRef,
} from "./circles-crypto";
import { CIRCLES_TEMPLATE_REGISTRY } from "./circles-template-registry";
import type { CirclesTemplateRegistryRef } from "./circles-template-registry";
import {
  canonicalShareBody,
  validateShareAgainstTemplate,
  verifyDecryptedShare,
} from "./circles-share";

/**
 * The participation domain (PR3): what two people actually do to an activity.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOCK ORDER — MANDATORY for every Círculos command, present and future
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *     CircleMember
 *       → CircleInvitation
 *         → CircleGuestSession
 *           → CircleActivity
 *             → CircleActivityParticipant
 *               → CircleArtifact
 *
 * Each command takes ONLY the rows it needs, and never in another order. This
 * is not a style preference: two commands that take the same two rows in
 * opposite orders deadlock under contention, and it surfaces as a random 500 on
 * a Dúo two people are using at the same moment — the hardest kind of bug to
 * reproduce and the easiest to avoid. `circles-lock-order.spec.ts` reads the
 * order out of this file rather than trusting this comment.
 *
 * If a future command genuinely needs a different order, the fix is to change
 * this rule and every command with it, not to make an exception.
 *
 * ── Authority is re-derived inside every transaction ───────────────────────
 *
 * The guards resolve a `CircleActor` and refuse an unauthenticated or unknown
 * caller. They do NOT establish that the actor may still act: a member can
 * leave and a guest session can be revoked between the guard and the commit.
 * Every command below therefore re-reads — under lock — the membership or guest
 * session that constitutes its authority. The guard is the front door; this is
 * the decision.
 */

/**
 * The interactive transaction client.
 *
 * Not `PrismaService`: inside `$transaction` the client is deliberately missing
 * `$transaction` itself, so a nested transaction is a type error rather than a
 * silent savepoint somebody assumed was isolation.
 */
type CirclesTx = Prisma.TransactionClient;

/** What a caller may not learn. Every refusal here is one of these. */
const UNUSABLE = "CIRCLE_ACTIVITY_UNAVAILABLE" as const;
/**
 * The floor for continuing with whoever accepted: two people, organiser
 * included.
 *
 * Not a template number and not the capacity. The capacity is what COULD have
 * happened; this is the point below which there is no activity to have — one
 * person writing for nobody is not the product, and the reveal barrier would
 * have nothing to hold.
 */
const MIN_FLEXIBLE_GROUP = 2;

export interface CreateDuoInput {
  readonly userId: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  /**
   * One 256-bit caller-supplied secret PER SEAT that is not the organiser's —
   * so one for a Dúo, and N−1 for a group of N. Hashed here, never stored raw
   * and never logged.
   *
   * One secret per seat rather than one link many people can use: a link that
   * admits an indeterminate number of people is not a roster, and a roster is
   * the thing this activity promises.
   */
  readonly invitationTokens: readonly string[];
  /**
   * How many people, including the organiser. Optional: absent means the
   * template's default, which for a Dúo is the only possibility.
   */
  readonly size?: number;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface CreatedDuo {
  readonly circleId: string;
  readonly activityId: string;
  readonly replayed: boolean;
}

/** The rows a command needs, read and locked in the mandated order. */
interface ActivityContext {
  readonly activity: CircleActivityRow;
  readonly participants: readonly CircleParticipantRow[];
  readonly self: CircleParticipantRow;
  /**
   * Every seat that is not the actor's, in ROSTER order — the organiser's seat
   * first, then the invited ones by id.
   *
   * It replaced a `counterpart` computed as `participants.find(p => p.id !==
   * self.id)`. That was exactly right while every activity had two seats and
   * silently wrong the moment one had six: it answered "some other seat" and
   * the caller read it as "the other person".
   */
  readonly others: readonly CircleParticipantRow[];
  /**
   * Position of each seat in the roster, 1-based, for EVERY seat including the
   * actor's own. Same order for every viewer, so one seat is «Participante 3»
   * to all of them.
   */
  readonly positions: ReadonlyMap<string, number>;
  readonly definition: CircleActivityDefinition;
}

@Injectable()
export class CirclesParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: CircleActivityRepository,
    private readonly participants: CircleParticipantRepository,
    private readonly artifacts: CircleArtifactRepository,
    private readonly events: CircleEventRepository,
    private readonly members: CircleMemberRepository,
    private readonly guestSessions: CircleGuestSessionRepository,
    private readonly invitations: CircleInvitationRepository,
    private readonly rollout: CirclesRolloutService,
    @Inject(CIRCLES_CIPHER) private readonly cipher: CirclesCipherRef,
    @Inject(CIRCLES_TEMPLATE_REGISTRY)
    private readonly registry: CirclesTemplateRegistryRef,
  ) {}

  /**
   * The cipher, or a refusal.
   *
   * Under `off` this is `null` and unreachable: the rollout guard closes every
   * route before a handler runs. The check exists so that a future rewiring
   * that lost the guard would fail closed rather than write plaintext.
   */
  private requireCipher() {
    if (!this.cipher) throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    return this.cipher;
  }

  // ══ Authority ════════════════════════════════════════════════════════════

  /**
   * Re-derive, under lock, that this actor may still act on this activity.
   *
   * ── Why the whole chain is locked, not just the actor's own row ────────────
   *
   * The guard proved who is calling. It did not prove they may still act, and
   * for a GUEST it could not: a guest holds no membership of their own. Their
   * entire authority is borrowed from the member who invited them, through the
   * invitation that minted their session. Three rows, and any one of them can
   * change between the guard and the commit — the session revoked, the
   * invitation revoked, the inviter leaving the circle or dropping out of the
   * pilot allowlist.
   *
   * An earlier version read the session with `findById` and checked nothing
   * above it. Two consequences, both real:
   *
   *   · a revocation committing in parallel could lose the race, so a command
   *     wrote an envelope and a `PARTICIPANT_READY` event on a credential that
   *     no longer existed;
   *   · nothing re-derived the inviter at all, so a guest kept full command
   *     access after the member who invited them left, and under `pilot` after
   *     that member was removed from the allowlist. The invitation exchange
   *     (PR2) revalidates the inviter under lock; every command after it did
   *     not, which made the check a door policy rather than an invariant.
   *
   * Preliminary reads below resolve IDS ONLY. Nothing is decided from them:
   * every value they produce is read again under `FOR UPDATE`, in the
   * canonical order, and only the locked read is allowed to authorize.
   *
   *     CircleMember → CircleInvitation → CircleGuestSession →
   *     CircleActivity → CircleActivityParticipant → CircleArtifact
   *
   * A `null` anywhere on the path produces the same opaque refusal as an
   * activity that does not exist, so probing an id teaches nothing.
   */
  private async resolveAuthority(
    actor: CircleActor,
    activityId: string,
    tx: CirclesTx,
    now: Date = new Date(),
  ): Promise<ActivityContext> {
    if (actor.kind === "GUEST" && actor.activityId !== activityId) {
      // A guest's actor names its one activity. Asking about another is not an
      // authorization failure to explain; it is a question with no answer.
      throw new CirclesError(UNUSABLE);
    }

    let membership: { id: string; circleId: string } | null = null;
    let guestSeatId: string | null = null;

    if (actor.kind === "USER") {
      // ── 1. CircleMember ────────────────────────────────────────────────
      const activityPeek = await this.activities.findById(activityId, tx);
      if (!activityPeek) throw new CirclesError(UNUSABLE);
      // Resolve which row, then lock THAT row. Two statements because the
      // lock needs an id and the id comes from `(circleId, userId)`.
      const candidate = await this.members.findActive(
        activityPeek.circleId,
        actor.userId,
        tx,
      );
      if (!candidate) throw new CirclesError(UNUSABLE);
      const member = await this.members.lockById(candidate.id, tx);
      if (
        !member ||
        member.status !== "ACTIVE" ||
        member.circleId !== activityPeek.circleId
      ) {
        throw new CirclesError(UNUSABLE);
      }
      membership = { id: member.id, circleId: member.circleId };

      // ── 2 and 3. CircleInvitation, CircleGuestSession ──────────────────
      //
      // Taken here, BEFORE the activity, and taken on every command rather
      // than only on the ones that revoke.
      //
      // This service used to skip them entirely: a member's path went member
      // → activity → seats, and `withdraw` then revoked the invitations and
      // the guest sessions at the end, three statements past the activity
      // lock. The sweep and account deletion take those rows FIRST. So a
      // person pressing «retirarme» while the sweep cancelled the same
      // unfinishable room was an inversion between two things the product
      // does on its own, and PostgreSQL settled it by killing one of them:
      // either the sweep abandoned its batch or somebody was told their
      // withdrawal had failed on a storage error.
      //
      // Unconditional because the alternative is a flag each future method
      // must remember to set, and the cost of holding them is nothing that
      // was not already being paid: every command here already locks EVERY
      // seat of the activity, so commands on one activity were serialized
      // before this line existed. What changes is the ORDER, not the
      // concurrency.
      await lockActivityAccessRows(
        { invitations: this.invitations, guestSessions: this.guestSessions },
        activityId,
        tx as never,
      );
    } else {
      guestSeatId = await this.resolveGuestAuthority(
        actor,
        activityId,
        tx,
        now,
      );
    }

    // ── 4. CircleActivity ────────────────────────────────────────────────
    const activity = await this.activities.lockById(activityId, tx);
    if (!activity) throw new CirclesError(UNUSABLE);

    // ── 5. CircleActivityParticipant ─────────────────────────────────────
    const participants = await this.participants.lockForActivity(
      activityId,
      tx,
    );
    // For a guest the seat comes from the LOCKED session, never from the
    // actor the guard assembled — see `resolveGuestAuthority`.
    const self =
      actor.kind === "GUEST"
        ? participants.find((p) => p.id === guestSeatId)
        : participants.find((p) => p.memberId === membership?.id);
    if (!self) throw new CirclesError(UNUSABLE);
    // The seat belongs to THIS activity and THIS circle. Composite foreign
    // keys make both true at the storage layer, and the seat was found in a
    // list scoped to the activity — so this is a third statement of the same
    // fact. It is here because the cost is one comparison and the failure it
    // guards against is one person's answer appearing under another's name.
    if (
      self.activityId !== activity.id ||
      self.circleId !== activity.circleId
    ) {
      throw new CirclesError(UNUSABLE);
    }
    /**
     * The roster, in one fixed order every viewer computes identically.
     *
     * Organiser first — that seat is the only one holding a `memberId`, and it
     * is the one everybody already knows about because they got their link
     * from them — then the invited seats by `id`.
     *
     * `id` rather than `createdAt`: every seat of an activity is written inside
     * ONE transaction, and `CURRENT_TIMESTAMP` is the transaction's start, so
     * all of them carry the same `createdAt` to the millisecond. Ordering a
     * group's five seats by a value they all share is not an order at all — it
     * is whatever PostgreSQL returned this time, and the labels built on it
     * would move between two reads of the same room.
     */
    const roster = [...participants].sort((a, b) => {
      const organizer =
        Number(b.memberId !== null) - Number(a.memberId !== null);
      if (organizer !== 0) return organizer;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const positions = new Map(roster.map((p, index) => [p.id, index + 1]));
    const others = roster.filter((p) => p.id !== self.id);

    let definition: CircleActivityDefinition;
    try {
      definition = this.registry.getExact(
        activity.templateKey,
        activity.templateVersion,
      );
    } catch {
      // An activity pinned to a template this build does not know is not a
      // client error. It is an operational one, and it is opaque either way.
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }

    return { activity, participants, self, others, positions, definition };
  }

  /**
   * The guest half of the authority path: member, invitation, session — locked,
   * in that order, and every one of them re-checked afterwards.
   *
   * Returns the seat id the SESSION names. That return value matters as much as
   * the checks: the caller must resolve the guest's seat from this row and not
   * from `actor.participantId`. The actor was assembled by the guard from the
   * same session a moment earlier, so the two agree in the normal case — and
   * "agrees in the normal case" is exactly the property an attacker works on.
   * Comparing them here, and then using the locked one, means a mismatch is a
   * refusal rather than a silent choice of which to trust.
   *
   * Order of operations, and why it cannot be simplified:
   *
   *   1. read session (unlocked) — for its `invitationId` only;
   *   2. read invitation (unlocked) — for its `createdByMemberId` only;
   *   3. LOCK member, then EVERY invitation and session of the activity, then
   *      this guest's own two rows — canonical order;
   *   4. decide, using only the locked rows.
   *
   * Steps 1 and 2 look like the checks they precede, and are not: their values
   * are used to address rows, never to authorize. Locking in the canonical
   * order requires knowing the member id before the session is locked, and the
   * only path to it runs through both unlocked reads. Doing it the other way —
   * lock the session first because that is what we have an id for — would put
   * two commands in opposite lock orders and deadlock them under contention.
   */
  private async resolveGuestAuthority(
    actor: Extract<CircleActor, { kind: "GUEST" }>,
    activityId: string,
    tx: CirclesTx,
    now: Date,
  ): Promise<string> {
    // ── Preliminary: ids only. Nothing here authorizes anything. ─────────
    const sessionPeek = await this.guestSessions.findById(
      actor.guestSessionId,
      tx,
    );
    if (!sessionPeek) throw new CirclesError(UNUSABLE);
    const invitationPeek = await this.invitations.findById(
      sessionPeek.invitationId,
      tx,
    );
    if (!invitationPeek) throw new CirclesError(UNUSABLE);

    // ── 1. CircleMember — the inviter, whose eligibility the guest borrows ─
    const inviter = await this.members.lockById(
      invitationPeek.createdByMemberId,
      tx,
    );
    if (
      !inviter ||
      inviter.status !== "ACTIVE" ||
      inviter.circleId !== invitationPeek.circleId
    ) {
      throw new CirclesError(UNUSABLE);
    }

    // The pilot allowlist, re-derived from the LOCKED inviter row. PR2 checks
    // this when the invitation is exchanged; a guest session outlives that
    // moment by up to its whole lifetime, so a member removed from the pilot
    // would otherwise keep a working guest attached to them.
    const mode = this.rollout.currentMode();
    // Unreachable: the guest guard refuses under `off`. Fails closed anyway.
    if (mode === "off") throw new CirclesError(UNUSABLE);
    if (mode === "pilot" && !this.rollout.isAvailable(inviter.userId)) {
      throw new CirclesError(UNUSABLE);
    }

    // ── 2 and 3. EVERY invitation and session, before this guest's own ───
    //
    // A guest only needs its own two rows to be authorized, and locking only
    // those was the bug: `withdraw` and the group's private exit then revoke
    // EVERYBODY's, reaching — after the activity — for rows this transaction
    // does not hold. The sweep holds them, in id order, and wants the
    // activity. That is the cycle.
    //
    // It has to come BEFORE the lock on this guest's own invitation, not
    // after. Taking one row and then asking for the whole set ordered by id
    // is itself an inversion whenever this guest's row is not the first one:
    // the sweep would hold the earlier rows and wait for this one while this
    // one waited for the earlier rows.
    await lockActivityAccessRows(
      { invitations: this.invitations, guestSessions: this.guestSessions },
      activityId,
      tx as never,
    );

    // ── 2. CircleInvitation — this guest's own, already held above ───────
    const invitation = await this.invitations.lockById(invitationPeek.id, tx);
    if (
      !invitation ||
      invitation.revokedAt !== null ||
      invitation.activityId !== activityId ||
      invitation.createdByMemberId !== inviter.id ||
      // It must have been legitimately exchanged. A session whose invitation
      // was never consumed, or was declined, describes a state the exchange
      // path cannot produce — so the safe reading is that something else
      // produced it.
      invitation.consumedAt === null ||
      invitation.acceptedAt === null ||
      invitation.declinedAt !== null
    ) {
      throw new CirclesError(UNUSABLE);
    }

    // ── A note on `invitation.expiresAt`, which is NOT checked here ────────
    //
    // The audit asks for "not expired", and enforcing it at command time
    // would be wrong for this product. An invitation's window governs whether
    // the LINK can still be exchanged: 14 days. A guest session, once minted,
    // lives `GUEST_SESSION_TTL_MS` — 30 days — deliberately longer, because a
    // Dúo is a conversation that runs over days and the link that started it
    // has already done its job.
    //
    // Re-deriving invitation expiry on every command would cut a guest off
    // mid-conversation on day 14 of a 30-day session, and would do it
    // silently: the code path is a `404` that says nothing. The invitation's
    // own expiry was enforced once, by `invitationIsUsable`, at the moment it
    // mattered — and `consumedAt` above is the durable record that it passed.
    //
    // Stated rather than skipped: if the intended policy is that guest access
    // ends with the invitation window, the fix belongs in
    // `GUEST_SESSION_TTL_MS`, where it is one number and visible, not in a
    // second expiry rule that silently overrides the first.

    // ── 3. CircleGuestSession ────────────────────────────────────────────
    const session = await this.guestSessions.lockById(actor.guestSessionId, tx);
    if (!session || !guestSessionIsLive(session, now)) {
      throw new CirclesError(UNUSABLE);
    }
    if (session.activityId !== activityId) throw new CirclesError(UNUSABLE);
    if (session.invitationId !== invitation.id) {
      throw new CirclesError(UNUSABLE);
    }
    // The actor the guard built must name the seat this session names. If it
    // does not, something between the two disagrees and the safe reading of a
    // disagreement about identity is: no.
    if (session.participantId !== actor.participantId) {
      throw new CirclesError(UNUSABLE);
    }
    return session.participantId;
  }

  // ══ Create ═══════════════════════════════════════════════════════════════

  /**
   * Create a Dúo, its first activity, both seats and the invitation — atomically.
   *
   * ── Idempotency versus a secret that can only be handed over once ─────────
   *
   * A replay must not create a second Dúo, and it must not hand back a token
   * either — the server does not keep one to hand back, by design. Squaring
   * those two produced the design the spec asks for: the CALLER supplies the
   * token, the API only ever sees it once per request and stores its hash.
   *
   * So a replay with the same key AND the same token returns the same resource
   * without creating anything: the caller already has the secret it sent. A
   * replay with the same key and a DIFFERENT token is a conflict, because
   * honouring it would either mint a second link into one seat or silently
   * ignore the token the caller believes is live.
   *
   * The token is treated as a secret on the way in: hashed immediately, never
   * logged, never echoed, never placed in an event or an error.
   */
  async createDuo(input: CreateDuoInput): Promise<CreatedDuo> {
    const now = input.now ?? new Date();

    // ── The template is resolved AFTER the receipt, not before ────────────
    //
    // It used to be the first thing this method did, which quietly made
    // idempotency expire. A caller creates a Dúo on template v3; editorial
    // archives v3 a week later; the caller retries the very same request
    // after a timeout — and instead of the aggregate it already committed,
    // it got `CIRCLE_TEMPLATE_UNAVAILABLE`. Nothing was wrong with the
    // request; the world had moved on around a resource that already exists.
    //
    // A replay does not instantiate anything, so it does not need the
    // template to be instantiable. It does not need the template at all: the
    // committed activity carries its own pin, and comparing THAT against the
    // request is what decides replay from conflict. `getPublished` is a
    // precondition for CREATING, so it runs where creation happens.
    const { hashSecret } = await import("./circles-secrets");
    /**
     * Every seat's secret, hashed once, in the order the caller minted them.
     *
     * All of them are the request, and the idempotency comparison below reads
     * all of them. The order is kept because it decides which seat each link
     * opens, not because the comparison cares about it.
     */
    const tokenHashes = input.invitationTokens.map((t) => hashSecret(t));

    try {
      return await this.prisma.$transaction(async (tx) => {
        // ── Serialize this user's creations against each other ────────────
        //
        // The receipt read below is only decisive once a receipt EXISTS. Two
        // requests carrying the same key that arrive together both find
        // nothing, both proceed, and both create a Dúo — the unique index on
        // `CIRCLE_CREATED` then fails one of them at the very end, after two
        // circles, two activities, four seats and two invitations have been
        // written. One transaction rolls back, so no garbage survives; but
        // the loser gets a storage error where it should have got the same
        // resource as the winner, and a caller retrying a timeout is exactly
        // the caller most likely to hit it.
        //
        // Locking the actor's own `User` row first makes the two orders. The
        // second transaction blocks here, and by the time it reads the
        // receipt the first has committed one — so it replays. The row is a
        // natural choice: every creation by this user needs it, no other
        // user contends for it, and it is taken before any Círculos row, so
        // it cannot invert the lock order.
        await tx.$executeRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`,
        );

        // A replay is decided by the receipt, in PostgreSQL, before anything
        // is written. `CIRCLE_CREATED` carries the idempotency key; what
        // tells a replay from a conflict is whether the request that key
        // stands for is the SAME request.
        const prior = await tx.circleEvent.findFirst({
          where: {
            type: "CIRCLE_CREATED",
            actorUserId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
          select: { circleId: true, activityId: true },
        });
        if (prior) {
          // All three, not just the token.
          //
          // An idempotency key stands for ONE request. Comparing only the
          // token meant the same key with a different template replayed
          // happily and returned the first activity — so a caller that fixed
          // a typo in `templateKey` and retried received a Dúo running the
          // template they had just corrected away from, reported as success.
          // Template key, template version and token hash together are the
          // request; any of them differing is a different request wearing a
          // used key, which is the definition of a conflict.
          //
          // EVERY secret, not the first one and a count.
          //
          // The first version of this compared `tokenHashes[0]` and then
          // checked that the remaining ones were the right NUMBER — and a group
          // spec written against it caught what that misses at once. A caller
          // that created a group of four with (t1,t2,t3), timed out, and
          // retried with (t1,t2,t9) agreed on the first secret and on the
          // count, so it replayed: the third person was handed a link the
          // server had never seen, and the retry was reported as success.
          //
          // Compared as a SET rather than in order: seats are anonymous at
          // creation — every one of them is an empty INVITED row — so the same
          // three secrets in a different order are the same three links to the
          // same three people, and turning an array reordering into a conflict
          // would refuse a retry that is genuinely identical.
          const priorHashes = new Set(
            (
              await tx.circleInvitation.findMany({
                where: { circleId: prior.circleId },
                select: { tokenHash: true },
              })
            ).map((i) => i.tokenHash),
          );
          const sameSecrets =
            priorHashes.size === tokenHashes.length &&
            tokenHashes.every((hash) => priorHashes.has(hash));
          const priorActivity = prior.activityId
            ? await this.activities.findById(prior.activityId, tx)
            : null;
          // …and the SIZE, now that there is one to disagree about. A caller
          // that asked for four, timed out, and retried asking for six is not
          // replaying: it is a different request wearing a used key, and
          // returning the group of four as success would hand back an activity
          // two people were never invited to.
          const requestedSize = input.size ?? null;
          if (
            !sameSecrets ||
            !priorActivity ||
            priorActivity.templateKey !== input.templateKey ||
            priorActivity.templateVersion !== input.templateVersion ||
            (requestedSize !== null &&
              priorActivity.requiredParticipants !== requestedSize) ||
            tokenHashes.length !== priorActivity.requiredParticipants - 1
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return {
            circleId: prior.circleId,
            activityId: priorActivity.id,
            replayed: true,
          };
        }

        // No receipt: this is a real creation, so the template must be
        // instantiable right now. DRAFT and ARCHIVED still resolve by exact
        // pin — a running activity keeps working — but neither may start a
        // new one.
        let definition: CircleActivityDefinition;
        try {
          definition = this.registry.getPublished(
            input.templateKey,
            input.templateVersion,
          );
        } catch {
          throw new CirclesError("CIRCLE_TEMPLATE_UNAVAILABLE");
        }

        /**
         * The size, decided once and checked against the template's range.
         *
         * `circleSizeIsAllowed` is the same predicate the Web uses to offer the
         * choice, so "which sizes exist" has one answer. A size outside the
         * range is REFUSED rather than clamped: quietly giving somebody a
         * different group from the one they asked for is worse than saying no.
         *
         * For a Dúo the range is a single number, so a caller that sends
         * nothing gets two and a caller that sends three is refused — by this
         * line, not by a mode-specific branch further down.
         */
        const size = input.size ?? definition.participants.required;
        // All three refusals below are CIRCLE_INVALID_PAYLOAD — a closed
        // vocabulary rather than three new codes. They are the same kind of
        // thing: a request that does not describe an activity this template can
        // produce, answered without saying which part was wrong.
        if (!circleSizeIsAllowed(definition, size)) {
          throw new CirclesError("CIRCLE_INVALID_PAYLOAD");
        }
        // One secret per seat that is not the organiser's. Too few and a seat
        // could never be filled; too many and the caller believes it invited
        // somebody this activity has no room for.
        if (tokenHashes.length !== size - 1) {
          throw new CirclesError("CIRCLE_INVALID_PAYLOAD");
        }
        if (new Set(tokenHashes).size !== tokenHashes.length) {
          throw new CirclesError("CIRCLE_INVALID_PAYLOAD");
        }

        const kind =
          definition.audience === "GROUP_ADULT" ? "GROUP_ADULT" : "DUO";

        /**
         * The modality gate, asked of the RESOLVED TEMPLATE.
         *
         * Not of the request. A caller cannot open groups by sending `size: 4`,
         * by naming a group template, or by any other field: the audience comes
         * from the catalogue entry the server just looked up, and `size` was
         * already checked against that same entry's range. The only way to
         * reach this branch is for the template itself to be a group template.
         *
         * `CIRCLES_UNAVAILABLE` rather than a code of its own, and the same one
         * an unallowlisted member gets: somebody the modality is closed for
         * should not be able to learn that adult groups exist. That is also why
         * the check sits here and not in the guard — the guard runs before the
         * body is parsed and cannot know which template was asked for.
         */
        if (
          kind === "GROUP_ADULT" &&
          !this.rollout.isGroupCreationAvailable(input.userId)
        ) {
          throw new CirclesError("CIRCLES_UNAVAILABLE");
        }

        const circle = await tx.circle.create({
          data: {
            kind,
            status: "ACTIVE",
            createdByUserId: input.userId,
            maxParticipants: size,
          },
          select: { id: true },
        });
        const member = await tx.circleMember.create({
          data: {
            circleId: circle.id,
            userId: input.userId,
            role: "ORGANIZER",
            status: "ACTIVE",
          },
          select: { id: true },
        });
        const followUpDueAt = definition.followUp
          ? new Date(now.getTime() + definition.followUp.afterHours * 3_600_000)
          : null;
        const activity = await tx.circleActivity.create({
          data: {
            circleId: circle.id,
            templateKey: definition.templateKey,
            templateVersion: definition.templateVersion,
            status: "INVITING",
            kind,
            // CAPACITY. How many people COULD take part — what the organiser
            // chose and what every invitee is shown before accepting. Not how
            // many will: that is `confirmedParticipants`, written when the
            // organiser closes onboarding.
            requiredParticipants: size,
            // A group created from here on runs the flexible rules: people
            // prepare as they arrive and the organiser continues with whoever
            // accepted. A Dúo does not — it is two people by definition, so
            // "continue with whoever accepted" is either both of them or
            // nobody, and its guarantees are left exactly as they were.
            onboarding: kind === "GROUP_ADULT" ? "FLEXIBLE" : "FIXED",
            followUpDueAt,
          },
          select: { id: true },
        });
        // The organizer's acceptance is implicit in creating the circle.
        await tx.circleActivityParticipant.create({
          data: {
            circleId: circle.id,
            activityId: activity.id,
            memberId: member.id,
            status: "ACCEPTED",
          },
          select: { id: true },
        });
        /**
         * One invitation and one seat per secret, in one pass.
         *
         * Sequential rather than `Promise.all`: these rows are written inside
         * one transaction against one connection, and issuing them concurrently
         * on a single client buys nothing while making the write order —
         * which is the lock order — depend on scheduling.
         */
        const expiresAt = new Date(now.getTime() + 14 * 24 * 3_600_000);
        for (const [index, hash] of tokenHashes.entries()) {
          const invitation = await tx.circleInvitation.create({
            data: {
              circleId: circle.id,
              activityId: activity.id,
              createdByMemberId: member.id,
              tokenHash: hash,
              // Which seat this link opens. The database keeps at most one live
              // invitation per seat, so a group's N−1 links coexist while a
              // second link into the SAME seat is still refused — the rule the
              // Dúo has had since the foundation, now said per seat.
              seatIndex: index + 1,
              expiresAt,
            },
            select: { id: true },
          });
          await tx.circleActivityParticipant.create({
            data: {
              circleId: circle.id,
              activityId: activity.id,
              invitationId: invitation.id,
              status: "INVITED",
            },
            select: { id: true },
          });
        }

        await this.events.append(
          {
            circleId: circle.id,
            activityId: activity.id,
            type: "CIRCLE_CREATED",
            actorUserId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
          tx,
        );
        await this.events.append(
          {
            circleId: circle.id,
            activityId: activity.id,
            type: "ACTIVITY_CREATED",
            actorUserId: input.userId,
          },
          tx,
        );
        await this.events.append(
          {
            circleId: circle.id,
            activityId: activity.id,
            type: "INVITATION_CREATED",
            metadata: { hasCode: false },
          },
          tx,
        );

        return {
          circleId: circle.id,
          activityId: activity.id,
          replayed: false,
        };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  // ══ Confirm share ════════════════════════════════════════════════════════

  /**
   * Put a confirmed snapshot on the server, and reveal if that was the last one.
   *
   * The whole barrier is one transaction. Steps 4 through 8 of the spec happen
   * with the activity and both seats locked, and the reveal itself is a single
   * conditional UPDATE whose predicate counts the READY seats — so two
   * simultaneous confirmations produce exactly one of two complete states, and
   * never a partial one.
   */
  async confirmShare(
    actor: CircleActor,
    activityId: string,
    confirmation: CircleShareConfirmation,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<{
    readonly revealed: boolean;
    readonly replayed: boolean;
    /**
     * The activity ended instead of taking a snapshot.
     *
     * Only a group can answer `true`: keeping it private in a room is the
     * conservative exit, not a confirmation. The room polls anyway, so this is
     * not the only way the screen finds out — it is how it finds out WITHOUT
     * first rendering a waiting state for an activity that is already over.
     */
    readonly cancelled?: boolean;
  }> {
    const cipher = this.requireCipher();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx, now);

        // ── Validate and MAC the candidate BEFORE consulting the receipt ──
        //
        // A receipt says "this key has been used". It does not say what for,
        // and the previous version did not ask: finding one returned success
        // whatever the body was. So the same key with a completely different
        // answer — different fields, different mode, a summary instead of a
        // selection — was reported as a successful replay while the ORIGINAL
        // snapshot stayed on the server. The caller believed it had changed
        // what it shares. It had not.
        //
        // Computing the candidate first gives the comparison something to
        // compare against: `payloadHash` is a keyed digest over the canonical
        // body AND the AAD context, so two requests match here only if they
        // mean the same thing under the same mode and the same field keys.
        const shape = validateShareAgainstTemplate(
          confirmation,
          ctx.definition,
        );
        const context: CircleEnvelopeContext = {
          circleId: ctx.activity.circleId,
          activityId: ctx.activity.id,
          participantId: ctx.self.id,
          templateKey: ctx.activity.templateKey,
          templateVersion: ctx.activity.templateVersion,
          sharingMode: shape.mode,
          fieldKeys: shape.fieldKeys,
        };
        const canonical = canonicalShareBody(confirmation);
        const candidateHash = cipher.macOf(canonical, context);

        // BOTH outcomes this key can stand for.
        //
        // A confirmation normally leaves `PARTICIPANT_READY`. In a group,
        // keeping it private leaves `PARTICIPANT_WITHDRAWN` and cancels the
        // activity — so a retry of that request must find ITS receipt here, or
        // it would fall through to the status check, meet a CANCELLED activity
        // and be told the activity is unusable. A person whose connection
        // dropped would read that as "something went wrong" about the very
        // thing that worked.
        const receipt = await tx.circleEvent.findFirst({
          where: {
            type: { in: ["PARTICIPANT_READY", "PARTICIPANT_WITHDRAWN"] },
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { type: true },
        });
        if (receipt?.type === "PARTICIPANT_WITHDRAWN") {
          // ── The receipt says the key was spent. It does not say on what ──
          //
          // An exit leaves no snapshot, so there is no hash to compare — which
          // is exactly why this branch has to ask the question some other way
          // instead of not asking it. `PARTICIPANT_WITHDRAWN` is written by
          // every way of leaving: the group's private exit, «retirarme» from
          // `PREPARING`, and «retirarme» after the reveal. Accepting the bare
          // event meant a key spent on ANY of those could come back carrying a
          // body full of answers and be told its confirmation had been
          // replayed. Nothing had been stored, and on a cancelled activity
          // nothing ever could be.
          //
          // So the request itself must be the exit this receipt can stand for,
          // and the three conditions below are read off state that already
          // exists — no draft is kept, no marker is written, nothing records
          // which button was pressed:
          //
          //   · the request is `KEEP_PRIVATE`. A body with fields in it is a
          //     different act, whatever key it arrives under;
          //   · the activity is a GROUP. In a Dúo `KEEP_PRIVATE` is a
          //     CONFIRMATION — the seat goes READY and the barrier may open —
          //     so replaying a withdrawal as one would claim a reveal that
          //     cannot happen;
          //   · the activity is `CANCELLED`. The private exit cancels; leaving
          //     a revealed room CLOSES it. A `CLOSED` activity is proof this
          //     key was spent on the other ending.
          //
          // ── What this deliberately still accepts ────────────────────────
          //
          // In a group, «retirarme» from `PREPARING` and «prefiero no
          // compartir» are ONE act: the same helper, the same cancellation,
          // the same two events. A key spent on one replays the other, and
          // that is the privacy property rather than a hole in it — anything
          // able to tell them apart here would be a stored marker saying which
          // button somebody pressed, which is the thing this design refuses to
          // write.
          if (
            shape.mode !== "KEEP_PRIVATE" ||
            ctx.activity.kind !== "GROUP_ADULT" ||
            ctx.activity.status !== "CANCELLED"
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return { revealed: false, replayed: true, cancelled: true };
        }
        if (receipt) {
          // The stored hash is the authority on what this key committed. A
          // seat that has since withdrawn has no hash at all, and that is a
          // conflict too: the key stands for a confirmation that no longer
          // exists, so replaying it cannot return the same resource.
          if (
            ctx.self.payloadHash === null ||
            !cipher.macMatches(ctx.self.payloadHash, candidateHash)
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return {
            revealed: ctx.activity.status !== "PREPARING",
            replayed: true,
          };
        }

        // ── Preparing is not confirming, and the screen must be able to
        //    say which one is not available yet ──────────────────────────────
        //
        // A flexible room still taking people in is `INVITING`, and the old
        // answer here was the opaque "this activity is unavailable". That is
        // the sentence Jorge saw on a room of three with one guest in: it read
        // as «esta actividad ya no admite cambios» about an activity that was
        // working perfectly and simply had nobody to confirm to yet.
        //
        // There is nothing to confirm against until the group is fixed —
        // confirming means "these people may read this", and the list does not
        // exist yet — so the refusal is right and only its name was wrong.
        if (
          ctx.activity.onboarding === "FLEXIBLE" &&
          ctx.activity.status === "INVITING"
        ) {
          throw new CirclesError("CIRCLE_ONBOARDING_OPEN");
        }
        if (ctx.activity.status !== "PREPARING")
          throw new CirclesError(UNUSABLE);
        if (ctx.self.status !== "ACCEPTED") throw new CirclesError(UNUSABLE);

        // ── In a group, keeping it private ENDS the activity ──────────────
        //
        // The Dúo's meaning is unchanged: `KEEP_PRIVATE` is a confirmation
        // that shares nothing, the seat goes READY, and the other person is
        // told a person finished and chose not to share. With one other person
        // that is fine — they already know who it was, and the reveal is about
        // whether their own answer is worth opening.
        //
        // In a room it is not. Four people would be shown that somebody kept
        // theirs private, and in a room of four "somebody" is an accusation
        // with three suspects — or, with the labels the reveal needs, none at
        // all: the label IS the identification. There is no version of
        // "publish that one seat shared nothing" that does not point at a
        // person.
        //
        // So for a group this is the conservative exit, and it is the SAME
        // exit any other withdrawal takes from `PREPARING`: the activity is
        // cancelled, every pending envelope is destroyed, invitations and
        // guest sessions are revoked, and the ledger records exactly what it
        // records for a withdrawal — which is the point. Nothing distinguishes
        // "they pressed keep private" from "they left", so nothing can be read
        // back to say which.
        //
        // The screen says so before the button: see `PreparacionPrivada`.
        if (
          ctx.activity.kind === "GROUP_ADULT" &&
          confirmation.mode === "KEEP_PRIVATE"
        ) {
          const exited = await this.exitWithoutSharing(
            ctx,
            idempotencyKey,
            now,
            tx,
          );
          return { revealed: false, replayed: false, cancelled: exited };
        }

        const envelope = cipher.seal(canonical, context);

        const moved = await this.participants.confirmShare(
          {
            participantId: ctx.self.id,
            activityId: ctx.activity.id,
            sharingMode: shape.mode,
            fieldKeys: shape.fieldKeys,
            envelope,
            now,
          },
          tx,
        );
        if (!moved) throw new CircleStorageError();

        const readyEvent = await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "PARTICIPANT_READY",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
        // The receipt was checked above under this seat's lock, so a REPLAY
        // here would mean the snapshot was just overwritten for a key that
        // already had one. Refusing rolls the whole transaction back.
        if (readyEvent.outcome !== "APPENDED") throw new CircleStorageError();

        // The barrier. One statement; its predicate is the whole condition.
        const revealed = await this.activities.revealIfAllReady(
          ctx.activity.id,
          now,
          tx,
        );
        if (revealed) {
          await this.events.append(
            {
              circleId: ctx.activity.circleId,
              activityId: ctx.activity.id,
              type: "ACTIVITY_REVEALED",
            },
            tx,
          );
        }
        return { revealed, replayed: false };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  /**
   * Leave an activity that has not revealed, and take the activity with it.
   *
   * ONE implementation, reached two ways: pressing «retirarme», and — in a
   * group only — choosing to keep everything private. They are the same act
   * and they leave the same trace, which is deliberate: if the two wrote
   * different rows, the row would say which button somebody pressed.
   *
   * Everything or nothing, inside the caller's transaction:
   *
   *   · this seat becomes `WITHDRAWN` and loses its own envelope;
   *   · every OTHER pending envelope is destroyed — those snapshots were
   *     confirmed for a conversation that is not going to happen;
   *   · every invitation and every guest session on the activity is revoked,
   *     so no link and no already-issued credential outlives it;
   *   · the activity becomes `CANCELLED`, which is terminal.
   *
   * The ledger gets `PARTICIPANT_WITHDRAWN` carrying the caller's idempotency
   * key — that is what makes a retry replay rather than repeat — and
   * `ACTIVITY_CANCELLED`, which carries nothing at all. The metadata grammar
   * admits no reason on either, so there is nowhere to record why even if
   * somebody later wanted to.
   */
  private async exitWithoutSharing(
    ctx: ActivityContext,
    idempotencyKey: string,
    now: Date,
    tx: CirclesTx,
  ): Promise<true> {
    const withdrew = await this.participants.withdraw(
      ctx.self.id,
      ctx.activity.id,
      now,
      tx,
    );
    if (!withdrew) throw new CirclesError(UNUSABLE);

    for (const p of ctx.participants) {
      if (p.id !== ctx.self.id) {
        await this.participants.purgeEnvelope(p.id, ctx.activity.id, tx);
      }
    }
    await tx.circleInvitation.updateMany({
      where: { activityId: ctx.activity.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.circleGuestSession.updateMany({
      where: { activityId: ctx.activity.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const cancelled = await this.activities.cancel(
      ctx.activity.id,
      now,
      ["INVITING", "PREPARING"],
      tx,
    );
    if (!cancelled) throw new CirclesError(UNUSABLE);

    const withdrawEvent = await this.events.append(
      {
        circleId: ctx.activity.circleId,
        activityId: ctx.activity.id,
        type: "PARTICIPANT_WITHDRAWN",
        actorParticipantId: ctx.self.id,
        idempotencyKey,
      },
      tx,
    );
    if (withdrawEvent.outcome !== "APPENDED") throw new CircleStorageError();
    await this.events.append(
      {
        circleId: ctx.activity.circleId,
        activityId: ctx.activity.id,
        type: "ACTIVITY_CANCELLED",
      },
      tx,
    );
    return true;
  }

  // ══ Closing onboarding ═══════════════════════════════════════════════════

  /**
   * Continue with whoever accepted.
   *
   * ── What this command decides, and what it deliberately does not ──────────
   *
   * It fixes the GROUP: from here the people inside are the people who will
   * read each other, and every confirmation given afterwards is given against
   * that list. It does not choose who is in it — everybody who accepted is in
   * it, and there is no way to press this button and quietly leave somebody
   * out. An organiser who wants a smaller room has to not invite them.
   *
   * ── Everything, or nothing ────────────────────────────────────────────────
   *
   * One transaction, on the shared lock order, doing four things that only
   * make sense together:
   *
   *   · every invitation nobody redeemed is revoked, so a link shared an hour
   *     ago cannot admit a seventh person into a conversation five people
   *     already agreed the shape of;
   *   · the seats those links opened are dropped — they were never taken up,
   *     and a seat nobody sits in is a seat the reveal barrier waits for;
   *   · the group is written, once, and the database refuses to move it after;
   *   · the activity opens for preparation.
   *
   * ── The race, and why it has only two endings ─────────────────────────────
   *
   * Somebody accepting while this runs either got there first — their seat is
   * `ACCEPTED`, the recount below includes them, and they are in the group —
   * or they arrive after: the invitation they are redeeming is revoked, and
   * `consume` refuses it exactly as it refuses a link that expired. There is
   * no third outcome, because both commands take the invitations before the
   * activity and one of them has to wait.
   */
  async closeOnboarding(
    actor: CircleActor,
    activityId: string,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<{
    readonly group: number;
    readonly replayed: boolean;
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx, now);

        // The organiser's, and only theirs. A guest closing the room would be
        // deciding the audience for everybody else's answers.
        if (ctx.self.memberId === null) {
          throw new CirclesError("CIRCLE_FORBIDDEN");
        }
        if (ctx.activity.onboarding !== "FLEXIBLE") {
          throw new CirclesError(UNUSABLE);
        }

        // Already closed — by an earlier press, or by this very request whose
        // response was lost. The group is read back from the row rather than
        // recomputed, because the row is what everybody else is now bound to.
        if (ctx.activity.confirmedParticipants !== null) {
          const receipt = await tx.circleEvent.findFirst({
            where: {
              type: "INVITATION_REVOKED",
              actorParticipantId: ctx.self.id,
              idempotencyKey,
            },
            select: { id: true },
          });
          // A DIFFERENT key on an already-closed room is not a replay: it is a
          // second attempt to decide a group that is already decided, and the
          // honest answer is that this activity is past that point.
          if (!receipt) throw new CirclesError(UNUSABLE);
          return {
            group: ctx.activity.confirmedParticipants,
            replayed: true,
          };
        }
        if (ctx.activity.status !== "INVITING") {
          throw new CirclesError(UNUSABLE);
        }

        const accepted = ctx.participants.filter(
          (p) => p.status === "ACCEPTED",
        ).length;
        // Two, counting the organiser. One person and nobody is not an
        // activity, and this is the only floor: the capacity they chose when
        // creating is what could have happened, not what must.
        if (accepted < MIN_FLEXIBLE_GROUP) {
          throw new CirclesError("CIRCLE_GROUP_TOO_SMALL");
        }

        const revoked = await tx.circleInvitation.updateMany({
          where: {
            activityId: ctx.activity.id,
            revokedAt: null,
            consumedAt: null,
          },
          data: { revokedAt: now },
        });
        await this.participants.dropUnclaimedSeats(ctx.activity.id, tx);

        const closed = await this.activities.closeOnboarding(
          ctx.activity.id,
          accepted,
          now,
          tx,
        );
        // Under this transaction's locks nothing else could have moved the
        // row, so a refusal here is the statement disagreeing with the count
        // taken three lines ago — an invariant failure, not a verdict.
        if (!closed) throw new CircleStorageError();

        // ONE event, carrying the caller's key so a retry after a lost
        // response replays instead of being told the room moved on. It says
        // what the ledger's grammar can say: links were revoked. The
        // transition itself is visible in the row, as it always was — the
        // roster-completed path never wrote an event either.
        {
          void revoked;
          const appended = await this.events.append(
            {
              circleId: ctx.activity.circleId,
              activityId: ctx.activity.id,
              type: "INVITATION_REVOKED",
              actorParticipantId: ctx.self.id,
              idempotencyKey,
            },
            tx,
          );
          if (appended.outcome !== "APPENDED") throw new CircleStorageError();
        }

        return { group: accepted, replayed: false };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  // ══ Withdraw ═════════════════════════════════════════════════════════════

  /**
   * Leave. One service for USER and GUEST, and no reason is accepted anywhere.
   *
   * Three outcomes, decided by where the activity is — and each is complete or
   * does not happen, because all of it is one transaction:
   *
   *   · `INVITING`  — the organizer retracts. Terminal, silent, and the
   *                   invitation becomes unusable.
   *   · `PREPARING` — cancels the Dúo and destroys BOTH pending envelopes. The
   *                   other person's snapshot was confirmed for a conversation
   *                   that is not going to happen.
   *   · `REVEALED`
   *     `FOLLOW_UP` — closes it and revokes future access. The withdrawer's own
   *                   envelope is purged; nothing pretends the other person can
   *                   un-see what they already read.
   *
   * ── Replay semantics differ by actor, and that is not a defect ────────────
   *
   *     MEMBER_WITHDRAW_REPLAY = response_idempotent
   *     GUEST_WITHDRAW_REPLAY  = effect_idempotent_but_credential_is_revoked
   *
   * A member retrying their withdrawal reaches this method, finds the receipt
   * and gets the same answer as the first call.
   *
   * A guest cannot, and must not. Withdrawing revokes the guest session — that
   * is the point of it — so the second attempt is refused by the guard with
   * `CIRCLE_GUEST_SESSION_INVALID` before this method runs. The EFFECT is
   * idempotent (leaving twice leaves once; nothing is written the second
   * time); the RESPONSE is not, because the credential that would have
   * produced it no longer exists.
   *
   * Making the two responses identical would mean keeping a revoked session
   * usable for one more call, and there is no way to scope "one more call" to
   * the harmless one: whatever window is opened for a replayed withdrawal is
   * the same window a stolen link uses. An imperfect response shape is worth
   * far less than an unconditional revocation, so the revocation wins and the
   * asymmetry is documented instead of engineered away.
   */
  async withdraw(
    actor: CircleActor,
    activityId: string,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<{
    readonly outcome: "CANCELLED" | "CLOSED";
    readonly replayed: boolean;
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);

        const receipt = await tx.circleEvent.findFirst({
          where: {
            type: "PARTICIPANT_WITHDRAWN",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { id: true },
        });
        if (receipt) {
          return {
            outcome: ctx.activity.status === "CLOSED" ? "CLOSED" : "CANCELLED",
            replayed: true,
          };
        }

        const stage = ctx.activity.status;
        if (stage === "CLOSED" || stage === "CANCELLED") {
          throw new CirclesError(UNUSABLE);
        }

        if (stage === "INVITING" || stage === "PREPARING") {
          // The same exit a group's private answer takes — seat, envelopes,
          // invitations, sessions and status, all inside the helper. ONE
          // implementation, so the two cannot drift and the ledger cannot tell
          // them apart.
          await this.exitWithoutSharing(ctx, idempotencyKey, now, tx);
          return { outcome: "CANCELLED", replayed: false };
        }

        const withdrew = await this.participants.withdraw(
          ctx.self.id,
          ctx.activity.id,
          now,
          tx,
        );
        if (!withdrew) throw new CirclesError(UNUSABLE);

        // ── After the reveal: whose access is cut ─────────────────────────
        //
        // The Dúo's rule is unchanged, deliberately. The person who left loses
        // their session and their seat; the other person keeps reading what
        // they were already reading, because in a two-person exchange that
        // content is half theirs and they have already seen it. Nothing here
        // pretends anybody can un-see it.
        //
        // A group is different in a way that is not a matter of degree. The
        // revealed room holds FOUR other people's answers, and each of them
        // agreed to be read inside an activity that is still running. Leaving
        // ends the activity — that has always been the rule — so continuing to
        // serve everybody else's selections to everybody else is serving them
        // out of a conversation that no longer exists.
        //
        // So for a group every session goes, and every live invitation with
        // them. The seat rows are untouched: this is an AUTHORIZATION change,
        // not a deletion, and the retention policy — including agreed
        // artifacts — is exactly what it was. What stops is future reading; see
        // `accessIsWithdrawn` for the other half, which is what the projection
        // enforces for members, who have no guest session to revoke.
        const everybody = ctx.activity.kind === "GROUP_ADULT";
        await tx.circleGuestSession.updateMany({
          where: {
            activityId: ctx.activity.id,
            ...(everybody ? {} : { participantId: ctx.self.id }),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        if (everybody) {
          await tx.circleInvitation.updateMany({
            where: { activityId: ctx.activity.id, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        const closed = await this.activities.close(
          ctx.activity.id,
          now,
          ["REVEALED", "FOLLOW_UP"],
          tx,
        );
        if (!closed) throw new CirclesError(UNUSABLE);

        const withdrawEvent = await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "PARTICIPANT_WITHDRAWN",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
        if (withdrawEvent.outcome !== "APPENDED") {
          throw new CircleStorageError();
        }
        await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "ACTIVITY_CLOSED",
          },
          tx,
        );
        return { outcome: "CLOSED", replayed: false };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  // ══ Artifact ═════════════════════════════════════════════════════════════

  /** Propose or edit the shared result. Editing supersedes; it never mutates. */
  async proposeArtifact(
    actor: CircleActor,
    activityId: string,
    body: string,
    idempotencyKey: string,
  ): Promise<{ readonly artifactId: string; readonly version: number }> {
    const cipher = this.requireCipher();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);
        if (
          ctx.activity.status !== "REVEALED" &&
          ctx.activity.status !== "FOLLOW_UP"
        ) {
          throw new CirclesError(UNUSABLE);
        }
        if (ctx.self.status !== "READY") throw new CirclesError(UNUSABLE);

        // A template whose outcome is NONE has no shared result. It was being
        // coerced to `AGREEMENT` — inventing a kind of outcome the reviewed
        // template deliberately does not offer, and then storing two people's
        // words under it. "There is nothing to produce here" is an editorial
        // decision; the API's job is to honour it, not to substitute one.
        if (ctx.definition.outcome.kind === "NONE") {
          throw new CirclesError(UNUSABLE);
        }

        // ── 6. CircleArtifact ────────────────────────────────────────────
        const existing = await this.artifacts.lockForActivity(
          ctx.activity.id,
          tx,
        );

        // ── The receipt is resolved BEFORE anything is superseded ─────────
        //
        // The previous order superseded the live artifact, created a new row
        // and only then appended the event — so a retried proposal bumped the
        // version, invalidated both confirmations of text that had already
        // been agreed, and the receipt collision at the end rolled it back
        // only if the append happened to be reached. A replay must not be
        // able to disturb the live version at all, which means deciding that
        // it IS a replay before touching anything.
        const prior = await tx.circleEvent.findFirst({
          where: {
            type: "ARTIFACT_PROPOSED",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { artifactId: true },
        });
        if (prior?.artifactId) {
          const already =
            existing.find((a) => a.id === prior.artifactId) ?? null;
          // Same key, same content → the same artifact and version, and no
          // new row. Same key, different content → a conflict: the key stands
          // for the text that was proposed under it, and honouring the second
          // body would silently replace what the other person may already
          // have confirmed.
          if (
            !already ||
            // Purged: the body this key was spent on is gone, so "same key,
            // same content" has nothing to compare against. Returning the
            // artifact would hand back a proposal with no text; minting a new
            // one would spend the key twice. A conflict is the honest answer
            // and, like every other refusal here, it does not say why.
            already.payloadHash === null ||
            !cipher.macMatches(
              already.payloadHash,
              cipher.macOf(body, this.artifactContext(ctx, already.version)),
            )
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return { artifactId: already.id, version: already.version };
        }

        const live = existing.find((a) => a.status !== "SUPERSEDED") ?? null;
        const nextVersion =
          existing.reduce((max, a) => Math.max(max, a.version), 0) + 1;
        if (live) await this.artifacts.supersede(live.id, tx);

        const envelope = cipher.seal(
          body,
          this.artifactContext(ctx, nextVersion),
        );
        const created = await this.artifacts.create(
          {
            activityId: ctx.activity.id,
            version: nextVersion,
            kind: ctx.definition.outcome.kind,
            envelope,
            createdByParticipantId: ctx.self.id,
          },
          tx,
        );
        const appended = await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "ARTIFACT_PROPOSED",
            artifactId: created.id,
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
        // Unreachable under the artifact lock this transaction holds, and
        // checked anyway: a REPLAY here would mean the row above was written
        // for a key that already had one, which is the state this whole
        // section exists to prevent.
        if (appended.outcome !== "APPENDED") throw new CircleStorageError();
        return { artifactId: created.id, version: nextVersion };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  /**
   * The AAD context for an artifact of a given version.
   *
   * The version is inside `sharingMode`, so an envelope sealed for v2 cannot
   * be opened as v3 even if somebody moved the row. It also means the payload
   * MAC is version-specific, which is what makes "same key, same content" a
   * comparison against the version that key actually produced.
   *
   * `participantId` is the ACTOR's seat, not the artifact's author: the caller
   * passes its own context, and every read re-derives it from
   * `createdByParticipantId` on the stored row. Both paths are exercised in
   * `circles-participation.pg-spec.ts`.
   */
  private artifactContext(
    ctx: ActivityContext,
    version: number,
  ): CircleEnvelopeContext {
    return {
      circleId: ctx.activity.circleId,
      activityId: ctx.activity.id,
      participantId: ctx.self.id,
      templateKey: ctx.activity.templateKey,
      templateVersion: ctx.activity.templateVersion,
      sharingMode: `ARTIFACT:v${version}`,
      fieldKeys: [],
    };
  }

  /** Confirm an EXACT artifact and version. Agreement needs EVERY seat. */
  async confirmArtifact(
    actor: CircleActor,
    activityId: string,
    artifactId: string,
    version: number,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<{ readonly agreed: boolean; readonly replayed: boolean }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);
        // The stage was never checked here. `CLOSED`, `CANCELLED`, `INVITING`
        // and `PREPARING` all accepted confirmations, so an artifact could be
        // agreed after the Dúo had ended — including by somebody confirming
        // into an activity the other person had already closed by leaving.
        // Agreement is a live act between two people; it does not happen to a
        // finished conversation.
        if (
          ctx.activity.status !== "REVEALED" &&
          ctx.activity.status !== "FOLLOW_UP"
        ) {
          throw new CirclesError(UNUSABLE);
        }
        if (ctx.self.status !== "READY") throw new CirclesError(UNUSABLE);

        const artifacts = await this.artifacts.lockForActivity(
          ctx.activity.id,
          tx,
        );
        const target = artifacts.find((a) => a.id === artifactId) ?? null;

        // ── The key is bound to the exact artifact and version ────────────
        //
        // A confirmation key stands for "I agree to THIS text". Reusing it
        // against a different artifact — or the same artifact at another
        // version — is a different statement, and the ledger already holds
        // what the key was spent on. Checked before the target is validated,
        // so a reused key is a conflict rather than a 404 about the artifact
        // it was pointed at.
        const prior = await tx.circleEvent.findFirst({
          where: {
            type: "ARTIFACT_CONFIRMED",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { artifactId: true },
        });
        if (prior) {
          const confirmed =
            artifacts.find((a) => a.id === prior.artifactId) ?? null;
          if (
            !confirmed ||
            confirmed.id !== artifactId ||
            confirmed.version !== version
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return { agreed: confirmed.status === "AGREED", replayed: true };
        }

        // The version is part of what is being confirmed, not a hint: a client
        // holding stale copy must not be able to agree to text it never saw.
        if (!target || target.version !== version)
          throw new CirclesError(UNUSABLE);
        if (target.status === "SUPERSEDED") throw new CirclesError(UNUSABLE);
        // Purged: the author's account was deleted while this was still a
        // draft, and its text is gone. Agreeing to it now would agree to
        // nothing, and would turn a proposal nobody can read into a shared
        // result. Refused with the same answer as every other unusable
        // artifact — "why" is not the confirmer's business, and here it would
        // announce that somebody deleted their account.
        //
        // The database refuses it too (`CircleArtifact_agreed_is_never_purged`).
        // This check is so the refusal is the product's, in the product's
        // vocabulary, rather than a constraint violation surfacing as storage.
        if (target.purgedAt !== null) throw new CirclesError(UNUSABLE);

        // ── Already confirmed, under a DIFFERENT key ─────────────────────
        //
        // This used to return `{ replayed: true }`, and that was a quiet
        // accounting hole rather than a convenience.
        //
        // The seat confirmed this artifact with K1, so the ledger holds K1's
        // receipt. Presenting K2 for the same act got a SUCCESS response —
        // and K2 was never written anywhere, because the append was skipped.
        // A key that has produced a successful response is spent: the caller
        // may reasonably believe K2 now stands for "I confirmed artifact A".
        // But nothing recorded that, so K2 stayed free, and the same K2 could
        // afterwards be used against artifact B and be accepted as a fresh
        // command. One key, two successful meanings, no record of the first.
        //
        // Refusing keeps the invariant simple: a key is spent only when a
        // receipt records it. K2 never succeeded here, so K2 is not spent,
        // and nothing is inconsistent. The transaction rolls back, so no
        // second `ARTIFACT_CONFIRMED` event is written either.
        //
        // `CIRCLE_IDEMPOTENCY_CONFLICT` and not a replay: the key is new, so
        // there is nothing to replay, and the committed state cannot satisfy
        // it. Opaque, like every other refusal here — though the seat is the
        // actor and already knows it confirmed.
        if (await this.artifacts.hasConfirmed(target.id, ctx.self.id, tx)) {
          throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
        }

        const appended = await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "ARTIFACT_CONFIRMED",
            artifactId: target.id,
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
        if (appended.outcome !== "APPENDED") throw new CircleStorageError();

        const confirmations = await this.artifacts.countConfirmations(
          target.id,
          tx,
        );
        let agreed = false;
        // The GROUP, not the capacity. A room offered to six that continued
        // with two is an agreement between those two: asking for six
        // confirmations would mean the people actually in the conversation
        // could never reach one.
        if (confirmations >= participatingSize(ctx.activity)) {
          agreed = await this.artifacts.agree(target.id, now, tx);
        }
        return { agreed, replayed: false };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  // ══ Follow-up ════════════════════════════════════════════════════════════

  /**
   * Record one decision. The state is derived, never chosen.
   *
   * A client asks to record `KEEP | ADJUST | CLOSE`. It does not ask for
   * `FOLLOW_UP` — the activity opens that stage itself, and only once the due
   * date has passed, in a conditional UPDATE whose predicate holds the date.
   */
  async recordFollowUp(
    actor: CircleActor,
    activityId: string,
    decision: CircleFollowUpDecision,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<{ readonly closed: boolean; readonly replayed: boolean }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);

        const receipt = await tx.circleEvent.findFirst({
          where: {
            type: "FOLLOW_UP_RECORDED",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { id: true },
        });
        if (receipt) {
          // The decision is what the key committed to. Returning success for
          // a DIFFERENT decision under the same key told a caller their
          // `CLOSE` had been recorded when the stored answer was still
          // `KEEP` — and the seat's decision is single-write, so no later
          // request could have corrected it either.
          if (ctx.self.followUpDecision !== decision) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return { closed: ctx.activity.status === "CLOSED", replayed: true };
        }

        // Derived transition: only if the date has actually arrived.
        if (ctx.activity.status === "REVEALED") {
          await this.activities.openFollowUpIfDue(ctx.activity.id, now, tx);
        }
        const current = await this.activities.lockById(ctx.activity.id, tx);
        if (!current || current.status !== "FOLLOW_UP") {
          throw new CirclesError(UNUSABLE);
        }

        const recorded = await this.participants.recordFollowUp(
          ctx.self.id,
          ctx.activity.id,
          decision,
          tx,
        );
        if (!recorded) throw new CirclesError(UNUSABLE);
        const followUpEvent = await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "FOLLOW_UP_RECORDED",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
        if (followUpEvent.outcome !== "APPENDED") {
          throw new CircleStorageError();
        }

        const seats = await this.participants.lockForActivity(
          ctx.activity.id,
          tx,
        );
        const decided = seats.filter((p) => p.followUpDecision !== null).length;
        let closed = false;
        // Same rule, same reason: the follow-up is over when the people who
        // were IN it have all answered. Against capacity, two participants
        // could never close their own conversation — only the clock could, a
        // week later, and closing on time is not the same as them deciding.
        if (decided >= participatingSize(current)) {
          closed = await this.activities.close(
            ctx.activity.id,
            now,
            ["FOLLOW_UP"],
            tx,
          );
          if (closed) {
            await this.events.append(
              {
                circleId: ctx.activity.circleId,
                activityId: ctx.activity.id,
                type: "ACTIVITY_CLOSED",
              },
              tx,
            );
          }
        }
        return { closed, replayed: false };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  // ══ Read ═════════════════════════════════════════════════════════════════

  /** The rows a projection needs, resolved through the same authority path. */
  async readActivity(
    actor: CircleActor,
    activityId: string,
  ): Promise<{
    readonly ctx: ActivityContext;
    readonly artifact: Awaited<
      ReturnType<CircleArtifactRepository["findActive"]>
    >;
    readonly confirmations: number;
    readonly confirmedByYou: boolean;
    /** Display names for the member seats, by seat id. */
    readonly memberNames: ReadonlyMap<string, string>;
    /** Seat indexes of invitations nobody has redeemed. Organiser only. */
    readonly pendingSeatIndexes: readonly number[];
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);
        const artifact = await this.artifacts.findActive(ctx.activity.id, tx);
        const confirmations = artifact
          ? await this.artifacts.countConfirmations(artifact.id, tx)
          : 0;
        const confirmedByYou = artifact
          ? await this.artifacts.hasConfirmed(artifact.id, ctx.self.id, tx)
          : false;

        // ── The two extra reads the room list needs ───────────────────────
        //
        // Names first. `firstName` before `name`, and NEITHER is an email or
        // an id: the columns are chosen here rather than selected broadly,
        // because "select the user and pick a field later" is how an address
        // ends up in a response nobody meant to put it in.
        const memberNames = new Map<string, string>();
        const memberSeats = ctx.participants.filter((p) => p.memberId !== null);
        if (memberSeats.length > 0) {
          const rows = await tx.circleMember.findMany({
            where: { id: { in: memberSeats.map((p) => p.memberId!) } },
            select: {
              id: true,
              user: { select: { firstName: true, name: true } },
            },
          });
          const byMember = new Map(rows.map((r) => [r.id, r.user]));
          for (const seat of memberSeats) {
            const user = byMember.get(seat.memberId!);
            const shown = user?.firstName?.trim() || user?.name?.trim() || null;
            if (shown) memberNames.set(seat.id, shown.slice(0, 24));
          }
        }

        // And the links still waiting — for the ORGANISER only. A guest
        // learning how many invitations are outstanding learns something
        // about people who have not decided yet.
        const pendingSeatIndexes =
          ctx.self.memberId !== null && ctx.activity.onboarding === "FLEXIBLE"
            ? (
                await tx.circleInvitation.findMany({
                  where: {
                    activityId: ctx.activity.id,
                    consumedAt: null,
                    revokedAt: null,
                    declinedAt: null,
                  },
                  select: { seatIndex: true },
                  orderBy: { seatIndex: "asc" },
                })
              ).map((r) => r.seatIndex)
            : [];

        return {
          ctx,
          artifact,
          confirmations,
          confirmedByYou,
          memberNames,
          pendingSeatIndexes,
        };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  /**
   * Resolve WHO is contributing, and let the analytics plane store it.
   *
   * The actor, the seat and the template are all derived here, from the same
   * authority check every command goes through. Nothing about identity comes
   * from the request body — a browser that could name its own `participantId`
   * or `templateKey` could file a contribution as somebody else, in an
   * activity it was never part of.
   *
   * Read-only as far as the DOMAIN is concerned: this resolves and returns.
   * Writing happens in the analytics plane, outside the transaction, and its
   * failure is its own — a contribution that cannot be stored must never turn
   * a finished activity into an error.
   */
  async resolveContributor(
    actor: CircleActor,
    activityId: string,
  ): Promise<{
    participantId: string;
    templateKey: string;
    templateVersion: number;
    activityId: string;
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx = await this.resolveAuthority(actor, activityId, tx);
        return {
          participantId: ctx.self.id,
          templateKey: ctx.activity.templateKey,
          templateVersion: ctx.activity.templateVersion,
          activityId: ctx.activity.id,
        };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
  }

  /**
   * Open an envelope for the actor entitled to it, and prove it still means
   * what it claims.
   *
   * `open()` now verifies the payload MAC, so a stripped or altered
   * `payloadHash` refuses here instead of sailing through as the empty string
   * the previous version passed in. `verifyDecryptedShare` then re-checks the
   * plaintext against the pinned template and against the mode and field keys
   * stored on the row — see its comment for why authentication alone is not
   * the same as validity.
   *
   * `definition` is REQUIRED, which is the point: there is no overload that
   * skips the template check.
   */
  openEnvelope(
    participant: CircleParticipantRow,
    activity: CircleActivityRow,
    definition: CircleActivityDefinition,
  ): string | null {
    if (
      !participant.ciphertext ||
      !participant.nonce ||
      !participant.sharingMode ||
      !participant.payloadHash
    ) {
      return null;
    }
    let plaintext: string;
    try {
      plaintext = this.requireCipher().open(
        {
          ciphertext: participant.ciphertext,
          nonce: participant.nonce,
          keyVersion: participant.keyVersion ?? 0,
          payloadHash: participant.payloadHash,
        },
        {
          circleId: activity.circleId,
          activityId: activity.id,
          participantId: participant.id,
          templateKey: activity.templateKey,
          templateVersion: activity.templateVersion,
          sharingMode: participant.sharingMode,
          fieldKeys: participant.fieldKeys,
        },
      );
    } catch {
      return null;
    }
    const verified = verifyDecryptedShare(plaintext, definition, participant);
    // Re-canonicalised rather than returned as read: the caller receives the
    // bytes this build would have produced for that meaning, so nothing that
    // survived parsing but is not part of the shape can reach a response.
    return verified ? canonicalShareBody(verified) : null;
  }

  /**
   * Open an artifact body for a participant of its activity.
   *
   * `payloadHash` is a real column now. It used to be passed as `""`, which
   * `open()` ignored — so the artifact, the one piece of content BOTH people
   * put their name to, was the only envelope in the system with no integrity
   * check at all.
   */
  openArtifact(
    artifact: {
      id: string;
      version: number;
      ciphertext: string | null;
      nonce: string | null;
      keyVersion: number | null;
      payloadHash: string | null;
      createdByParticipantId: string;
    },
    activity: CircleActivityRow,
  ): string | null {
    // Purged. Not an error and not a decryption failure — there is nothing to
    // open. The projection already renders a null body as no artifact at all,
    // so the room shows the conversation without a shared result rather than
    // an empty quote or a broken screen.
    if (
      artifact.ciphertext === null ||
      artifact.nonce === null ||
      artifact.keyVersion === null ||
      artifact.payloadHash === null
    ) {
      return null;
    }
    try {
      return this.requireCipher().open(
        {
          ciphertext: artifact.ciphertext,
          nonce: artifact.nonce,
          keyVersion: artifact.keyVersion,
          payloadHash: artifact.payloadHash,
        },
        {
          circleId: activity.circleId,
          activityId: activity.id,
          participantId: artifact.createdByParticipantId,
          templateKey: activity.templateKey,
          templateVersion: activity.templateVersion,
          sharingMode: `ARTIFACT:v${artifact.version}`,
          fieldKeys: [],
        },
      );
    } catch {
      return null;
    }
  }

  /** Every domain failure leaves as a closed code, never as a driver message. */
  private asCirclesError(err: unknown): CirclesError {
    if (err instanceof CirclesError) return err;
    if (err instanceof CircleStorageError) {
      return new CirclesError("CIRCLE_STORAGE_FAILURE");
    }
    if (err instanceof CirclesCryptoError) {
      return new CirclesError("CIRCLE_STORAGE_FAILURE");
    }
    return new CirclesError("CIRCLE_STORAGE_FAILURE");
  }
}
