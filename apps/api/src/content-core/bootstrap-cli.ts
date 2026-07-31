import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  assertBookBootstrapAllowed,
  bootstrapBook,
  parseBookManifest,
  planBookBootstrap,
  sanitizeBootstrapError,
  serializeBootstrapPlan,
  type BootstrapChapter,
  type BootstrapInput,
} from "./bootstrap-book";
import { parseTestEditionChapter } from "./lib/test-edition-parser";

/**
 * Content Core — new-book bootstrap CLI (test editions).
 *
 *   node dist/content-core/bootstrap-cli.js --manifest=<path>           # dry-run (default)
 *   node dist/content-core/bootstrap-cli.js --manifest=<path> --apply   # real write
 *
 * An apply on a deployed box (production/staging via the canonical PSICO_ENV
 * resolver) additionally requires ALLOW_CONTENT_CORE_BOOK_INGEST=on.
 *
 * Dry-run is the default and writes nothing, ever. An existing slug fails closed:
 * this CLI has no delete and no overwrite path, so a mistaken re-run cannot
 * destroy an existing book's reader marks. Replacing a test edition with the
 * final master is `ingestUnitV2` per unit, not a re-run of this.
 *
 * stdout carries METRICS ONLY — never chapter text, quotes or titles. Errors
 * surface exclusively as a whitelisted machine code.
 * Exit codes: 0 ok · 1 refused/failed.
 */

export interface BootstrapArgs {
  manifestPath: string;
  apply: boolean;
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  let manifestPath = "";
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a.startsWith("--manifest=")) manifestPath = a.slice(11);
    else if (a === "--manifest") manifestPath = argv[++i] ?? "";
    else if (a === "--dry-run") apply = false;
  }
  if (!manifestPath) throw new Error("MISSING_MANIFEST");
  return { manifestPath, apply };
}

/**
 * Read the manifest and every chapter file it references. Chapter paths resolve
 * relative to the manifest, so a manifest travels with its sources.
 */
export function loadBootstrapInput(manifestPath: string): BootstrapInput {
  let rawText: string;
  try {
    rawText = readFileSync(manifestPath, "utf8");
  } catch {
    throw new Error("MISSING_MANIFEST");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("MANIFEST_INVALID");
  }

  const manifest = parseBookManifest(parsed);
  const base = dirname(resolve(manifestPath));

  const chapters: BootstrapChapter[] = manifest.chapters.map((c) => {
    const file = isAbsolute(c.file) ? c.file : resolve(base, c.file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      throw new Error("CHAPTER_FILE_UNREADABLE");
    }
    // A neutral placeholder, never an invented editorial title: when the source
    // carries no identifiable heading we say so plainly instead of pretending.
    const fallback = c.title ?? `Sección OCR de prueba ${c.order}`;
    const chapter = parseTestEditionChapter(source, fallback);
    return {
      order: c.order,
      title: c.title ?? chapter.title ?? fallback,
      blocks: chapter.blocks,
    };
  });

  return { manifest, chapters };
}

/* istanbul ignore next -- CLI entrypoint, exercised operationally */
async function main(): Promise<void> {
  const args = parseBootstrapArgs(process.argv.slice(2));
  const input = loadBootstrapInput(args.manifestPath);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MISSING_DATABASE_URL");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const plan = await planBookBootstrap(prisma, input);

    if (!args.apply) {
      console.log("mode=dry-run");
      console.log(serializeBootstrapPlan(plan));
      console.log("writes=0");
      return;
    }

    // Refuse an unsafe apply up front, with the SAME inspection the dry-run
    // prints — surfaced as metrics BEFORE any transaction starts.
    assertBookBootstrapAllowed(process.env);
    if (!plan.bootstrap_safe) {
      console.log("mode=apply-refused");
      console.log(serializeBootstrapPlan(plan));
      process.exitCode = 1;
      return;
    }

    const stats = await bootstrapBook(prisma, input);
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
    console.error(`error=${sanitizeBootstrapError(err)}`);
    process.exit(1);
  });
}
