-- ═══════════════════════════════════════════════════════════════════════════
-- Círculos · the three tables the panel needs, and not one more
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Additive. Nothing existing is altered, dropped or renamed.
--
-- ── Why so little ──────────────────────────────────────────────────────────
--
-- Almost every number the panel shows already exists in the domain, written by
-- transactions that committed: `CircleInvitation.createdAt/acceptedAt`,
-- `CircleActivity.createdAt/revealedAt/closedAt/cancelledAt`,
-- `CircleActivityParticipant.readyAt/withdrawnAt`,
-- `CircleArtifact.createdAt/agreedAt`. Copying those into an analytics table
-- would create a second source of truth that can disagree with the first, and
-- the first is the one the product acts on.
--
-- So this adds storage for exactly the two things the domain does not know —
-- what somebody says about the activity afterwards, and whether they opened a
-- prepared help — plus the weekly aggregate those two collapse into.
--
-- ── Three planes, and they do not mix ──────────────────────────────────────
--
-- The domain keeps its own permissions. Technical logs are sanitised
-- elsewhere. These tables are the third plane: aggregated analytics, read by
-- an administrator, containing no content and no free text. There is no column
-- here an answer could be written into, which is a stronger guarantee than a
-- promise not to write one.
--
-- ── The identifier, named honestly ─────────────────────────────────────────
--
-- `participantId` is the seat: one person in ONE activity. It is what makes
-- deduplication possible — "this help was opened by the same person twice" —
-- and it is pseudonymous, not anonymous. It does not follow anybody between
-- activities and it is not a browsing identifier. Saying "anonymous" here
-- would be untrue while a seat still points at a membership.
--
-- ── Retention lives above this file ────────────────────────────────────────
--
-- 30 days for the linkable contributions, 12 months for the weekly facts,
-- enforced by a job. No trigger, no partition: a sweep that can be read and
-- run by hand is easier to trust than one that happens invisibly.

CREATE TYPE "CircleFeedbackUsefulness" AS ENUM ('YES', 'SOME', 'NO');

-- ── 1 · what somebody says afterwards, if they want to ─────────────────────
--
-- One row per seat. A second submission updates the first rather than adding a
-- vote, so a person cannot weigh more by answering twice.
CREATE TABLE "CircleFeedback" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "topics" TEXT[],
  "usefulness" "CircleFeedbackUsefulness",
  "noticeVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircleFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CircleFeedback_participantId_key"
  ON "CircleFeedback"("participantId");
CREATE INDEX "CircleFeedback_createdAt_idx" ON "CircleFeedback"("createdAt");
CREATE INDEX "CircleFeedback_templateKey_templateVersion_idx"
  ON "CircleFeedback"("templateKey", "templateVersion");

-- At most two substantive topics. The cap is here as well as in the DTO
-- because a list that can grow is a list somebody can put a sentence in.
ALTER TABLE "CircleFeedback"
  ADD CONSTRAINT "CircleFeedback_topics_at_most_two"
  CHECK (array_length("topics", 1) IS NULL OR array_length("topics", 1) <= 2);

-- Closed keys, and short ones. Not a free-text column wearing an array.
--
-- Written against the joined text rather than `unnest`, because a CHECK may not
-- contain a subquery. The comma is safe as a separator precisely because the
-- pattern forbids one inside a key: a value with a comma in it cannot satisfy
-- the expression no matter where it sits.
ALTER TABLE "CircleFeedback"
  ADD CONSTRAINT "CircleFeedback_topics_are_keys"
  CHECK (
    "topics" IS NULL
    OR array_to_string("topics", ',')
       ~ '^([a-z0-9][a-z0-9-]{0,39})?(,[a-z0-9][a-z0-9-]{0,39})*$'
  );

-- ── 2 · whether a prepared help was opened ─────────────────────────────────
CREATE TABLE "CircleHelpOpen" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "piece" TEXT NOT NULL,
  "opens" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircleHelpOpen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CircleHelpOpen_participantId_fieldKey_piece_key"
  ON "CircleHelpOpen"("participantId", "fieldKey", "piece");
CREATE INDEX "CircleHelpOpen_createdAt_idx" ON "CircleHelpOpen"("createdAt");

-- Two pieces exist. A third value would be a third kind of help nobody wrote.
ALTER TABLE "CircleHelpOpen"
  ADD CONSTRAINT "CircleHelpOpen_piece_is_known"
  CHECK ("piece" IN ('explanation', 'example'));

ALTER TABLE "CircleHelpOpen"
  ADD CONSTRAINT "CircleHelpOpen_opens_positive"
  CHECK ("opens" >= 1);

-- ── 3 · the aggregate that outlives them ───────────────────────────────────
--
-- Tall and narrow: one row per (week, template, metric, value). Adding a
-- metric is a row rather than a migration, and there is no seat in it to join
-- back to.
CREATE TABLE "CircleWeeklyFact" (
  "weekStart" TIMESTAMP(3) NOT NULL,
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "metric" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "contributors" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircleWeeklyFact_pkey"
    PRIMARY KEY ("weekStart", "templateKey", "templateVersion", "metric", "dimension")
);

CREATE INDEX "CircleWeeklyFact_weekStart_idx" ON "CircleWeeklyFact"("weekStart");

ALTER TABLE "CircleWeeklyFact"
  ADD CONSTRAINT "CircleWeeklyFact_metric_is_known"
  CHECK ("metric" IN ('topic', 'usefulness', 'help'));

ALTER TABLE "CircleWeeklyFact"
  ADD CONSTRAINT "CircleWeeklyFact_counts_are_not_negative"
  CHECK ("value" >= 0 AND "contributors" >= 0);
