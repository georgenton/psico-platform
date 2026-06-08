-- Sprint S50 — PlatformMetricDaily for Pulso v2 time series.
--
-- One row per UTC day, written by the nightly PlatformSnapshotProcessor
-- at 02:30 UTC. Powers sparklines + "vs last period" deltas in the admin
-- Overview. Privacy invariant preserved: integer + float columns only,
-- no per-user identifiers.

CREATE TABLE "PlatformMetricDaily" (
    "day"               TIMESTAMP(3) NOT NULL,
    "totalUsers"        INTEGER NOT NULL DEFAULT 0,
    "newUsers"          INTEGER NOT NULL DEFAULT 0,
    "paidUsers"         INTEGER NOT NULL DEFAULT 0,
    "dau"               INTEGER NOT NULL DEFAULT 0,
    "diaryEntries"      INTEGER NOT NULL DEFAULT 0,
    "ecoMessages"       INTEGER NOT NULL DEFAULT 0,
    "ecoCrisis"         INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readingSessions"   INTEGER NOT NULL DEFAULT 0,
    "reportsOpened"     INTEGER NOT NULL DEFAULT 0,
    "reportsResolved"   INTEGER NOT NULL DEFAULT 0,
    "generatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformMetricDaily_pkey" PRIMARY KEY ("day")
);

CREATE INDEX "PlatformMetricDaily_day_idx" ON "PlatformMetricDaily" ("day" DESC);
