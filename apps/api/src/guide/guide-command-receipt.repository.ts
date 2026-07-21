import type { GuideCommandReceipt, PrismaClient } from "@prisma/client";
import { canonicalizeIdempotencyKey } from "../shared/idempotency-key";
import { isValidGuideCatalogKey } from "./guide-catalog";
import {
  computeSemanticFingerprint,
  SEMANTIC_FINGERPRINT_VERSION,
  type GuideCommandReceiptWrite,
  type ValidatedGuideCommandSemantics,
} from "./guide-command-semantics";

/**
 * CC-7.4B — the SINGLE authorized writer of `GuideCommandReceipt` (ADR 0019
 * §7). The `no-direct-guide-receipt-write` ratchet pins that the only write
 * primitive in `apps/api/src` runtime code is the one `createMany` in this
 * file, and zero raw SQL INSERT/UPDATE/DELETE anywhere.
 *
 * The receipt is the ONE transversal replay/conflict authority for the five
 * Guide commands. It is NOT a source of `stepsCompleted` — the ledger
 * (`GuideSessionStep`) is (ADR 0019 §3). Semantics and result linkage are
 * SEPARATE (PR #590 closure): `inspectValidated` takes SEMANTICS only (a
 * START inspection needs no sessionId — none exists yet); `appendValidated`
 * takes a WRITE, which for START carries the `resultSessionId` the server
 * just created. A START replay returns the ORIGINAL receipt with the
 * ORIGINAL session — never a placeholder.
 *
 * EVERY command is fail-closed validated PRE-DB: kind/target coupling,
 * closed catalog-key grammar, canonical UUID key — invalid input never
 * round-trips. Errors are EXACTLY three value-free types; raw Prisma/pg
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

// ─── Fail-closed PRE-DB validation (closure §3) ─────────────────────────────

const invalid = (): never => {
  throw new GuideCommandInvalidInputError();
};

/** Non-empty plain id (cuid-shaped server ids — not catalog keys). */
function requireId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) {
    invalid();
  }
  return value as string;
}

/** Closed catalog-key grammar — shared with the catalog validator. */
function requireCatalogKey(value: unknown): string {
  if (!isValidGuideCatalogKey(value)) invalid();
  return value as string;
}

/** Reject any own key outside the exact allowlist (malicious casts carrying
 * an extra target are invalid PRE-DB, not silently dropped). */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== "string" || !allowed.includes(key)) invalid();
  }
}

const BASE_KEYS = ["commandType", "userId", "idempotencyKey"] as const;

/**
 * Runtime authority over the semantics union: exact shape per command type
 * (kind↔target coupling included), closed grammar for every catalog key.
 * Types make mismatches inexpressible; this guards malicious casts.
 */
