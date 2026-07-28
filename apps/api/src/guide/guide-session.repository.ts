import type { GuideSessionProjection, GuideSessionStatus } from "@psico/types";
import type { PrismaClient } from "@prisma/client";

/**
 * CC-7.4C — the SINGLE authorized runtime writer of `GuideSession`
 * (ratchet: `no-direct-guide-session-write`). Every write reconstructs the
 * mutable columns field by field from SERVER-derived values:
 *
 *   status · stepsCompleted · totalSteps · currentStepKey · completedAt ·
 *   cancelledAt
 *
 * A client-supplied counter can never reach the table: the repository only
 * accepts a `GuideSessionProjection` derived by the pure state machine from
 * the ledger (GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP).
 *
 * Ownership is part of every lookup and every update predicate — a session is
 * only ever read or mutated through `(id, userId)`, so another user's session
 * is indistinguishable from a missing one.
 *
 * Privacy: nothing here logs, and no error leaves carrying a Prisma/pg message,
 * an id, or a catalog key.
 */

export type GuideSessionDb = Pick<PrismaClient, "guideSession">;

/** Sanitized storage failure — the value-free replacement for EVERY upstream
 * error. `cause` is never set (driver text can embed values). */
export class GuideSessionStorageError extends Error {
  readonly code = "GUIDE_SESSION_STORAGE_FAILURE" as const;
  constructor() {
    super("GUIDE_SESSION_STORAGE_FAILURE");
    this.name = "GuideSessionStorageError";
  }
}

/** The columns the lifecycle reads. Deliberately a plain shape (no Prisma
 * type) so the consumer stays decoupled from the generated client. */
export interface GuideSessionRow {
  id: string;
  userId: string;
  guideKey: string;
  guideVersion: number;
  status: GuideSessionStatus;
  editionId: string | null;
  unitId: string | null;
  stepsCompleted: number;
  totalSteps: number;
  currentStepKey: string | null;
  startedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

const SELECT = {
  id: true,
  userId: true,
  guideKey: true,
  guideVersion: true,
  status: true,
  editionId: true,
  unitId: true,
  stepsCompleted: true,
  totalSteps: true,
  currentStepKey: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
} as const;

export interface CreateGuideSessionInput {
  userId: string;
  guideKey: string;
  guideVersion: number;
  /** SERVER-derived editorial anchor (all-or-nothing, SQL CHECK). */
  editionId: string;
  unitId: string;
  totalSteps: number;
  /** The first step of the pinned definition. */
  currentStepKey: string;
}

function sanitize(err: unknown): never {
  if (err instanceof GuideSessionStorageError) throw err;
  throw new GuideSessionStorageError();
}

export class GuideSessionRepository {
  constructor(private readonly prisma: GuideSessionDb) {}

  /** Own session by `(id, userId)` — another user's session reads as null. */
  async findOwn(
    sessionId: string,
    userId: string,
    db?: GuideSessionDb,
  ): Promise<GuideSessionRow | null> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSession.findFirst({
        where: { id: sessionId, userId },
        select: SELECT,
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /** The user's ACTIVE session, if any (DB enforces at most one). */
  async findActive(
    userId: string,
    db?: GuideSessionDb,
  ): Promise<GuideSessionRow | null> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSession.findFirst({
        where: { userId, status: "ACTIVE" },
        select: SELECT,
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /** Create the ACTIVE session. All counters start server-owned at zero. */
  async createActive(
    input: CreateGuideSessionInput,
    db?: GuideSessionDb,
  ): Promise<GuideSessionRow> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSession.create({
        data: {
          userId: input.userId,
          guideKey: input.guideKey,
          guideVersion: input.guideVersion,
          status: "ACTIVE",
          editionId: input.editionId,
          unitId: input.unitId,
          stepsCompleted: 0,
          totalSteps: input.totalSteps,
          currentStepKey: input.currentStepKey,
          completedAt: null,
          cancelledAt: null,
        },
        select: SELECT,
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * Apply a ledger-derived projection to an ACTIVE session. `updateMany` with
   * the ownership + status predicate: a session that moved out of ACTIVE under
   * us updates zero rows and the caller sees it.
   */
  async applyProjection(
    sessionId: string,
    userId: string,
    projection: GuideSessionProjection,
    db?: GuideSessionDb,
  ): Promise<number> {
    const client = db ?? this.prisma;
    try {
      const { count } = await client.guideSession.updateMany({
        where: { id: sessionId, userId, status: "ACTIVE" },
        data: {
          stepsCompleted: projection.stepsCompleted,
          totalSteps: projection.totalSteps,
          currentStepKey: projection.currentStepKey,
        },
      });
      return count;
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * ACTIVE → CANCELLED. Keeps the accepted count (derived from the ledger),
   * drops the cursor, stamps the SERVER clock. Used both by the explicit
   * CANCEL command and by START's autocancel.
   */
  async cancelActive(
    sessionId: string,
    userId: string,
    stepsCompleted: number,
    db?: GuideSessionDb,
  ): Promise<number> {
    const client = db ?? this.prisma;
    try {
      const { count } = await client.guideSession.updateMany({
        where: { id: sessionId, userId, status: "ACTIVE" },
        data: {
          status: "CANCELLED",
          stepsCompleted,
          currentStepKey: null,
          cancelledAt: new Date(),
          completedAt: null,
        },
      });
      return count;
    } catch (err) {
      sanitize(err);
    }
  }

  /** ACTIVE → COMPLETED with a full ledger. Cursor cleared, server clock. */
  async completeActive(
    sessionId: string,
    userId: string,
    stepsCompleted: number,
    db?: GuideSessionDb,
  ): Promise<number> {
    const client = db ?? this.prisma;
    try {
      const { count } = await client.guideSession.updateMany({
        where: { id: sessionId, userId, status: "ACTIVE" },
        data: {
          status: "COMPLETED",
          stepsCompleted,
          currentStepKey: null,
          completedAt: new Date(),
          cancelledAt: null,
        },
      });
      return count;
    } catch (err) {
      sanitize(err);
    }
  }
}
