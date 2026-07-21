import { createHash } from "node:crypto";
import { ForbiddenException, Injectable } from "@nestjs/common";
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
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
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
  ValidatedGuideSessionCompleteSemantics,
  ValidatedGuideStartSemantics,
  ValidatedGuideStepCompleteSemantics,
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
import { guideFail, mapGuideErrors, translateGuideError } from "./guide-errors";

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
 *   - progress is GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP: the projection comes
 *     from the accepted-step ledger through the pure state machine, and
 *     LearningEvents are never read to compute it;
 *   - receipts are inspected BEFORE any effect, so a replay applies nothing and
 *     is never rejected by the state the session has since reached;
 *   - lock order is always START_LOCK (`guide:start:<userId>`) then
 *     SESSION_MUTATION_LOCK (`guide:session:<userId>:<sessionId>`), never the
 *     reverse — no command takes both, so the order cannot invert;
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

/**
 * Deterministic, canonical event key derived from the guide command's key.
 *
 * The LearningEvent writer requires an RFC UUID, so the guide's key cannot be
 * decorated with a prefix; and reusing it verbatim would put guide events in
 * the SAME `(userId, idempotencyKey)` namespace as standalone learning
 * commands, where an unrelated client key could collide. Hashing gives a key
 * that is (a) stable for a given command — so the append is itself a replay on
 * retry — and (b) practically disjoint from client-chosen keys. Version nibble
 * 8 (RFC 9562 custom/deterministic), canonical variant.
 */
