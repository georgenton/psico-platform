-- Sprint B5 — Journey (Exploraciones).
--
-- New isolated table; no existing data to migrate. `bookSlugs` is a Postgres
-- native text array so the renderer can keep the order without a join table.
-- A composite index on (publishedAt, order) makes the list query — which is
-- the only read path in v1 — index-only.

CREATE TABLE "Journey" (
  "id"              TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "subtitle"        TEXT NOT NULL,
  "description"     TEXT,
  "coverToken"      TEXT NOT NULL DEFAULT 'mixed',
  "durationMinutes" INTEGER NOT NULL DEFAULT 0,
  "bookSlugs"       TEXT[],
  "order"           INTEGER NOT NULL DEFAULT 0,
  "publishedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Journey_slug_key" ON "Journey" ("slug");
CREATE INDEX "Journey_publishedAt_order_idx" ON "Journey" ("publishedAt", "order");