function assertValidSemantics(semantics: ValidatedGuideCommandSemantics): void {
  const obj = semantics as unknown as Record<string, unknown>;
  requireId(semantics.userId);
  switch (semantics.commandType) {
    case "START": {
      assertExactKeys(obj, [
        ...BASE_KEYS,
        "guideKey",
        "guideVersion",
        "editionId",
        "unitId",
      ]);
      requireCatalogKey(semantics.guideKey);
      if (
        !Number.isInteger(semantics.guideVersion) ||
        semantics.guideVersion < 1
      ) {
        invalid();
      }
      // Editorial anchor is all-or-nothing; ids are server-resolved.
      if ((semantics.editionId === null) !== (semantics.unitId === null)) {
        invalid();
      }
      if (semantics.editionId !== null) requireId(semantics.editionId);
      if (semantics.unitId !== null) requireId(semantics.unitId);
      return;
    }
    case "STEP_COMPLETE": {
      requireId(semantics.sessionId);
      requireCatalogKey(semantics.stepKey);
      switch (semantics.kind) {
        case "CONCEPT_EXPLORATION":
          assertExactKeys(obj, [
            ...BASE_KEYS,
            "sessionId",
            "stepKey",
            "kind",
            "conceptKey",
          ]);
          requireCatalogKey(semantics.conceptKey);
          return;
        case "CATALOG_PRACTICE":
          assertExactKeys(obj, [
            ...BASE_KEYS,
            "sessionId",
            "stepKey",
            "kind",
            "exerciseKey",
          ]);
          requireCatalogKey(semantics.exerciseKey);
          return;
        case "EXPLICIT_CONFIRMATION":
          assertExactKeys(obj, [
            ...BASE_KEYS,
            "sessionId",
            "stepKey",
            "kind",
            "confirmationKey",
          ]);
          requireCatalogKey(semantics.confirmationKey);
          return;
        default:
          return invalid();
      }
    }
    case "STEP_RECALL":
      assertExactKeys(obj, [
        ...BASE_KEYS,
        "sessionId",
        "stepKey",
        "itemKey",
        "selectedOptionKey",
      ]);
      requireId(semantics.sessionId);
      requireCatalogKey(semantics.stepKey);
      requireCatalogKey(semantics.itemKey);
      requireCatalogKey(semantics.selectedOptionKey);
      return;
    case "CANCEL":
    case "SESSION_COMPLETE":
      assertExactKeys(obj, [...BASE_KEYS, "sessionId"]);
      requireId(semantics.sessionId);
      return;
    default:
      return invalid();
  }
}

// ─── Column projection + structural comparison ──────────────────────────────

/** The stored sessionId: START links the session the server CREATED; every
 * other command's sessionId IS its semantics. */
function sessionIdOf(write: GuideCommandReceiptWrite): string {
  return "resultSessionId" in write
    ? write.resultSessionId
    : write.semantics.sessionId;
}

/** Field-by-field projection — nothing off the per-type whitelist reaches
 * storage; unset columns are explicit NULLs. */
function toColumns(semantics: ValidatedGuideCommandSemantics) {
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
  switch (semantics.commandType) {
    case "START":
      return {
        ...base,
        guideKey: semantics.guideKey,
        guideVersion: semantics.guideVersion,
        editionId: semantics.editionId,
        unitId: semantics.unitId,
      };
    case "STEP_COMPLETE":
      switch (semantics.kind) {
        case "CONCEPT_EXPLORATION":
          return {
            ...base,
            stepKey: semantics.stepKey,
            conceptKey: semantics.conceptKey,
          };
        case "CATALOG_PRACTICE":
          return {
            ...base,
            stepKey: semantics.stepKey,
            exerciseKey: semantics.exerciseKey,
          };
        case "EXPLICIT_CONFIRMATION":
          return {
            ...base,
            stepKey: semantics.stepKey,
            confirmationKey: semantics.confirmationKey,
          };
      }
      break;
    case "STEP_RECALL":
      return {
        ...base,
        stepKey: semantics.stepKey,
        itemKey: semantics.itemKey,
        selectedOptionKey: semantics.selectedOptionKey,
      };
    case "CANCEL":
    case "SESSION_COMPLETE":
      return base;
  }
  // Unreachable for valid unions; fail closed for malicious casts.
  return invalid();
}

/**
 * Exact structural comparison: fingerprint (with its version) PLUS every
 * semantic column, per command type. On START the stored `sessionId` is the
 * session the ORIGINAL command created — result linkage, never compared as
 * input semantics. On every other type the sessionId IS semantic.
 */
