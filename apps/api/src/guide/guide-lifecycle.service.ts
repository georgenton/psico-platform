import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  GuideDefinition,
  GuideRecallOutcome,
  GuideSessionProjection,
  GuideSessionView,
  GuideSessionStatus,
  GuideStepDefinition,
  GuideExperienceStateResponse,
  GuideExperienceCardState,
  GuideExperienceCardStatus,
} from "@psico/types";
// Value import, not `import type`: `Prisma.TransactionIsolationLevel` is read
// at runtime to state the isolation level of both Guide command transactions.
import { Prisma } from "@prisma/client";
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
import {
  guideStartLockKeys,
  readGuideActiveCapability,
  type GuideActiveCapability,
} from "./guide-active-capability";
import { productionGuideRegistry } from "./guide-catalog";
import { toGuideCompletionSummary } from "./guide-completion-summary";
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
 *   - lock order is always LINEAGE_START_LOCK (`guide:start:<userId>:<guideKey>`)
 *     then SESSION_MUTATION_LOCK (`guide:session:<userId>:<sessionId>`) — START
 *     takes the lineage lock, which V1 also takes, so a mixed V1/V2 fleet still
 *     serialises per lineage; it nests the session lock when it autocancels.
 *     The global compatibility lock is gone with V0. Nothing ever takes them
 *     the other way round, which is what makes the total order deadlock-free
 *     (ADR 0022 §7);
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

/**
 * GR-3 — the recall command's result. The extra field is the outcome the
 * person is shown; the catalog's correct option is still never returned.
 */
export interface GuideRecallCommandResult extends GuideCommandResult {
  feedback: { outcome: GuideRecallOutcome };
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

  /** Operational signal only — never a decision input. */
  private readonly logger = new Logger("GuideLifecycle");

  // ─── Shared primitives ───────────────────────────────────────────────────

  /**
   * Say out loud that the schema is in a state we tolerate but did not expect.
   *
   * `degraded` is the whole reason authority and health are separate values:
   * a half-built or leftover-invalid lineage index does NOT stop START, which
   * is correct — and would therefore be completely invisible without this. A
   * failed `CREATE INDEX CONCURRENTLY` leaves its index behind, so the state
   * can persist for days with nothing on fire.
   *
   * Three properties, in order of importance:
   *
   *   - it CANNOT change the outcome. Everything is inside a catch, so a
   *     broken logger degrades observability and nothing else;
   *   - it carries only the closed enum values. No index name, no SQL, no
   *     predicate, no pg message, no userId and no guideKey — an operator
   *     needs to know the schema is odd, not who was reading at the time;
   *   - it is emitted per occurrence. Deduplicating would mean remembering
   *     the authority between transactions, and a remembered authority is the
   *     feature flag this design refuses to have.
   */
  private reportDegradedCapability(capability: GuideActiveCapability): void {
    try {
      this.logger.warn(
        `GUIDE_ACTIVE_CAPABILITY_DEGRADED effectiveMode=${capability.effectiveMode} globalHealth=${capability.globalHealth} lineageHealth=${capability.lineageHealth}`,
      );
    } catch {
      // Telemetry is never load-bearing.
    }
  }

