import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

export interface CreateDuoInput {
  readonly userId: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  /** 256 bits of caller-supplied entropy. Hashed here, never stored raw. */
  readonly invitationToken: string;
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
  readonly counterpart: CircleParticipantRow | null;
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
    const counterpart = participants.find((p) => p.id !== self.id) ?? null;

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

    return { activity, participants, self, counterpart, definition };
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
   *   3. LOCK member, then invitation, then session — canonical order;
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

    // ── 2. CircleInvitation ──────────────────────────────────────────────
    const invitation = await this.invitations.lockById(invitationPeek.id, tx);
    if (
      !invitation ||
      invitation.revokedAt !== null ||
      invitation.activityId !== activityId ||
      invitation.createdByMemberId !== inviter.id
    ) {
      throw new CirclesError(UNUSABLE);
    }

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

    // Only a PUBLISHED template can be instantiated. DRAFT and ARCHIVED
    // resolve by exact pin — a running activity must keep working — but
    // neither may start a new one.
    let definition: CircleActivityDefinition;
    try {
      definition = this.registry.getPublished(
        input.templateKey,
        input.templateVersion,
      );
    } catch {
      throw new CirclesError("CIRCLE_TEMPLATE_UNAVAILABLE");
    }

    const { hashSecret } = await import("./circles-secrets");
    const tokenHash = hashSecret(input.invitationToken);

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
          const sameToken = await tx.circleInvitation.findFirst({
            where: { circleId: prior.circleId, tokenHash },
            select: { id: true },
          });
          const priorActivity = prior.activityId
            ? await this.activities.findById(prior.activityId, tx)
            : null;
          if (
            !sameToken ||
            !priorActivity ||
            priorActivity.templateKey !== input.templateKey ||
            priorActivity.templateVersion !== input.templateVersion
          ) {
            throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          }
          return {
            circleId: prior.circleId,
            activityId: priorActivity.id,
            replayed: true,
          };
        }

        const circle = await tx.circle.create({
          data: {
            kind: "DUO",
            status: "ACTIVE",
            createdByUserId: input.userId,
            maxParticipants: 2,
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
            requiredParticipants: 2,
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
        const invitation = await tx.circleInvitation.create({
          data: {
            circleId: circle.id,
            activityId: activity.id,
            createdByMemberId: member.id,
            tokenHash,
            expiresAt: new Date(now.getTime() + 14 * 24 * 3_600_000),
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
  ): Promise<{ readonly revealed: boolean; readonly replayed: boolean }> {
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

        const receipt = await tx.circleEvent.findFirst({
          where: {
            type: "PARTICIPANT_READY",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { id: true },
        });
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

        if (ctx.activity.status !== "PREPARING")
          throw new CirclesError(UNUSABLE);
        if (ctx.self.status !== "ACCEPTED") throw new CirclesError(UNUSABLE);

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

        const withdrew = await this.participants.withdraw(
          ctx.self.id,
          ctx.activity.id,
          now,
          tx,
        );
        if (!withdrew) throw new CirclesError(UNUSABLE);

        let outcome: "CANCELLED" | "CLOSED";
        if (stage === "INVITING" || stage === "PREPARING") {
          // Pending envelopes on BOTH sides go, then the activity is terminal.
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
          outcome = "CANCELLED";
        } else {
          await tx.circleGuestSession.updateMany({
            where: {
              activityId: ctx.activity.id,
              participantId: ctx.self.id,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          const closed = await this.activities.close(
            ctx.activity.id,
            now,
            ["REVEALED", "FOLLOW_UP"],
            tx,
          );
          if (!closed) throw new CirclesError(UNUSABLE);
          outcome = "CLOSED";
        }

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
            type:
              outcome === "CANCELLED"
                ? "ACTIVITY_CANCELLED"
                : "ACTIVITY_CLOSED",
          },
          tx,
        );
        return { outcome, replayed: false };
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

  /** Confirm an EXACT artifact and version. Agreement needs both seats. */
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

        // A second confirmation of the same artifact by the same seat under a
        // DIFFERENT key. Not a replay of this key — the receipt above said so
        // — and not an error either: the seat has already agreed, and saying
        // so again changes nothing.
        if (await this.artifacts.hasConfirmed(target.id, ctx.self.id, tx)) {
          return { agreed: target.status === "AGREED", replayed: true };
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
        if (confirmations >= ctx.activity.requiredParticipants) {
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
        if (decided >= current.requiredParticipants) {
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
        return { ctx, artifact, confirmations, confirmedByYou };
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
      ciphertext: string;
      nonce: string;
      keyVersion: number;
      payloadHash: string;
      createdByParticipantId: string;
    },
    activity: CircleActivityRow,
  ): string | null {
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
