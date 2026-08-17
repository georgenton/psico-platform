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

/** The actor's ACTIVE-session count, as a value the caller cannot weaken. */
export type ActiveOwnCardinality =
  | { kind: "NONE" }
  | { kind: "SINGLE"; session: GuideSessionRow }
  | { kind: "MULTIPLE" };

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

  /**
   * The actor's ACTIVE session for ONE guide lineage.
   *
   * C.0A — replaces an unordered `findActive(userId)` that assumed the
   * database allowed a single ACTIVE row per user. Once the invariant becomes
   * per-`(userId, guideKey)` that assumption is false, and an unordered
   * `findFirst` over several rows returns an ARBITRARY lineage: recovery could
   * answer about guide B when asked about A, and START could cancel a journey
   * nobody touched. Selecting by `guideKey` makes the answer a property of the
   * query rather than of row order.
   *
   * At most one row can match in either schema state, so no ordering is needed
   * here: the global index permits one ACTIVE per user, the lineage index one
   * per user and guide.
   */
  async findActiveOwnForGuideKey(
    userId: string,
    guideKey: string,
    db?: GuideSessionDb,
  ): Promise<GuideSessionRow | null> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSession.findFirst({
        where: { userId, guideKey, status: "ACTIVE" },
        select: SELECT,
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * How many ACTIVE sessions the actor has, as a closed answer.
   *
   * Used only while the GLOBAL index is the authority, to PROVE the "at most
   * one" it promises instead of assuming it. There is no caller-supplied
   * limit: a `limit: 1` would hide the second row and turn the corruption
   * check into a lie, so the bound of two is the operation's own.
   *
   * `MULTIPLE` is a state the global index says cannot exist. Reaching it
   * means the schema and the code disagree, and the caller must write nothing.
   */
  async activeOwnCardinality(
    userId: string,
    db?: GuideSessionDb,
  ): Promise<ActiveOwnCardinality> {
    const client = db ?? this.prisma;
    try {
      const rows = await client.guideSession.findMany({
        where: { userId, status: "ACTIVE" },
        // Deterministic even though `MULTIPLE` discards the rows: a
        // non-deterministic read has no business existing on this path.
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        take: 2,
        select: SELECT,
      });
      if (rows.length === 0) return { kind: "NONE" };
      if (rows.length === 1) {
        return { kind: "SINGLE", session: rows[0] as GuideSessionRow };
      }
      return { kind: "MULTIPLE" };
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * GR-7 — the LATEST session this actor has for an exact pin, whatever its
   * status.
   *
   * `findActive` cannot answer "did I finish this?", which is why a completed
   * journey read as never-started after a reload. This is the same shape of
   * read — scoped to `userId` by construction, so another actor's session does
   * not come back denied, it does not exist — widened to the statuses that
   * are not ACTIVE.
   *
   * Newest first: a reader who cancelled a run and started again should be
   * told about the run they are in, not the one they walked away from.
   */
  async findLatestOwnForExactPin(
    userId: string,
    pin: { guideKey: string; guideVersion: number },
    db?: GuideSessionDb,
  ): Promise<GuideSessionRow | null> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSession.findFirst({
        where: {
          userId,
          guideKey: pin.guideKey,
          guideVersion: pin.guideVersion,
        },
        orderBy: { startedAt: "desc" },
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
