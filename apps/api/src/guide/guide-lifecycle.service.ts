import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  GuideDefinition,
  GuideSessionProjection,
  GuideSessionStatus,
  GuideStepDefinition,
} from "@psico/types";
import type { Prisma } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ContentAccessService } from "../content-core/access/content-access.service";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  LearningCatalogResolver,
  type ResolvedExerciseContext,
  type ResolvedRecallItemContext,
} from "../learning/learning-catalog.resolver";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningEventRepository } from "../learning/learning-event.repository";
import {
  buildObjectiveRecallAttempt,
  buildPracticeCompletedPayload,
} from "../learning/learning-event-builders";
import type { ValidatedLearningEvent } from "../learning/validated-learning-event";
import { productionGuideRegistry } from "./guide-catalog";
import type {
  ValidatedGuideCancelSemantics,
  ValidatedGuideCommandSemantics,
  ValidatedGuideSessionCompleteSemantics,
  ValidatedGuideStartSemantics,
  ValidatedGuideStepRecallSemantics,
} from "./guide-command-semantics";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  GuideSessionRepository,
  type GuideSessionRow,
} from "./guide-session.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideSessionStepRepository } from "./guide-session-step.repository";
import {
  type AcceptedGuideStep,
  canAcceptStep,
  canCompleteSession,
  deriveGuideProjection,
  parseAcceptedGuideStepRow,
} from "./guide-state-machine";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  GuideTargetContextService,
  type ResolvedGuideContext,
} from "./guide-target-context.service";
import {
  classifyCatalogError,
  guideFail,
  mapGuideErrors,
  translateGuideError,
} from "./guide-errors";

/**
 * CC-7.4C — the complete INTERNAL Guide V1 lifecycle (ADR 0019).
 *
 * Five commands — START · STEP_COMPLETE · STEP_RECALL · CANCEL ·
 * SESSION_COMPLETE — each one atomic: receipt, ledger row, session projection
 * and LearningEvent commit or roll back together.
 *
 * Invariants this service exists to hold:
 *
 *   - the ACTOR is always the authenticated JWT user; no input carries a userId;
 *   - the CLIENT never sends kind, completionPolicy, targets, order, result or
 *     editorial context — every one of those is derived from the PINNED
 *     `guideKey@guideVersion` and the server-side catalog;
 *   - EVERYTHING a command decides on — catalog lookup, editorial context,
 *     entitlement, receipt, ledger, projection, event — happens inside ONE
 *     transaction, under the relevant advisory lock, on ONE snapshot;
 *   - progress is GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP: the projection comes
 *     from the accepted-step ledger through the pure state machine, and
 *     LearningEvents are never read to compute it;
 *   - receipts are inspected BEFORE any effect, so a replay applies nothing and
 *     is never rejected by the state the session has since reached;
 *   - the LearningEvent a command emits carries EXACTLY the command's own
 *     idempotency key — the same canonical UUID stored in its receipt;
 *   - lock order is always START_LOCK (`guide:start:<userId>`) then
 *     SESSION_MUTATION_LOCK (`guide:session:<userId>:<sessionId>`) — START
 *     nests the second one when it autocancels, and nothing ever takes them
 *     the other way round;
 *   - errors are value-free (`guide-errors.ts`): a foreign session and a
 *     nonexistent one are indistinguishable.
 *
 * Not registered in AppModule and not exposed by any controller — CC-7.4D owns
 * the HTTP surface.
 */

// ─── Command inputs — CLOSED, internal, never carrying a userId ─────────────

export interface GuideStartCommandInput {
  /** Canonical UUID, per the shared idempotency contract. */
  idempotencyKey: string;
  guideKey: string;
  /** EXACT version — the lifecycle never resolves a "latest". */
  guideVersion: number;
}

export interface GuideStepCompleteCommandInput {
  idempotencyKey: string;
  sessionId: string;
  /** Which step is being completed; its kind and target come from the catalog. */
  stepKey: string;
}

export interface GuideStepRecallCommandInput {
  idempotencyKey: string;
  sessionId: string;
  stepKey: string;
  /**
   * The chosen option, and NOTHING else: the item key comes from the pinned
   * step, and the result/evaluationSource are graded by the server.
   */
  selectedOptionKey: string;
}

