Loaded Prisma config from prisma.config.ts.

-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textCiphertext" TEXT NOT NULL,
    "textNonce" TEXT NOT NULL,
    "excerptCiphertext" TEXT,
    "excerptNonce" TEXT,
    "mood" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'free',
    "promptId" TEXT,
    "tags" TEXT[],
    "audioUrl" TEXT,
    "audioDurationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedDiaryEntry" (
    "id" TEXT NOT NULL,
    "entryId" TEXT,
    "therapistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ciphertextForTherapist" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "userOneShotPubKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedDiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryPrompt" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaryPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiaryEntry_userId_createdAt_idx" ON "DiaryEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DiaryEntry_userId_mood_idx" ON "DiaryEntry"("userId", "mood");

-- CreateIndex
CREATE INDEX "SharedDiaryEntry_userId_createdAt_idx" ON "SharedDiaryEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SharedDiaryEntry_therapistId_expiresAt_idx" ON "SharedDiaryEntry"("therapistId", "expiresAt");

-- CreateIndex
CREATE INDEX "DiaryPrompt_isActive_idx" ON "DiaryPrompt"("isActive");

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "DiaryPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedDiaryEntry" ADD CONSTRAINT "SharedDiaryEntry_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DiaryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedDiaryEntry" ADD CONSTRAINT "SharedDiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

