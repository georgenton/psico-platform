-- Fase D (V2, decision L4) — explicit opt-in for the on-device reflection
-- text analysis (TXT-L1). Default FALSE for everyone, including accounts
-- that uploaded features before consent existed: their stored rows go
-- dormant (the scoring stops reading them) until they opt in, and are
-- deleted if they explicitly opt out.
ALTER TABLE "PrivacySettings" ADD COLUMN "localTextAnalysis" BOOLEAN NOT NULL DEFAULT false;
