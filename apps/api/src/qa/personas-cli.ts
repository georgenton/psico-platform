/**
 * QA personas CLI.
 *
 *   node dist/qa/personas-cli.js                     # dry-run (default)
 *   node dist/qa/personas-cli.js --apply             # real write
 *   node dist/qa/personas-cli.js --apply --rotate-passwords
 *
 * Dry-run is the default and writes nothing, ever.
 *
 * The password is NOT optional and has no default:
 *
 *   QA_PERSONAS_PASSWORD='…'     at least 10 characters
 *
 * On a deployed box the run additionally requires the same explicit opt-in the
 * visual fixture asks for, and refuses outright when the canonical resolver
 * says the box is production or when the target database holds an account at a
 * routable domain. See `visual-fixture.ts` for those three barriers and
 * `personas.ts` for the fourth — the one that refuses to touch an account that
 * is not one of its own four.
 *
 *   ALLOW_QA_VISUAL_FIXTURE=on
 *
 * stdout carries counts, slugs and machine codes only — never an email address,
 * never a password, never a row.
 * Exit codes: 0 ok · 1 refused/failed.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { applyQaPersonas } from "./personas";
import { sanitizeFixtureError } from "./visual-fixture";

export function parsePersonasArgs(argv: string[]): {
  apply: boolean;
  rotatePasswords: boolean;
} {
  let apply = false;
  let rotatePasswords = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
    else if (a === "--rotate-passwords") rotatePasswords = true;
  }
  return { apply, rotatePasswords };
}

async function main(): Promise<number> {
  const { apply, rotatePasswords } = parsePersonasArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const report = await applyQaPersonas(prisma, { apply, rotatePasswords });
    console.log(JSON.stringify(report, null, 2));
    console.log(
      apply
        ? "QA_PERSONAS_APPLY=OK"
        : "QA_PERSONAS_DRY_RUN=OK (nothing written; pass --apply to write)",
    );
    return 0;
  } catch (err) {
    console.error(`QA_PERSONAS_REFUSED=${sanitizeFixtureError(err)}`);
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
