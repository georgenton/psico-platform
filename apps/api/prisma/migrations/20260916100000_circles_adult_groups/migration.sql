-- Círculos · adult groups of three to six
--
-- Additive, and designed to be applied while the PREVIOUS API and worker are
-- still serving. Every new column has a default that makes an old instance's
-- INSERT legal and still correct: it writes no kind, gets 'DUO', and 'DUO' is
-- the rule it was already obeying.
--
-- Nothing here edits an applied migration, rewrites a pin, or relaxes a Dúo.

-- ── 1 · the second shape ────────────────────────────────────────────────────
--
-- A new enum VALUE rather than a new enum: the column, its indexes and every
-- row that already exists keep their type.
ALTER TYPE "CircleKind" ADD VALUE IF NOT EXISTS 'GROUP_ADULT';

-- ── 2 · admitting the second shape, explicitly ──────────────────────────────
--
-- The foundation migration wrote `CHECK ("kind" = 'DUO')` and said why: "v1
-- admits one shape, and widening it has to be an edit to these three lines
-- rather than a value somebody passed without anybody noticing."
--
-- That guard worked — it refused the first GROUP_ADULT circle this branch tried
-- to insert. So it is REPLACED, not dropped: the new constraint names the two
-- kinds the product admits, so adding a third to the enum still fails here
-- until somebody decides it should not.
ALTER TABLE "Circle" DROP CONSTRAINT IF EXISTS "Circle_kind_duo_only";

ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_kind_is_admitted"
  CHECK ("kind" IN ('DUO', 'GROUP_ADULT'));

-- ── 3 · a circle of three to six ────────────────────────────────────────────
--
-- The Dúo rule is untouched and stays exactly what it was:
--   CHECK ("kind" <> 'DUO' OR "maxParticipants" = 2)
-- This is a SECOND constraint for the second kind, deliberately not a rewrite
-- of the first into a range. A single `BETWEEN 2 AND 6` would be shorter and
-- would silently let a Dúo hold six.
ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_group_size_is_three_to_six"
  CHECK ("kind" <> 'GROUP_ADULT' OR "maxParticipants" BETWEEN 3 AND 6);

-- Reference target for the activity's composite foreign key below.
CREATE UNIQUE INDEX IF NOT EXISTS "Circle_id_kind_key" ON "Circle"("id", "kind");

-- ── 4 · the activity carries its shape ──────────────────────────────────────
--
-- A CHECK cannot ask another table, and "how many seats may this have" depends
-- entirely on the circle's kind. So the kind is copied onto the activity — and
-- then held to the circle's by a composite foreign key, which is what stops the
-- copy from becoming an unchecked second opinion.
ALTER TABLE "CircleActivity"
  ADD COLUMN IF NOT EXISTS "kind" "CircleKind" NOT NULL DEFAULT 'DUO';

ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_circleId_kind_fkey"
  FOREIGN KEY ("circleId", "kind") REFERENCES "Circle"("id", "kind")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5 · how many seats, by shape ────────────────────────────────────────────
--
-- The old constraint was `CHECK ("requiredParticipants" = 2)`, unconditional.
-- It is REPLACED by a conditional one rather than widened into a global range:
-- a Dúo is still exactly two, and a group is three to six. Dropping the
-- equality and writing `BETWEEN 2 AND 6` would have opened every Dúo to six
-- without a single line saying so.
ALTER TABLE "CircleActivity" DROP CONSTRAINT IF EXISTS "CircleActivity_required_participants_exactly_two";

ALTER TABLE "CircleActivity"
  ADD CONSTRAINT "CircleActivity_size_matches_kind"
  CHECK (
    ("kind" = 'DUO' AND "requiredParticipants" = 2)
    OR ("kind" = 'GROUP_ADULT' AND "requiredParticipants" BETWEEN 3 AND 6)
  );

