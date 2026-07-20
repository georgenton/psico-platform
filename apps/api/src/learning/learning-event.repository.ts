import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { LearningEventRecord } from "@psico/types";
import type { ValidatedLearningEvent } from "./validated-learning-event";
import {
  isSemanticallyEquivalent,
  KIND_TO_TYPE,
  readStoredPayload,
  rebuildPayload,
  TYPE_TO_KIND,
} from "./learning-event-semantics";

/**
 * CC-7.2 — the SINGLE authorized writer of the LearningEvent table (ADR 0017
 * §5). The `no-direct-learning-event-write` ratchet pins that the ONLY
 * `learningEvent.create` in `apps/api/src` runtime code is the one in this
 * file, and that no update/delete/upsert exists anywhere: append-only does
 * not depend on the absence of HTTP endpoints.
 *
 * This is a plain, Nest-free repository (constructor-injected Prisma-shaped
 * client) so CC-7.3's domain commands can register it in a module later; for
 * now nothing imports it at runtime — the table stays inert in production.
 *
 * Privacy: no method logs, and no thrown error embeds, a payload or any input
 * value. Errors carry stable codes only.
 */

/**
 * The slice of the Prisma surface this writer needs. Both `PrismaClient` (or
 * the Nest `PrismaService` extending it) and a `$transaction` client satisfy
 * it, so a future domain command can persist its state transition and the
 * event atomically: `appendValidated(input, tx)`.
 */
export type LearningEventDb = Pick<PrismaClient, "learningEvent">;

export interface AppendLearningEventResult {
  /** True when this call inserted the row. */
  created: boolean;
  /** True when an exact prior write already held the row (idempotent replay). */
  replayed: boolean;
  /** The public record — server clock as `occurredAt`, never `userId`. */
  record: LearningEventRecord;
}

/**
 * Same `(userId, idempotencyKey)` as an existing row, but the semantic
 * content (type, payload, references or blockKey) differs. Deliberately
 * carries NO values — codes only.
 */
export class LearningEventIdempotencyConflictError extends Error {
  readonly code = "LEARNING_EVENT_IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("LEARNING_EVENT_IDEMPOTENCY_CONFLICT");
    this.name = "LearningEventIdempotencyConflictError";
  }
}

/**
 * Sanitized storage failure. Prisma validation errors can serialize the data
 * object into their message, so anything that is not a known-request error is
 * replaced by this value-free wrapper (the `cause` is intentionally dropped —
 * an embedded payload in a log line would break the privacy contract).
 */
export class LearningEventStorageError extends Error {
  readonly code = "LEARNING_EVENT_STORAGE_FAILURE" as const;
  constructor() {
    super("LEARNING_EVENT_STORAGE_FAILURE");
    this.name = "LearningEventStorageError";
  }
}

function isUniqueViolation(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  // When Prisma reports the violated columns, require the idempotency
  // constraint; when it does not, the only non-PK unique on this table is
  // (userId, idempotencyKey), so accept.
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.includes("idempotencyKey");
  }
  return true;
}

interface StoredRow {
  id: string;
  kind: string;
  payload: unknown;
  editionId: string | null;
  unitId: string | null;
  conceptId: string | null;
  guideSessionId: string | null;
  blockKey: string | null;
  schemaVersion: number | null;
  createdAt: Date;
}

export class LearningEventRepository {
  constructor(private readonly prisma: LearningEventDb) {}

  /**
   * Append one validated V1 event, race-safe:
   *
   *   1. attempt the INSERT (never find-then-create — that is a TOCTOU hole);
   *   2. on a unique violation of `(userId, idempotencyKey)`, read the
   *      existing row and compare it semantically (type, exact payload,
   *      every reference, blockKey, schemaVersion — never `id`/`createdAt`);
   *   3. exact match ⇒ idempotent replay of the original row;
   *      any drift ⇒ `LearningEventIdempotencyConflictError`.
   *
   * `db` accepts a `$transaction` client so a domain transition and its event
   * commit or roll back together.
   */
  async appendValidated(
    input: ValidatedLearningEvent,
    db?: LearningEventDb,
  ): Promise<AppendLearningEventResult> {
    const client = db ?? this.prisma;

    // Runtime guard mirroring the compile-time union: a value smuggled in via
    // casts (or a future non-V1 type) never reaches the INSERT.
    const kind = TYPE_TO_KIND[input.type];
    if (kind === undefined) {
      throw new LearningEventStorageError();
    }

    // Field-by-field reconstruction — no property of the caller's object
    // reaches storage without being on the per-type whitelist. The payload
    // interfaces have no index signature, so Prisma's JSON input type needs
    // the two-step widening; the VALUE is a plain closed object by build.
    const payload = rebuildPayload(input) as unknown as Prisma.InputJsonValue;

    try {
      const row = await client.learningEvent.create({
        data: {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind,
          payload,
          // Server-owned: the repository stamps the schema version and the
          // database assigns `createdAt` — neither is an input.
          schemaVersion: 1,
          editionId: input.editionId ?? null,
          unitId: input.unitId ?? null,
          conceptId: input.conceptId ?? null,
          guideSessionId: input.guideSessionId ?? null,
          blockKey: input.blockKey ?? null,
        },
      });
      return { created: true, replayed: false, record: toRecord(row) };
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // Known request errors (FK violation, connection loss…) have
        // template messages without data values — rethrow for ops signal.
        // Anything else (notably validation errors, which can embed the data
        // object) is replaced wholesale.
        if (err instanceof Prisma.PrismaClientKnownRequestError) throw err;
        throw new LearningEventStorageError();
      }

      const existing = await client.learningEvent.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!existing) {
        // The row that made us collide vanished between the INSERT and this
        // read — nothing safe to replay.
        throw new LearningEventStorageError();
      }
      if (!isSemanticallyEquivalent(existing, input)) {
        throw new LearningEventIdempotencyConflictError();
      }
      return { created: false, replayed: true, record: toRecord(existing) };
    }
  }
}

/**
 * Map a stored row to the public `LearningEventRecord`: the server clock
 * becomes `occurredAt`, `type` and `payload` come back exactly coupled, and
 * `userId` never appears (the actor is the caller's JWT, not the wire).
 */
function toRecord(row: StoredRow): LearningEventRecord {
  const type = KIND_TO_TYPE[row.kind];
  if (type === undefined) {
    // A non-V1 kind can only reach here through a foreign write — fail closed.
    throw new LearningEventStorageError();
  }
  const payload = readStoredPayload(type, row.payload);
  if (payload === null) {
    throw new LearningEventStorageError();
  }
  const base = {
    id: row.id,
    schemaVersion: 1 as const,
    occurredAt: row.createdAt.toISOString(),
    editionId: row.editionId,
    unitId: row.unitId,
    conceptId: row.conceptId,
    guideSessionId: row.guideSessionId,
  };
  // The exact parse above re-established the type↔payload coupling at
  // runtime; the cast restates for the union what a runtime switch cannot
  // carry back into the type system.
  return { ...base, type, payload } as LearningEventRecord;
}
