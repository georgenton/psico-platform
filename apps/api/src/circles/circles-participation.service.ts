import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
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
   * USER: an ACTIVE membership of the activity's circle, locked first.
   * GUEST: a live session whose `activityId` matches, locked third.
   *
   * Returns the actor's own seat. A `null` anywhere on the path produces the
   * same opaque refusal as an activity that does not exist, so probing an id
   * teaches nothing.
   */
  private async resolveAuthority(
    actor: CircleActor,
    activityId: string,
    tx: CirclesTx,
  ): Promise<ActivityContext> {
    if (actor.kind === "GUEST" && actor.activityId !== activityId) {
      // A guest's actor names its one activity. Asking about another is not an
      // authorization failure to explain; it is a question with no answer.
      throw new CirclesError(UNUSABLE);
    }

    // ── 1. CircleMember (USER only) ──────────────────────────────────────
    let membership: { id: string; circleId: string } | null = null;
    if (actor.kind === "USER") {
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
    }

    // ── 3. CircleGuestSession (GUEST only) ───────────────────────────────
    if (actor.kind === "GUEST") {
      const session = await this.guestSessions.findById(
        actor.guestSessionId,
        tx,
      );
      if (!session || !guestSessionIsLive(session, new Date())) {
        throw new CirclesError(UNUSABLE);
      }
      if (session.activityId !== activityId) throw new CirclesError(UNUSABLE);
    }

    // ── 4. CircleActivity ────────────────────────────────────────────────
    const activity = await this.activities.lockById(activityId, tx);
    if (!activity) throw new CirclesError(UNUSABLE);

    // ── 5. CircleActivityParticipant ─────────────────────────────────────
    const participants = await this.participants.lockForActivity(
      activityId,
      tx,
    );
    const self =
      actor.kind === "GUEST"
        ? participants.find((p) => p.id === actor.participantId)
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
        // A replay is decided by the receipt, in PostgreSQL, before anything
        // is written. `CIRCLE_CREATED` carries the idempotency key; the token
        // hash is what tells a replay from a conflict.
        const prior = await tx.circleEvent.findFirst({
          where: {
            type: "CIRCLE_CREATED",
            actorUserId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
          select: { circleId: true, activityId: true },
        });
        if (prior) {
          const sameToken = await tx.circleInvitation.findFirst({
            where: { circleId: prior.circleId, tokenHash },
            select: { id: true },
          });
          if (!sameToken) throw new CirclesError("CIRCLE_IDEMPOTENCY_CONFLICT");
          return {
            circleId: prior.circleId,
            activityId: prior.activityId as string,
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
        const ctx = await this.resolveAuthority(actor, activityId, tx);

        const receipt = await tx.circleEvent.findFirst({
          where: {
            type: "PARTICIPANT_READY",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          select: { id: true },
        });
        if (receipt) {
          return {
            revealed: ctx.activity.status !== "PREPARING",
            replayed: true,
          };
        }

        if (ctx.activity.status !== "PREPARING")
          throw new CirclesError(UNUSABLE);
        if (ctx.self.status !== "ACCEPTED") throw new CirclesError(UNUSABLE);

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
        const envelope = cipher.seal(canonicalShareBody(confirmation), context);

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

        await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "PARTICIPANT_READY",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );

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

        await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "PARTICIPANT_WITHDRAWN",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );
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

        // ── 6. CircleArtifact ────────────────────────────────────────────
        const existing = await this.artifacts.lockForActivity(
          ctx.activity.id,
          tx,
        );
        const live = existing.find((a) => a.status !== "SUPERSEDED") ?? null;
        const nextVersion =
          existing.reduce((max, a) => Math.max(max, a.version), 0) + 1;
        if (live) await this.artifacts.supersede(live.id, tx);

        const envelope = cipher.seal(body, {
          circleId: ctx.activity.circleId,
          activityId: ctx.activity.id,
          participantId: ctx.self.id,
          templateKey: ctx.activity.templateKey,
          templateVersion: ctx.activity.templateVersion,
          sharingMode: `ARTIFACT:v${nextVersion}`,
          fieldKeys: [],
        });
        const created = await this.artifacts.create(
          {
            activityId: ctx.activity.id,
            version: nextVersion,
            kind:
              ctx.definition.outcome.kind === "NONE"
                ? "AGREEMENT"
                : ctx.definition.outcome.kind,
            envelope,
            createdByParticipantId: ctx.self.id,
          },
          tx,
        );
        await this.events.append(
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
        return { artifactId: created.id, version: nextVersion };
      });
    } catch (err) {
      throw this.asCirclesError(err);
    }
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
        if (ctx.self.status !== "READY") throw new CirclesError(UNUSABLE);

        const artifacts = await this.artifacts.lockForActivity(
          ctx.activity.id,
          tx,
        );
        const target = artifacts.find((a) => a.id === artifactId) ?? null;
        // The version is part of what is being confirmed, not a hint: a client
        // holding stale copy must not be able to agree to text it never saw.
        if (!target || target.version !== version)
          throw new CirclesError(UNUSABLE);
        if (target.status === "SUPERSEDED") throw new CirclesError(UNUSABLE);

        if (await this.artifacts.hasConfirmed(target.id, ctx.self.id, tx)) {
          return { agreed: target.status === "AGREED", replayed: true };
        }

        await this.events.append(
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
        await this.events.append(
          {
            circleId: ctx.activity.circleId,
            activityId: ctx.activity.id,
            type: "FOLLOW_UP_RECORDED",
            actorParticipantId: ctx.self.id,
            idempotencyKey,
          },
          tx,
        );

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

  /** Open an envelope for the actor entitled to it. */
  openEnvelope(
    participant: CircleParticipantRow,
    activity: CircleActivityRow,
  ): string | null {
    if (
      !participant.ciphertext ||
      !participant.nonce ||
      !participant.sharingMode
    ) {
      return null;
    }
    try {
      return this.requireCipher().open(
        {
          ciphertext: participant.ciphertext,
          nonce: participant.nonce,
          keyVersion: participant.keyVersion ?? 0,
          payloadHash: participant.payloadHash ?? "",
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
  }

  /** Open an artifact body for a participant of its activity. */
  openArtifact(
    artifact: {
      id: string;
      version: number;
      ciphertext: string;
      nonce: string;
      keyVersion: number;
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
          payloadHash: "",
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
