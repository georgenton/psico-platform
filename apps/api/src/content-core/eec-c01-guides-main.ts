import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveEnvironment } from "../shared/psico-environment";
import { flagEnabled, type FlagName } from "../shared/flags";
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
 * `--chapter=C02` runs the same commands over the second chapter's suite. The
 * module keeps its C01 name because the deployed container invokes it by path
 * and the ops runbooks for the pilot cite it; what it serves is any EEC
 * chapter listed in `CHAPTERS` below.
 *
 * Dry-run is the default everywhere. A deployed box additionally requires
 * `--environment=production --confirm-production-draft`, so nothing writes to
 * production because a script was run in the wrong terminal.
 *
 * Exit codes: 0 ok · 1 refused or failed · 2 drift found · 3 partial apply.
 * They are distinct because the remedies are: 2 needs somebody to look at a
 * conflict, 3 needs the same command run again.
 */

const ROOT = join(process.cwd(), "../..");

/**
 * Which chapter's suite this run is about.
 *
 * The commands were written for C01 and are chapter-agnostic in everything but
 * these three facts, so C02 needed a row here rather than a second CLI. The
 * flag is per chapter because it gates a route: C01 has one
 * (`EEC_C01_GUIDED_SUITE_V1`), C02 has none yet — its five are DRAFT and the
 * chapter is not in the discovery catalog, so "the route is dark" is
 * structural rather than switchable.
 */
const CHAPTERS = {
  C01: {
    manifestDir: "artifacts/eec/C01/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C01/chapter.md",
    flag: "EEC_C01_GUIDED_SUITE_V1" as FlagName | null,
  },
  C02: {
    manifestDir: "artifacts/eec/C02/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C02/chapter.md",
    flag: null as FlagName | null,
  },
  // C03–C10 · the forty guided readings (`APROBAR ARQUITECTURA C03-C10`,
  // 2026-09-04). Eight rows, no flags: like C02, the five ship as DRAFT and the
  // chapter is absent from the discovery catalog, so the route is dark by
  // construction rather than by a switch somebody could flip early.
  C03: {
    manifestDir: "artifacts/eec/C03/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C03/chapter.md",
    flag: null as FlagName | null,
  },
  C04: {
    manifestDir: "artifacts/eec/C04/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C04/chapter.md",
    flag: null as FlagName | null,
  },
  C05: {
    manifestDir: "artifacts/eec/C05/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C05/chapter.md",
    flag: null as FlagName | null,
  },
  // C06 closed at v1.1 — its artifacts live under that version, not v1.0.
  C06: {
    manifestDir: "artifacts/eec/C06/v1.1/feelverse/guides",
    chapterMd: "content/books/eec/C06/chapter.md",
    flag: null as FlagName | null,
  },
  C07: {
    manifestDir: "artifacts/eec/C07/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C07/chapter.md",
    flag: null as FlagName | null,
  },
  C08: {
    manifestDir: "artifacts/eec/C08/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C08/chapter.md",
    flag: null as FlagName | null,
  },
  C09: {
    manifestDir: "artifacts/eec/C09/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C09/chapter.md",
    flag: null as FlagName | null,
  },
  C10: {
    manifestDir: "artifacts/eec/C10/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C10/chapter.md",
    flag: null as FlagName | null,
  },
} as const;

export type ChapterCode = keyof typeof CHAPTERS;

export function isChapterCode(value: string): value is ChapterCode {
  return Object.prototype.hasOwnProperty.call(CHAPTERS, value);
}

export interface CliArgs {
  command: string;
  chapter: ChapterCode;
  apply: boolean;
  environment: string | null;
  confirmProductionDraft: boolean;
  /** Only ever meaningful off a deployed box; see `publishTestSuite`. */
  confirmNonProductionPublish: boolean;
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
  const chapter = get("chapter") ?? "C01";
  if (!isChapterCode(chapter)) {
    throw new EecGuidesCliError(
      "EEC_GUIDES_UNKNOWN_CHAPTER",
      `--chapter must be one of ${Object.keys(CHAPTERS).join(", ")}`,
    );
  }
  return {
    command,
    chapter,
    apply: argv.includes("--apply") && !argv.includes("--dry-run"),
    environment: get("environment"),
    confirmProductionDraft: argv.includes("--confirm-production-draft"),
    confirmNonProductionPublish: argv.includes(
      "--confirm-nonproduction-publish",
    ),
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
  const chapter = CHAPTERS[args.chapter];
  const manifests: GuideManifest[] = loadManifests(
    join(ROOT, chapter.manifestDir),
  );
  const canonical = sha256(readFileSync(join(ROOT, chapter.chapterMd), "utf8"));

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
        chapter.flag ? flagEnabled(chapter.flag) : false,
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
      runPublishTestSuite,
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
        // 3 is its own code: a partial apply is neither success nor drift, and
        // an operator scripting this has to be able to branch on it — the
        // remedy is to run the command again, not to investigate a conflict.
        if (r.outcome === "PARTIAL_APPLY") return 3;
        return r.ok ? 0 : r.drift ? 2 : 1;
      }
      // Publishing, for a throwaway environment only. `publishTestSuite`
      // refuses production and staging before it reads anything.
      case "publish-test-suite": {
        const r = await runPublishTestSuite(
          prisma,
          manifests,
          args.confirmNonProductionPublish,
        );
        console.log(
          JSON.stringify({ command: "publish-test-suite", ...r }, null, 2),
        );
        return r.ok ? 0 : 1;
      }
      case "verify-drafts": {
        const r = await runVerifyDrafts(prisma, manifests, chapter.flag);
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
          "usage: [--chapter=C01|C02] validate | plan | apply-targets | " +
            "create-drafts | publish-test-suite | verify-drafts | " +
            "preview-report",
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
