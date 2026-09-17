-- Círculos · flexible onboarding
--
-- ── What changes, and why it needs columns rather than a convention ─────────
--
-- Until now ONE number carried four different meanings, and the screens were
-- starting to disagree about which one they meant:
--
--   · how many people COULD take part (what the organiser chose when
--     creating, and what each invitee was told before accepting);
--   · how many ACCEPTED;
--   · which group will actually share the activity;
--   · how many of that group have confirmed what they will send.
--
-- `requiredParticipants` was all four at once, and the reveal barrier read it
-- as the last two. So a room of three with one guest accepted could never
-- open, and the screen told the organiser the activity no longer admitted
-- changes — which was not true and not their fault.
--
-- So `requiredParticipants` keeps exactly ONE meaning from here on: CAPACITY.
-- The group that will share the activity is `confirmedParticipants`, written
-- once when the organiser closes onboarding, and null until then. The reveal
-- barrier reads the group when there is one and capacity when there is not,
-- which is precisely the old behaviour for every room created before today.
--
-- ── Old rooms keep the rules their participants entered under ──────────────
--
-- `onboarding` is per ACTIVITY and defaults to `FIXED`, so every row that
-- exists right now — and every row an API instance from before this migration
-- writes during a rolling deploy — means what it has always meant: everybody
-- invited must accept, and the last acceptance opens the preparation. Nothing
-- is rewritten and nothing is reinterpreted.

-- ── 1 · which rules this activity plays by ──────────────────────────────────
CREATE TYPE "CircleOnboardingPolicy" AS ENUM ('FIXED', 'FLEXIBLE');

ALTER TABLE "CircleActivity"
  ADD COLUMN "onboarding" "CircleOnboardingPolicy" NOT NULL DEFAULT 'FIXED';

-- ── 2 · the group that will actually share it ───────────────────────────────
--
-- Null while onboarding is open. Never larger than capacity — a room cannot
-- end up with more people than were ever invited — and never smaller than two,
-- because an activity between one person and nobody is not the product.
--
-- Only a FLEXIBLE room has one: under the old rules the group IS the capacity,
-- and writing it twice would be inviting the two to disagree.
ALTER TABLE "CircleActivity"
  ADD COLUMN "confirmedParticipants" INTEGER;

ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_confirmed_group_is_within_capacity"
  CHECK (
    "confirmedParticipants" IS NULL
    OR (
      "onboarding" = 'FLEXIBLE'
      AND "confirmedParticipants" >= 2
      AND "confirmedParticipants" <= "requiredParticipants"
    )
  );

-- ── 3 · a guest's short alias, chosen when they accept ──────────────────────
--
-- The name the other participants see. It belongs to the SEAT rather than to
-- an account because the person may not have one, and it is personal data: it
-- is deleted with the seat, never sent to analytics, and never presented as a
-- verified identity.
--
-- Members do not have one — their display name already exists — so the column
-- is only ever written on a seat that came from an invitation.
ALTER TABLE "CircleActivityParticipant"
  ADD COLUMN "alias" TEXT;

ALTER TABLE "CircleActivityParticipant"
  ADD CONSTRAINT "CircleActivityParticipant_alias_is_a_short_guest_name"
  CHECK (
    "alias" IS NULL
    OR (
      "invitationId" IS NOT NULL
      AND char_length(btrim("alias")) BETWEEN 1 AND 24
      AND char_length("alias") <= 24
    )
  );

-- ── 4 · the shape stays frozen, and the group joins it ──────────────────────
--
-- `onboarding` can never change: a room offered under one set of rules cannot
-- be switched to the other while people are inside it.
--
-- `confirmedParticipants` is WRITE-ONCE. Closing onboarding fixes who will
-- read whose answers, and every confirmation after it is given against that
-- group. Letting it move afterwards would mean somebody's selection reaching
-- an audience they never saw.
CREATE OR REPLACE FUNCTION "circle_activity_pin_is_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."templateKey" IS DISTINCT FROM OLD."templateKey"
     OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion" THEN
    RAISE EXCEPTION 'CIRCLE_ACTIVITY_PIN_IMMUTABLE';
  END IF;
  IF NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."requiredParticipants" IS DISTINCT FROM OLD."requiredParticipants" THEN
    RAISE EXCEPTION 'CIRCLE_ACTIVITY_SHAPE_IMMUTABLE';
  END IF;
  IF NEW."onboarding" IS DISTINCT FROM OLD."onboarding" THEN
    RAISE EXCEPTION 'CIRCLE_ACTIVITY_ONBOARDING_IMMUTABLE';
  END IF;
  IF OLD."confirmedParticipants" IS NOT NULL
     AND NEW."confirmedParticipants" IS DISTINCT FROM OLD."confirmedParticipants" THEN
    RAISE EXCEPTION 'CIRCLE_ACTIVITY_GROUP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