function deriveGuideEventKey(scope: string, commandKey: string): string {
  const h = createHash("sha256")
    .update(`guide-event:v1:${scope}:${commandKey}`)
    .digest("hex");
  const variant = ((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `8${h.slice(13, 16)}`,
    `${variant}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}

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

  /** The pinned definition of a stored session (its version, not the newest). */
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
   * surface uses, run inside the caller's transaction. Any denial is the
   * value-free GUIDE_FORBIDDEN; a resolution failure is an unresolved editorial
   * context, never a leak of the underlying reason.
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
      guideFail("GUIDE_CONTEXT_UNRESOLVED");
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

  // ─── START ───────────────────────────────────────────────────────────────

  /**
   * Start a session of an EXACT `guideKey@guideVersion`.
   *
   * Flow, all inside one transaction holding `guide:start:<userId>`:
   *   1. receipt inspection — a replay returns the ORIGINAL session, applying
   *      nothing (in particular it never autocancels a second time);
   *   2. entitlement, in this transaction;
   *   3. autocancel of the user's other ACTIVE session — a server-side
   *      housekeeping transition that creates NO receipt and emits NO event;
   *   4. create the session, append the receipt, emit `guide_session_started`.
   *
   * The editorial context is derived beforehand (read-only) from the pinned
   * targets, which must all converge — that derivation is what the START
   * semantics pin as `editionId`/`unitId`.
   */
  async start(
    user: AuthenticatedUser,
    command: GuideStartCommandInput,
  ): Promise<GuideCommandResult> {
    const definition = await mapGuideErrors(async () =>
      productionGuideRegistry.getExact(command.guideKey, command.guideVersion),
    );
    const ctx = await mapGuideErrors(() => this.context.resolve(definition));

    const semantics: ValidatedGuideStartSemantics = {
      commandType: "START",
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      guideKey: definition.guideKey,
      guideVersion: definition.guideVersion,
      editionId: ctx.editionId,
      unitId: ctx.unitId,
    };

    return mapGuideErrors(() =>
      this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `guide:start:${user.userId}`);

        // (1) Receipt BEFORE any effect — including before the autocancel.
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

        // (2) Entitlement, under this transaction's snapshot and lock.
        await this.gate(user, ctx, tx);

        // (3) Autocancel — at most one ACTIVE session per user. It keeps the
        // accepted count its ledger justifies; counting unique accepted
        // stepKeys is exactly the CANCELLED projection, and needs no catalog
        // lookup (so a retired definition can never block a new start).
        const active = await this.sessions.findActive(user.userId, tx);
        if (active) {
          const rows = await this.steps.listAccepted(active.id, tx);
          const accepted = new Set(rows.map((r) => r.stepKey)).size;
          const changed = await this.sessions.cancelActive(
            active.id,
            user.userId,
            accepted,
            tx,
          );
          if (changed !== 1) guideFail("GUIDE_SESSION_INVALID_TRANSITION");
        }

        // (4) Create → receipt → event, atomically with everything above.
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
          idempotencyKey: deriveGuideEventKey("start", command.idempotencyKey),
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

  // ─── Session mutations — one spine, four commands ────────────────────────

  /**
   * The shared transactional spine of every command that mutates an existing
   * session. It holds `guide:session:<userId>:<sessionId>`, resolves the
   * replay verdict BEFORE reading the session's state (so a replay is never
   * rejected by a state reached since), then hands the ACTIVE-state decision
   * to `apply`, and finally writes the receipt in the same transaction.
   */
  private async mutate(
    user: AuthenticatedUser,
    sessionId: string,
    semantics:
      | ValidatedGuideStepCompleteSemantics
      | ValidatedGuideStepRecallSemantics
      | ValidatedGuideCancelSemantics
      | ValidatedGuideSessionCompleteSemantics,
    apply: (
      tx: Tx,
      session: GuideSessionRow,
      definition: GuideDefinition,
    ) => Promise<GuideSessionRow>,
  ): Promise<GuideCommandResult> {
    return mapGuideErrors(() =>
      this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `guide:session:${user.userId}:${sessionId}`);

        const seen = await this.receipts.inspectValidated(semantics, tx);
        const current = await this.sessions.findOwn(sessionId, user.userId, tx);
        // Foreign and nonexistent are the same value-free verdict.
        if (!current) guideFail("GUIDE_SESSION_NOT_FOUND");
        const session = current as GuideSessionRow;
        const definition = this.definitionOf(session);

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
      // The receipt's semantics need the step's kind and target, which live in
      // the PINNED definition — so the session is read once before the
      // transaction opens. That read is safe: `guideKey`/`guideVersion` are
      // immutable for the life of a session, and every state-dependent
      // decision is re-taken inside the lock by `apply`.
      await this.stepCompleteSemantics(user, command),
      async (tx, session, definition) => {
        const step = this.stepOf(definition, command.stepKey);
        if (step.kind === "ACTIVE_RECALL") {
          guideFail("GUIDE_STEP_COMMAND_MISMATCH");
        }
        const accepted = await this.ledger(session.id, tx);
        this.assertAcceptable(definition, accepted, step.stepKey, session);

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
            const ctx = await this.resolveExercise(step.exerciseKey);
            this.assertSameAnchor(session, ctx);
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
              idempotencyKey: deriveGuideEventKey(
                "practice",
                command.idempotencyKey,
              ),
              type: "practice_completed",
              payload: buildPracticeCompletedPayload(ctx),
              editionId: ctx.editionId,
              unitId: ctx.unitId,
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
        }

        await this.applyLedgerProjection(session, definition, tx);
        return this.reread(session.id, user.userId, tx);
      },
    );
  }

  /**
   * Build the STEP_COMPLETE semantics. The variant's target is read from the
   * PINNED definition — the client never declares kind or target, so a command
   * cannot claim a step is something it is not.
   */
  private async stepCompleteSemantics(
    user: AuthenticatedUser,
    command: GuideStepCompleteCommandInput,
  ): Promise<ValidatedGuideStepCompleteSemantics> {
    const session = await mapGuideErrors(() =>
      this.sessions.findOwn(command.sessionId, user.userId),
    );
    if (!session) guideFail("GUIDE_SESSION_NOT_FOUND");
    const definition = this.definitionOf(session as GuideSessionRow);
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
        // Refused here so the receipt never records a recall as a plain step.
        return guideFail("GUIDE_STEP_COMMAND_MISMATCH");
    }
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
    const semantics = await this.recallSemantics(user, command);
    return this.mutate(
      user,
      command.sessionId,
      semantics,
      async (tx, session, definition) => {
        const step = this.recallStepOf(definition, command.stepKey);
        const accepted = await this.ledger(session.id, tx);
        this.assertAcceptable(definition, accepted, step.stepKey, session);

        const item = await this.resolveRecallItem(step.itemKey);
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
          idempotencyKey: deriveGuideEventKey("recall", command.idempotencyKey),
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

  /** STEP_RECALL semantics — itemKey from the catalog, option from the client. */
  private async recallSemantics(
    user: AuthenticatedUser,
    command: GuideStepRecallCommandInput,
  ): Promise<ValidatedGuideStepRecallSemantics> {
    const session = await mapGuideErrors(() =>
      this.sessions.findOwn(command.sessionId, user.userId),
    );
    if (!session) guideFail("GUIDE_SESSION_NOT_FOUND");
    const definition = this.definitionOf(session as GuideSessionRow);
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
  }

  // ─── CANCEL ──────────────────────────────────────────────────────────────

  /** ACTIVE → CANCELLED. Emits no event: abandoning is not a learning fact. */
  async cancel(
    user: AuthenticatedUser,
    command: GuideCancelCommandInput,
  ): Promise<GuideCommandResult> {
    const semantics: ValidatedGuideCancelSemantics = {
      commandType: "CANCEL",
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      sessionId: command.sessionId,
    };
    return this.mutate(
      user,
      command.sessionId,
      semantics,
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
    const semantics: ValidatedGuideSessionCompleteSemantics = {
      commandType: "SESSION_COMPLETE",
      userId: user.userId,
      idempotencyKey: command.idempotencyKey,
      sessionId: command.sessionId,
    };
    return this.mutate(
      user,
      command.sessionId,
      semantics,
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
          idempotencyKey: deriveGuideEventKey(
            "complete",
            command.idempotencyKey,
          ),
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

  /** Resolver failures are editorial-context problems, value-free. */
  private async resolveExercise(exerciseKey: string) {
    try {
      return await this.resolver.resolveExercise(exerciseKey);
    } catch {
      return guideFail("GUIDE_CONTEXT_UNRESOLVED");
    }
  }

  private async resolveRecallItem(itemKey: string) {
    try {
      return await this.resolver.resolveRecallItem(itemKey);
    } catch {
      return guideFail("GUIDE_CONTEXT_UNRESOLVED");
    }
  }
}
