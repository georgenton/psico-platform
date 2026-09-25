/**
 * QA visual fixture CLI.
 *
 *   node dist/qa/visual-fixture-cli.js            # dry-run (default)
 *   node dist/qa/visual-fixture-cli.js --apply    # real write
 *
 * Dry-run is the default and writes nothing, ever.
 *
 * On a deployed box the run additionally requires TWO explicit opt-ins:
 *
 *   ALLOW_QA_VISUAL_FIXTURE=on          this fixture
 *   ALLOW_CONTENT_CORE_BOOK_INGEST=on   the book bootstrap it calls
 *
 * and it refuses outright when the canonical resolver says the box is
 * production, or when the target database holds an account at a routable
 * domain. See `visual-fixture.ts` for the three barriers.
 *
 * stdout carries counts and machine codes only — never row contents, never an
 * email address, never a password.
 * Exit codes: 0 ok · 1 refused/failed.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { applyVisualFixture, sanitizeFixtureError } from "./visual-fixture";

export function parseFixtureArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
  }
  return { apply };
}

async function main(): Promise<number> {
  const { apply } = parseFixtureArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const report = await applyVisualFixture(prisma, { apply });
    console.log(JSON.stringify(report, null, 2));
    console.log(
      apply
        ? "QA_FIXTURE_APPLY=OK"
        : "QA_FIXTURE_DRY_RUN=OK (nothing written; pass --apply to write)",
    );
    return 0;
  } catch (err) {
    console.error(`QA_FIXTURE_REFUSED=${sanitizeFixtureError(err)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/* istanbul ignore next -- entrypoint */
if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}
