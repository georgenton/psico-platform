-- Círculos · account deletion, without an application bypass
--
-- PR2 stated the consequence rather than discovering it later:
--
--   "CONSEQUENCE, stated rather than discovered later: once Círculos is on,
--    account deletion needs a sanctioned way to scrub or detach these rows.
--    That is a migration PR3+ owes, not an application bypass."
--
-- This is that migration. Three foreign keys stand between `user.delete()` and
-- success, and each is loosened in the narrowest way that keeps its invariant:
--
--   1. `Circle.createdByUserId`   RESTRICT → SET NULL (column made nullable)
--   2. `CircleMember.userId`      CASCADE  → SET NULL (column made nullable)
--   3. `CircleEvent.actorUserId`  RESTRICT → SET NULL (already nullable)
--
-- ── 1 · A circle outlives its creator ───────────────────────────────────────
--
-- A Dúo is shared. Deleting the organiser must not delete the other person's
-- circle, and reassigning `createdBy` to the counterpart would record that they
-- created something they did not. NULL says the honest thing: this circle was
-- created by an account that no longer exists.
--
-- ── 2 · Membership is revoked, not erased ───────────────────────────────────
--
-- CASCADE could not work anyway: `CircleActivityParticipant.memberId` is
-- RESTRICT, and its CHECK `num_nonnulls(memberId, invitationId) = 1` means the
-- seat cannot simply drop its member either. So the member ROW survives with
-- `userId` NULL, which is what keeps the other person's activity coherent — the
-- seat still points at a member of that circle.
--
-- It authorises nothing. Every actor lookup resolves membership BY `userId`,
-- and a NULL `userId` matches no authenticated caller, ever. The application
-- additionally sets `status = LEFT` and `leftAt` before the delete, so the row
-- is terminal as well as detached.
--
-- ── 3 · The ledger stays append-only; ONE transition is admitted ────────────
--
-- The append-only triggers are not dropped, not disabled, and not made
-- conditional on anything a runtime connection can set. There is no
-- `session_replication_role`, no GUC, no SECURITY DEFINER function, no dynamic
-- SQL and no privileged role to hold.
--
-- Instead the trigger admits EXACTLY ONE shape of UPDATE:
--
--   · `actorUserId` goes from a value to NULL, and
--   · every other column is unchanged (compared one by one), and
--   · the user it named NO LONGER EXISTS.
--
-- That last clause is what makes this the authorised deletion path and nothing
-- else. `ON DELETE SET NULL` runs AFTER the `User` row is gone, so the check
-- passes there. An ordinary service `UPDATE ... SET "actorUserId" = NULL` runs
-- while the user still exists, and is refused like every other write. The
-- service cannot delete a `User` on a whim either: that is the account-deletion
-- flow, which is the authorised path by definition.
--
-- Everything else the ledger refused, it still refuses: any other UPDATE, every
-- DELETE, every TRUNCATE.
--
-- `CircleEvent` carries no content — `metadata` is a closed two-value grammar
-- (`{"hasCode": …}`) enforced by CHECK — so detaching the actor detaches the
-- row. This is not content kept under the name "anonymised": the content lives
-- in participant envelopes and artifacts, and the application purges those
-- through the same path a withdrawal uses, before the account row is removed.

-- ── 1 · Circle.createdByUserId ──────────────────────────────────────────────
ALTER TABLE "Circle" ALTER COLUMN "createdByUserId" DROP NOT NULL;

ALTER TABLE "Circle" DROP CONSTRAINT "Circle_createdByUserId_fkey";

ALTER TABLE "Circle"
  ADD CONSTRAINT "Circle_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2 · CircleMember.userId ─────────────────────────────────────────────────
ALTER TABLE "CircleMember" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "CircleMember" DROP CONSTRAINT "CircleMember_userId_fkey";

ALTER TABLE "CircleMember"
  ADD CONSTRAINT "CircleMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A detached membership is never ACTIVE. The application sets this before the
-- delete; the CHECK makes a detached-but-active row unrepresentable even if a
-- future path forgets.
ALTER TABLE "CircleMember"
  ADD CONSTRAINT "CircleMember_detached_is_left"
  CHECK ("userId" IS NOT NULL OR "status" = 'LEFT');

-- ── 3 · CircleEvent.actorUserId ─────────────────────────────────────────────
ALTER TABLE "CircleEvent" DROP CONSTRAINT "CircleEvent_actorUserId_fkey";

ALTER TABLE "CircleEvent"
  ADD CONSTRAINT "CircleEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The trigger function, replaced in place. The three triggers themselves are
-- untouched: UPDATE, DELETE and TRUNCATE all still route here.
--
-- `search_path` is pinned so the `User` lookup cannot be redirected by a
-- caller's schema search order.
CREATE OR REPLACE FUNCTION "circle_event_is_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     -- The one admitted transition: an actor reference is dropped.
     AND OLD."actorUserId" IS NOT NULL
     AND NEW."actorUserId" IS NULL
     -- …and the account it named is already gone, which is true only inside
     -- the `ON DELETE SET NULL` action of an authorised account deletion.
     AND NOT EXISTS (
       SELECT 1 FROM public."User" u WHERE u."id" = OLD."actorUserId"
     )
     -- …and nothing else moved. Compared column by column, no dynamic SQL.
     AND NEW."id"                 IS NOT DISTINCT FROM OLD."id"
     AND NEW."circleId"           IS NOT DISTINCT FROM OLD."circleId"
     AND NEW."activityId"         IS NOT DISTINCT FROM OLD."activityId"
     AND NEW."type"               IS NOT DISTINCT FROM OLD."type"
     AND NEW."actorParticipantId" IS NOT DISTINCT FROM OLD."actorParticipantId"
     AND NEW."artifactId"         IS NOT DISTINCT FROM OLD."artifactId"
     AND NEW."idempotencyKey"     IS NOT DISTINCT FROM OLD."idempotencyKey"
     AND NEW."metadata"           IS NOT DISTINCT FROM OLD."metadata"
     AND NEW."occurredAt"         IS NOT DISTINCT FROM OLD."occurredAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CIRCLE_EVENT_APPEND_ONLY';
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;