export interface GuideCancelCommandInput {
  idempotencyKey: string;
  sessionId: string;
}

export interface GuideSessionCompleteCommandInput {
  idempotencyKey: string;
  sessionId: string;
}

/** What every command returns — server state only, never catalog answers. */
export interface GuideCommandResult {
  /** This call applied the effects. */
  created: boolean;
  /** An identical prior command already applied them; nothing ran now. */
  replayed: boolean;
  sessionId: string;
  guideKey: string;
  guideVersion: number;
  status: GuideSessionStatus;
  projection: GuideSessionProjection;
}

type Tx = Prisma.TransactionClient;

type GuideRecallStepDefinition = Extract<
  GuideStepDefinition,
  { kind: "ACTIVE_RECALL" }
>;

/** Semantics of a command that mutates an EXISTING session. */
type MutationSemantics = Exclude<
  ValidatedGuideCommandSemantics,
  ValidatedGuideStartSemantics
>;

@Injectable()
export class GuideLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: LearningCatalogResolver,
    private readonly access: ContentAccessService,
    private readonly context: GuideTargetContextService,
    private readonly sessions: GuideSessionRepository,
    private readonly steps: GuideSessionStepRepository,
    private readonly receipts: GuideCommandReceiptRepository,
    private readonly events: LearningEventRepository,
  ) {}

  // ─── Shared primitives ───────────────────────────────────────────────────

  /**
   * The ONLY raw SQL in the lifecycle: a transaction-scoped advisory lock. It
   * writes no row, so the single-writer ratchets stay intact.
   */
  private async lock(tx: Tx, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 42))`;
  }

  /** The accepted-step ledger, parsed into the pure machine's shape. */
  private async ledger(
    sessionId: string,
    tx: Tx,
  ): Promise<AcceptedGuideStep[]> {
    const rows = await this.steps.listAccepted(sessionId, tx);
    return rows.map((row) => parseAcceptedGuideStepRow(row));
  }

  /**
   * The pinned definition of a stored session (its version, not the newest).
   * A definition that is no longer in the registry means the session cannot be
   * reasoned about at all — the lifecycle fails closed rather than guessing.
   */
  private definitionOf(session: GuideSessionRow): GuideDefinition {
    try {
      return productionGuideRegistry.getExact(
        session.guideKey,
        session.guideVersion,
      );
    } catch (err) {
      throw translateGuideError(err);
    }
  }

  private stepOf(
    definition: GuideDefinition,
    stepKey: string,
  ): GuideStepDefinition {
    const step = definition.steps.find((s) => s.stepKey === stepKey);
    // A stepKey outside the pinned definition is a command that does not
    // describe this guide — not an ordering problem.
    if (step === undefined) guideFail("GUIDE_STEP_COMMAND_MISMATCH");
    return step as GuideStepDefinition;
  }

  /** The pinned step, REQUIRED to be the recall kind — one place to refuse. */
  private recallStepOf(
    definition: GuideDefinition,
    stepKey: string,
  ): GuideRecallStepDefinition {
    const step = this.stepOf(definition, stepKey);
    if (step.kind !== "ACTIVE_RECALL") {
      guideFail("GUIDE_STEP_COMMAND_MISMATCH");
    }
    return step as GuideRecallStepDefinition;
  }

  /** Build the result from CURRENT stored state (never from the command). */
  private async snapshot(
    session: GuideSessionRow,
    definition: GuideDefinition,
    tx: Tx,
    flags: { created: boolean; replayed: boolean },
  ): Promise<GuideCommandResult> {
    const accepted = await this.ledger(session.id, tx);
    return {
      created: flags.created,
      replayed: flags.replayed,
      sessionId: session.id,
      guideKey: session.guideKey,
      guideVersion: session.guideVersion,
      status: session.status,
      projection: deriveGuideProjection(definition, accepted, session.status),
    };
  }

  /**
   * The entitlement gate — the SAME `ContentAccessService` every content
   * surface uses, run inside the caller's transaction.
   *
   * The three outcomes are distinct facts: a denial is FORBIDDEN; a NotFound
   * AFTER a valid resolution means the legacy bridge disagrees with the
   * catalog (an editorial context problem, not a verdict on the user); and
   * anything else is infrastructure.
   */
  private async gate(
    user: AuthenticatedUser,
    ctx: ResolvedGuideContext,
    tx: Tx,
  ): Promise<void> {
    try {
      await this.access.assertCanReadUnit(
        {
          userId: user.userId,
          userPlan: user.plan,
          editionKey: ctx.editionKey,
          unitKey: ctx.unitKey,
        },
        tx,
      );
    } catch (err) {
      if (err instanceof ForbiddenException) guideFail("GUIDE_FORBIDDEN");
      if (err instanceof NotFoundException) {
        guideFail("GUIDE_CONTEXT_UNRESOLVED");
      }
      guideFail("GUIDE_STORAGE_FAILURE");
    }
  }

  /**
   * A step's editorial target must still land on the session's anchor. The
   * anchor was derived at START; if the catalog moved underneath (republished
   * revision, relocated unit), the step is refused instead of writing a ledger
   * row against a different unit.
   */
  private assertSameAnchor(
    session: GuideSessionRow,
    resolved: { editionId: string; unitId: string },
  ): void {
    if (
      session.editionId !== resolved.editionId ||
      session.unitId !== resolved.unitId
    ) {
      guideFail("GUIDE_CONTEXT_MISMATCH");
    }
  }

  /**
   * Revalidation shared by EVERY step command, whatever its kind: resolve the
   * pinned definition's full context on THIS transaction, require it to still
   * be the session's anchor, and re-apply entitlement. A confirmation step
   * carries no target of its own, but the guide it belongs to does — losing
   * access mid-session must stop it too.
   */
  private async revalidate(
    user: AuthenticatedUser,
    session: GuideSessionRow,
    definition: GuideDefinition,
    tx: Tx,
  ): Promise<ResolvedGuideContext> {
    const ctx = await this.context.resolve(definition, tx);
    this.assertSameAnchor(session, ctx);
    await this.gate(user, ctx, tx);
    return ctx;
  }

  // ─── START ───────────────────────────────────────────────────────────────

  /**
   * Start a session of an EXACT `guideKey@guideVersion`.
   *
   * Everything runs in ONE transaction holding `guide:start:<userId>`:
   *   1. load the pinned definition and resolve ALL its targets on `tx`, which
   *      is what pins `editionId`/`unitId` into the START semantics;
   *   2. receipt inspection — a replay returns the ORIGINAL session, applying
   *      nothing (in particular it never autocancels a second time);
   *   3. entitlement, on the same snapshot;
   *   4. autocancel of the user's other ACTIVE session, under its OWN session
   *      lock (nested, never reversed). It creates NO receipt and emits NO
   *      event;
   *   5. create the session, append the receipt, emit `guide_session_started`
   *      with the command's own idempotency key.
   */
  async start(
    user: AuthenticatedUser,
    command: GuideStartCommandInput,
  ): Promise<GuideCommandResult> {
    return mapGuideErrors(() =>
      this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `guide:start:${user.userId}`);

        // (1) Catalog + context, both on THIS transaction's snapshot.
        const definition = productionGuideRegistry.getExact(
          command.guideKey,
          command.guideVersion,
        );
        const ctx = await this.context.resolve(definition, tx);
        const semantics: ValidatedGuideStartSemantics = {
          commandType: "START",
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          guideKey: definition.guideKey,
          guideVersion: definition.guideVersion,
          editionId: ctx.editionId,
          unitId: ctx.unitId,
        };

        // (2) Receipt BEFORE any effect — including before the autocancel.
        const seen = await this.receipts.inspectValidated(semantics, tx);
        if (seen.state === "replay") {
          // START's receipt stores the session it created in `sessionId`.
          const priorId = seen.receipt.sessionId;
          if (!priorId) guideFail("GUIDE_STORAGE_FAILURE");
          const prior = await this.sessions.findOwn(
            priorId as string,
            user.userId,
            tx,
          );
          if (!prior) guideFail("GUIDE_SESSION_NOT_FOUND");
          const row = prior as GuideSessionRow;
          return this.snapshot(row, this.definitionOf(row), tx, {
            created: false,
            replayed: true,
          });
        }

        // (3) Entitlement, under this transaction's snapshot and lock.
        await this.gate(user, ctx, tx);

        // (4) At most one ACTIVE session per user.
        const active = await this.sessions.findActive(user.userId, tx);
        if (active) await this.autocancel(user, active.id, tx);

        // (5) Create → receipt → event, atomically with everything above.
        const first = definition.steps[0] as GuideStepDefinition;
        const session = await this.sessions.createActive(
          {
            userId: user.userId,
            guideKey: definition.guideKey,
            guideVersion: definition.guideVersion,
            editionId: ctx.editionId,
            unitId: ctx.unitId,
            totalSteps: definition.steps.length,
            currentStepKey: first.stepKey,
          },
          tx,
        );
        await this.receipts.appendValidated(
          { semantics, resultSessionId: session.id },
          tx,
        );
        const event: ValidatedLearningEvent<"guide_session_started"> = {
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          type: "guide_session_started",
          payload: { guideSessionId: session.id },
          editionId: ctx.editionId,
          unitId: ctx.unitId,
          guideSessionId: session.id,
        };
        await this.events.appendValidated(event, tx);

        return this.snapshot(session, definition, tx, {
          created: true,
          replayed: false,
        });
      }),
    );
  }

  /**
   * Close the user's previous ACTIVE session so the new one can start.
   *
   * Server housekeeping, not a command: no receipt, no event. It takes the
   * session's OWN mutation lock while still holding the start lock — the one
   * and only place both are held, always in that order — so a step racing on
   * that session cannot interleave with the cancellation.
   *
   * The retained count is DERIVED by the state machine from the ledger, never
   * counted off raw rows: a row only counts once its full semantics matched
   * the pinned catalog.
   */
  private async autocancel(
    user: AuthenticatedUser,
    sessionId: string,
    tx: Tx,
  ): Promise<void> {
    await this.lock(tx, `guide:session:${user.userId}:${sessionId}`);
    // Re-read UNDER the second lock: it may have been cancelled or completed
    // between the findActive and the lock being granted.
    const fresh = await this.sessions.findOwn(sessionId, user.userId, tx);
    if (!fresh || fresh.status !== "ACTIVE") return;

    const definition = this.definitionOf(fresh);
    const accepted = await this.ledger(fresh.id, tx);
    const projection = deriveGuideProjection(definition, accepted, "CANCELLED");
    const changed = await this.sessions.cancelActive(
      fresh.id,
      user.userId,
      projection.stepsCompleted,
      tx,
    );
    if (changed !== 1) guideFail("GUIDE_SESSION_INVALID_TRANSITION");
  }

  // ─── Session mutations — one spine, four commands ────────────────────────

  /**
   * The shared transactional spine of every command that mutates an existing
   * session. It holds `guide:session:<userId>:<sessionId>` for EVERYTHING:
   * loading the session, reading its pinned definition, building the receipt
   * semantics from that definition, the replay verdict, and the transition.
   *
   * Loading the session is not judging it: the replay verdict is resolved
   * BEFORE any ACTIVE/current-step/completeness check, so a replay is never
   * rejected by a state reached since the original command.
   */
  private async mutate(
    user: AuthenticatedUser,
    sessionId: string,
    buildSemantics: (
      session: GuideSessionRow,
      definition: GuideDefinition,
    ) => MutationSemantics,
    apply: (
      tx: Tx,
      session: GuideSessionRow,
      definition: GuideDefinition,
    ) => Promise<GuideSessionRow>,
  ): Promise<GuideCommandResult> {
    return mapGuideErrors(() =>
      this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `guide:session:${user.userId}:${sessionId}`);

        const current = await this.sessions.findOwn(sessionId, user.userId, tx);
        // Foreign and nonexistent are the same value-free verdict.
        if (!current) guideFail("GUIDE_SESSION_NOT_FOUND");
        const session = current as GuideSessionRow;
        const definition = this.definitionOf(session);
        const semantics = buildSemantics(session, definition);

        const seen = await this.receipts.inspectValidated(semantics, tx);
        if (seen.state === "replay") {
          return this.snapshot(session, definition, tx, {
            created: false,
            replayed: true,
          });
        }

        const updated = await apply(tx, session, definition);
        await this.receipts.appendValidated({ semantics }, tx);
        return this.snapshot(updated, definition, tx, {
          created: true,
          replayed: false,
        });
      }),
    );
  }

  /** Re-read the session after a projection/state write, or fail closed. */
  private async reread(
    sessionId: string,
    userId: string,
    tx: Tx,
  ): Promise<GuideSessionRow> {
    const row = await this.sessions.findOwn(sessionId, userId, tx);
    if (!row) guideFail("GUIDE_SESSION_NOT_FOUND");
    return row as GuideSessionRow;
  }

  /**
   * Guard shared by both step commands: the step must be the one the machine
   * expects NOW. A closed session is an invalid transition; an ACTIVE session
   * pointing elsewhere means the step is not current.
   */
  private assertAcceptable(
    definition: GuideDefinition,
    accepted: readonly AcceptedGuideStep[],
    stepKey: string,
    session: GuideSessionRow,
  ): void {
    if (canAcceptStep(definition, accepted, stepKey, session.status)) return;
    if (session.status !== "ACTIVE") {
      guideFail("GUIDE_SESSION_INVALID_TRANSITION");
    }
    guideFail("GUIDE_STEP_NOT_CURRENT");
  }

  // ─── STEP_COMPLETE — concept · practice · confirmation ───────────────────

  /**
   * Accept the current step of a non-recall kind. The kind, policy and target
   * come from the pinned definition; the client supplies only which step.
   *
   * ACTIVE_RECALL is refused here — it has its own command because it carries
   * evidence (the chosen option) and requires server grading.
   *
   * Events: practice → `practice_completed`; concept and confirmation emit
   * NOTHING (ADR 0019 — there is no `guide_step_completed`).
   */
  async completeStep(
    user: AuthenticatedUser,
    command: GuideStepCompleteCommandInput,
  ): Promise<GuideCommandResult> {
    return this.mutate(
      user,
      command.sessionId,
      // Built UNDER the lock from the pinned definition: the client never
      // declares kind or target, so a command cannot claim a step is
      // something it is not.
      (_session, definition) => {
        const step = this.stepOf(definition, command.stepKey);
        const base = {
          commandType: "STEP_COMPLETE" as const,
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          sessionId: command.sessionId,
          stepKey: step.stepKey,
        };
        switch (step.kind) {
          case "CONCEPT_EXPLORATION":
            return { ...base, kind: step.kind, conceptKey: step.conceptKey };
          case "CATALOG_PRACTICE":
            return { ...base, kind: step.kind, exerciseKey: step.exerciseKey };
          case "EXPLICIT_CONFIRMATION":
            return {
              ...base,
              kind: step.kind,
              confirmationKey: step.confirmationKey,
            };
          case "ACTIVE_RECALL":
            // Refused here so no receipt ever records a recall as a plain step.
            return guideFail("GUIDE_STEP_COMMAND_MISMATCH");
        }
      },
      async (tx, session, definition) => {
        const step = this.stepOf(definition, command.stepKey);
        const accepted = await this.ledger(session.id, tx);
        this.assertAcceptable(definition, accepted, step.stepKey, session);

        // Context + entitlement, revalidated on THIS transaction for EVERY
        // kind — including the concept and confirmation steps.
        await this.revalidate(user, session, definition, tx);

        switch (step.kind) {
          case "CONCEPT_EXPLORATION":
            await this.steps.appendAccepted(
              {
                sessionId: session.id,
                stepKey: step.stepKey,
                order: step.order,
                kind: "CONCEPT_EXPLORATION",
                conceptKey: step.conceptKey,
              },
              tx,
            );
            break;
          case "CATALOG_PRACTICE": {
            const exercise = await this.resolveExercise(step.exerciseKey, tx);
            this.assertSameAnchor(session, exercise);
            await this.steps.appendAccepted(
              {
                sessionId: session.id,
                stepKey: step.stepKey,
                order: step.order,
                kind: "CATALOG_PRACTICE",
                exerciseKey: step.exerciseKey,
              },
              tx,
            );
            const event: ValidatedLearningEvent<"practice_completed"> = {
              userId: user.userId,
              idempotencyKey: command.idempotencyKey,
              type: "practice_completed",
              payload: buildPracticeCompletedPayload(exercise),
              editionId: exercise.editionId,
              unitId: exercise.unitId,
              guideSessionId: session.id,
            };
            await this.events.appendValidated(event, tx);
            break;
          }
          case "EXPLICIT_CONFIRMATION":
            await this.steps.appendAccepted(
              {
                sessionId: session.id,
                stepKey: step.stepKey,
                order: step.order,
                kind: "EXPLICIT_CONFIRMATION",
                confirmationKey: step.confirmationKey,
              },
              tx,
            );
            break;
          case "ACTIVE_RECALL":
            return guideFail("GUIDE_STEP_COMMAND_MISMATCH");
        }

        await this.applyLedgerProjection(session, definition, tx);
        return this.reread(session.id, user.userId, tx);
      },
    );
  }

  // ─── STEP_RECALL — server-graded objective attempt ───────────────────────

  /**
   * Accept the current ACTIVE_RECALL step. The item comes from the pinned step;
   * the SERVER grades the chosen option against the catalog's canonical answer
   * through the shared builder. The correct option is never persisted in the
   * ledger, never carried by the event, and never returned.
   */
  async completeRecallStep(
    user: AuthenticatedUser,
    command: GuideStepRecallCommandInput,
  ): Promise<GuideCommandResult> {
    return this.mutate(
      user,
      command.sessionId,
      (_session, definition): ValidatedGuideStepRecallSemantics => {
        const step = this.recallStepOf(definition, command.stepKey);
        return {
          commandType: "STEP_RECALL",
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          sessionId: command.sessionId,
          stepKey: step.stepKey,
          // From the PINNED step — the client never sends an itemKey.
          itemKey: step.itemKey,
          selectedOptionKey: command.selectedOptionKey,
        };
      },
      async (tx, session, definition) => {
        const step = this.recallStepOf(definition, command.stepKey);
        const accepted = await this.ledger(session.id, tx);
        this.assertAcceptable(definition, accepted, step.stepKey, session);

        await this.revalidate(user, session, definition, tx);

        const item = await this.resolveRecallItem(step.itemKey, tx);
        this.assertSameAnchor(session, item);

        // A chosen option outside the item's closed set (or a non-objective
        // item) is a command that does not describe this step.
        let payload;
        try {
          payload = buildObjectiveRecallAttempt(
            item,
            command.selectedOptionKey,
          );
        } catch {
          return guideFail("GUIDE_STEP_COMMAND_MISMATCH");
        }

        await this.steps.appendAccepted(
          {
            sessionId: session.id,
            stepKey: step.stepKey,
            order: step.order,
            kind: "ACTIVE_RECALL",
            itemKey: step.itemKey,
            selectedOptionKey: payload.selectedOptionKey as string,
            recallResult:
              payload.result === "correct" ? "CORRECT" : "INCORRECT",
          },
          tx,
        );

        const event: ValidatedLearningEvent<"active_recall_attempted"> = {
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          type: "active_recall_attempted",
          payload,
          editionId: item.editionId,
          unitId: item.unitId,
          conceptId: item.conceptId,
          guideSessionId: session.id,
        };
        await this.events.appendValidated(event, tx);

        await this.applyLedgerProjection(session, definition, tx);
        return this.reread(session.id, user.userId, tx);
      },
    );
  }

  // ─── CANCEL ──────────────────────────────────────────────────────────────

  /** ACTIVE → CANCELLED. Emits no event: abandoning is not a learning fact. */
  async cancel(
    user: AuthenticatedUser,
    command: GuideCancelCommandInput,
  ): Promise<GuideCommandResult> {
    return this.mutate(
      user,
      command.sessionId,
      (): ValidatedGuideCancelSemantics => ({
        commandType: "CANCEL",
        userId: user.userId,
        idempotencyKey: command.idempotencyKey,
        sessionId: command.sessionId,
      }),
      async (tx, session, definition) => {
        if (session.status !== "ACTIVE") {
          guideFail("GUIDE_SESSION_INVALID_TRANSITION");
        }
        const accepted = await this.ledger(session.id, tx);
        const projection = deriveGuideProjection(
          definition,
          accepted,
          "CANCELLED",
        );
        const changed = await this.sessions.cancelActive(
          session.id,
          user.userId,
          projection.stepsCompleted,
          tx,
        );
        if (changed !== 1) guideFail("GUIDE_SESSION_INVALID_TRANSITION");
        return this.reread(session.id, user.userId, tx);
      },
    );
  }

  // ─── SESSION_COMPLETE ────────────────────────────────────────────────────

  /**
   * ACTIVE → COMPLETED, allowed only with a FULL ledger for the pinned version.
   * Emits `guide_session_completed` with the server-counted `stepsCompleted` —
   * derived from the ledger, never from the client.
   */
  async completeSession(
    user: AuthenticatedUser,
    command: GuideSessionCompleteCommandInput,
  ): Promise<GuideCommandResult> {
    return this.mutate(
      user,
      command.sessionId,
      (): ValidatedGuideSessionCompleteSemantics => ({
        commandType: "SESSION_COMPLETE",
        userId: user.userId,
        idempotencyKey: command.idempotencyKey,
        sessionId: command.sessionId,
      }),
      async (tx, session, definition) => {
        const accepted = await this.ledger(session.id, tx);
        if (!canCompleteSession(definition, accepted, session.status)) {
          guideFail("GUIDE_SESSION_INVALID_TRANSITION");
        }
        const projection = deriveGuideProjection(
          definition,
          accepted,
          "COMPLETED",
        );
        const changed = await this.sessions.completeActive(
          session.id,
          user.userId,
          projection.stepsCompleted,
          tx,
        );
        if (changed !== 1) guideFail("GUIDE_SESSION_INVALID_TRANSITION");

        const event: ValidatedLearningEvent<"guide_session_completed"> = {
          userId: user.userId,
          idempotencyKey: command.idempotencyKey,
          type: "guide_session_completed",
          payload: {
            guideSessionId: session.id,
            stepsCompleted: projection.stepsCompleted,
          },
          editionId: session.editionId,
          unitId: session.unitId,
          guideSessionId: session.id,
        };
        await this.events.appendValidated(event, tx);

        return this.reread(session.id, user.userId, tx);
      },
    );
  }

  // ─── Projection + catalog helpers ────────────────────────────────────────

  /**
   * Recompute the projection from the LEDGER and write it. Never derived from
   * a counter the client sent, and never from LearningEvents.
   */
  private async applyLedgerProjection(
    session: GuideSessionRow,
    definition: GuideDefinition,
    tx: Tx,
  ): Promise<void> {
    const accepted = await this.ledger(session.id, tx);
    const projection = deriveGuideProjection(definition, accepted, "ACTIVE");
    const changed = await this.sessions.applyProjection(
      session.id,
      session.userId,
      projection,
      tx,
    );
    if (changed !== 1) guideFail("GUIDE_SESSION_INVALID_TRANSITION");
  }

  /**
   * Per-target resolution for the step that needs the TYPED context (the event
   * payload). It runs on the caller's transaction, and its failures are
   * classified exactly like the context service's: editorial → unresolved,
   * infrastructure → storage.
   */
  private async resolveExercise(
    exerciseKey: string,
    tx: Tx,
  ): Promise<ResolvedExerciseContext> {
    try {
      return await this.resolver.resolveExercise(exerciseKey, tx);
    } catch (err) {
      return classifyCatalogError(err);
    }
  }

  private async resolveRecallItem(
    itemKey: string,
    tx: Tx,
  ): Promise<ResolvedRecallItemContext> {
    try {
      return await this.resolver.resolveRecallItem(itemKey, tx);
    } catch (err) {
      return classifyCatalogError(err);
    }
  }
}