function isSameSemantics(
  stored: GuideCommandReceipt,
  semantics: ValidatedGuideCommandSemantics,
): boolean {
  if (stored.commandType !== semantics.commandType) return false;
  if (stored.semanticFingerprintVersion !== SEMANTIC_FINGERPRINT_VERSION) {
    return false;
  }
  if (stored.semanticFingerprint !== computeSemanticFingerprint(semantics)) {
    return false;
  }
  if (
    semantics.commandType !== "START" &&
    stored.sessionId !== semantics.sessionId
  ) {
    return false;
  }
  const cols = toColumns(semantics);
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

export class GuideCommandReceiptRepository {
  constructor(private readonly prisma: GuideCommandReceiptDb) {}

  private canonicalKey(raw: unknown) {
    return canonicalizeIdempotencyKey(
      raw,
      () => new GuideCommandInvalidInputError(),
    );
  }

  /**
   * READ-ONLY replay/conflict verdict over SEMANTICS alone — a START
   * inspection needs no sessionId (the server has not created one yet), so a
   * lifecycle command can decide BEFORE any irreversible transition (e.g.
   * the autocancel of a start: a replay must never autocancel, ADR 0019 §6).
   * Accepts a `$transaction` client so the inspection shares the caller's
   * snapshot and advisory lock.
   */
  async inspectValidated(
    semantics: ValidatedGuideCommandSemantics,
    db?: GuideCommandReceiptDb,
  ): Promise<GuideCommandInspection> {
    const client = db ?? this.prisma;
    assertValidSemantics(semantics);
    const idempotencyKey = this.canonicalKey(semantics.idempotencyKey);
    try {
      const existing = await client.guideCommandReceipt.findUnique({
        where: {
          userId_idempotencyKey: { userId: semantics.userId, idempotencyKey },
        },
      });
      if (!existing) return { state: "absent" };
      if (!isSameSemantics(existing, semantics)) {
        throw new GuideCommandIdempotencyConflictError();
      }
      return { state: "replay", receipt: existing };
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * Persist one receipt WRITE — transaction-safe and race-safe (CC-7.2
   * pattern, never `find → create`):
   *
   *   1. fail-closed validation of the SEMANTICS + key canonicalization (no
   *      DB touch on bad input); for START, the write's `resultSessionId` is
   *      the REAL session the server just created (server-owned linkage);
   *   2. NON-ABORTING `createMany({ skipDuplicates: true })` — a concurrent
   *      duplicate inside the caller's `$transaction` never raises P2002 and
   *      never poisons the transaction;
   *   3. `count` tells whether THIS call inserted;
   *   4. read by `(userId, canonicalKey)` and compare EXACTLY: match ⇒
   *      replay of the ORIGINAL receipt (a START replay returns the ORIGINAL
   *      session's linkage); drift ⇒ conflict thrown by OUR code.
   */
  async appendValidated(
    write: GuideCommandReceiptWrite,
    db?: GuideCommandReceiptDb,
  ): Promise<AppendGuideCommandReceiptResult> {
    const client = db ?? this.prisma;
    const semantics = write.semantics;
    assertValidSemantics(semantics);
    const idempotencyKey = this.canonicalKey(semantics.idempotencyKey);
    const sessionId = requireId(sessionIdOf(write));
    const cols = toColumns(semantics);

    try {
      // Single write primitive of the whole API for this table (see
      // ratchet). `id`/`createdAt` keep their server-side defaults.
      const { count } = await client.guideCommandReceipt.createMany({
        data: [
          {
            userId: semantics.userId,
            idempotencyKey,
            commandType: semantics.commandType,
            sessionId,
            ...cols,
            semanticFingerprintVersion: SEMANTIC_FINGERPRINT_VERSION,
            semanticFingerprint: computeSemanticFingerprint(semantics),
          },
        ],
        skipDuplicates: true,
      });

      const stored = await client.guideCommandReceipt.findUnique({
        where: {
          userId_idempotencyKey: { userId: semantics.userId, idempotencyKey },
        },
      });
      if (!stored) throw new GuideCommandStorageError();

      if (count === 1) {
        return { created: true, replayed: false, receipt: stored };
      }
      if (!isSameSemantics(stored, semantics)) {
        throw new GuideCommandIdempotencyConflictError();
      }
      return { created: false, replayed: true, receipt: stored };
    } catch (err) {
      sanitize(err);
    }
  }
}
