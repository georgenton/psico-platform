import { ForbiddenException, Injectable } from "@nestjs/common";
import type {
  CompletePracticeCommand,
  CompleteUnitCommand,
  ExploreConceptCommand,
  LearningCommandResponse,
  OpenUnitCommand,
  SubmitRecallAttemptCommand,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ContentAccessService } from "../content-core/access/content-access.service";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  LearningCatalogResolver,
  type ResolvedUnitContext,
} from "./learning-catalog.resolver";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningEventRepository } from "./learning-event.repository";
import { learningException, mapRepositoryErrors } from "./learning-errors";
import type { ValidatedLearningEvent } from "./validated-learning-event";

/**
 * CC-7.3 — the five learning domain commands (ADR 0017 §1/§2).
 *
 * Every command follows the same spine: parse (already done by the CC-7.1
 * parser in the controller) → resolve the catalog key to full editorial
 * context → entitlement via ContentAccessService (the same gate every content
 * surface uses) → build the server-owned `ValidatedLearningEvent` → persist
 * through the SINGLE writer. Any failure before the append writes nothing.
 *
 * The actor is ALWAYS the authenticated JWT user — no command reads a userId
 * from the wire.
 */
@Injectable()
export class LearningCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: LearningCatalogResolver,
    private readonly access: ContentAccessService,
    private readonly repository: LearningEventRepository,
  ) {}

  /**
   * The SAME entitlement gate as every content read (CC-6E): resolve →
   * `assertCanReadUnit`. Any denial surfaces as the value-free
   * LEARNING_EVENT_FORBIDDEN — never the underlying reason, never catalog
   * detail the user has no access to.
   */
  private async gate(
    user: AuthenticatedUser,
    ctx: ResolvedUnitContext,
  ): Promise<void> {
    try {
      await this.access.assertCanReadUnit({
        userId: user.userId,
        userPlan: user.plan,
        editionKey: ctx.editionKey,
        unitKey: ctx.unitKey,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw learningException("LEARNING_EVENT_FORBIDDEN");
      }
      // The resolver already proved the unit exists in the published
      // revision; a NotFound here means the legacy bridge disagrees — an
      // unresolvable editorial context, not a 404 on the client's key.
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
  }

  private toResponse(result: {
    created: boolean;
    replayed: boolean;
    record: LearningCommandResponse["event"];
  }): LearningCommandResponse {
    return {
      created: result.created,
      replayed: result.replayed,
      event: result.record,
    };
  }

  /** POST /api/learning/units/:unitKey/open — repeatable across keys. */
  async openUnit(
    user: AuthenticatedUser,
    command: OpenUnitCommand,
  ): Promise<LearningCommandResponse> {
    const ctx = await this.resolver.resolveUnit(command.unitKey);
    await this.gate(user, ctx);
    const input: ValidatedLearningEvent<"unit_opened"> = {
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      type: "unit_opened",
      payload: { editionKey: ctx.editionKey, unitKey: ctx.unitKey },
      editionId: ctx.editionId,
      unitId: ctx.unitId,
    };
    const result = await mapRepositoryErrors(() =>
      this.repository.appendValidated(input),
    );
    return this.toResponse(result);
  }

  /**
   * POST /api/learning/units/:unitKey/complete — a real server-side
   * TRANSITION (ADR 0017 §2): requires a prior V1 unit_opened and no prior
   * completion, race-safe under an advisory transaction lock keyed by
   * (userId, unitId). What it guarantees is that the transition was ACCEPTED
   * — never that the unit was read, attended to, or understood.
   */
  async completeUnit(
    user: AuthenticatedUser,
    command: CompleteUnitCommand,
  ): Promise<LearningCommandResponse> {
    const ctx = await this.resolver.resolveUnit(command.unitKey);
    await this.gate(user, ctx);
    const input: ValidatedLearningEvent<"unit_completed"> = {
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      type: "unit_completed",
      payload: {
        editionKey: ctx.editionKey,
        unitKey: ctx.unitKey,
        // Server-owned: the revision the transition ran against.
        revisionNumber: ctx.revisionNumber,
      },
      editionId: ctx.editionId,
      unitId: ctx.unitId,
    };

    const lockKey = `learning:unit-completion:${user.userId}:${ctx.unitId}`;
    return this.prisma.$transaction(async (tx) => {
      // Serialize completions per (user, unit): two racing completions with
      // DIFFERENT keys cannot both pass the "no prior completion" check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 42))`;

      // Idempotency BEFORE the transition — an exact replay never re-runs it.
      const inspection = await mapRepositoryErrors(() =>
        this.repository.inspectValidated(input, tx),
      );
      if (inspection.state === "replay") {
        return this.toResponse({
          created: false,
          replayed: true,
          record: inspection.record,
        });
      }

      const opened = await tx.learningEvent.findFirst({
        where: {
          userId: user.userId,
          unitId: ctx.unitId,
          kind: "UNIT_OPENED",
          schemaVersion: 1,
        },
        select: { id: true },
      });
      if (!opened) {
        throw learningException("LEARNING_EVENT_INVALID_TRANSITION");
      }
      const alreadyCompleted = await tx.learningEvent.findFirst({
        where: {
          userId: user.userId,
          unitId: ctx.unitId,
          kind: "UNIT_COMPLETED",
          schemaVersion: 1,
        },
        select: { id: true },
      });
      if (alreadyCompleted) {
        throw learningException("LEARNING_EVENT_INVALID_TRANSITION");
      }

      const result = await mapRepositoryErrors(() =>
        this.repository.appendValidated(input, tx),
      );
      return this.toResponse(result);
    });
  }

  /**
   * POST /api/learning/concepts/:conceptKey/explore. Every editorial field is
   * server-resolved; `concept_explored` NEVER creates or modifies a Resonance
   * (ADR 0017 §7 / ADR 0018).
   */
  async exploreConcept(
    user: AuthenticatedUser,
    command: ExploreConceptCommand,
  ): Promise<LearningCommandResponse> {
    const ctx = await this.resolver.resolveConcept(command.conceptKey);
    await this.gate(user, ctx);
    const input: ValidatedLearningEvent<"concept_explored"> = {
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      type: "concept_explored",
      payload: { conceptKey: ctx.conceptKey, unitKey: ctx.unitKey },
      editionId: ctx.editionId,
      unitId: ctx.unitId,
      conceptId: ctx.conceptId,
    };
    const result = await mapRepositoryErrors(() =>
      this.repository.appendValidated(input),
    );
    return this.toResponse(result);
  }

  /**
   * POST /api/learning/recall-attempts. The catalog row declares the mode;
   * the client's variant must MATCH it — the mode is never deduced from what
   * was sent. Objective attempts are graded by the SERVER against the
   * catalog's canonical answer; the chosen option is persisted; the correct
   * option is never exposed.
   */
  async submitRecallAttempt(
    user: AuthenticatedUser,
    command: SubmitRecallAttemptCommand,
  ): Promise<LearningCommandResponse> {
    const item = await this.resolver.resolveRecallItem(command.itemKey);
    await this.gate(user, item);

    let payload: ValidatedLearningEvent<"active_recall_attempted">["payload"];
    if (command.kind === "objective") {
      if (item.mode !== "objective") {
        // A selectedOptionKey against a self-assessed item is a payload error.
        throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
      }
      if (!item.optionKeys.includes(command.selectedOptionKey)) {
        throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
      }
      payload = {
        unitKey: item.unitKey,
        itemKey: item.itemKey,
        conceptKey: item.conceptKey,
        evaluationSource: "server",
        selectedOptionKey: command.selectedOptionKey,
        // SERVER-graded — the client never sends result/evaluationSource.
        result:
          command.selectedOptionKey === item.correctOptionKey
            ? "correct"
            : "incorrect",
      };
    } else {
      if (item.mode !== "self_assessed") {
        // A selfResult against an objective item is a payload error — the
        // catalog demands a graded option there.
        throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
      }
      payload = {
        unitKey: item.unitKey,
        itemKey: item.itemKey,
        conceptKey: item.conceptKey,
        evaluationSource: "self_assessed",
        selectedOptionKey: null,
        result: command.selfResult,
      };
    }

    const input: ValidatedLearningEvent<"active_recall_attempted"> = {
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      type: "active_recall_attempted",
      payload,
      editionId: item.editionId,
      unitId: item.unitId,
      conceptId: item.conceptId,
    };
    const result = await mapRepositoryErrors(() =>
      this.repository.appendValidated(input),
    );
    return this.toResponse(result);
  }

  /**
   * POST /api/learning/practices/:exerciseKey/complete. Records that the
   * practice's completion was REGISTERED — no reflection, duration, emotion
   * or score is accepted, and no Resonance/Checkin/emotional signal is
   * created (ADR 0017 §6).
   */
  async completePractice(
    user: AuthenticatedUser,
    command: CompletePracticeCommand,
  ): Promise<LearningCommandResponse> {
    const ctx = await this.resolver.resolveExercise(command.exerciseKey);
    await this.gate(user, ctx);
    const input: ValidatedLearningEvent<"practice_completed"> = {
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      type: "practice_completed",
      payload: { exerciseKey: ctx.exerciseKey, unitKey: ctx.unitKey },
      editionId: ctx.editionId,
      unitId: ctx.unitId,
    };
    const result = await mapRepositoryErrors(() =>
      this.repository.appendValidated(input),
    );
    return this.toResponse(result);
  }
}
