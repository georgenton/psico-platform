-- Fase E (V2) — ARC cycle: confirmed resonances. Every row is an explicit
-- user confirmation; the only content-side signal allowed into the map.
CREATE TYPE "ResonanceSource" AS ENUM ('HIGHLIGHT', 'ECO', 'EXERCISE');

CREATE TABLE "Resonance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "conceptLabel" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "source" "ResonanceSource" NOT NULL DEFAULT 'HIGHLIGHT',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resonance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Resonance_userId_conceptKey_key" ON "Resonance"("userId", "conceptKey");

CREATE INDEX "Resonance_userId_confirmedAt_idx" ON "Resonance"("userId", "confirmedAt" DESC);

ALTER TABLE "Resonance" ADD CONSTRAINT "Resonance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
