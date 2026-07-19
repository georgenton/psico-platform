import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  applyTargetedBackfill,
  assertBackfillAllowed,
  dryRunTargetedBackfill,
  parseRunnerArgs,
  sanitizeErrorCode,
  serializeDryRunReport,
} from "./backfill-runner";

/**
 * Content Core — CC-6F targeted backfill CLI.
 *
 *   node dist/content-core/backfill-cli.js --book-slug=<slug>            # dry-run (default)
 *   node dist/content-core/backfill-cli.js --book-slug=<slug> --apply    # real backfill
 *
 * An apply on a deployed box (production/staging via the canonical PSICO_ENV
 * resolver) additionally requires ALLOW_CONTENT_CORE_BACKFILL=on.
 *
 * ROLLBACK REGISTERS — before any apply the CLI records:
 *   previous_published_revision_id   (the Edition pointer to RESTORE on rollback)
 *   previous_main_sha                (the build to redeploy if this was the
 *                                     FIRST backfill, i.e. previous pointer null)
 * Rollback procedure: non-null previous pointer → restore it; null (first
 * backfill) → redeploy the recorded legacy-only build. Core rows stay inert
 * either way — never improvise deletes of Core data.
 *
 * stdout carries METRICS ONLY — never block text, titles, emails or quotes.
 * Errors surface exclusively as a whitelisted machine code
 * (BOOK_NOT_FOUND | BACKFILL_FORBIDDEN | BACKFILL_DRIFT_DETECTED |
 * MISSING_BOOK_SLUG; anything else → BACKFILL_INTERNAL_ERROR).
 * Exit codes: 0 ok · 1 refused/failed.
 */
async function main(): Promise<void> {
  const args = parseRunnerArgs(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MISSING_DATABASE_URL");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    if (!args.apply) {
      const report = await dryRunTargetedBackfill(prisma, args.bookSlug);
      console.log("mode=dry-run");
      console.log(serializeDryRunReport(report));
      return;
    }

    assertBackfillAllowed(process.env);
    // Refuse an unsafe apply up front: the SAME shared inspection the apply
    // enforces, surfaced as metrics BEFORE any transaction starts.
    const pre = await dryRunTargetedBackfill(prisma, args.bookSlug);
    if (!pre.backfill_safe) {
      console.log("mode=apply-refused");
      console.log(serializeDryRunReport(pre));
      process.exitCode = 1;
      return;
    }

    // Rollback registers — recorded BEFORE the apply mutates anything.
    const edition = await prisma.edition.findUnique({
      where: { editionKey: `${args.bookSlug}-1e` },
      select: { publishedRevisionId: true },
    });
    console.log(
      `previous_published_revision_id=${edition?.publishedRevisionId ?? "null"}`,
    );
    console.log(
      `previous_main_sha=${process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown"}`,
    );

    const stats = await applyTargetedBackfill(prisma, args.bookSlug);
    console.log("mode=apply");
    for (const [k, v] of Object.entries(stats)) console.log(`stats_${k}=${v}`);
    const post = await dryRunTargetedBackfill(prisma, args.bookSlug);
    console.log(`post_manifest_source=${post.current_manifest_source}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
if (require.main === module) {
  main().catch((err: unknown) => {
    // NEVER the raw message: only a whitelisted machine code reaches output.
    console.error(`error=${sanitizeErrorCode(err)}`);
    process.exit(1);
  });
}
