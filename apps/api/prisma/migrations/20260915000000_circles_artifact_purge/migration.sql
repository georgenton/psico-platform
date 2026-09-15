-- ═══════════════════════════════════════════════════════════════════════════
-- Círculos · purging an artifact's CONTENT without deleting its row
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The approved policy: when an account is deleted, the content of the
-- artifacts THAT ACCOUNT AUTHORED is removed while they are still proposals or
-- superseded drafts. Agreements both people confirmed are kept, and so is
-- everything the counterpart authored.
--
-- ── Why the row stays ──────────────────────────────────────────────────────
--
-- Deleting the row is not available, and that is a property of the schema
-- rather than a preference:
--
--     CircleEvent.artifactId → CircleArtifact  ON DELETE RESTRICT
--
-- The ledger records that a proposal happened and that confirmations were
-- given. Those events are append-only and they point here. Removing the row
-- would either be refused by the database or, if the reference were loosened,
-- would erase the record that the act occurred — which is not what was
-- approved. What was approved is that the TEXT goes.
--
-- So the content columns become nullable and a purge nulls them. Four columns
-- move together because they are one thing: the ciphertext, the nonce that
-- decrypts it, the key version that selects the key, and the MAC that proves
-- it was not altered. Leaving any of them would leave a fragment of a body.
--
-- ── What remains, exactly ──────────────────────────────────────────────────
--
-- `id`, `activityId`, `version`, `kind`, `status`, `createdByParticipantId`,
-- `createdAt`, `updatedAt`, `agreedAt` and the new `purgedAt`. That is: the
-- fact that version N was proposed by that seat, when, and that its content was
-- later removed.
--
-- This is NOT anonymisation and must not be described as such. The row still
-- points at the seat that wrote it, and the seat still points at a membership.
-- The account is gone and the text is gone; the shape of the act remains.
--
-- Nor does it reach backups. A snapshot taken before this runs still holds the
-- old row, and nothing here rewrites history on the backup volume.

-- ── 1 · the content becomes optional ───────────────────────────────────────
ALTER TABLE "CircleArtifact" ALTER COLUMN "ciphertext" DROP NOT NULL;
ALTER TABLE "CircleArtifact" ALTER COLUMN "nonce" DROP NOT NULL;
ALTER TABLE "CircleArtifact" ALTER COLUMN "keyVersion" DROP NOT NULL;
ALTER TABLE "CircleArtifact" ALTER COLUMN "payloadHash" DROP NOT NULL;

ALTER TABLE "CircleArtifact" ADD COLUMN "purgedAt" TIMESTAMP(3);

-- ── 2 · the existing shape checks tolerate absence, not corruption ─────────
--
-- Both constraints described a value that is always present. They now describe
-- a value that is either absent or well-formed; a truncated hash or a zero key
-- version is still refused at write time.
ALTER TABLE "CircleArtifact" DROP CONSTRAINT "CircleArtifact_key_version_positive";
ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_key_version_positive"
  CHECK ("keyVersion" IS NULL OR "keyVersion" >= 1);

ALTER TABLE "CircleArtifact" DROP CONSTRAINT "CircleArtifact_payload_hash_is_hmac_hex";
ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_payload_hash_is_hmac_hex"
  CHECK ("payloadHash" IS NULL OR "payloadHash" ~ '^[0-9a-f]{64}$');

-- ── 3 · purged means purged ────────────────────────────────────────────────
--
-- Two states, and nothing between them: either the body is whole and there is
-- no purge, or the body is entirely gone and the purge is dated.
--
-- Written as a disjunction rather than an equivalence, and that is not style.
-- `("purgedAt" IS NOT NULL) = (all four IS NULL)` reads like the same rule and
-- is not: with the ciphertext nulled and the nonce left, both sides are false,
-- the equivalence holds, and the database accepts half a body. The test named
-- "refuses half a purge" caught exactly that.
ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_purged_has_no_content"
  CHECK (
    (
      "purgedAt" IS NOT NULL
      AND "ciphertext" IS NULL AND "nonce" IS NULL
      AND "keyVersion" IS NULL AND "payloadHash" IS NULL
    )
    OR (
      "purgedAt" IS NULL
      AND "ciphertext" IS NOT NULL AND "nonce" IS NOT NULL
      AND "keyVersion" IS NOT NULL AND "payloadHash" IS NOT NULL
    )
  );

-- ── 4 · an agreement is never purged ───────────────────────────────────────
--
-- The approved policy in the one place it cannot be forgotten. Both people
-- confirmed this text; deleting one account does not destroy the other's copy
-- of what they agreed. A future edit that tried to purge an AGREED artifact —
-- in the service, in a script, by hand — is refused by the database.
ALTER TABLE "CircleArtifact"
  ADD CONSTRAINT "CircleArtifact_agreed_is_never_purged"
  CHECK (NOT ("status" = 'AGREED' AND "purgedAt" IS NOT NULL));
