-- GR-3 — a resonance can now be confirmed from inside a Guide session.
--
-- Additive and reversible in practice: adding an enum value neither rewrites
-- rows nor invalidates the existing three. No row is written by this migration;
-- `GUIDE` only appears when a person explicitly confirms one inside a Guide.
--
-- Provenance is the reason for a new value rather than reusing HIGHLIGHT or
-- EXERCISE: "Mis resonancias" tells the person WHERE each confirmation
-- happened, and a borrowed value would make that line untrue.
ALTER TYPE "ResonanceSource" ADD VALUE IF NOT EXISTS 'GUIDE';
