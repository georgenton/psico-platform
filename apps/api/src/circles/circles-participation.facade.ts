import { Injectable } from "@nestjs/common";
import type {
  CircleActivityView,
  CircleActor,
  CircleFollowUpDecision,
  CircleShareConfirmation,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesParticipationService } from "./circles-participation.service";
import { CirclesError } from "./circles-http-errors";
import { projectActivity } from "./circles-projection";
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
  constructor(private readonly domain: CirclesParticipationService) {}

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
      invitationToken: dto.invitationToken,
      idempotencyKey,
    });
    // Deliberately minimal: two ids and nothing else. Not the token — the
    // caller minted it — and not the invitation id, which is not theirs to
    // hold.
    return { circleId: created.circleId, activityId: created.activityId };
  }

  async read(
    actor: CircleActor,
    activityId: string,
  ): Promise<CircleActivityView> {
    const { ctx, artifact, confirmations, confirmedByYou } =
      await this.domain.readActivity(actor, activityId);

    const revealedStage =
      ctx.activity.status === "REVEALED" ||
      ctx.activity.status === "FOLLOW_UP" ||
      (ctx.activity.status === "CLOSED" && ctx.activity.revealedAt !== null);
    // `READY` only. `ACCEPTED` used to qualify, which after the barrier means
    // a seat with no confirmed snapshot reading the other person's — receiving
    // without giving. The projection enforces the same rule independently; see
    // `mayReadRevealedContent`.
    const selfStillIn = ctx.self.status === "READY";

    // The counterpart's envelope is not merely hidden before the reveal — it is
    // never decrypted. There is nothing in memory for a later bug to serialize.
    const counterpartBody =
      revealedStage && selfStillIn && ctx.counterpart
        ? this.domain.openEnvelope(
            ctx.counterpart,
            ctx.activity,
            ctx.definition,
          )
        : null;

    return projectActivity({
      activity: ctx.activity,
      definition: ctx.definition,
      self: ctx.self,
      counterpart: ctx.counterpart,
      readyCount: ctx.participants.filter((p) => p.status === "READY").length,
      selfBody: this.domain.openEnvelope(
        ctx.self,
        ctx.activity,
        ctx.definition,
      ),
      counterpartBody,
      artifact:
        artifact && revealedStage && selfStillIn
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
