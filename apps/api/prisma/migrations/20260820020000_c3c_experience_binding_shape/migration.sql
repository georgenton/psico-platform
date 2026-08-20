-- C.3C (#639) — the cutover shape: what a row's binding columns must be, given
-- its status.
--
-- This is the structure that turns RESERVATION_AUTHORITY from BRIDGE into
-- STRUCTURAL. Until it exists, the runtime must still scan legacy rows, because
-- rows with null columns are legal. Once it exists, they are not — which is why
-- it may only be applied after the C.3B backfill has filled every reserving row
-- and reported zero collisions.
--
--   DRAFT / PUBLISHED → identity AND lineage present. These rows reserve.
--   ARCHIVED          → identity present, lineage null. Identity is history;
--                       the binding is what archiving gives back.
--
-- ── Both halves land together, deliberately ─────────────────────────────────
--
-- `contentUnitId` becomes NOT NULL in the SAME file as the CHECK. The authority
-- detector treats a schema carrying one without the other as FAIL_CLOSED,
-- because it is a cutover that stopped halfway and no binary should write into
-- one. Keeping them together means that state exists only inside a failed
-- migration, never as something a replica can observe.
--
-- The column constraint and the CHECK's `IS NOT NULL` clauses are redundant on
-- purpose. The CHECK then states the whole rule by itself — including for
-- anybody who later relaxes the column — and the detector pins its exact
-- rendered text.
--
-- `NOT VALID` is deliberately NOT used. The whole point of the gate is that the
-- data already complies, and a constraint that is present but unvalidated is
-- exactly the ambiguous shape the authority detector treats as FAIL_CLOSED.
--
-- This migration FAILS if any row still has a null `contentUnitId`. That is the
-- gate working: it means C.3B has not run, or ran and left something behind.
--
-- ── Why the explicit transaction ───────────────────────────────────────────
--
-- `prisma migrate deploy` does NOT wrap a migration file. Measured with this
-- project's own command against a disposable PostgreSQL 18.4. So without
-- `BEGIN`/`COMMIT` the likely failure here — the CHECK rejecting a row the
-- backfill missed — would leave the column already NOT NULL, the constraint
-- absent, and `_prisma_migrations` unfinished.
--
-- That state is exactly the one the authority detector calls FAIL_CLOSED, and
-- fail-closed is not a substitute for atomicity: the CMS would be down, the
-- deploy blocked on P3009, and the recovery would need a hand-written
-- `ALTER COLUMN … DROP NOT NULL` before anything could be retried.
--
-- Both halves land together or neither does. Verified the way it was measured:
-- with a deliberate failure before `COMMIT`, the column keeps its nullability
-- and no constraint appears.
BEGIN;

ALTER TABLE "ChapterExperienceVersion"
    ALTER COLUMN "contentUnitId" SET NOT NULL;

ALTER TABLE "ChapterExperienceVersion"
    ADD CONSTRAINT "ChapterExperienceVersion_binding_shape_check"
    CHECK (
        ("status" = 'ARCHIVED' AND "contentUnitId" IS NOT NULL AND "guideKey" IS NULL)
        OR ("status" <> 'ARCHIVED' AND "contentUnitId" IS NOT NULL AND "guideKey" IS NOT NULL)
    );

COMMIT;
