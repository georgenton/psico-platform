-- Sprint S51 — CohortRetentionWeek for the Pulso v2 retention heatmap.
--
-- Triangle table: one row per (signup-week, week-offset). Populated by the
-- weekly `CohortRetentionProcessor` (Monday 03:00 UTC). Idempotent via the
-- composite PK on (cohortWeek, weekOffset).
--
-- Privacy invariant preserved: integer counts only, no per-user identifiers.

CREATE TABLE "CohortRetentionWeek" (
    "cohortWeek"  TIMESTAMP(3) NOT NULL,
    "weekOffset"  INTEGER      NOT NULL,
    "cohortSize"  INTEGER      NOT NULL DEFAULT 0,
    "activeUsers" INTEGER      NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortRetentionWeek_pkey" PRIMARY KEY ("cohortWeek", "weekOffset")
);

CREATE INDEX "CohortRetentionWeek_cohortWeek_idx"
  ON "CohortRetentionWeek" ("cohortWeek" DESC);
