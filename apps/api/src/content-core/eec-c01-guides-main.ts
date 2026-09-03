import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveEnvironment } from "../shared/psico-environment";
import { flagEnabled } from "../shared/flags";
import {
  EecGuidesCliError,
  loadManifests,
  planGuides,
  validateManifests,
  type GuideManifest,
} from "./eec-c01-guides-cli";

/**
 * EEC-C01 guided suite — the operator's entry point.
 *
 *   node dist/content-core/eec-c01-guides-main.js validate
 *   node dist/content-core/eec-c01-guides-main.js plan
 *   node dist/content-core/eec-c01-guides-main.js apply-targets --apply
 *   node dist/content-core/eec-c01-guides-main.js create-drafts --apply
 *   node dist/content-core/eec-c01-guides-main.js verify-drafts
 *   node dist/content-core/eec-c01-guides-main.js preview-report
 *
 * Dry-run is the default everywhere. A deployed box additionally requires
 * `--environment=production --confirm-production-draft`, so nothing writes to
 * production because a script was run in the wrong terminal.
 *
 * Exit codes: 0 ok · 1 refused or failed · 2 drift found (a plan verdict, not a
 * crash — an operator scripting this needs to tell them apart).
 */

const ROOT = join(process.cwd(), "../..");
const MANIFEST_DIR = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");
const CHAPTER = join(ROOT, "content/books/eec/C01/chapter.md");

export interface CliArgs {
  command: string;
  apply: boolean;
  environment: string | null;
  confirmProductionDraft: boolean;
  out: string | null;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const command = argv.find((a) => !a.startsWith("-")) ?? "";
  const get = (name: string) =>
    argv
      .find((a) => a.startsWith(`--${name}=`))
      ?.split("=")
      .slice(1)
      .join("=") ?? null;
  return {
    command,
    apply: argv.includes("--apply") && !argv.includes("--dry-run"),
    environment: get("environment"),
    confirmProductionDraft: argv.includes("--confirm-production-draft"),
    out: get("out"),
  };
}

export const PRODUCTION_WRITE_REFUSED = "EEC_C01_PRODUCTION_WRITE_REFUSED";

/**
 * A write on a deployed box is a separate decision from running the command.
 *
 * Local and test boxes need nothing: their whole purpose is to be written to.
 * Production needs the environment named out loud AND the intent spelled — and
 * even then it may only create DRAFTs, because this phase does not publish.
 */
export function assertWriteAllowed(args: CliArgs): void {
  if (!args.apply) return;
  const env = resolveEnvironment();
  if (env !== "production" && env !== "staging") return;
  if (args.environment !== env || !args.confirmProductionDraft) {
    throw new EecGuidesCliError(
      PRODUCTION_WRITE_REFUSED,
      `on ${env} a write needs --environment=${env} --confirm-production-draft`,
    );
  }
}

const sha256 = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");

function openPrisma(): { prisma: PrismaClient; pool: Pool } {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}

/* c8 ignore start — process wiring */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const manifests: GuideManifest[] = loadManifests(MANIFEST_DIR);
  const canonical = sha256(readFileSync(CHAPTER, "utf8"));

  if (args.command === "validate") {
    const issues = validateManifests(manifests, canonical);
    console.log(
      JSON.stringify(
        {
          command: "validate",
          manifests: manifests.length,
          canonicalSha256: canonical,
          issues,
          ok: issues.length === 0,
        },
        null,
        2,
      ),
    );
    return issues.length === 0 ? 0 : 1;
  }

  assertWriteAllowed(args);
  const { prisma, pool } = openPrisma();
  try {
    if (args.command === "plan") {
      const plan = await planGuides(
        prisma,
        manifests,
        resolveEnvironment(),
        flagEnabled("EEC_C01_GUIDED_SUITE_V1"),
      );
      console.log(JSON.stringify({ command: "plan", ...plan }, null, 2));
      const drift = plan.drafts.some((d) => d.action === "DRIFT");
      const anchorsOk = plan.anchors.every(
        (a) => a.headingMatches === 1 && a.fingerprintMatches === 1,
      );
      if (!anchorsOk) return 1;
      // Off production the unit key legitimately differs — it is derived from
      // the legacy chapter's id, and a test database mints its own. On a
      // deployed box it does not: a mismatch there means the manifests were
      // written against another chapter, and planning "successfully" would
      // invite an apply that binds five drafts to the wrong unit.
      const env = resolveEnvironment();
      if (!plan.unitKeyMatches && (env === "production" || env === "staging")) {
        return 1;
      }
      return drift ? 2 : 0;
    }

    const {
      runApplyTargets,
      runCreateDrafts,
      runVerifyDrafts,
      runPreviewReport,
    } = await import("./eec-c01-guides-apply");

    switch (args.command) {
      case "apply-targets": {
        const r = await runApplyTargets(prisma, manifests, args.apply);
        console.log(
          JSON.stringify({ command: "apply-targets", ...r }, null, 2),
        );
        return r.ok ? 0 : 1;
      }
      case "create-drafts": {
        const r = await runCreateDrafts(prisma, manifests, args.apply);
        console.log(
          JSON.stringify({ command: "create-drafts", ...r }, null, 2),
        );
        return r.ok ? 0 : r.drift ? 2 : 1;
      }
      case "verify-drafts": {
        const r = await runVerifyDrafts(prisma, manifests);
        console.log(
          JSON.stringify({ command: "verify-drafts", ...r }, null, 2),
        );
        return r.ok ? 0 : 1;
      }
      case "preview-report": {
        const r = await runPreviewReport(prisma, manifests);
        const body = JSON.stringify(
          { command: "preview-report", ...r },
          null,
          2,
        );
        if (args.out) writeFileSync(args.out, body + "\n");
        console.log(body);
        return r.ok ? 0 : 1;
      }
      default:
        console.error(
          "usage: validate | plan | apply-targets | create-drafts | verify-drafts | preview-report",
        );
        return 1;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      // Codes only. A stack trace here would print connection strings.
      const e = err as EecGuidesCliError;
      console.error(
        e.code ? `${e.code}: ${e.message}` : String(e.message ?? e),
      );
      process.exit(1);
    });
}
/* c8 ignore stop */
