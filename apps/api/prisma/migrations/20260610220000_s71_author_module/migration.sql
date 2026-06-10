-- Sprint S71 — Editor de autor (B2B). Adds AUTHOR role + author book lifecycle.

-- AUTHOR role.
ALTER TYPE "Role" ADD VALUE 'AUTHOR';

-- AuthorBookStatus enum.
CREATE TYPE "AuthorBookStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- AuthorBook — the workspace book (distinct from public Book row).
CREATE TABLE "AuthorBook" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "summary" TEXT,
    "status" "AuthorBookStatus" NOT NULL DEFAULT 'DRAFT',
    "cover" TEXT NOT NULL DEFAULT 'warm',
    "coverArtUrl" TEXT,
    "categoryId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "publishedBookId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorBook_publishedBookId_key" ON "AuthorBook"("publishedBookId");
CREATE INDEX "AuthorBook_authorUserId_status_idx" ON "AuthorBook"("authorUserId", "status");
CREATE INDEX "AuthorBook_status_submittedAt_idx" ON "AuthorBook"("status", "submittedAt");

ALTER TABLE "AuthorBook" ADD CONSTRAINT "AuthorBook_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuthorBookChapter.
CREATE TABLE "AuthorBookChapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorBookChapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorBookChapter_bookId_n_key" ON "AuthorBookChapter"("bookId", "n");
CREATE INDEX "AuthorBookChapter_bookId_idx" ON "AuthorBookChapter"("bookId");

ALTER TABLE "AuthorBookChapter" ADD CONSTRAINT "AuthorBookChapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "AuthorBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuthorPublicationRequest — submission audit trail.
CREATE TABLE "AuthorPublicationRequest" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewState" TEXT NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "AuthorPublicationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthorPublicationRequest_bookId_submittedAt_idx" ON "AuthorPublicationRequest"("bookId", "submittedAt");
CREATE INDEX "AuthorPublicationRequest_reviewState_submittedAt_idx" ON "AuthorPublicationRequest"("reviewState", "submittedAt");

ALTER TABLE "AuthorPublicationRequest" ADD CONSTRAINT "AuthorPublicationRequest_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "AuthorBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
