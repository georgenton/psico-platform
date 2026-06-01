
-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "cover" TEXT NOT NULL DEFAULT 'cool',
ADD COLUMN     "coverArtUrl" TEXT,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "pages" INTEGER,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "BookAuthor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "licenseNumber" TEXT,
    "cover" TEXT NOT NULL DEFAULT 'cool',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReflectionPrompt" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReflectionPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedReflectionPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedReflectionPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookAuthor_slug_key" ON "BookAuthor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BookCategory_slug_key" ON "BookCategory"("slug");

-- CreateIndex
CREATE INDEX "BookFavorite_userId_idx" ON "BookFavorite"("userId");

-- CreateIndex
CREATE INDEX "BookFavorite_bookId_idx" ON "BookFavorite"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "BookFavorite_userId_bookId_key" ON "BookFavorite"("userId", "bookId");

-- CreateIndex
CREATE INDEX "BookBookmark_userId_idx" ON "BookBookmark"("userId");

-- CreateIndex
CREATE INDEX "BookBookmark_bookId_idx" ON "BookBookmark"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "BookBookmark_userId_bookId_key" ON "BookBookmark"("userId", "bookId");

-- CreateIndex
CREATE INDEX "BookReview_bookId_createdAt_idx" ON "BookReview"("bookId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BookReview_userId_idx" ON "BookReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookReview_userId_bookId_key" ON "BookReview"("userId", "bookId");

-- CreateIndex
CREATE INDEX "ReflectionPrompt_isActive_idx" ON "ReflectionPrompt"("isActive");

-- CreateIndex
CREATE INDEX "DismissedReflectionPrompt_userId_dismissedAt_idx" ON "DismissedReflectionPrompt"("userId", "dismissedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedReflectionPrompt_userId_promptId_key" ON "DismissedReflectionPrompt"("userId", "promptId");

-- CreateIndex
CREATE INDEX "Book_authorId_idx" ON "Book"("authorId");

-- CreateIndex
CREATE INDEX "Book_categoryId_idx" ON "Book"("categoryId");

-- CreateIndex
CREATE INDEX "Book_isPublished_publishedAt_idx" ON "Book"("isPublished", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "BookAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BookCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookFavorite" ADD CONSTRAINT "BookFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookFavorite" ADD CONSTRAINT "BookFavorite_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookBookmark" ADD CONSTRAINT "BookBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookBookmark" ADD CONSTRAINT "BookBookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookReview" ADD CONSTRAINT "BookReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookReview" ADD CONSTRAINT "BookReview_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedReflectionPrompt" ADD CONSTRAINT "DismissedReflectionPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedReflectionPrompt" ADD CONSTRAINT "DismissedReflectionPrompt_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "ReflectionPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
