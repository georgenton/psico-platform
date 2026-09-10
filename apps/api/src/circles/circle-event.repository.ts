import type { CircleEventType, PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";

/**
 * The single authorized writer of `CircleEvent` (PR2).
 *
 * An event records THAT something happened. There is no column for a reason, a
 * note or anything a person wrote, and `metadata` is not a bag: a SQL CHECK
 * enumerates the two values it may ever hold, on the one event type that takes
 * it. The previous version capped its serialised size at 2 kB and called that a
 * guarantee — 2 kB is several paragraphs, and a paragraph is precisely what
 * must never land here.
 *
 * The table is also APPEND-ONLY, enforced by triggers on UPDATE, DELETE and
 * TRUNCATE. This repository has one write primitive and no update or delete
 * method, but that is a convention; the triggers are what make it true.
 *
 * It is also the receipt. The migration adds two partial unique indexes over
 * `(actor, type, idempotencyKey)`, one per actor kind, so a replayed command
 * collides in PostgreSQL rather than being deduplicated by something in front
 * of it. That is the difference this cut cares about: Redis makes retries
 * cheap; PostgreSQL makes them correct.
 */

export type CircleEventDb = Pick<PrismaClient, "circleEvent">;
export type CircleEventTx = CircleEventDb;

/**
 * The metadata grammar, as a CLOSED discriminated union rather than a bag.
 *
 * `Record<string, string | number | boolean>` was the wrong shape: it admits
 * any key, and a key is all somebody needs to put a sentence somewhere. This
 * admits one key, on one event type, holding one boolean — and the union makes
 * "metadata on an event that does not take metadata" a type error rather than a
 * runtime discovery. The SQL CHECK enumerates the same two values, so the type
 * and the column cannot drift into disagreeing.
 *
 * Widening this is a three-place edit — this union, the CHECK, and the specs —
 * which is the point: it should not be possible to add a field to an audit
 * ledger by accident.
 */
export type CircleEventTypeWithMetadata = "INVITATION_CREATED";

/**
 * The two event types that are ABOUT an artifact (PR3).
 *
 * Both carry `artifactId`, and both require the activity and the acting seat —
 * the activity because the composite foreign key needs both columns to run, and
 * the seat because "somebody confirmed this" without a somebody is not a
 * confirmation. A SQL CHECK enforces the same three, so the type and the column
 * cannot drift into disagreeing.
 */
export type CircleEventTypeWithArtifact =
  | "ARTIFACT_PROPOSED"
  | "ARTIFACT_CONFIRMED";

export type CircleEventTypePlain = Exclude<
  CircleEventType,
  CircleEventTypeWithMetadata | CircleEventTypeWithArtifact
>;

export type CircleEventShape =
  | {
      readonly type: CircleEventTypeWithMetadata;
      /** Whether a short code exists — a fact its recipient already knows. */
      readonly metadata: { readonly hasCode: boolean };
      readonly artifactId?: undefined;
    }
  | {
      readonly type: CircleEventTypeWithArtifact;
      /** The EXACT artifact row, which pins the version with it. */
      readonly artifactId: string;
      readonly activityId: string;
      readonly actorParticipantId: string;
      readonly metadata?: undefined;
    }
  | {
      readonly type: CircleEventTypePlain;
      readonly metadata?: undefined;
      readonly artifactId?: undefined;
    };

export type AppendEventInput = CircleEventShape & {
  readonly circleId: string;
  readonly activityId?: string | null;
  /** Exactly one of these, or neither for a SYSTEM event (SQL CHECK). */
  readonly actorUserId?: string | null;
  readonly actorParticipantId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly occurredAt?: Date;
};

export type AppendEventResult =
  /** This call wrote the event. */
  | { readonly outcome: "APPENDED"; readonly id: string }
  /**
   * An event with this receipt already existed. The command was a replay and
   * this call is a NOOP — decided by a unique index, not by a prior read.
   */
  | { readonly outcome: "REPLAY" };

/** Prisma's unique-violation code. Matched on the code, never on the message. */
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export class CircleEventRepository {
  constructor(private readonly prisma: CircleEventDb) {}

  async append(
    input: AppendEventInput,
    db: CircleEventDb = this.prisma,
  ): Promise<AppendEventResult> {
    try {
      const row = await db.circleEvent.create({
        data: {
          circleId: input.circleId,
          activityId: input.activityId ?? null,
          type: input.type,
          actorUserId: input.actorUserId ?? null,
          actorParticipantId: input.actorParticipantId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          artifactId: input.artifactId ?? null,
          // `undefined` omits the column, which lands as SQL NULL — the only
          // value the CHECK admits for every type but `INVITATION_CREATED`.
          metadata: input.metadata ?? undefined,
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        },
        select: { id: true },
      });
      return { outcome: "APPENDED", id: row.id };
    } catch (err) {
      // A receipt collision is the mechanism working, not a failure. Anything
      // else becomes the value-free storage error.
      if (isUniqueViolation(err) && input.idempotencyKey) {
        return { outcome: "REPLAY" };
      }
      throw new CircleStorageError();
    }
  }
}
