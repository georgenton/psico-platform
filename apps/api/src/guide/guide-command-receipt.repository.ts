import type { GuideCommandReceipt, PrismaClient } from "@prisma/client";
import { canonicalizeIdempotencyKey } from "../shared/idempotency-key";
import {
  computeSemanticFingerprint,
  SEMANTIC_FINGERPRINT_VERSION,
  type ValidatedGuideCommand,
} from "./guide-command-semantics";

/**
 * CC-7.4B — the SINGLE authorized writer of `GuideCommandReceipt` (ADR 0019
 * §7). The `no-direct-guide-receipt-write` ratchet pins that the only write
 * primitive in `apps/api/src` runtime code is the one `createMany` in this
 * file, and zero raw SQL INSERT/UPDATE/DELETE anywhere.
 *
 * The receipt is the ONE transversal replay/conflict authority for the five
 * Guide commands (START / STEP_COMPLETE / STEP_RECALL / CANCEL /
 * SESSION_COMPLETE). It is NOT a source of `stepsCompleted` — the ledger
 * (`GuideSessionStep`) is (ADR 0019 §3). CC-7.4C's lifecycle will call it
 * inside its transactions: receipt + step + session state + events commit or
 * roll back TOGETHER. Nothing imports it at runtime yet.
 *
 * Nest-free, transaction-safe (CC-7.2 pattern): non-aborting
 * `createMany({ skipDuplicates: true })` → `findUnique` → exact semantic
 * comparison. Errors are EXACTLY three value-free types; raw Prisma/pg
 * errors never escape and are never attached as `cause`.
 */

export type GuideCommandReceiptDb = Pick<PrismaClient, "guideCommandReceipt">;

export class GuideCommandIdempotencyConflictError extends Error {
  readonly code = "GUIDE_COMMAND_IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("GUIDE_COMMAND_IDEMPOTENCY_CONFLICT");
    this.name = "GuideCommandIdempotencyConflictError";
  }
}

export class GuideCommandInvalidInputError extends Error {
  readonly code = "GUIDE_COMMAND_INVALID_INPUT" as const;
  constructor() {
    super("GUIDE_COMMAND_INVALID_INPUT");
    this.name = "GuideCommandInvalidInputError";
  }
}

export class GuideCommandStorageError extends Error {
  readonly code = "GUIDE_COMMAND_STORAGE_FAILURE" as const;
  constructor() {
    super("GUIDE_COMMAND_STORAGE_FAILURE");
    this.name = "GuideCommandStorageError";
  }
}

/** Re-throw our own typed errors; replace everything else, value-free. */
function sanitize(err: unknown): never {
  if (
    err instanceof GuideCommandIdempotencyConflictError ||
    err instanceof GuideCommandInvalidInputError ||
    err instanceof GuideCommandStorageError
  ) {
    throw err;
  }
  throw new GuideCommandStorageError();
}

export type GuideCommandInspection =
  | { state: "absent" }
  | { state: "replay"; receipt: GuideCommandReceipt };

export interface AppendGuideCommandReceiptResult {
  created: boolean;
  replayed: boolean;
  receipt: GuideCommandReceipt;
}

/** The exact column projection a validated command persists — field by
 * field, per command type. Unset columns are explicit NULLs (never the
 * caller's extra properties). */
function toColumns(command: ValidatedGuideCommand) {
  const base = {
    stepKey: null as string | null,
    guideKey: null as string | null,
    guideVersion: null as number | null,
    editionId: null as string | null,
    unitId: null as string | null,
    conceptKey: null as string | null,
    itemKey: null as string | null,
    exerciseKey: null as string | null,
    confirmationKey: null as string | null,
    selectedOptionKey: null as string | null,
  };
  switch (command.commandType) {
    case "START":
      return {
        ...base,
        guideKey: command.guideKey,
        guideVersion: command.guideVersion,
        editionId: command.editionId,
        unitId: command.unitId,
      };
    case "STEP_COMPLETE": {
      const target = command.target;
      return {
        ...base,
        stepKey: command.stepKey,
        conceptKey: "conceptKey" in target ? target.conceptKey : null,
        exerciseKey: "exerciseKey" in target ? target.exerciseKey : null,
        confirmationKey:
          "confirmationKey" in target ? target.confirmationKey : null,
      };
    }
    case "STEP_RECALL":
      return {
        ...base,
        stepKey: command.stepKey,
        itemKey: command.itemKey,
        selectedOptionKey: command.selectedOptionKey,
      };
    case "CANCEL":
    case "SESSION_COMPLETE":
      return base;
  }
}

/**
 * Exact structural comparison: the fingerprint (with its version) PLUS every
 * semantic column, per command type. On START the stored `sessionId` is the
 * session the ORIGINAL command created — result linkage, never compared as
 * input semantics (the retry does not know it). On every other type the
 * sessionId IS semantic and must match.
 */
