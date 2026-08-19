-- C.3A (#639) — the binding bridge: stable chapter identity and a structural
-- reservation for the guide an experience lineage owns.
--
-- ADDITIVE ONLY, and deliberately so: the binary running in production knows
-- none of this. It keeps inserting rows with both new columns null, and a
-- composite foreign key with MATCH SIMPLE is not evaluated when any of its
-- columns is null — so those writes stay legal for the whole rollout. What
-- they do NOT get is a reservation, which is exactly why C.3A is a bridge and
-- not the cutover.
--
-- Nothing here adds ARCHIVED, the final CHECK, guide selection, rebind or
-- archive. No editorial row is rewritten.

-- ── Stable identity and the reserved lineage, promoted out of JSON ──────────
--
-- A constraint cannot be built on a value buried inside `definitionJson`, so
-- the two things the database must be able to enforce become real columns.
-- `guideVersion` is NOT among them: a lineage is a `guideKey`, and versions of
-- one lineage share a reservation.
ALTER TABLE "ChapterExperienceVersion"
    ADD COLUMN "contentUnitId" TEXT,
    ADD COLUMN "guideKey" TEXT;

-- ── Who owns which guide inside one stable chapter ─────────────────────────
--
-- A partial bijection, with both halves structural:
--   PRIMARY KEY (contentUnitId, experienceKey)  → one guide per experience
--   UNIQUE      (contentUnitId, guideKey)       → one experience per guide
CREATE TABLE "ExperienceGuideReservation" (
    "contentUnitId" TEXT NOT NULL,
    "experienceKey" TEXT NOT NULL,
    "guideKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceGuideReservation_pkey"
        PRIMARY KEY ("contentUnitId", "experienceKey")
);

-- One experience per guide, inside the chapter.
CREATE UNIQUE INDEX "ExperienceGuideReservation_contentUnitId_guideKey_key"
    ON "ExperienceGuideReservation"("contentUnitId", "guideKey");

-- The target of the composite foreign key below. It exists for that reason and
-- for no other: it does not express either rule above.
CREATE UNIQUE INDEX "ExperienceGuideReservation_contentUnitId_experienceKey_guid_key"
    ON "ExperienceGuideReservation"("contentUnitId", "experienceKey", "guideKey");

-- A chapter cannot be deleted out from under a reservation.
ALTER TABLE "ExperienceGuideReservation"
    ADD CONSTRAINT "ExperienceGuideReservation_contentUnitId_fkey"
    FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── The chapter a row names is a fact of its own ───────────────────────────
--
-- Not redundant with the composite key below, and the reason is MATCH SIMPLE.
-- That constraint is not evaluated once `guideKey` is null — which is exactly
-- what an archived row is. Without this one, an ARCHIVED row's `contentUnitId`
-- would be an unchecked string and the unit it names could be deleted out from
-- under it. Identity survives archiving, so it must be protected after the
-- binding is released, not only while the binding is there.
--
-- Nullable, because a row written by the previous binary has no identity yet.
ALTER TABLE "ChapterExperienceVersion"
    ADD CONSTRAINT "ChapterExperienceVersion_contentUnitId_fkey"
    FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── The row cannot outrun its reservation ──────────────────────────────────
--
-- RESTRICT, so a reservation cannot be released while a version still depends
-- on it: "archiving releases the guide" becomes something the database keeps
-- rather than something the service promises.
--
-- MATCH SIMPLE is the default and is load-bearing here: with `contentUnitId`
-- or `guideKey` null the constraint is not evaluated at all, which is what
-- keeps a legacy row — and, later, an archived one — legal without weakening
-- the rule for rows that genuinely reserve.
ALTER TABLE "ChapterExperienceVersion"
    ADD CONSTRAINT "ChapterExperienceVersion_reservation_fkey"
    FOREIGN KEY ("contentUnitId", "experienceKey", "guideKey")
    REFERENCES "ExperienceGuideReservation"("contentUnitId", "experienceKey", "guideKey")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ChapterExperienceVersion_contentUnitId_guideKey_idx"
    ON "ChapterExperienceVersion"("contentUnitId", "guideKey");