  /**
   * The ONLY raw SQL in the lifecycle: a transaction-scoped advisory lock. It
   * writes no row, so the single-writer ratchets stay intact.
   *
   * `hashtextextended(key, 42)` and the xact-scoped variant are part of the
   * protocol, not an implementation detail: two versions of this service only
   * serialize against each other if they hash the SAME string the SAME way
   * and take the same kind of lock.
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

  /**
   * GR-5 — "am I already in the middle of this guide?", answered by the SERVER.
   *
   * This is the whole of cross-device resume. V1 could only recover what the
   * same browser had kept, so opening the guide on a phone after starting it
   * on a laptop looked like starting over. The checkpoint has always lived in
   * the ledger; it just had no way out.
   *
   * READ-ONLY and actor-scoped by construction: the lookup filters on the
   * JWT's userId, so another actor's session is not "denied" — it does not
   * exist. A session pinned to a DIFFERENT guide is equally invisible here;
   * this endpoint answers about one pin and nothing else, and it never cancels
   * or replaces what it finds.
   *
   * What comes back is the checkpoint, not the panel:
   * `CROSS_DEVICE_EXACT_SCENE_RESUME=false`. The Player derives the first
   * scene for `currentStepKey` itself, which is why no `sceneKey` is stored
   * anywhere and why this needed no migration.
   */
  async findRecoverableSession(
    userId: string,
    pin: { guideKey: string; guideVersion: number },
  ): Promise<GuideSessionView | null> {
    // C.0A — ask about THIS lineage. The previous read took whatever ACTIVE
    // row came back for the user and only then compared the pin, which is
    // sound while one ACTIVE exists per user and wrong the moment two can:
    // asked about A it could be handed B, and answer `null` for a journey that
    // was very much running.
    const session = await this.sessions.findActiveOwnForGuideKey(
      userId,
      pin.guideKey,
    );
    if (session === null) return null;
    // The lineage is now part of the query, so a foreign guide cannot come
    // back — but the check stays as a second line of defence. Handing back
    // another journey is the exact failure this path exists to prevent, and
    // it should not become possible through a repository change alone.
    //
    // The version check stays for a different reason: offering an older
    // pinned version in place of the one asked for is a public behaviour
    // change, and it belongs to the per-Experience state endpoint, not to
    // this compatibility release.
    if (
      session.guideKey !== pin.guideKey ||
      session.guideVersion !== pin.guideVersion
    ) {
      return null;
    }

    // The pinned definition, not the newest — a session that outlived its
    // version cannot be reasoned about, so it reads as unrecoverable rather
    // than as a guess.
    // `getExact` THROWS for a pin the registry no longer holds. Here that is
    // not an error to surface: a session whose version was retired is simply
    // not recoverable, and answering 500 would turn a stale pin into an
    // outage on a read that promises to be harmless.
    let definition: GuideDefinition;
    try {
      definition = productionGuideRegistry.getExact(
        session.guideKey,
        session.guideVersion,
      );
    } catch {
      return null;
    }

    const accepted = (await this.steps.listAccepted(session.id)).map((row) =>
      parseAcceptedGuideStepRow(row),
    );
    const projection = deriveGuideProjection(
      definition,
      accepted,
      session.status,
    );

    return {
      sessionId: session.id,
      guideKey: session.guideKey,
      guideVersion: session.guideVersion,
      status: session.status,
      stepsCompleted: projection.stepsCompleted,
      totalSteps: projection.totalSteps,
      currentStepKey: projection.currentStepKey,
    };
  }

  /**
   * GR-7 — "where do I stand in THIS experience?", answered by the server.
   *
   * `findRecoverableSession` could only see ACTIVE runs, which is why a
   * finished journey read as never-started after a reload while an unfinished
   * one survived. The honest fix is a read, not a client-side memory: a
   * browser asserting "I completed this" is a claim about the ledger that the
   * browser has no standing to make.
   *
   * Three answers and nothing else. A CANCELLED session presents as
   * `NOT_STARTED` — cancelling is the reader withdrawing, and reporting it
   * back tells them about a decision they already made rather than about
   * where they are. Another actor's session is not denied, it is invisible:
   * `findLatestOwnForExactPin` filters on `userId`, so a foreign run and no
   * run are the same answer.
   *
   * READ-ONLY. No session, step, receipt or learning event is written.
   */
  async findExperienceState(
    userId: string,
    pin: { guideKey: string; guideVersion: number },
  ): Promise<GuideExperienceStateResponse> {
    const NOT_STARTED = {
      state: "NOT_STARTED",
      session: null,
      summary: null,
    } as const;

    const session = await this.sessions.findLatestOwnForExactPin(userId, pin);
    if (session === null || session.status === "CANCELLED") {
      return NOT_STARTED;
    }

    // A session pinned to a version the registry no longer holds cannot be
    // reasoned about, so it reads as not started rather than as a guess.
    let definition: GuideDefinition;
    try {
      definition = productionGuideRegistry.getExact(
        session.guideKey,
        session.guideVersion,
      );
    } catch {
      return NOT_STARTED;
    }

    const accepted = (await this.steps.listAccepted(session.id)).map((row) =>
      parseAcceptedGuideStepRow(row),
    );
    const projection = deriveGuideProjection(
      definition,
      accepted,
      session.status,
    );
    const view: GuideSessionView = {
      sessionId: session.id,
      guideKey: session.guideKey,
      guideVersion: session.guideVersion,
      status: session.status,
      stepsCompleted: projection.stepsCompleted,
      totalSteps: projection.totalSteps,
      currentStepKey: projection.currentStepKey,
    };

    if (session.status === "COMPLETED") {
      return {
        state: "COMPLETED",
        session: view,
        summary: toGuideCompletionSummary({
          definition,
          acceptedSteps: accepted,
        }),
      };
    }
    return { state: "ACTIVE", session: view, summary: null };
  }

