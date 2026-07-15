#!/usr/bin/env node
/**
 * PR-2B — WeeklySummary hygiene.
 *
 * `WeeklySummary` rows persisted BEFORE PR-2B were built from the old
 * aggregation, which could count a raw/ambiguous mood or fall back to a
 * fabricated "calma" when a week had no explicit check-ins. PR-2B fixed the
 * aggregation (consumers now read only the server-vouched `effectiveMood`), but
 * it does NOT regenerate historical rows automatically — Patrones and the weekly
 * digest can still SERVE a stale summary until the Sunday cron (S46) overwrites
 * it, or the user regenerates it by hand.
 *
 * This script wipes the `WeeklySummary` table so the next cron run rebuilds
 * every summary under the corrected rules. It is safe: the rows are derived
 * (regenerable), unique-keyed by (userId, weekStart), and the cron is idempotent.
 *
 *   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs            # DRY RUN
 *   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs --apply    # execute
 *
 * DRY RUN is the default and writes NOTHING — it prints a single aggregate line
 * `weekly_summaries_found=<n>`. `--apply` runs one `deleteMany` and prints
 * `weekly_summaries_deleted=<n>`. NEITHER path ever prints a userId, an email, a
 * headline, or a narrative: a hygiene log that leaked content would defeat the
 * point. `--apply` is idempotent — a second run deletes 0.
 *
 * Requires DATABASE_URL. Run it against the deployed database from a trusted
 * shell (per the runbook, right after the API + worker roll out).
 */

import { pathToFileURL } from "node:url";

/**
 * Core logic, extracted so it can be unit-tested with a Prisma mock. It only
 * ever touches counts — never selects or logs row content.
 *
 * @param {{ prisma: any, apply: boolean, log?: (msg: string) => void }} opts
 * @returns {Promise<{ found?: number, deleted?: number }>}
 */
export async function runWeeklySummaryHygiene({
  prisma,
  apply,
  log = console.log,
}) {
  if (!apply) {
    const found = await prisma.weeklySummary.count();
    log(`weekly_summaries_found=${found}`);
    return { found };
  }
  // Blanket delete — the Sunday cron (S46) rebuilds every eligible summary.
  // deleteMany is naturally idempotent: a second run reports deleted=0.
  const { count } = await prisma.weeklySummary.deleteMany({});
  log(`weekly_summaries_deleted=${count}`);
  return { deleted: count };
}

// ─── CLI bootstrap — only when invoked directly, never on import ─────────────
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");

  const APPLY = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  console.log(
    `\n[pr2b-weekly-summary-hygiene] mode=${APPLY ? "APPLY" : "DRY RUN"}\n`,
  );

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await runWeeklySummaryHygiene({ prisma, apply: APPLY });
    if (!APPLY) {
      console.log(
        "\nDRY RUN — nothing was written. Re-run with --apply to execute.\n",
      );
    }
  } catch (err) {
    console.error("[pr2b-weekly-summary-hygiene] failed:", err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
