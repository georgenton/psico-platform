-- FeelVerse Círculos — the relational domain (PR2 · ADR 0023).
--
-- STRICTLY ADDITIVE. Nothing existing is renamed, dropped or altered: every
-- statement below creates a new type, table, index or constraint. The eight
-- models are inert on arrival because `CIRCLES_ROLLOUT_MODE` defaults to `off`.
--
-- The second half of this file is the part that matters. Prisma can express
-- tables, simple foreign keys and total unique indexes; it cannot express a
-- CHECK, a partial unique index, a composite foreign key or a trigger. Every
-- invariant the architecture calls non-negotiable is written there, in SQL,
-- because an invariant that lives only in a TypeScript `if` is one refactor
-- away from not existing.
-- CreateEnum
CREATE TYPE "CircleKind" AS ENUM ('DUO');

-- CreateEnum
CREATE TYPE "CircleStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CircleMemberRole" AS ENUM ('ORGANIZER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CircleMemberStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "CircleActivityStatus" AS ENUM ('INVITING', 'PREPARING', 'REVEALED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CircleParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'READY', 'WITHDRAWN', 'DECLINED');

-- CreateEnum
CREATE TYPE "CircleSharingMode" AS ENUM ('SELECTED_FIELDS', 'EDITED_SUMMARY', 'KEEP_PRIVATE', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "CircleArtifactKind" AS ENUM ('AGREEMENT', 'REQUEST', 'RECOGNITION', 'ECO_SUMMARY');

-- CreateEnum
CREATE TYPE "CircleArtifactStatus" AS ENUM ('PROPOSED', 'AGREED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CircleFollowUpDecision" AS ENUM ('KEEP', 'ADJUST', 'CLOSE');

-- CreateEnum
CREATE TYPE "CircleEventType" AS ENUM ('CIRCLE_CREATED', 'ACTIVITY_CREATED', 'INVITATION_CREATED', 'INVITATION_EXCHANGED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'INVITATION_REVOKED', 'GUEST_SESSION_CREATED', 'GUEST_SESSION_REVOKED', 'PARTICIPANT_READY', 'ACTIVITY_REVEALED', 'PARTICIPANT_WITHDRAWN', 'ARTIFACT_PROPOSED', 'ARTIFACT_CONFIRMED', 'FOLLOW_UP_RECORDED', 'ACTIVITY_CLOSED', 'ACTIVITY_CANCELLED');

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "kind" "CircleKind" NOT NULL DEFAULT 'DUO',
    "status" "CircleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleMember" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CircleMemberRole" NOT NULL,
    "status" "CircleMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "CircleMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleInvitation" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleGuestSession" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleGuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleActivity" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" "CircleActivityStatus" NOT NULL DEFAULT 'INVITING',
    "requiredParticipants" INTEGER NOT NULL,
    "revealedAt" TIMESTAMP(3),
    "followUpDueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleActivityParticipant" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "memberId" TEXT,
    "invitationId" TEXT,
    "status" "CircleParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "ciphertext" TEXT,
    "nonce" TEXT,
    "keyVersion" INTEGER,
    "readyAt" TIMESTAMP(3),
    "sharingMode" "CircleSharingMode",
    "fieldKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payloadHash" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "followUpDecision" "CircleFollowUpDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircleActivityParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleArtifact" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "CircleArtifactKind" NOT NULL,
    "status" "CircleArtifactStatus" NOT NULL DEFAULT 'PROPOSED',
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdByParticipantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agreedAt" TIMESTAMP(3),

    CONSTRAINT "CircleArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleEvent" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "activityId" TEXT,
    "type" "CircleEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorParticipantId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Circle_createdByUserId_idx" ON "Circle"("createdByUserId");

-- CreateIndex
CREATE INDEX "Circle_status_idx" ON "Circle"("status");

-- CreateIndex
CREATE INDEX "CircleMember_circleId_userId_idx" ON "CircleMember"("circleId", "userId");

-- CreateIndex
CREATE INDEX "CircleMember_userId_status_idx" ON "CircleMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CircleInvitation_tokenHash_key" ON "CircleInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CircleInvitation_codeHash_key" ON "CircleInvitation"("codeHash");

-- CreateIndex
CREATE INDEX "CircleInvitation_activityId_idx" ON "CircleInvitation"("activityId");

-- CreateIndex
CREATE INDEX "CircleInvitation_circleId_idx" ON "CircleInvitation"("circleId");

-- CreateIndex
CREATE INDEX "CircleInvitation_expiresAt_idx" ON "CircleInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircleInvitation_id_activityId_key" ON "CircleInvitation"("id", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleGuestSession_tokenHash_key" ON "CircleGuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CircleGuestSession_invitationId_idx" ON "CircleGuestSession"("invitationId");

-- CreateIndex
CREATE INDEX "CircleGuestSession_activityId_idx" ON "CircleGuestSession"("activityId");

-- CreateIndex
CREATE INDEX "CircleGuestSession_expiresAt_idx" ON "CircleGuestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CircleActivity_circleId_status_idx" ON "CircleActivity"("circleId", "status");

-- CreateIndex
CREATE INDEX "CircleActivity_templateKey_templateVersion_idx" ON "CircleActivity"("templateKey", "templateVersion");

-- CreateIndex
CREATE INDEX "CircleActivity_followUpDueAt_idx" ON "CircleActivity"("followUpDueAt");

-- CreateIndex
CREATE INDEX "CircleActivityParticipant_activityId_status_idx" ON "CircleActivityParticipant"("activityId", "status");

-- CreateIndex
CREATE INDEX "CircleActivityParticipant_memberId_idx" ON "CircleActivityParticipant"("memberId");

-- CreateIndex
CREATE INDEX "CircleActivityParticipant_invitationId_idx" ON "CircleActivityParticipant"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleActivityParticipant_id_activityId_key" ON "CircleActivityParticipant"("id", "activityId");

-- CreateIndex
CREATE INDEX "CircleArtifact_activityId_status_idx" ON "CircleArtifact"("activityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CircleArtifact_activityId_version_key" ON "CircleArtifact"("activityId", "version");

-- CreateIndex
CREATE INDEX "CircleEvent_circleId_occurredAt_idx" ON "CircleEvent"("circleId", "occurredAt");

-- CreateIndex
CREATE INDEX "CircleEvent_activityId_occurredAt_idx" ON "CircleEvent"("activityId", "occurredAt");

-- CreateIndex
CREATE INDEX "CircleEvent_type_idx" ON "CircleEvent"("type");

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CircleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "CircleMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleGuestSession" ADD CONSTRAINT "CircleGuestSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CircleInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleGuestSession" ADD CONSTRAINT "CircleGuestSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CircleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleGuestSession" ADD CONSTRAINT "CircleGuestSession_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CircleActivityParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleActivity" ADD CONSTRAINT "CircleActivity_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleActivityParticipant" ADD CONSTRAINT "CircleActivityParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CircleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleActivityParticipant" ADD CONSTRAINT "CircleActivityParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CircleMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleActivityParticipant" ADD CONSTRAINT "CircleActivityParticipant_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CircleInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleArtifact" ADD CONSTRAINT "CircleArtifact_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CircleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleArtifact" ADD CONSTRAINT "CircleArtifact_createdByParticipantId_fkey" FOREIGN KEY ("createdByParticipantId") REFERENCES "CircleActivityParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleEvent" ADD CONSTRAINT "CircleEvent_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleEvent" ADD CONSTRAINT "CircleEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CircleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- Invariants PostgreSQL enforces, because TypeScript cannot be trusted to
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Circle · Dúo is the only shape v1 admits ───────────────────────────────
-- The enum already has one value; this survives the day a second is added for
-- a later audience, so enabling Familia has to be a deliberate edit here.
ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_kind_duo_only" CHECK ("kind" = 'DUO');

ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_duo_two_participants"
  CHECK ("kind" <> 'DUO' OR "maxParticipants" = 2);

ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_closed_has_timestamp"
  CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- ── CircleMember · one ACTIVE membership per person per circle ─────────────
-- Partial, so leaving and being invited back stays possible while a second
-- live membership never can.
CREATE UNIQUE INDEX "CircleMember_one_active_per_user"
  ON "CircleMember" ("circleId", "userId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "CircleMember"
  ADD CONSTRAINT "CircleMember_left_has_timestamp"
  CHECK (("status" = 'LEFT') = ("leftAt" IS NOT NULL));

-- ── CircleInvitation · hashes only, single use, bounded life ───────────────
-- `tokenHash` and `codeHash` are already UNIQUE from the model. What is added
-- here is the shape of a hash: 64 lowercase hex characters. A raw token would
-- not fit, so "we accidentally stored the secret" fails at the database.
ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_token_hash_is_sha256"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_code_hash_is_sha256"
  CHECK ("codeHash" IS NULL OR "codeHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- Accepting or declining an invitation implies it was consumed. The single-use
-- guarantee itself is the atomic `UPDATE ... WHERE consumedAt IS NULL`; this
-- refuses the half-state where a row is accepted but still looks unused.
ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_accepted_implies_consumed"
  CHECK ("acceptedAt" IS NULL OR "consumedAt" IS NOT NULL);

ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_not_accepted_and_declined"
  CHECK ("acceptedAt" IS NULL OR "declinedAt" IS NULL);

-- At most ONE live invitation per activity. Two people cannot race into the
-- same Dúo seat, and a second link cannot be minted while the first is open.
CREATE UNIQUE INDEX "CircleInvitation_one_live_per_activity"
  ON "CircleInvitation" ("activityId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "declinedAt" IS NULL;

-- ── CircleGuestSession · opaque, and scoped to one activity ────────────────
ALTER TABLE "CircleGuestSession"
  ADD CONSTRAINT "CircleGuestSession_token_hash_is_sha256"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "CircleGuestSession"
  ADD CONSTRAINT "CircleGuestSession_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- The composite foreign keys are the whole point of this block: a session
-- cannot point at a participant or an invitation belonging to a DIFFERENT
-- activity. Without them, `activityId` would be a denormalised column that
-- two writers could disagree about, and the guest actor is built from it.
ALTER TABLE "CircleGuestSession"
  ADD CONSTRAINT "CircleGuestSession_participant_in_same_activity"
  FOREIGN KEY ("participantId", "activityId")
  REFERENCES "CircleActivityParticipant" ("id", "activityId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CircleGuestSession"
  ADD CONSTRAINT "CircleGuestSession_invitation_in_same_activity"
  FOREIGN KEY ("invitationId", "activityId")
  REFERENCES "CircleInvitation" ("id", "activityId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CircleActivity · an immutable template pin ─────────────────────────────
ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_template_version_positive"
  CHECK ("templateVersion" >= 1);

ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_required_participants_min_two"
  CHECK ("requiredParticipants" >= 2);

-- `revealedAt` is not a column anybody sets by hand: it is the reveal barrier's
-- output. Here it is only bound to the status, so a REVEALED row without a
-- timestamp — or the reverse — cannot exist. PR3 adds the barrier itself.
ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_revealed_has_timestamp"
  CHECK ("status" <> 'REVEALED' OR "revealedAt" IS NOT NULL);

ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_cancelled_has_timestamp"
  CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));

-- The pin identifies which reviewed template an activity is running. Letting it
-- change would silently re-point a running activity at different copy, which is
-- why this is a trigger and not a convention.
CREATE OR REPLACE FUNCTION "circle_activity_pin_is_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."templateKey" IS DISTINCT FROM OLD."templateKey"
     OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion" THEN
    RAISE EXCEPTION 'CIRCLE_ACTIVITY_PIN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CircleActivity_pin_immutable"
  BEFORE UPDATE ON "CircleActivity"
  FOR EACH ROW EXECUTE FUNCTION "circle_activity_pin_is_immutable"();

-- ── CircleActivityParticipant · exactly one identity, whole envelopes ──────
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_exactly_one_identity"
  CHECK (num_nonnulls("memberId", "invitationId") = 1);

-- All four snapshot columns arrive together or not at all. A half-written
-- envelope is not a state the reveal barrier should ever have to interpret.
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_snapshot_all_or_nothing"
  CHECK (num_nonnulls("ciphertext", "nonce", "keyVersion", "readyAt") IN (0, 4));

-- READY means an envelope exists. Nothing else may claim readiness.
ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_ready_has_snapshot"
  CHECK ("status" <> 'READY' OR "readyAt" IS NOT NULL);

ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_withdrawn_has_timestamp"
  CHECK (("status" = 'WITHDRAWN') = ("withdrawnAt" IS NOT NULL));

-- One seat per identity per activity.
CREATE UNIQUE INDEX "CircleActivityParticipant_one_per_member"
  ON "CircleActivityParticipant" ("activityId", "memberId")
  WHERE "memberId" IS NOT NULL;

CREATE UNIQUE INDEX "CircleActivityParticipant_one_per_invitation"
  ON "CircleActivityParticipant" ("activityId", "invitationId")
  WHERE "invitationId" IS NOT NULL;

-- ── CircleArtifact · one active result, monotonic versions ─────────────────
ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_version_positive" CHECK ("version" >= 1);

ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_key_version_positive" CHECK ("keyVersion" >= 1);

ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_agreed_has_timestamp"
  CHECK (("status" = 'AGREED') = ("agreedAt" IS NOT NULL));

CREATE UNIQUE INDEX "CircleArtifact_one_active_per_activity"
  ON "CircleArtifact" ("activityId")
  WHERE "status" <> 'SUPERSEDED';

-- ── CircleEvent · append-only receipts with no room for prose ──────────────
ALTER TABLE "CircleEvent"
  ADD CONSTRAINT "CircleEvent_at_most_one_actor"
  CHECK (num_nonnulls("actorUserId", "actorParticipantId") <= 1);

-- The metadata column is for counters, ids and versions. Capping its serialised
-- size is a blunt instrument, and that is what makes it useful: nobody will fit
-- somebody's answer into 2 kB by accident, and there is no text column at all.
ALTER TABLE "CircleEvent"
  ADD CONSTRAINT "CircleEvent_metadata_is_small"
  CHECK ("metadata" IS NULL OR length("metadata"::text) <= 2048);

-- The receipt. A replayed command finds its own event and becomes a NOOP —
-- PostgreSQL is the authority for that, never Redis.
CREATE UNIQUE INDEX "CircleEvent_receipt_per_user_actor"
  ON "CircleEvent" ("actorUserId", "type", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL AND "actorUserId" IS NOT NULL;

CREATE UNIQUE INDEX "CircleEvent_receipt_per_participant_actor"
  ON "CircleEvent" ("actorParticipantId", "type", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL AND "actorParticipantId" IS NOT NULL;
