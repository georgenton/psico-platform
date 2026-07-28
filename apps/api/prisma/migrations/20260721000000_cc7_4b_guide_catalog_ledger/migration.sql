-- CC-7.4B · Guide V1: GuideSession + GuideSessionStep (explicit step ledger)
-- + GuideCommandReceipt (transversal idempotency) — ADR 0019, approved PR #589.
-- STRICTLY ADDITIVE: creates 5 enums + 3 tables; touches no existing table,
-- performs zero backfill. State/shape invariants are enforced HERE (CHECK
-- constraints + a partial unique index) because Prisma cannot express them.

-- CreateEnum
CREATE TYPE "GuideSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GuideStepKind" AS ENUM ('CONCEPT_EXPLORATION', 'ACTIVE_RECALL', 'CATALOG_PRACTICE', 'EXPLICIT_CONFIRMATION');

-- CreateEnum
CREATE TYPE "GuideStepCompletionPolicy" AS ENUM ('EXPLICIT_CONFIRMATION', 'OBJECTIVE_RECALL', 'CATALOG_PRACTICE_CONFIRMATION');

-- CreateEnum
CREATE TYPE "GuideStepRecallResult" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateEnum
CREATE TYPE "GuideCommandType" AS ENUM ('START', 'STEP_COMPLETE', 'STEP_RECALL', 'CANCEL', 'SESSION_COMPLETE');

-- CreateTable
CREATE TABLE "GuideSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guideKey" TEXT NOT NULL,
    "guideVersion" INTEGER NOT NULL,
    "status" "GuideSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "editionId" TEXT,
    "unitId" TEXT,
    "stepsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL,
    "currentStepKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "GuideSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideSessionStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "GuideStepKind" NOT NULL,
    "completionPolicy" "GuideStepCompletionPolicy" NOT NULL,
    "conceptKey" TEXT,
    "itemKey" TEXT,
    "exerciseKey" TEXT,
    "confirmationKey" TEXT,
    "selectedOptionKey" TEXT,
    "recallResult" "GuideStepRecallResult",
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideSessionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideCommandReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandType" "GuideCommandType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepKey" TEXT,
    "guideKey" TEXT,
    "guideVersion" INTEGER,
    "editionId" TEXT,
    "unitId" TEXT,
    "conceptKey" TEXT,
    "itemKey" TEXT,
    "exerciseKey" TEXT,
    "confirmationKey" TEXT,
    "selectedOptionKey" TEXT,
    "semanticFingerprintVersion" INTEGER NOT NULL DEFAULT 1,
    "semanticFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideCommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideSession_userId_status_idx" ON "GuideSession"("userId", "status");

-- CreateIndex
CREATE INDEX "GuideSession_userId_startedAt_idx" ON "GuideSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "GuideSession_guideKey_guideVersion_idx" ON "GuideSession"("guideKey", "guideVersion");

