-- C.0B1 — add the lineage ACTIVE invariant ALONGSIDE the global one.
--
-- ADR 0022 replaced "one ACTIVE session per user" with "one ACTIVE session per
-- (userId, guideKey)". This migration only ADDS the new index; the global one
-- (`GuideSession_one_active_per_user`) stays and therefore keeps deciding, so
-- this phase changes no visible behaviour. `readGuideActiveCapability` reports
-- GLOBAL while both are healthy, by design: the stricter rule wins while it is
-- actually being enforced.
--
-- CONCURRENTLY, deliberately. A plain CREATE UNIQUE INDEX takes a lock that
-- blocks writes to GuideSession for the whole build, which on a live table is
-- an outage. Prisma runs each statement outside an explicit transaction, so
-- CONCURRENTLY is legal here — verified against the real chain in
-- `guide-c0b1-lineage-index.pg-spec.ts`, not assumed.
--
-- Deliberately NOT written here:
--   * `guideVersion` — a (userId, guideKey, guideVersion) index would let X@v1
--     and X@v2 be ACTIVE at once, which ADR 0022 §2 forbids.
--   * `IF NOT EXISTS` — it would mask a pre-existing index of a DIFFERENT
--     shape carrying this name, and the detector reads structure, not names.
--     A second run must fail loudly instead of pretending success.
--   * `INCLUDE` — payload columns make indnatts exceed indnkeyatts, which the
--     detector classifies as NOT_OURS.
--   * expressions — the detector rejects `indexprs IS NOT NULL`.
--
-- If this statement fails it leaves an INVALID index behind. That is not a
-- transient: see the recovery matrix in docs/ROADMAP.md before retrying.
CREATE UNIQUE INDEX CONCURRENTLY "GuideSession_one_active_per_lineage"
  ON "GuideSession"("userId", "guideKey")
  WHERE "status" = 'ACTIVE';
