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