function isSameSemantics(
  stored: GuideCommandReceipt,
  command: ValidatedGuideCommand,
): boolean {
  if (stored.commandType !== command.commandType) return false;
  if (stored.semanticFingerprintVersion !== SEMANTIC_FINGERPRINT_VERSION) {
    return false;
  }
  if (stored.semanticFingerprint !== computeSemanticFingerprint(command)) {
    return false;
  }
  const cols = toColumns(command);
  if (
    command.commandType !== "START" &&
    stored.sessionId !== command.sessionId
  ) {
    return false;
  }
  return (
    stored.stepKey === cols.stepKey &&
    stored.guideKey === cols.guideKey &&
    stored.guideVersion === cols.guideVersion &&
    stored.editionId === cols.editionId &&
    stored.unitId === cols.unitId &&
    stored.conceptKey === cols.conceptKey &&
    stored.itemKey === cols.itemKey &&
    stored.exerciseKey === cols.exerciseKey &&
    stored.confirmationKey === cols.confirmationKey &&
    stored.selectedOptionKey === cols.selectedOptionKey
  );
}

const COMMAND_TYPES = new Set([
  "START",
  "STEP_COMPLETE",
  "STEP_RECALL",
  "CANCEL",
  "SESSION_COMPLETE",
]);

export class GuideCommandReceiptRepository {
  constructor(private readonly prisma: GuideCommandReceiptDb) {}

  private canonicalKey(raw: unknown) {
    return canonicalizeIdempotencyKey(
      raw,
      () => new GuideCommandInvalidInputError(),
    );
  }

  private assertValid(command: ValidatedGuideCommand): void {
    if (!COMMAND_TYPES.has(command.commandType)) {
      throw new GuideCommandInvalidInputError();
    }
    if (typeof command.userId !== "string" || command.userId.length === 0) {
      throw new GuideCommandInvalidInputError();
    }
    if (
      typeof command.sessionId !== "string" ||
      command.sessionId.length === 0
    ) {
      throw new GuideCommandInvalidInputError();
    }
  }

  /**
   * READ-ONLY replay/conflict verdict, so a lifecycle command can decide
   * BEFORE running an irreversible transition (e.g. the autocancel of a
   * start — a replay must never autocancel, ADR 0019 §6). Accepts a
   * `$transaction` client so the inspection shares the caller's snapshot and
   * advisory lock.
   */
  async inspectValidated(
    command: ValidatedGuideCommand,
    db?: GuideCommandReceiptDb,
  ): Promise<GuideCommandInspection> {
    const client = db ?? this.prisma;
    this.assertValid(command);
    const idempotencyKey = this.canonicalKey(command.idempotencyKey);
    try {
      const existing = await client.guideCommandReceipt.findUnique({
        where: {
          userId_idempotencyKey: { userId: command.userId, idempotencyKey },
        },
      });
      if (!existing) return { state: "absent" };
      if (!isSameSemantics(existing, command)) {
        throw new GuideCommandIdempotencyConflictError();
      }
      return { state: "replay", receipt: existing };
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * Persist one validated command receipt — transaction-safe and race-safe
   * (CC-7.2 pattern, never `find → create`):
   *
   *   1. fail-closed validation + key canonicalization (no DB touch on bad
   *      input);
   *   2. NON-ABORTING `createMany({ skipDuplicates: true })` — a concurrent
   *      duplicate inside the caller's `$transaction` never raises P2002 and
   *      never poisons the transaction;
   *   3. `count` tells whether THIS call inserted;
   *   4. read by `(userId, canonicalKey)` and compare EXACTLY (fingerprint +
   *      every semantic column): match ⇒ replay; drift ⇒ conflict thrown by
   *      OUR code (clean, deliberate rollback for the caller).
   */
  async appendValidated(
    command: ValidatedGuideCommand,
    db?: GuideCommandReceiptDb,
  ): Promise<AppendGuideCommandReceiptResult> {
    const client = db ?? this.prisma;
    this.assertValid(command);
    const idempotencyKey = this.canonicalKey(command.idempotencyKey);
    const cols = toColumns(command);

    try {
      // Single write primitive of the whole API for this table (see
      // ratchet). `id`/`createdAt` keep their server-side defaults.
      const { count } = await client.guideCommandReceipt.createMany({
        data: [
          {
            userId: command.userId,
            idempotencyKey,
            commandType: command.commandType,
            sessionId: command.sessionId,
            ...cols,
            semanticFingerprintVersion: SEMANTIC_FINGERPRINT_VERSION,
            semanticFingerprint: computeSemanticFingerprint(command),
          },
        ],
        skipDuplicates: true,
      });

      const stored = await client.guideCommandReceipt.findUnique({
        where: {
          userId_idempotencyKey: { userId: command.userId, idempotencyKey },
        },
      });
      if (!stored) throw new GuideCommandStorageError();

      if (count === 1) {
        return { created: true, replayed: false, receipt: stored };
      }
      if (!isSameSemantics(stored, command)) {
        throw new GuideCommandIdempotencyConflictError();
      }
      return { created: false, replayed: true, receipt: stored };
    } catch (err) {
      sanitize(err);
    }
  }
}