-- CreateIndex
CREATE UNIQUE INDEX "GuideSessionStep_sessionId_stepKey_key" ON "GuideSessionStep"("sessionId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "GuideSessionStep_sessionId_order_key" ON "GuideSessionStep"("sessionId", "order");

-- CreateIndex
CREATE INDEX "GuideSessionStep_sessionId_acceptedAt_idx" ON "GuideSessionStep"("sessionId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuideCommandReceipt_userId_idempotencyKey_key" ON "GuideCommandReceipt"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GuideCommandReceipt_sessionId_commandType_idx" ON "GuideCommandReceipt"("sessionId", "commandType");

-- CreateIndex
CREATE INDEX "GuideCommandReceipt_userId_createdAt_idx" ON "GuideCommandReceipt"("userId", "createdAt");

-- One ACTIVE session per user (ADR 0019 §7). Partial unique — deliberately
-- NOT represented in schema.prisma (Prisma cannot); pinned by pg-specs.
CREATE UNIQUE INDEX "GuideSession_one_active_per_user" ON "GuideSession"("userId") WHERE "status" = 'ACTIVE';

-- CreateIndex — ownership target of the receipt composite FK below.
CREATE UNIQUE INDEX "GuideSession_id_userId_key" ON "GuideSession"("id", "userId");

-- AddForeignKey
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideSessionStep" ADD CONSTRAINT "GuideSessionStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuideSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — COMPOSITE ownership FK: the database itself forbids a
-- receipt whose userId differs from its session's userId (a receipt can
-- never reference another user's session, nor be relinked through another
-- actor).
ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_sessionId_userId_fkey" FOREIGN KEY ("sessionId", "userId") REFERENCES "GuideSession"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── GuideSession invariants (ADR 0019 §6) ──────────────────────────────────

-- Editorial anchor is all-or-nothing.
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_context_all_or_nothing"
  CHECK (("editionId" IS NULL) = ("unitId" IS NULL));

-- Version and counters are sane in every state.
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_version_positive"
  CHECK ("guideVersion" > 0);
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_total_steps_positive"
  CHECK ("totalSteps" > 0);
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_counter_range"
  CHECK ("stepsCompleted" >= 0 AND "stepsCompleted" <= "totalSteps");

-- Exact per-state machine:
--   ACTIVE    → no completion/cancellation clocks; cursor present exactly
--               while steps remain (all accepted ⇒ cursor NULL, awaiting the
--               explicit SESSION_COMPLETE command);
--   COMPLETED → completedAt set, cancelledAt NULL, full counter, cursor NULL;
--   CANCELLED → cancelledAt set, completedAt NULL, cursor NULL.
ALTER TABLE "GuideSession" ADD CONSTRAINT "GuideSession_state_machine"
  CHECK (
    ("status" = 'ACTIVE'
      AND "completedAt" IS NULL
      AND "cancelledAt" IS NULL
      AND (
        ("stepsCompleted" < "totalSteps" AND "currentStepKey" IS NOT NULL)
        OR ("stepsCompleted" = "totalSteps" AND "currentStepKey" IS NULL)
      ))
    OR ("status" = 'COMPLETED'
      AND "completedAt" IS NOT NULL
      AND "cancelledAt" IS NULL
      AND "stepsCompleted" = "totalSteps"
      AND "currentStepKey" IS NULL)
    OR ("status" = 'CANCELLED'
      AND "completedAt" IS NULL
      AND "cancelledAt" IS NOT NULL
      AND "currentStepKey" IS NULL)
  );

-- ─── GuideSessionStep invariants (ADR 0019 §2 — union mirrored in SQL) ──────

ALTER TABLE "GuideSessionStep" ADD CONSTRAINT "GuideSessionStep_order_positive"
  CHECK ("order" > 0);

-- Exact kind → policy → target coupling; recall fields only on ACTIVE_RECALL.
ALTER TABLE "GuideSessionStep" ADD CONSTRAINT "GuideSessionStep_variant_shape"
  CHECK (
    ("kind" = 'CONCEPT_EXPLORATION'
      AND "completionPolicy" = 'EXPLICIT_CONFIRMATION'
      AND "conceptKey" IS NOT NULL
      AND "itemKey" IS NULL AND "exerciseKey" IS NULL AND "confirmationKey" IS NULL
      AND "selectedOptionKey" IS NULL AND "recallResult" IS NULL)
    OR ("kind" = 'ACTIVE_RECALL'
      AND "completionPolicy" = 'OBJECTIVE_RECALL'
      AND "itemKey" IS NOT NULL
      AND "selectedOptionKey" IS NOT NULL AND "recallResult" IS NOT NULL
      AND "conceptKey" IS NULL AND "exerciseKey" IS NULL AND "confirmationKey" IS NULL)
    OR ("kind" = 'CATALOG_PRACTICE'
      AND "completionPolicy" = 'CATALOG_PRACTICE_CONFIRMATION'
      AND "exerciseKey" IS NOT NULL
      AND "conceptKey" IS NULL AND "itemKey" IS NULL AND "confirmationKey" IS NULL
      AND "selectedOptionKey" IS NULL AND "recallResult" IS NULL)
    OR ("kind" = 'EXPLICIT_CONFIRMATION'
      AND "completionPolicy" = 'EXPLICIT_CONFIRMATION'
      AND "confirmationKey" IS NOT NULL
      AND "conceptKey" IS NULL AND "itemKey" IS NULL AND "exerciseKey" IS NULL
      AND "selectedOptionKey" IS NULL AND "recallResult" IS NULL)
  );

-- ─── GuideCommandReceipt invariants (ADR 0019 §7) ───────────────────────────

-- Stored keys are CANONICAL: lowercase RFC UUID (v1–v8, canonical variant).
ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_key_canonical"
  CHECK ("idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_fingerprint_version"
  CHECK ("semanticFingerprintVersion" >= 1);

ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_version_positive"
  CHECK ("guideVersion" IS NULL OR "guideVersion" > 0);

-- Exact shape per command type. sessionId is NOT NULL for every type (on
-- START it links the CREATED session — result linkage, not input semantics).
ALTER TABLE "GuideCommandReceipt" ADD CONSTRAINT "GuideCommandReceipt_command_shape"
  CHECK (
    ("commandType" = 'START'
      AND "guideKey" IS NOT NULL AND "guideVersion" IS NOT NULL
      AND (("editionId" IS NULL) = ("unitId" IS NULL))
      AND "stepKey" IS NULL
      AND "conceptKey" IS NULL AND "itemKey" IS NULL AND "exerciseKey" IS NULL
      AND "confirmationKey" IS NULL AND "selectedOptionKey" IS NULL)
    OR ("commandType" = 'STEP_COMPLETE'
      AND "stepKey" IS NOT NULL
      AND num_nonnulls("conceptKey", "exerciseKey", "confirmationKey") = 1
      AND "itemKey" IS NULL AND "selectedOptionKey" IS NULL
      AND "guideKey" IS NULL AND "guideVersion" IS NULL
      AND "editionId" IS NULL AND "unitId" IS NULL)
    OR ("commandType" = 'STEP_RECALL'
      AND "stepKey" IS NOT NULL AND "itemKey" IS NOT NULL AND "selectedOptionKey" IS NOT NULL
      AND "conceptKey" IS NULL AND "exerciseKey" IS NULL AND "confirmationKey" IS NULL
      AND "guideKey" IS NULL AND "guideVersion" IS NULL
      AND "editionId" IS NULL AND "unitId" IS NULL)
    OR ("commandType" IN ('CANCEL', 'SESSION_COMPLETE')
      AND "stepKey" IS NULL
      AND "conceptKey" IS NULL AND "itemKey" IS NULL AND "exerciseKey" IS NULL
      AND "confirmationKey" IS NULL AND "selectedOptionKey" IS NULL
      AND "guideKey" IS NULL AND "guideVersion" IS NULL
      AND "editionId" IS NULL AND "unitId" IS NULL)
  );
