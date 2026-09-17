import { Injectable } from "@nestjs/common";
import type {
  CircleActivityView,
  CircleActor,
  CircleFollowUpDecision,
  CircleShareConfirmation,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesParticipationService } from "./circles-participation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesAnalyticsService } from "./circles-analytics.service";
import { CirclesError } from "./circles-http-errors";
import { accessIsWithdrawn, projectActivity } from "./circles-projection";
import type { CreateDuoDto } from "./dto/participation.dto";

/**
 * The thin layer between two controllers and one domain (PR3).
 *
 * It exists so the controllers can stay what they should be — routing, guards
 * and shapes — while the decision about WHAT a caller may see lives next to the
 * projection that enforces it. Both the member and the guest controller call
 * exactly these methods; there is no branch anywhere below this line on how the
 * actor was proven.
 *
 * The read path is the one worth reading carefully. Decrypting the
 * counterpart's envelope is gated on the same condition the projection uses,
 * and the projection is what decides what appears — so a bug that decrypted too
 * eagerly would still not serialize the result, and a bug in the projection
 * would have nothing to serialize. Two independent gates on the one thing the
 * product promises.
 */
@Injectable()
export class CirclesParticipationFacade {
  constructor(
    private readonly domain: CirclesParticipationService,
    private readonly analytics: CirclesAnalyticsService,
  ) {}

  /**
   * Store one person's optional contribution.
   *
   * Two steps, and the order is the guarantee: the domain resolves WHO is
   * contributing — seat, template, activity — and only then does the analytics
   * plane write. Nothing identifying travels in the body, so a browser cannot
   * file a contribution as somebody else or against an activity it was never
   * in.
   *
   * `usefulness` absent means skipped. It is stored as `null` rather than as a
   * fourth value, so "prefirió no decirlo" can never appear in a distribution
   * as though it were an opinion.
   */
  async recordFeedback(
    actor: CircleActor,
    activityId: string,
    input: {
      topics: readonly string[];
      usefulness?: "YES" | "SOME" | "NO";
      noticeVersion: string;
      helpOpens?: readonly {
        fieldKey: string;
        piece: "explanation" | "example";
        opens: number;
      }[];
    },
  ): Promise<{ recorded: true }> {
    const who = await this.domain.resolveContributor(actor, activityId);
    await this.analytics.recordFeedback({
      activityId: who.activityId,
      participantId: who.participantId,
      templateKey: who.templateKey,
      templateVersion: who.templateVersion,
      topics: input.topics,
      usefulness: input.usefulness ?? null,
      noticeVersion: input.noticeVersion,
      helpOpens: input.helpOpens ?? [],
    });
    return { recorded: true };
  }

  async createDuo(
    actor: CircleActor,
    dto: CreateDuoDto,
    idempotencyKey: string,
  ): Promise<{ circleId: string; activityId: string }> {
    if (actor.kind !== "USER") throw new CirclesError("CIRCLE_FORBIDDEN");
    const created = await this.domain.createDuo({
      userId: actor.userId,
      templateKey: dto.templateKey,
      templateVersion: dto.templateVersion,
      invitationTokens: dto.invitationTokens,
      ...(dto.size === undefined ? {} : { size: dto.size }),
      idempotencyKey,
    });
    // Deliberately minimal: two ids and nothing else. Not the token — the
    // caller minted it — and not the invitation id, which is not theirs to
    // hold.
    return { circleId: created.circleId, activityId: created.activityId };
  }

  /** Fix the group. Organiser only; see the service for why. */
  closeOnboarding(
    actor: CircleActor,
    activityId: string,
    idempotencyKey: string,
  ) {
    return this.domain.closeOnboarding(actor, activityId, idempotencyKey);
  }

  async read(
    actor: CircleActor,
    activityId: string,
  ): Promise<CircleActivityView> {
    const {
      ctx,
      artifact,
      confirmations,
      confirmedByYou,
      memberNames,
      pendingSeatIndexes,
    } = await this.domain.readActivity(actor, activityId);

    const revealedStage =
      ctx.activity.status === "REVEALED" ||
      ctx.activity.status === "FOLLOW_UP" ||
      (ctx.activity.status === "CLOSED" && ctx.activity.revealedAt !== null);
    // `READY` only. `ACCEPTED` used to qualify, which after the barrier means
    // a seat with no confirmed snapshot reading the other person's — receiving
    // without giving. The projection enforces the same rule independently; see
    // `mayReadRevealedContent`.
    const selfStillIn = ctx.self.status === "READY";
    // And the room's own answer, asked BEFORE anything is decrypted. A group
    // that somebody left after the reveal is closed to everybody, so the
    // envelopes are not opened at all — there is nothing in memory for a later
    // bug to serialize. The projection asks the same question again with the
    // same function, because two checks that must agree are weaker than one
    // that cannot be bypassed, and this is the cheap half.
    const roomOpen = !accessIsWithdrawn(ctx.activity, ctx.participants);

    // The other people's envelopes are not merely hidden before the reveal —
    // they are never decrypted. There is nothing in memory for a later bug to
    // serialize. The condition is evaluated ONCE, outside the loop, so a room
    // of six cannot end up with five seats refused and one opened.
    const mayOpenOthers = revealedStage && selfStillIn && roomOpen;
    const others = ctx.others.map((participant) => ({
      participant,
      position: ctx.positions.get(participant.id) ?? 0,
      body: mayOpenOthers
        ? this.domain.openEnvelope(participant, ctx.activity, ctx.definition)
        : null,
    }));

    return projectActivity({
      activity: ctx.activity,
      definition: ctx.definition,
      self: ctx.self,
      others,
      readyCount: ctx.participants.filter((p) => p.status === "READY").length,
      memberNames,
      pendingSeatIndexes,
      selfBody: this.domain.openEnvelope(
        ctx.self,
        ctx.activity,
        ctx.definition,
      ),
      artifact:
        artifact && mayOpenOthers
          ? {
              id: artifact.id,
              version: artifact.version,
              status: artifact.status,
              body: this.domain.openArtifact(artifact, ctx.activity),
              confirmations,
              confirmedByYou,
            }
          : null,
    });
  }

  confirmShare(
    actor: CircleActor,
    activityId: string,
    confirmation: CircleShareConfirmation,
    idempotencyKey: string,
  ) {
    return this.domain.confirmShare(
      actor,
      activityId,
      confirmation,
      idempotencyKey,
    );
  }

  withdraw(actor: CircleActor, activityId: string, idempotencyKey: string) {
    return this.domain.withdraw(actor, activityId, idempotencyKey);
  }

  proposeArtifact(
    actor: CircleActor,
    activityId: string,
    body: string,
    idempotencyKey: string,
  ) {
    return this.domain.proposeArtifact(actor, activityId, body, idempotencyKey);
  }

  confirmArtifact(
    actor: CircleActor,
    activityId: string,
    artifactId: string,
    version: number,
    idempotencyKey: string,
  ) {
    return this.domain.confirmArtifact(
      actor,
      activityId,
      artifactId,
      version,
      idempotencyKey,
    );
  }

  recordFollowUp(
    actor: CircleActor,
    activityId: string,
    decision: CircleFollowUpDecision,
    idempotencyKey: string,
  ) {
    return this.domain.recordFollowUp(
      actor,
      activityId,
      decision,
      idempotencyKey,
    );
  }
}
