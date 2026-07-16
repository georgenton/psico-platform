#!/usr/bin/env node
/**
 * PR-2B — WeeklySummary hygiene.
 *
 * `WeeklySummary` rows persisted BEFORE PR-2B were built from the old
 * aggregation, which could count a raw/ambiguous mood or fall back to a
 * fabricated "calma" when a week had no explicit check-ins. PR-2B fixed the
 * aggregation (consumers now read only the server-vouched `effectiveMood`), but
 * it does NOT regenerate historical rows automatically — Patrones and the weekly
 * digest can still SERVE a stale summary until it is overwritten.
 *
 * This script DELETES the `WeeklySummary` rows so no stale summary is served.
 *
 * ⚠️ It is a LOSS, not a rebuild — read carefully:
 *   - The existing summaries are deleted.
 *   - They are NOT reconstructed retroactively. `regenerateWeeklySummary` (the
 *     Sunday cron in S46, or the manual "Regenerar" button) only ever produces
 *     the CURRENT week's summary — it never backfills past weeks.
 *   - So subsequent runs produce NEW summaries from that moment forward; the
 *     historical editorial narratives are gone for good.
 *   - Running `--apply` therefore means ACCEPTING the loss of the previously
 *     derived history. PR-2B does NOT build a historical backfill.
 *
 *   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs            # DRY RUN
 *   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs --apply    # execute
 *
 * OUTPUT — stdout carries EXACTLY ONE LINE and nothing else:
 *   dry-run:  weekly_summaries_found=<n>
 *   apply:    weekly_summaries_deleted=<n>
 * No banner, no verbose mode, and NEVER a userId, email, headline, or narrative.
 * Any error goes to STDERR. `--apply` is idempotent — a second run deletes 0.
 *
 * Requires DATABASE_URL. Run it against the deployed database from a trusted
 * shell (per the runbook, with the worker paused so the cron can't create a new
 * summary that this hygiene would immediately delete).
 */

import { pathToFileURL } from "node:url";

/**
 * Core logic, extracted so it can be unit-tested with a Prisma mock. It ONLY
 * counts / deletes — it never selects or logs row content, and it never
 * regenerates (no create/upsert): the deletion is a loss, not a rebuild.
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
  // Blanket delete. NOTHING here rebuilds the rows — `regenerateWeeklySummary`
  // only produces the current week, so the historical summaries are lost until
  // new runs regenerate forward. deleteMany is idempotent: a second run → 0.
  const { count } = await prisma.weeklySummary.deleteMany({});
  log(`weekly_summaries_deleted=${count}`);
  return { deleted: count };
}

// ─── CLI bootstrap — only when invoked directly, never on import ─────────────
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  // The url check runs BEFORE importing Prisma so an error path loads nothing
  // and touches stdout with nothing — errors go to stderr only.
  const APPLY = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    // The helper's single count line is the ONLY thing written to stdout.
    await runWeeklySummaryHygiene({ prisma, apply: APPLY });
  } catch (err) {
    console.error("[pr2b-weekly-summary-hygiene] failed:", err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
