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
  type LearningActivationPlan,
  type LearningActivationStats,
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
 * ORDER MATTERS: for an apply the authorization guard runs BEFORE the database
 * URL is read and before any connection is opened. An unauthorized operator
 * should be refused by the process, not by the database — opening a pool first
 * would mean an unauthorized run had already reached production infrastructure.
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

/** Everything the run touches outside itself, injectable so a test can prove
 * that an unauthorized apply never reaches the database. */
export interface ActivationCliDeps {
  env: NodeJS.ProcessEnv;
  /** Called ONLY after authorization passes for an apply. */
  connect: () => { prisma: PrismaClient; close: () => Promise<void> };
  plan: (
    prisma: PrismaClient,
    bookSlug: string,
  ) => Promise<LearningActivationPlan>;
  apply: (
    prisma: PrismaClient,
    bookSlug: string,
  ) => Promise<LearningActivationStats>;
  log: (line: string) => void;
}

export interface ActivationCliResult {
  mode: "dry-run" | "apply" | "apply-refused";
  exitCode: 0 | 1;
}

/**
 * The operational flow, free of process globals so it can be driven by spies.
 * Returns the outcome; throwing is reserved for genuine failures, which the
 * entrypoint sanitizes.
 */
export async function runActivationCli(
  argv: string[],
  deps: ActivationCliDeps,
): Promise<ActivationCliResult> {
  const args = parseActivationArgs(argv);

  // Refuse an unauthorized apply BEFORE reading DATABASE_URL or connecting.
  if (args.apply) assertLearningActivationAllowed(deps.env);

  const { prisma, close } = deps.connect();
  try {
    const plan = await deps.plan(prisma, args.bookSlug);

    if (!args.apply) {
      deps.log("mode=dry-run");
      deps.log(serializeActivationPlan(plan));
      return { mode: "dry-run", exitCode: 0 };
    }

    if (!plan.activation_safe) {
      deps.log("mode=apply-refused");
      deps.log(serializeActivationPlan(plan));
      return { mode: "apply-refused", exitCode: 1 };
    }

    const stats = await deps.apply(prisma, args.bookSlug);
    deps.log("mode=apply");
    for (const [k, v] of Object.entries(stats)) deps.log(`stats_${k}=${v}`);
    return { mode: "apply", exitCode: 0 };
  } finally {
    await close();
  }
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
function connectFromEnv(): {
  prisma: PrismaClient;
  close: () => Promise<void>;
} {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MISSING_DATABASE_URL");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    prisma,
    close: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
if (require.main === module) {
  runActivationCli(process.argv.slice(2), {
    env: process.env,
    connect: connectFromEnv,
    plan: planBookLearningActivation,
    apply: activateBookLearningCatalog,
    log: (line) => console.log(line),
  })
    .then((r) => {
      if (r.exitCode !== 0) process.exitCode = r.exitCode;
    })
    .catch((err: unknown) => {
      // NEVER the raw message: only a whitelisted machine code reaches output.
      console.error(`error=${sanitizeActivationError(err)}`);
      process.exit(1);
    });
}