  /**
   * C.1 — where the reader stands in EACH of several experiences.
   *
   * The defect this closes (#639): the chapter asked once, for the chapter's
   * own guide pin, and every card compared itself to that single answer. Two
   * experiences therefore shared one state — finish one and the other read
   * «Completada» without anybody opening it.
   *
   * Three reads, whatever the list's length:
   *
   *   1. the ACTIVE sessions of the distinct lineages;
   *   2. every session of the exact published pins;
   *   3. the accepted steps of the sessions those two produced.
   *
   * Precedence per card, and the order matters:
   *
   *   1. ACTIVE of the same `guideKey` → CONTINUE, on that session's OWN pin.
   *      A reader who left `A@v1` running is offered the run they are in, not
   *      a fresh `A@v2` that would strand it. A session is never migrated.
   *   2. otherwise COMPLETED of the EXACT published pin → COMPLETED.
   *      Completion does not cross versions.
   *   3. otherwise → START, on the published pin.
   *
   * A CANCELLED session is not a state: the reader withdrew, and the honest
   * answer is START. The response echoes the requested order and repeats the
   * answer for a repeated pin — two experiences deliberately bound to the same
   * guide DO share a lineage, and pretending otherwise would invent an
   * independence the data does not have.
   */
  async resolveExperienceCardStates(
    userId: string,
    pins: readonly { guideKey: string; guideVersion: number }[],
  ): Promise<GuideExperienceCardState[]> {
    if (pins.length === 0) return [];

    const [activeRows, exactRows] = await Promise.all([
      this.sessions.findActiveOwnForGuideKeys(
        userId,
        pins.map((p) => p.guideKey),
      ),
      this.sessions.findOwnForExactPins(userId, pins),
    ]);

    const activeByKey = new Map<string, GuideSessionRow>();
    for (const row of activeRows) {
      if (!activeByKey.has(row.guideKey)) activeByKey.set(row.guideKey, row);
    }
    // Newest first per pin comes from the repository's ordering; the first row
    // seen for a pin is therefore the latest one.
    const exactByPin = new Map<string, GuideSessionRow>();
    for (const row of exactRows) {
      const k = `${row.guideKey}@${row.guideVersion}`;
      if (!exactByPin.has(k)) exactByPin.set(k, row);
    }

    // The sessions any card actually cites — and only those. Steps for a
    // session nobody will mention are work nobody asked for.
    const cited = new Map<string, GuideSessionRow>();
    for (const pin of pins) {
      const active = activeByKey.get(pin.guideKey);
      if (active) cited.set(active.id, active);
      const exact = exactByPin.get(`${pin.guideKey}@${pin.guideVersion}`);
      if (exact && exact.status === "COMPLETED") cited.set(exact.id, exact);
    }
    const steps = await this.steps.listAcceptedForSessions([...cited.keys()]);
    const stepsBySession = new Map<string, typeof steps>();
    for (const row of steps) {
      const list = stepsBySession.get(row.sessionId) ?? [];
      list.push(row);
      stepsBySession.set(row.sessionId, list);
    }

    /** The public view of a session, or `null` when its pin left the registry. */
    const viewOf = (row: GuideSessionRow): GuideSessionView | null => {
      let definition: GuideDefinition;
      try {
        definition = productionGuideRegistry.getExact(
          row.guideKey,
          row.guideVersion,
        );
      } catch {
        // A session pinned to a version this build no longer ships cannot be
        // projected, so it is not cited at all — the card falls back to START
        // rather than reporting a shape we cannot compute.
        return null;
      }
      const accepted = (stepsBySession.get(row.id) ?? []).map((r) =>
        parseAcceptedGuideStepRow(r),
      );
      const projection = deriveGuideProjection(
        definition,
        accepted,
        row.status,
      );
      return {
        sessionId: row.id,
        guideKey: row.guideKey,
        guideVersion: row.guideVersion,
        status: row.status,
        stepsCompleted: projection.stepsCompleted,
        totalSteps: projection.totalSteps,
        currentStepKey: projection.currentStepKey,
      };
    };

    return pins.map((pin) => {
      const published = {
        guideKey: pin.guideKey,
        guideVersion: pin.guideVersion,
      };

      const active = activeByKey.get(pin.guideKey);
      if (active) {
        const view = viewOf(active);
        if (view) {
          return {
            guidePin: published,
            status: "CONTINUE" as GuideExperienceCardStatus,
            session: view,
            // The session's OWN pin: continuing must never move a run to
            // another version.
            resumePin: {
              guideKey: view.guideKey,
              guideVersion: view.guideVersion,
            },
          };
        }
      }

      const exact = exactByPin.get(`${pin.guideKey}@${pin.guideVersion}`);
      if (exact && exact.status === "COMPLETED") {
        const view = viewOf(exact);
        if (view) {
          return {
            guidePin: published,
            status: "COMPLETED" as GuideExperienceCardStatus,
            session: view,
            resumePin: published,
          };
        }
      }

      return {
        guidePin: published,
        status: "START" as GuideExperienceCardStatus,
        session: null,
        resumePin: published,
      };
    });
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
   * Everything runs in ONE transaction, holding the LINEAGE start lock
   * (`guideStartLockKeys`), with the SESSION lock nested underneath only when
   * there is something to autocancel:
   *
   *   1. load the pinned definition and resolve ALL its targets on `tx`, which
   *      is what pins `editionId`/`unitId` into the START semantics;
   *   2. receipt inspection — a replay returns the ORIGINAL session, applying
   *      nothing (in particular it never autocancels a second time);
   *   3. entitlement, on the same snapshot;
   *   4. read from the SCHEMA which ACTIVE invariant is in force, and close
   *      what this start replaces accordingly: under GLOBAL the user's single
   *      ACTIVE session (its cardinality proved, not assumed), under LINEAGE
   *      only an ACTIVE session of the SAME `guideKey`. Either way it happens
   *      under that session's OWN lock (nested, never reversed), creates NO
   *      receipt and emits NO event. With no usable invariant, nothing is
   *      written at all;
   *   5. create the session, append the receipt, emit `guide_session_started`
   *      with the command's own idempotency key.
   */
  async start(
    user: AuthenticatedUser,
    command: GuideStartCommandInput,
  ): Promise<GuideCommandResult> {
    return mapGuideErrors(() =>
      this.prisma.$transaction(
        async (tx) => {
          // C.0B3 — the lineage start lock, from ONE authority.
          // The global compatibility key is gone: it existed to serialise
          // against V0, which took only that key, and V0 is extinct before this
          // binary ships. V1 still takes the lineage key, so V1 and V2 keep
          // serialising for the same lineage during the rollout — which is the
          // whole reason the bridge took both for two phases. Inlining the key
          // here would let production and the mixed-fleet pg-spec drift apart
          // while both kept passing.
          for (const key of guideStartLockKeys(user.userId, command.guideKey)) {
            await this.lock(tx, key);
          }

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

          // (4) Close whatever this start replaces — scoped by whichever
          // invariant the DATABASE is currently enforcing, read here rather
          // than configured, because the partial unique index IS the rule.
          const capability = await readGuideActiveCapability(tx);
          if (capability.degraded) this.reportDegradedCapability(capability);
          if (capability.effectiveMode === "FAIL_CLOSED") {
            // No authority means we cannot tell a global world from a lineage
            // one, and the two disagree about what to cancel. Refuse before the
            // first irreversible write rather than guess.
            guideFail("GUIDE_STORAGE_FAILURE");
          }

          if (capability.effectiveMode === "GLOBAL") {
            // The global index promises at most one ACTIVE row per user. Prove
            // it: a second row here means schema and code disagree, and a
            // global autocancel would then close an unrelated lineage.
            const cardinality = await this.sessions.activeOwnCardinality(
              user.userId,
              tx,
            );
            if (cardinality.kind === "MULTIPLE") {
              guideFail("GUIDE_STORAGE_FAILURE");
            }
            if (cardinality.kind === "SINGLE") {
              await this.autocancel(user, cardinality.session.id, tx);
            }
          } else {
            const active = await this.sessions.findActiveOwnForGuideKey(
              user.userId,
              definition.guideKey,
              tx,
            );
            if (active) await this.autocancel(user, active.id, tx);
          }

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
        },
        // C.0A — stated, not inherited. The cross-lineage idempotency race is
        // resolved by re-reading the receipt row the winner just committed,
        // and only READ COMMITTED takes a fresh snapshot per statement. Under
        // a stricter level the loser would read its own older snapshot, miss
        // the row and report a storage failure instead of the canonical
        // conflict — a different public contract, one server setting away.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
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
  private async mutate<R extends GuideCommandResult = GuideCommandResult>(
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
    /**
     * GR-3 — decorate the snapshot from state this transaction can still see.
     * It runs on BOTH paths, fresh and replay, so a command that reports more
     * than the session reports the same thing either way: the replay does not
     * re-derive anything, it reads the row the original attempt wrote.
     */
    finalize?: (
      tx: Tx,
      session: GuideSessionRow,
      result: GuideCommandResult,
    ) => Promise<R>,
  ): Promise<R> {
    return mapGuideErrors(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lock(tx, `guide:session:${user.userId}:${sessionId}`);

          const current = await this.sessions.findOwn(
            sessionId,
            user.userId,
            tx,
          );
          // Foreign and nonexistent are the same value-free verdict.
          if (!current) guideFail("GUIDE_SESSION_NOT_FOUND");
          const session = current as GuideSessionRow;
          const definition = this.definitionOf(session);
          const semantics = buildSemantics(session, definition);

          const seen = await this.receipts.inspectValidated(semantics, tx);
          if (seen.state === "replay") {
            const replay = await this.snapshot(session, definition, tx, {
              created: false,
              replayed: true,
            });
            return finalize ? finalize(tx, session, replay) : (replay as R);
          }

          const updated = await apply(tx, session, definition);
          await this.receipts.appendValidated({ semantics }, tx);
          const fresh = await this.snapshot(updated, definition, tx, {
            created: true,
            replayed: false,
          });
          return finalize ? finalize(tx, updated, fresh) : (fresh as R);
        },
        // The receipt key is transversal across command types, so the same
        // isolation contract has to hold here: a STEP and a CANCEL sharing an
        // idempotency key race exactly like two STARTs do.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
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
  ): Promise<GuideRecallCommandResult> {
    return this.mutate<GuideRecallCommandResult>(
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
      async (tx, session, result) => ({
        ...result,
        feedback: {
          outcome: await this.recallOutcome(session.id, command, tx),
        },
      }),
    );
  }

  /**
   * The outcome the person is shown, read back from the ACCEPTED ledger row of
   * this session and step — the same source on the fresh path and on a replay.
   *
   * Fail closed: no accepted row, a row of another kind, or a row whose graded
   * result is missing are all states in which we do not know what to say, and
   * inventing an outcome would be telling the person something the system did
   * not measure.
   */
  private async recallOutcome(
    sessionId: string,
    command: GuideStepRecallCommandInput,
    tx: Tx,
  ): Promise<GuideRecallOutcome> {
    const accepted = await this.ledger(sessionId, tx);
    const row = accepted.find((s) => s.stepKey === command.stepKey);
    if (!row || row.kind !== "ACTIVE_RECALL") {
      guideFail("GUIDE_STORAGE_FAILURE");
    }
    const graded = (
      row as Extract<AcceptedGuideStep, { kind: "ACTIVE_RECALL" }>
    ).recallResult;
    if (graded !== "CORRECT" && graded !== "INCORRECT") {
      guideFail("GUIDE_STORAGE_FAILURE");
    }
    // INCORRECT is a measurement; REVIEW is what we say about it.
    return graded === "CORRECT" ? "CORRECT" : "REVIEW";
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
