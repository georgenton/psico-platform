-- C.3C (#639) — the cutover constraint: what a row's binding columns must be,
-- given its status.
--
-- This is the structure that turns RESERVATION_AUTHORITY from BRIDGE into
-- STRUCTURAL. Until it exists, the runtime must still scan legacy rows, because
-- rows with null columns are legal. Once it exists, they are not — which is why
-- it may only be added after the C.3B backfill has filled every reserving row
-- and reported zero collisions.
--
--   DRAFT / PUBLISHED → identity AND lineage present. These rows reserve.
--   ARCHIVED          → identity present, lineage null. Identity is history;
--                       the binding is what archiving gives back.
--
-- `NOT VALID` is deliberately NOT used. The whole point of the gate is that the
-- data already complies, and a constraint that is present but unvalidated is
-- exactly the ambiguous shape the authority detector treats as FAIL_CLOSED.
ALTER TABLE "ChapterExperienceVersion"
    ADD CONSTRAINT "ChapterExperienceVersion_binding_shape_check"
    CHECK (
        ("status" = 'ARCHIVED' AND "contentUnitId" IS NOT NULL AND "guideKey" IS NULL)
        OR ("status" <> 'ARCHIVED' AND "contentUnitId" IS NOT NULL AND "guideKey" IS NOT NULL)
    );
