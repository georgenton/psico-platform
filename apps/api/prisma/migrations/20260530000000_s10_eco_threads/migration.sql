-- Sprint S10 — Eco conversational AI tables.
-- New tables (Conversation/ConversationMessage stay untouched for backward
-- compatibility with /ai/chat). User messages persist as ciphertext; LLM
-- responses persist as plaintext.

-- CreateEnum
CREATE TYPE "EcoMessageKind" AS ENUM ('USER', 'ASSISTANT', 'CRISIS', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "EcoMessageReportReason" AS ENUM ('HALLUCINATION', 'OFF_TONE', 'SENSITIVE_CONTENT', 'CRISIS_MISHANDLED', 'OTHER');

-- CreateTable
CREATE TABLE "EcoThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleCiphertext" TEXT,
    "titleNonce" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcoThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (rail in sidebar = recent threads)
CREATE INDEX "EcoThread_userId_lastMessageAt_idx" ON "EcoThread"("userId", "lastMessageAt");

-- CreateTable
CREATE TABLE "EcoMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "kind" "EcoMessageKind" NOT NULL,
    "textCiphertext" TEXT,
    "textNonce" TEXT,
    "assistantText" TEXT,
    "suggestedBookId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (paginated thread view)
CREATE INDEX "EcoMessage_threadId_createdAt_idx" ON "EcoMessage"("threadId", "createdAt");

-- CreateTable
CREATE TABLE "EcoMessageReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "EcoMessageReportReason" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoMessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EcoMessageReport_userId_createdAt_idx" ON "EcoMessageReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EcoMessageReport_reason_idx" ON "EcoMessageReport"("reason");

-- AddForeignKey
ALTER TABLE "EcoThread" ADD CONSTRAINT "EcoThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcoMessage" ADD CONSTRAINT "EcoMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EcoThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcoMessageReport" ADD CONSTRAINT "EcoMessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EcoMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
