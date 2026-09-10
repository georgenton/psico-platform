-- FeelVerse Círculos — the invariants participation needs (PR3 · ADR 0023).
--
-- STRICTLY ADDITIVE, and deliberately small. PR2's migration is not edited:
-- it has been applied to production, and a migration that has run is a fact,
-- not a draft. What is added here is only what real participation requires and
-- TypeScript cannot hold.
--
-- ── Confirmation is bound to an exact artifact and version ─────────────────
--
-- "Both of us agreed" has to mean both of us agreed to the SAME text. The
-- shape that makes that true is one nullable column on the event ledger plus a
-- composite key, not a ninth table whose only job would be to hold two ids:
--
--   · `CircleEvent.artifactId`, with a composite FK to `(id, activityId)` — so
--     a confirmation cannot name an artifact from another activity;
--   · a CHECK that the two artifact event types carry activity, artifact AND
--     acting seat, and that every other event type carries no artifact at all;
--   · a partial unique index giving each seat one confirmation per artifact.
--
-- Editing the artifact creates a new row with a higher version, which means the
-- old confirmations point at the old artifact and simply stop counting. Nothing
-- has to remember to invalidate them; they were never about the new one.
--
-- ── A READY envelope is complete, and a withdrawn one is gone ──────────────
--
-- PR2 required `ciphertext`, `nonce`, `keyVersion` and `readyAt` together. That
-- left two ways to be half-confirmed: READY without a `sharingMode`, and READY
-- without a `payloadHash` — the field that detects a replayed or altered
-- confirmation. Both are closed here.
--
-- And `WITHDRAW` is not a way of sharing. It cannot be a persisted
-- `sharingMode`, and a withdrawn seat cannot hold an envelope at all: the
-- columns go back to empty, which is what "destroys the pending envelope"
-- means when written as a constraint instead of as a promise.

-- AlterTable
ALTER TABLE "CircleEvent" ADD COLUMN     "artifactId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CircleArtifact_id_activityId_key" ON "CircleArtifact"("id", "activityId");

-- CreateIndex
CREATE INDEX "CircleEvent_artifactId_idx" ON "CircleEvent"("artifactId");

-- AddForeignKey
ALTER TABLE "CircleEvent" ADD CONSTRAINT "CircleEvent_artifactId_activityId_fkey" FOREIGN KEY ("artifactId", "activityId") REFERENCES "CircleArtifact"("id", "activityId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- Invariants PostgreSQL enforces, because TypeScript cannot be trusted to
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The artifact binding ───────────────────────────────────────────────────
-- Exactly two event types are about an artifact, and both need all three ids:
-- the activity (so the composite key runs), the artifact (what was agreed) and
-- the acting seat (who agreed). Every other event type must carry no artifact,
-- so nothing can quietly attach one to an unrelated record.
ALTER TABLE "CircleEvent"
  ADD CONSTRAINT "CircleEvent_artifact_binding"
  CHECK (
    CASE
      WHEN "type" IN ('ARTIFACT_PROPOSED', 'ARTIFACT_CONFIRMED') THEN
        "artifactId" IS NOT NULL
        AND "activityId" IS NOT NULL
        AND "actorParticipantId" IS NOT NULL
      ELSE "artifactId" IS NULL
    END
  );

-- One confirmation per seat per artifact. A second attempt collides in
-- PostgreSQL rather than being deduplicated by something in front of it, and
-- confirming a NEW version is a different artifact row, so it is a different
-- index entry rather than an overwrite.
CREATE UNIQUE INDEX "CircleEvent_one_confirmation_per_artifact_actor"
  ON "CircleEvent" ("artifactId", "actorParticipantId")
  WHERE "type" = 'ARTIFACT_CONFIRMED';

-- ── A confirmed snapshot is complete ───────────────────────────────────────
-- PR2 bound four columns together. `sharingMode` says WHAT kind of answer this
-- is and `payloadHash` is what detects a replayed or altered one; a READY seat
-- missing either is a confirmation nobody can verify.
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_ready_is_complete"
  CHECK (
    "status" <> 'READY'
    OR num_nonnulls(
         "ciphertext", "nonce", "keyVersion",
         "readyAt", "sharingMode", "payloadHash"
       ) = 6
  );

-- ── Withdrawing is not a way of sharing ────────────────────────────────────
-- `WITHDRAW` is a `CircleSharingMode` in the contract because a template may
-- OFFER it as an exit. It is never an answer that gets stored: persisting it
-- would make "I left" indistinguishable, at the row level, from "I shared
-- nothing" — two different things a reader must not confuse.
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_withdraw_is_not_a_share"
  CHECK ("sharingMode" IS NULL OR "sharingMode" <> 'WITHDRAW');

-- A withdrawn seat holds nothing. This is "destroys the pending envelope"
-- written as a constraint rather than as a promise: the purge is not something
-- the service is trusted to remember, it is a state the row cannot leave
-- without.
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_withdrawn_has_no_envelope"
  CHECK (
    "status" <> 'WITHDRAWN'
    OR (
      num_nonnulls(
        "ciphertext", "nonce", "keyVersion",
        "readyAt", "sharingMode", "payloadHash"
      ) = 0
      AND cardinality("fieldKeys") = 0
    )
  );
