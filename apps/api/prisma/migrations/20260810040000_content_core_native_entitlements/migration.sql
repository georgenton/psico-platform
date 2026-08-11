-- #580 — Content Core owns entitlement, instead of deriving it from legacy rows.
--
-- Both columns are additive and nullable/defaulted, so every existing row stays
-- readable through the deploy and the old resolution path keeps working until
-- the backfill has run.
--
-- `accessPlan` is deliberately NULL rather than FREE: null means "not derived
-- yet", which is what selects the legacy fallback. Defaulting it to FREE would
-- hand out a PRO book on any edition the backfill had not reached.
ALTER TABLE "Edition" ADD COLUMN "accessPlan" "Plan";

-- `isFreePreview` defaults to false, and is only trusted on editions whose
-- `accessPlan` is set — so a not-yet-derived unit cannot accidentally read as
-- "gated" and deny access that is allowed today.
ALTER TABLE "ContentUnit" ADD COLUMN "isFreePreview" BOOLEAN NOT NULL DEFAULT false;

-- ── Initialize the editions that already exist ──────────────────────────────
--
-- Production deploy runs `prisma migrate deploy` and nothing else — the
-- Content Core backfill is an operator-invoked runner. So if this migration
-- left existing editions with a NULL `accessPlan`, every one of them would stay
-- on the legacy fallback indefinitely, and a pure-core unit added to such a
-- book later could not be resolved at all: the fallback needs a Chapter row,
-- and a new unit has none. Initializing here is what makes those books
-- authorable without a separate ops step anybody could forget.
--
-- Both statements are guarded on `accessPlan IS NULL`, so they initialize
-- exactly once and can never overwrite a decision Content Core already owns.
-- Re-running the migration is a no-op.

-- 1. The plan, from the legacy Book this edition was backfilled from. Editions
--    with no matching Book are left NULL on purpose: there is nothing to derive
--    from, and inventing a tier is worse than staying on the old path.
UPDATE "Edition" e
SET "accessPlan" = b."plan"
FROM "Book" b
WHERE e."slug" = b."slug"
  AND e."accessPlan" IS NULL;

-- 2. The designation, from the unit currently sitting first in the edition's
--    published manifest.
--
--    Reader-equivalent by construction, not by hope: the backfill sets
--    `RevisionUnit.order` FROM `Chapter.order` and throws on drift, so "first in
--    the manifest" and "chapter 1" are the same unit for every legacy-backfilled
--    edition. That is what lets this run in SQL without recomputing uuidv5.
UPDATE "ContentUnit" cu
SET "isFreePreview" = true
FROM "RevisionUnit" ru
JOIN "Edition" e ON e."publishedRevisionId" = ru."revisionId"
WHERE ru."unitId" = cu."id"
  AND ru."order" = 1
  AND cu."editionId" = e."id"
  AND e."accessPlan" IS NOT NULL
  -- Only for editions that have no designation at all. Prisma never re-runs an
  -- applied migration, but writing it this way means running the statement
  -- twice is a genuine no-op rather than something that happens to be safe
  -- because of the migration runner — and it can never overwrite a designation
  -- an editor has since moved.
  AND NOT EXISTS (
    SELECT 1 FROM "ContentUnit" x
    WHERE x."editionId" = e."id" AND x."isFreePreview"
  );
