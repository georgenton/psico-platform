#!/usr/bin/env node
/**
 * PR-0.1 — legacy data hygiene.
 *
 * The consent gate (Fase D / L4) landed AFTER some users had already produced
 * `DiaryTextFeature` rows. `localTextAnalysis` now defaults to false, so those
 * users have derived numeric data on disk that they never consented to under the
 * new policy — and, because they never opted in, `compute()` no longer reads
 * their features anyway. The rows are inert but they should not exist.
 *
 * This script does, once, what a revocation does continuously: for every user
 * with `DiaryTextFeature` rows but `localTextAnalysis != true`, delete both
 * derivatives and bump the privacy revision — the exact same three writes as
 * `UsersService.updatePrivacy(false)`, so the invariant is identical.
 *
 *   node apps/api/scripts/legacy-text-analysis-hygiene.mjs            # DRY RUN
 *   node apps/api/scripts/legacy-text-analysis-hygiene.mjs --apply    # execute
 *
 * DRY RUN is the default and it writes NOTHING. It reports only AGGREGATE
 * COUNTS — how many users are affected, how many feature rows and snapshots
 * would go. It never prints a userId, an email, or any row content: the whole
 * point of this cleanup is privacy, and a log that leaked identifiers would
 * defeat it.
 *
 * `--apply` performs each user's cleanup in its OWN transaction that takes the
 * same exclusive lock on the User row (`FOR UPDATE`) the live revocation takes,
 * so it cannot race a concurrent text-feature upload or snapshot write.
 *
 * Requires DATABASE_URL in the environment. Run it against the deployed database
 * from a trusted shell — never commit its output.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(
    `\n[legacy-text-analysis-hygiene] mode=${APPLY ? "APPLY" : "DRY RUN"}\n`,
  );

  // Candidate set: has feature rows AND has not opted in. A missing
  // PrivacySettings row reads as "not opted in" (default false), so those users
  // are included — which is correct, they never consented.
  const candidates = await prisma.$queryRaw`
    SELECT dtf."userId" AS "userId",
           COUNT(*)::int AS "featureCount"
    FROM "DiaryTextFeature" dtf
    LEFT JOIN "PrivacySettings" ps ON ps."userId" = dtf."userId"
    WHERE COALESCE(ps."localTextAnalysis", false) <> true
    GROUP BY dtf."userId"
  `;

  if (candidates.length === 0) {
    console.log("Nothing to clean: no users have features without consent.\n");
    return;
  }

  // Aggregate the blast radius WITHOUT naming anyone.
  let totalFeatures = 0;
  const userIds = [];
  for (const row of candidates) {
    totalFeatures += row.featureCount;
    userIds.push(row.userId);
  }
  const snapshotCount = await prisma.emotionalMapSnapshot.count({
    where: { userId: { in: userIds } },
  });

  console.log("Aggregate counts only (no identifiers):");
  console.log(`  users affected ............ ${candidates.length}`);
  console.log(`  DiaryTextFeature rows ..... ${totalFeatures}`);
  console.log(`  EmotionalMapSnapshot rows . ${snapshotCount}`);

  if (!APPLY) {
    console.log(
      "\nDRY RUN — nothing was written. Re-run with --apply to execute.\n",
    );
    return;
  }

  let usersCleaned = 0;
  let featuresDeleted = 0;
  let snapshotsDeleted = 0;
  let revisionsBumped = 0;

  for (const { userId } of candidates) {
    await prisma.$transaction(async (tx) => {
      // Same barrier as the live revocation: no in-flight writer can land a row
      // on the far side of this deletion.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Re-check under the lock: a user may have opted in between the scan and
      // now. If they did, leave them alone.
      const ps = await tx.privacySettings.findUnique({
        where: { userId },
        select: { localTextAnalysis: true },
      });
      if (ps?.localTextAnalysis === true) return;

      const f = await tx.diaryTextFeature.deleteMany({ where: { userId } });
      const s = await tx.emotionalMapSnapshot.deleteMany({ where: { userId } });
      await tx.privacySettings.upsert({
        where: { userId },
        create: { userId, emotionalMapPrivacyRevision: 1 },
        update: { emotionalMapPrivacyRevision: { increment: 1 } },
      });

      usersCleaned += 1;
      featuresDeleted += f.count;
      snapshotsDeleted += s.count;
      revisionsBumped += 1;
    });
  }

  console.log("\nApplied (aggregate counts only):");
  console.log(`  users cleaned ............. ${usersCleaned}`);
  console.log(`  features deleted .......... ${featuresDeleted}`);
  console.log(`  snapshots deleted ......... ${snapshotsDeleted}`);
  console.log(`  revisions bumped .......... ${revisionsBumped}`);
  console.log(
    "\nThe live map cache clears on its own TTL; each user's revision moved,\n" +
      "so any request that begins after this cannot be served the old map.\n",
  );
}

main()
  .catch((err) => {
    console.error("[legacy-text-analysis-hygiene] failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
