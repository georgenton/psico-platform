-- Etapa 6 (Mapa Emocional) — on-device text features (numbers only, ADR 0007)
CREATE TABLE "DiaryTextFeature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT,
    "wordCount" INTEGER NOT NULL,
    "selfFocus" DOUBLE PRECISION NOT NULL,
    "positive" DOUBLE PRECISION NOT NULL,
    "negative" DOUBLE PRECISION NOT NULL,
    "insight" DOUBLE PRECISION NOT NULL,
    "causal" DOUBLE PRECISION NOT NULL,
    "absolutist" DOUBLE PRECISION NOT NULL,
    "social" DOUBLE PRECISION NOT NULL,
    "selfKind" DOUBLE PRECISION NOT NULL,
    "selfCritic" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryTextFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiaryTextFeature_entryId_key" ON "DiaryTextFeature"("entryId");

CREATE INDEX "DiaryTextFeature_userId_createdAt_idx" ON "DiaryTextFeature"("userId", "createdAt" DESC);

ALTER TABLE "DiaryTextFeature" ADD CONSTRAINT "DiaryTextFeature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
