-- Sprint S70 — Daily.co webhooks: capture actual session duration.
-- Distinct from durationMin (planned duration in minutes), this field is
-- populated by the `meeting.ended` webhook event in seconds for precision.

ALTER TABLE "TherapySession" ADD COLUMN "actualDurationSec" INTEGER;
