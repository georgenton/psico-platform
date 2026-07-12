-- Fase H (ARC-P1) — the user can mark a confirmed resonance as an "important
-- theme for me right now". Distinct important themes feed the Propósito axis
-- under the V2 contract (Eco proposes, the user confirms; nothing silent).
-- Additive; existing rows default to false.
ALTER TABLE "Resonance" ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false;
