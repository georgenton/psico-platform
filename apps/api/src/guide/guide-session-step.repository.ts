import type { GuideSessionStep, PrismaClient } from "@prisma/client";

/**
 * CC-7.4B — the SINGLE authorized writer of `GuideSessionStep`, the explicit
 * step ledger that is the ONLY probative source of `stepsCompleted`
 * (ADR 0019 §3, EXPLICIT_STEP_LEDGER). The `no-direct-guide-step-write`
 * ratchet pins that the only write primitive in `apps/api/src` runtime code
 * is the one `createMany` in this file, and zero raw SQL writes anywhere.
 *
 * Scope is deliberately MINIMAL (CC-7.4B): the insert primitive + reads.
 * It does NOT update GuideSession, does NOT emit LearningEvents, does NOT
 * implement lifecycle — those are CC-7.4C's transactions, which will call
 * `appendAccepted(input, tx)` so ledger row, session state, receipt and
 * events commit or roll back together. Nothing imports it at runtime yet.
 *
 * Public idempotency of a step command belongs to `GuideCommandReceipt`;
 * the `(sessionId, stepKey)` unique here is STRUCTURAL defense — under a
 * race the database, not the code, guarantees a single row.
 */

export type GuideSessionStepDb = Pick<PrismaClient, "guideSessionStep">;

export class GuideStepConflictError extends Error {
  readonly code = "GUIDE_STEP_CONFLICT" as const;
  constructor() {
    super("GUIDE_STEP_CONFLICT");
    this.name = "GuideStepConflictError";
  }
}

export class GuideStepInvalidInputError extends Error {
  readonly code = "GUIDE_STEP_INVALID_INPUT" as const;
  constructor() {
    super("GUIDE_STEP_INVALID_INPUT");
    this.name = "GuideStepInvalidInputError";
  }
}

export class GuideStepStorageError extends Error {
  readonly code = "GUIDE_STEP_STORAGE_FAILURE" as const;
  constructor() {
    super("GUIDE_STEP_STORAGE_FAILURE");
    this.name = "GuideStepStorageError";
  }
}

function sanitize(err: unknown): never {
  if (
    err instanceof GuideStepConflictError ||
    err instanceof GuideStepInvalidInputError ||
    err instanceof GuideStepStorageError
  ) {
    throw err;
  }
  throw new GuideStepStorageError();
}

/**
 * The server-validated accepted-step union — one variant per V1 catalog
 * variant, mirroring @psico/types/guide.ts. No counter, no timestamp, no
 * JSON, no client userId: `acceptedAt` is the DB clock, the policy is
 * DERIVED from the kind, and every column is reconstructed field by field.
 */
export type ValidatedGuideStepInput =
  | {
      sessionId: string;
      stepKey: string;
      order: number;
      kind: "CONCEPT_EXPLORATION";
      conceptKey: string;
    }
  | {
      sessionId: string;
      stepKey: string;
      order: number;
      kind: "ACTIVE_RECALL";
      itemKey: string;
      selectedOptionKey: string;
      recallResult: "CORRECT" | "INCORRECT";
    }
  | {
      sessionId: string;
      stepKey: string;
      order: number;
      kind: "CATALOG_PRACTICE";
      exerciseKey: string;
    }
  | {
      sessionId: string;
      stepKey: string;
      order: number;
      kind: "EXPLICIT_CONFIRMATION";
      confirmationKey: string;
    };

/** kind → policy, fixed (the union in @psico/types makes others invalid). */
const POLICY_BY_KIND = {
  CONCEPT_EXPLORATION: "EXPLICIT_CONFIRMATION",
  ACTIVE_RECALL: "OBJECTIVE_RECALL",
  CATALOG_PRACTICE: "CATALOG_PRACTICE_CONFIRMATION",
  EXPLICIT_CONFIRMATION: "EXPLICIT_CONFIRMATION",
} as const;

/** Field-by-field reconstruction — nothing off the whitelist reaches
 * storage; unset targets are explicit NULLs. */
