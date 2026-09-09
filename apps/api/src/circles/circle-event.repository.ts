import type { CircleEventType, PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";

/**
 * The single authorized writer of `CircleEvent` (PR2).
 *
 * An event records THAT something happened. There is no column for a reason, a
 * note or anything a person wrote — the table has no free-text column at all,
 * and `metadata` is a JSON bag the migration caps at 2 kB with a CHECK, which
 * is small enough that nobody fits an answer into it by accident.
 *
 * It is also the receipt. The migration adds two partial unique indexes over
 * `(actor, type, idempotencyKey)`, one per actor kind, so a replayed command
 * collides in PostgreSQL rather than being deduplicated by something in front
 * of it. That is the difference this cut cares about: Redis makes retries
 * cheap; PostgreSQL makes them correct.
 */

export type CircleEventDb = Pick<PrismaClient, "circleEvent">;

/**
 * Closed metadata: only these primitives, only at the top level. No nested
 * object, no array of objects, and — enforced by construction, not by review —
 * no place to put a sentence.
 */
export type CircleEventMetadata = Readonly<
  Record<string, string | number | boolean>
>;

export interface AppendEventInput {
  readonly circleId: string;
  readonly activityId?: string | null;
  readonly type: CircleEventType;
  /** Exactly one of these, or neither for a SYSTEM event (SQL CHECK). */
  readonly actorUserId?: string | null;
  readonly actorParticipantId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly metadata?: CircleEventMetadata;
  readonly occurredAt?: Date;
}

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