-- ── 6 · the roster is frozen too ────────────────────────────────────────────
--
-- The pin has been immutable since the foundation migration, because the
-- wording two people agreed to is not something an operator gets to change
-- underneath them. The same argument covers the shape and the size: a roster
-- that can be resized mid-activity is a roster nobody agreed to, and switching
-- a running Dúo to GROUP_ADULT would let a third seat appear in a conversation
-- that was offered as a conversation between two.
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 7 · one live link per SEAT, not per activity ────────────────────────────
--
-- The foundation migration wrote:
--
--   CREATE UNIQUE INDEX "CircleInvitation_one_live_per_activity"
--     ON "CircleInvitation" ("activityId")
--     WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "declinedAt" IS NULL;
--
-- …with the comment "Two people cannot race into the same Dúo seat, and a
-- second link cannot be minted while the first is open." Both halves are still
-- rules. The index expressed them by activity because a Dúo has exactly ONE
-- seat to fill, so "per activity" and "per seat" were the same sentence.
--
-- They stop being the same sentence at three people. A group of six needs five
-- live links at once, and this index refuses the second one — so the first
-- group of three this branch tried to create rolled back, exactly as the
-- `Circle_kind_duo_only` CHECK refused the first group circle.
--
-- The seat is therefore made EXPLICIT rather than the rule being dropped.
-- `seatIndex` numbers the seats an invitation may open: 1 for a Dúo's only
-- guest, 1..N−1 for a group of N. Existing rows are seat 1, which is what they
-- have always meant, so the default backfills them correctly and an old API
-- instance that does not know the column keeps minting seat 1.
ALTER TABLE "CircleInvitation"
  ADD COLUMN IF NOT EXISTS "seatIndex" INTEGER NOT NULL DEFAULT 1;

-- Five is the most guests any admitted shape has (a group of six). The bound
-- is the product's, not an arbitrary ceiling: widening it means widening
-- `Circle_group_size_is_three_to_six` first, which is an explicit edit.
--
-- What this CHECK cannot say is "and no higher than THIS activity's size" — a
-- CHECK cannot read another table, and the seat count is on `CircleActivity`.
-- That bound is held by the service, which refuses any request whose secret
-- count is not size − 1, and by the reveal barrier, which requires the seat
-- count to equal `requiredParticipants` exactly: an extra seat cannot leak a
-- conversation, it can only stop one from ever revealing.
ALTER TABLE "CircleInvitation"
  ADD CONSTRAINT "CircleInvitation_seat_index_in_range"
  CHECK ("seatIndex" BETWEEN 1 AND 5);

DROP INDEX IF EXISTS "CircleInvitation_one_live_per_activity";

CREATE UNIQUE INDEX "CircleInvitation_one_live_per_seat"
  ON "CircleInvitation" ("activityId", "seatIndex")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "declinedAt" IS NULL;

-- ── 8 · finding a circle's activities by shape ──────────────────────────────
CREATE INDEX IF NOT EXISTS "CircleActivity_kind_status_idx"
  ON "CircleActivity"("kind", "status");

-- ── 9 · a weekly fact remembers how many ROOMS it came from ─────────────────
--
-- Suppression used to rest on one number: ten distinct contributors. That was
-- written when every activity had two seats, so ten contributors meant at least
-- five separate rooms and no room's members could subtract themselves and be
-- left looking at an identifiable one.
--
-- A group of six breaks the arithmetic. Two rooms supply twelve contributors,
-- and each organiser knows their own six — so the ten-contributor rule would
-- call a cell safe that either of them can subtract into the other's answers.
-- The panel therefore requires distinct ACTIVITIES as well, and a cell that has
-- been folded into a weekly fact has to carry that number with it or be
-- suppressed forever.
--
-- Default 0: a row written before this column existed cannot say how many rooms
-- it came from, and the safe reading of "I do not know" is the one that
-- suppresses. In this deployment there are none — the fold happens 30 days
-- after a contribution and Círculos is younger than that — so nothing existing
-- is hidden by it.
ALTER TABLE "CircleWeeklyFact"
  ADD COLUMN IF NOT EXISTS "activities" INTEGER NOT NULL DEFAULT 0;
