import type { Prisma, PrismaClient } from "@prisma/client";
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
 * §5). The `no-direct-learning-event-write` ratchet pins that the ONLY write
 * primitive in `apps/api/src` runtime code is the one `createMany` in this
 * file (and zero raw SQL INSERTs anywhere): append-only does not depend on
 * the absence of HTTP endpoints.
 *
 * This is a plain, Nest-free repository (constructor-injected Prisma-shaped
 * client) so CC-7.3's domain commands can register it in a module later; for
 * now nothing imports it at runtime — the table stays inert in production.
 *
 * Privacy: no method logs anything, and no error that leaves this class
 * embeds a payload, userId, idempotencyKey, reference, SQL, connection
 * string, or upstream driver message. The public surface throws EXACTLY
 * three value-free error types (below) — raw Prisma/adapter/pg errors are
 * never propagated and never attached as `cause`.
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
 * content (type, payload, references or blockKey) differs. Codes only.
 */
export class LearningEventIdempotencyConflictError extends Error {
  readonly code = "LEARNING_EVENT_IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("LEARNING_EVENT_IDEMPOTENCY_CONFLICT");
    this.name = "LearningEventIdempotencyConflictError";
  }
}

/**
 * The caller handed the repository something that must never reach the
 * database: a non-UUID idempotency key, or a type outside the V1 union.
 * Thrown BEFORE any DB round-trip. Codes only.
 */
export class LearningEventInvalidInputError extends Error {
  readonly code = "LEARNING_EVENT_INVALID_PAYLOAD" as const;
  constructor() {
    super("LEARNING_EVENT_INVALID_PAYLOAD");
    this.name = "LearningEventInvalidInputError";
  }
}

/**
 * Sanitized storage failure — the value-free replacement for EVERY upstream
 * error (Prisma known/validation errors, adapter errors, pg errors, vanished
 * rows, malformed stored payloads). The `cause` is deliberately never set:
 * driver messages can embed data values or connection strings, and a
 * serialized cause would leak them into logs.
 */
export class LearningEventStorageError extends Error {
  readonly code = "LEARNING_EVENT_STORAGE_FAILURE" as const;
  constructor() {
    super("LEARNING_EVENT_STORAGE_FAILURE");
    this.name = "LearningEventStorageError";
  }
}

// ─── Idempotency-key canonicalization (fail-closed, ADR 0017 §3) ────────────

/**
 * Internal branded type: proof that a key passed `canonicalizeIdempotencyKey`.
 * The insert and the unique lookup only accept this type, so an un-validated
 * string cannot reach the database through any code path in this file.
 */
type CanonicalIdempotencyKey = string & {
  readonly __canonicalIdempotencyKey: unique symbol;
};

/**
 * Same shape the CC-7.1 parsers enforce (learning-command-parser.ts): RFC
 * UUID, version 1–8, canonical variant. Case-insensitive on input; the
 * CANONICAL form is lowercase.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The repository does not trust its caller with the idempotency key: a valid
 * UUID in any casing is canonicalized to lowercase (CC-7.1 contract);
 * anything else — whitespace, arbitrary strings, non-strings — is rejected
 * BEFORE any DB access. Never silently normalizes a non-UUID, and never
 * mutates the caller's object.
 */
function canonicalizeIdempotencyKey(raw: unknown): CanonicalIdempotencyKey {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    throw new LearningEventInvalidInputError();
  }
  return raw.toLowerCase() as CanonicalIdempotencyKey;
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

/** Re-throw our own typed errors; replace everything else, value-free. */
function sanitize(err: unknown): never {
  if (
    err instanceof LearningEventIdempotencyConflictError ||
    err instanceof LearningEventInvalidInputError ||
    err instanceof LearningEventStorageError
  ) {
    throw err;
  }
  throw new LearningEventStorageError();
}

export class LearningEventRepository {
  constructor(private readonly prisma: LearningEventDb) {}

  /**
   * Append one validated V1 event — transaction-safe and race-safe:
   *
   *   1. canonicalize the idempotency key (fail-closed, no DB touch on a
   *      bad key) and reject non-V1 types;
   *   2. NON-ABORTING insert: `createMany({ skipDuplicates: true })` compiles
   *      to `INSERT … ON CONFLICT DO NOTHING`, so a replay inside a caller's
   *      `$transaction` never raises a unique violation and never poisons
   *      the transaction (no P2002 → no 25P02 abort — the tx stays usable);
   *   3. `count` tells whether THIS call created the row;
   *   4. read the row by `(userId, canonicalKey)` and compare semantically
   *      (type, exact payload, every reference, blockKey, schemaVersion —
   *      never `id`/`createdAt`);
   *   5. exact match ⇒ idempotent replay of the original row;
   *      any drift ⇒ `LearningEventIdempotencyConflictError` (thrown by OUR
   *      code, not the database — inside a tx the caller's rollback is a
   *      clean, deliberate one).
   *
   * `db` accepts a `$transaction` client so a domain transition and its
   * event commit or roll back together.
   */
  async appendValidated(
    input: ValidatedLearningEvent,
    db?: LearningEventDb,
  ): Promise<AppendLearningEventResult> {
    const client = db ?? this.prisma;

    // Fail-closed BEFORE any DB access — invalid inputs never round-trip.
    const idempotencyKey = canonicalizeIdempotencyKey(input.idempotencyKey);
    const kind = TYPE_TO_KIND[input.type];
    if (kind === undefined) {
      throw new LearningEventInvalidInputError();
    }

    // Field-by-field reconstruction — no property of the caller's object
    // reaches storage without being on the per-type whitelist. The payload
    // interfaces have no index signature, so Prisma's JSON input type needs
    // the two-step widening; the VALUE is a plain closed object by build.
    const payload = rebuildPayload(input) as unknown as Prisma.InputJsonValue;

    try {
      // Single write primitive of the whole API (see ratchet). `id` keeps its
      // server-side cuid default and `createdAt` its DB default — neither is
      // an input.
      const { count } = await client.learningEvent.createMany({
        data: [
          {
            userId: input.userId,
            idempotencyKey,
            kind,
            payload,
            schemaVersion: 1,
            editionId: input.editionId ?? null,
            unitId: input.unitId ?? null,
            conceptId: input.conceptId ?? null,
            guideSessionId: input.guideSessionId ?? null,
            blockKey: input.blockKey ?? null,
          },
        ],
        skipDuplicates: true,
      });

      const stored = await client.learningEvent.findUnique({
        where: {
          userId_idempotencyKey: { userId: input.userId, idempotencyKey },
        },
      });
      if (!stored) {
        // We neither created nor found the row (deleted between the two
        // statements, or the skip came from a different constraint) —
        // nothing safe to replay.
        throw new LearningEventStorageError();
      }

      if (count === 1) {
        return { created: true, replayed: false, record: toRecord(stored) };
      }
      if (!isSemanticallyEquivalent(stored, input)) {
        throw new LearningEventIdempotencyConflictError();
      }
      return { created: false, replayed: true, record: toRecord(stored) };
    } catch (err) {
      sanitize(err);
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