function toColumns(input: ValidatedGuideStepInput) {
  const base = {
    sessionId: input.sessionId,
    stepKey: input.stepKey,
    order: input.order,
    kind: input.kind,
    completionPolicy: POLICY_BY_KIND[input.kind],
    conceptKey: null as string | null,
    itemKey: null as string | null,
    exerciseKey: null as string | null,
    confirmationKey: null as string | null,
    selectedOptionKey: null as string | null,
    recallResult: null as "CORRECT" | "INCORRECT" | null,
  };
  switch (input.kind) {
    case "CONCEPT_EXPLORATION":
      return { ...base, conceptKey: input.conceptKey };
    case "ACTIVE_RECALL":
      return {
        ...base,
        itemKey: input.itemKey,
        selectedOptionKey: input.selectedOptionKey,
        recallResult: input.recallResult,
      };
    case "CATALOG_PRACTICE":
      return { ...base, exerciseKey: input.exerciseKey };
    case "EXPLICIT_CONFIRMATION":
      return { ...base, confirmationKey: input.confirmationKey };
  }
}

function isSameStepSemantics(
  stored: GuideSessionStep,
  input: ValidatedGuideStepInput,
): boolean {
  const cols = toColumns(input);
  return (
    stored.sessionId === cols.sessionId &&
    stored.stepKey === cols.stepKey &&
    stored.order === cols.order &&
    stored.kind === cols.kind &&
    stored.completionPolicy === cols.completionPolicy &&
    stored.conceptKey === cols.conceptKey &&
    stored.itemKey === cols.itemKey &&
    stored.exerciseKey === cols.exerciseKey &&
    stored.confirmationKey === cols.confirmationKey &&
    stored.selectedOptionKey === cols.selectedOptionKey &&
    stored.recallResult === cols.recallResult
  );
}

function assertValidInput(input: ValidatedGuideStepInput): void {
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    throw new GuideStepInvalidInputError();
  }
  if (typeof input.stepKey !== "string" || input.stepKey.length === 0) {
    throw new GuideStepInvalidInputError();
  }
  if (!Number.isInteger(input.order) || input.order < 1) {
    throw new GuideStepInvalidInputError();
  }
  if (POLICY_BY_KIND[input.kind] === undefined) {
    throw new GuideStepInvalidInputError();
  }
}

export class GuideSessionStepRepository {
  constructor(private readonly prisma: GuideSessionStepDb) {}

  /** The accepted row for `(sessionId, stepKey)`, or null. Read-only. */
  async findAccepted(
    sessionId: string,
    stepKey: string,
    db?: GuideSessionStepDb,
  ): Promise<GuideSessionStep | null> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSessionStep.findUnique({
        where: { sessionId_stepKey: { sessionId, stepKey } },
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /** Every accepted row of a session, in catalog order. Read-only. */
  async listAccepted(
    sessionId: string,
    db?: GuideSessionStepDb,
  ): Promise<GuideSessionStep[]> {
    const client = db ?? this.prisma;
    try {
      return await client.guideSessionStep.findMany({
        where: { sessionId },
        orderBy: { order: "asc" },
      });
    } catch (err) {
      sanitize(err);
    }
  }

  /**
   * Insert ONE accepted step — the only ledger write primitive:
   *
   *   1. fail-closed input validation (no DB touch on bad shape);
   *   2. NON-ABORTING `createMany({ skipDuplicates: true })` — a duplicate
   *      `(sessionId, stepKey)` never raises inside the caller's tx;
   *   3. read back and compare EXACTLY: same semantics ⇒ return the existing
   *      row (never a second one); any drift ⇒ internal conflict.
   */
  async appendAccepted(
    input: ValidatedGuideStepInput,
    db?: GuideSessionStepDb,
  ): Promise<GuideSessionStep> {
    const client = db ?? this.prisma;
    assertValidInput(input);
    const cols = toColumns(input);
    try {
      await client.guideSessionStep.createMany({
        data: [cols],
        skipDuplicates: true,
      });
      const stored = await client.guideSessionStep.findUnique({
        where: {
          sessionId_stepKey: {
            sessionId: input.sessionId,
            stepKey: input.stepKey,
          },
        },
      });
      if (!stored) {
        // The skip did not come from OUR (sessionId, stepKey) unique. If a
        // DIFFERENT step already holds this order, that is a semantic
        // conflict (two steps claiming one position), not a storage failure.
        const orderHolder = await client.guideSessionStep.findUnique({
          where: {
            sessionId_order: { sessionId: input.sessionId, order: input.order },
          },
        });
        if (orderHolder) throw new GuideStepConflictError();
        throw new GuideStepStorageError();
      }
      if (!isSameStepSemantics(stored, input)) {
        throw new GuideStepConflictError();
      }
      return stored;
    } catch (err) {
      sanitize(err);
    }
  }
}
