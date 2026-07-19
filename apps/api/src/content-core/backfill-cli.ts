import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  applyTargetedBackfill,
  assertBackfillAllowed,
  dryRunTargetedBackfill,
  parseRunnerArgs,
  serializeDryRunReport,
} from "./backfill-runner";

/**
 * Content Core — CC-6F targeted backfill CLI.
 *
 *   node dist/content-core/backfill-cli.js --book-slug=<slug>            # dry-run (default)
 *   node dist/content-core/backfill-cli.js --book-slug=<slug> --apply    # real backfill
 *
 * Production apply additionally requires ALLOW_CONTENT_CORE_BACKFILL=on.
 * stdout carries METRICS ONLY — never block text, titles, emails, ids or
 * quotes. Exit codes: 0 ok · 1 refused/failed.
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
    // Refuse an unsafe apply up front: same drift check the library enforces,
    // but surfaced as metrics BEFORE any transaction starts.
    const pre = await dryRunTargetedBackfill(prisma, args.bookSlug);
    if (!pre.backfill_safe) {
      console.log("mode=apply-refused");
      console.log(serializeDryRunReport(pre));
      process.exitCode = 1;
      return;
    }
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
    // Errors are surfaced by their machine-readable message ONLY (no stack
    // with paths, no payloads).
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    console.error(`error=${msg}`);
    process.exit(1);
  });
}
