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
ALTER TABLE "CircleActivity"
  DROP CONSTRAINT IF EXISTS "CircleActivity_required_participants_exactly_two";

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

-- ── 7 · finding a circle's activities by shape ──────────────────────────────
CREATE INDEX IF NOT EXISTS "CircleActivity_kind_status_idx"
  ON "CircleActivity"("kind", "status");
