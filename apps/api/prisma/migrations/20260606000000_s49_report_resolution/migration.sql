-- Sprint S49 — Add resolution flow to EcoMessageReport.
--
-- All columns are nullable so the migration is purely additive: existing
-- rows are implicitly "open" (resolvedAt IS NULL). No backfill required.

ALTER TABLE "EcoMessageReport"
  ADD COLUMN "resolvedAt"     TIMESTAMP(3),
  ADD COLUMN "resolvedBy"     TEXT,
  ADD COLUMN "resolutionNote" TEXT;

-- Composite index narrowing on the resolution status. Postgres can range-scan
-- on `resolvedAt IS NULL` cheaply because that's the high-cardinality state
-- early on; once we've triaged most rows, the count is small either way.
CREATE INDEX "EcoMessageReport_resolvedAt_createdAt_idx"
  ON "EcoMessageReport" ("resolvedAt", "createdAt");
