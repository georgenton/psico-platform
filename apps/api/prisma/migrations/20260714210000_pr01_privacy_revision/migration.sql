-- PR-0.1 — make the emotional-map cache identity survive a Redis failure.
--
-- Revoking consent for the on-device text analysis used to depend on Redis for
-- its SAFETY: we committed the consent change and deleted the derived rows in
-- Postgres, then bumped a Redis counter to make the cached map unreachable. If
-- that INCR failed, the revocation was already committed while the cached map —
-- built from the very data the user had just revoked — stayed readable until its
-- TTL expired.
--
-- `emotionalMapPrivacyRevision` is incremented in the SAME TRANSACTION as the
-- consent change, and it is part of every cache key for that user. The moment
-- the revocation commits, the old payload is unreachable. Redis is now only a
-- freshness optimisation; the guarantee lives in Postgres.
--
-- Existing rows start at 0, which is correct: their current cache keys (which
-- did not carry a revision) are invalidated anyway by the shape change, so there
-- is nothing to preserve.
--
-- Additive only. Safe to re-run.

ALTER TABLE "PrivacySettings"
  ADD COLUMN IF NOT EXISTS "emotionalMapPrivacyRevision" INTEGER NOT NULL DEFAULT 0;
