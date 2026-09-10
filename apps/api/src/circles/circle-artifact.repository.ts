import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";
import type { CircleEnvelope } from "./circles-crypto";

/**
 * The single authorized writer of `CircleArtifact` (PR3).
 *
 * The shared result of a Dúo: one live row per activity, versioned, and never
 * edited in place. Editing produces a NEW row with the next version and marks
 * the previous `SUPERSEDED`, which is what makes "editing invalidates the
 * confirmations" structural instead of remembered — the old confirmations point
 * at the old artifact and simply stop counting toward the new one.
 *
 * Lock position: LAST. After the participants. See
 * `circles-participation.service.ts`.
 */

export type CircleArtifactDb = Pick<
  PrismaClient,
  "circleArtifact" | "circleEvent" | "$queryRaw"
>;
export type CircleArtifactTx = CircleArtifactDb;

export type CircleArtifactStatusRow = "PROPOSED" | "AGREED" | "SUPERSEDED";

export interface CircleArtifactRow {
  id: string;
  activityId: string;
  version: number;
  kind: string;
  status: CircleArtifactStatusRow;
  ciphertext: string;
  nonce: string;
  keyVersion: number;
  createdByParticipantId: string;
  agreedAt: Date | null;
}

const SELECT = {
  id: true,
  activityId: true,
  version: true,
  kind: true,
  status: true,
  ciphertext: true,
  nonce: true,
  keyVersion: true,
  createdByParticipantId: true,
  agreedAt: true,
} as const;

export class CircleArtifactRepository {
  constructor(private readonly prisma: CircleArtifactDb) {}

  /** The live artifact, if any. `SUPERSEDED` rows are history, not state. */
  async findActive(
    activityId: string,
    db: CircleArtifactDb = this.prisma,
  ): Promise<CircleArtifactRow | null> {
    try {
      return await db.circleArtifact.findFirst({
        where: { activityId, status: { not: "SUPERSEDED" } },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Every artifact of the activity, LOCKED, newest first.
   *
   * The whole set rather than just the live one: a proposal has to read the
   * highest version to pick the next, and reading it unlocked would let two
   * concurrent proposals both choose the same number — which the unique index
   * would then refuse, turning a normal race into a 500.
   */
  async lockForActivity(
    activityId: string,
    tx: CircleArtifactTx,
  ): Promise<CircleArtifactRow[]> {
    try {
      return await tx.$queryRaw<CircleArtifactRow[]>(Prisma.sql`
        SELECT "id", "activityId", "version", "kind", "status", "ciphertext",
               "nonce", "keyVersion", "createdByParticipantId", "agreedAt"
          FROM "CircleArtifact"
         WHERE "activityId" = ${activityId}
         ORDER BY "id"
           FOR UPDATE
      `);
    } catch {
      throw new CircleStorageError();
    }
  }

  /** Mark the current live artifact superseded, so the new one may exist. */
  async supersede(artifactId: string, tx: CircleArtifactTx): Promise<boolean> {
    try {
      const count = await tx.circleArtifact.updateMany({
        where: { id: artifactId, status: { not: "SUPERSEDED" } },
        data: { status: "SUPERSEDED" },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  async create(
    input: {
      readonly activityId: string;
      readonly version: number;
      readonly kind: string;
      readonly envelope: CircleEnvelope;
      readonly createdByParticipantId: string;
    },
    tx: CircleArtifactTx,
  ): Promise<{ id: string }> {
    try {
      return await tx.circleArtifact.create({
        data: {
          activityId: input.activityId,
          version: input.version,
          kind: input.kind as never,
          ciphertext: input.envelope.ciphertext,
          nonce: input.envelope.nonce,
          keyVersion: input.envelope.keyVersion,
          createdByParticipantId: input.createdByParticipantId,
        },
        select: { id: true },
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * How many distinct seats have confirmed THIS artifact.
   *
   * Counted from the event ledger, which is where a confirmation lives: the
   * partial unique index over `(artifactId, actorParticipantId)` on
   * `ARTIFACT_CONFIRMED` makes each seat contribute at most one.
   */
  async countConfirmations(
    artifactId: string,
    db: CircleArtifactDb,
  ): Promise<number> {
    try {
      const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT count(*) AS n FROM "CircleEvent"
         WHERE "artifactId" = ${artifactId} AND "type" = 'ARTIFACT_CONFIRMED'
      `);
      return Number(rows[0]?.n ?? 0);
    } catch {
      throw new CircleStorageError();
    }
  }

  /** Whether this seat already confirmed this exact artifact. */
  async hasConfirmed(
    artifactId: string,
    participantId: string,
    db: CircleArtifactDb,
  ): Promise<boolean> {
    try {
      const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT count(*) AS n FROM "CircleEvent"
         WHERE "artifactId" = ${artifactId}
           AND "actorParticipantId" = ${participantId}
           AND "type" = 'ARTIFACT_CONFIRMED'
      `);
      return Number(rows[0]?.n ?? 0) > 0;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * `PROPOSED → AGREED`, once.
   *
   * Conditional on still being `PROPOSED`, so two confirmations arriving
   * together cannot both agree it, and an artifact superseded in between
   * cannot be agreed at all.
   */
  async agree(
    artifactId: string,
    now: Date,
    tx: CircleArtifactTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleArtifact.updateMany({
        where: { id: artifactId, status: "PROPOSED" },
        data: { status: "AGREED", agreedAt: now },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }
}
