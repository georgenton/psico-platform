import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  ACTIVATION_INPUT_INVALID,
  activateBookLearningCatalog,
  assertLearningActivationAllowed,
  planBookLearningActivation,
  sanitizeActivationError,
  serializeActivationPlan,
} from "./learning-activation";

/**
 * Content Core — learning activation CLI.
 *
 *   node dist/content-core/learning-activation-cli.js --book-slug=<slug>
 *   node dist/content-core/learning-activation-cli.js --book-slug=<slug> --apply
 *
 * Dry-run is the default and writes nothing, ever. An apply on a deployed box
 * additionally requires ALLOW_BOOK_LEARNING_ACTIVATION=on, which the CLI never
 * persists — it must be supplied for that single invocation.
 *
 * stdout carries METRICS ONLY: never a question, an option, the correct answer,
 * a chapter title or a fragment of the manuscript. Errors surface exclusively
 * as a whitelisted machine code.
 * Exit codes: 0 ok · 1 refused/failed.
 */

export interface ActivationArgs {
  bookSlug: string;
  apply: boolean;
}

export function parseActivationArgs(argv: string[]): ActivationArgs {
  let bookSlug = "";
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
    else if (a.startsWith("--book-slug=")) bookSlug = a.slice(12);
    else if (a === "--book-slug") bookSlug = argv[++i] ?? "";
    // Anything else is rejected rather than ignored: a typo'd flag must not
    // silently downgrade an intended apply into a dry-run.
    else throw new Error(ACTIVATION_INPUT_INVALID);
  }
  if (!bookSlug.trim()) throw new Error(ACTIVATION_INPUT_INVALID);
  return { bookSlug, apply };
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
async function main(): Promise<void> {
  const args = parseActivationArgs(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MISSING_DATABASE_URL");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const plan = await planBookLearningActivation(prisma, args.bookSlug);

    if (!args.apply) {
      console.log("mode=dry-run");
      console.log(serializeActivationPlan(plan));
      return;
    }

    // Refuse an unsafe apply up front, showing the SAME inspection the dry-run
    // prints — surfaced as metrics BEFORE any transaction starts.
    assertLearningActivationAllowed(process.env);
    if (!plan.activation_safe) {
      console.log("mode=apply-refused");
      console.log(serializeActivationPlan(plan));
      process.exitCode = 1;
      return;
    }

    const stats = await activateBookLearningCatalog(prisma, args.bookSlug);
    console.log("mode=apply");
    for (const [k, v] of Object.entries(stats)) console.log(`stats_${k}=${v}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
if (require.main === module) {
  main().catch((err: unknown) => {
    // NEVER the raw message: only a whitelisted machine code reaches output.
    console.error(`error=${sanitizeActivationError(err)}`);
    process.exit(1);
  });
}
