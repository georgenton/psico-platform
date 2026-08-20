import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import type { PrismaService } from "../prisma";

/**
 * C.3B (#639) — the LITERAL operator command, run as a process.
 *
 * Every other test of this CLI imports it. That is the right way to check
 * dispatch and disposal, and it is exactly the shape that let the original bug
 * ship: `new PrismaClient()` with no adapter threw at construction, and nothing
 * in any suite ever started the program.
 *
 * So this one spawns it the way an operator does — `pnpm --filter @psico/api
 * content:experience:reserve -- --measure` — against a disposable PostgreSQL,
 * and asserts on its exit code and stdout. If the client cannot be built, this
 * fails; no amount of source-reading can say the same.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3b_cli_literal_db";
const BOOK = "emociones-en-construccion";
const HEADING = EXERCISE_INGESTION_CATALOG[BOOK][0].practice.sourceHeading;
/**
 * The OTHER book, and it is load-bearing.
 *
 * Shipped claims are resolved as a SET: if the Parejas definition cannot be
 * placed, the run refuses in every chapter with EXPERIENCE_CODE_OWNED_UNRESOLVED
 * — which is the fail-closed rule working, and would make this gate fail for a
 * reason that has nothing to do with the CLI. A single-book fixture describes
 * an environment production is not.
 */
const BOOK_B = "parejas-que-perduran";
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("C.3B · the command an operator actually types", () => {
  let url: string;
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    url = withDatabase(base as string, DB);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "ignore",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    for (const [slug, title, heading, order] of [
      [BOOK, "Emociones en Construcción", HEADING, 1],
      [BOOK_B, "Parejas que Perduran", HEADING_B, 2],
    ] as const) {
      const book = await prisma.book.create({
        data: { slug, title, plan: "FREE" },
      });
      const chapter = await prisma.chapter.create({
        data: { bookId: book.id, order, title: `C${order}`, isPublished: true },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: chapter.id,
          order: 1,
          kind: "HEADING",
          content: heading,
        },
      });
    }
    await backfillContentCore(prisma as unknown as PrismaService, {
      bookSlugs: [BOOK, BOOK_B],
    });
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** Spawn it exactly as the runbook says, and never throw on a non-zero exit. */
  function run(args: string[]): {
    code: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execFileSync(
        "pnpm",
        ["--filter", "@psico/api", "content:experience:reserve", "--", ...args],
        {
          cwd: API_DIR,
          env: { ...process.env, DATABASE_URL: url },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { code: 0, stdout, stderr: "" };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return {
        code: err.status ?? -1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
      };
    }
  }

  it("`-- --measure` starts, builds a client with the adapter, measures and exits 0", () => {
    const r = run(["--measure"]);
    // The regression in one assertion: a client that cannot be constructed
    // never reaches the report.
    expect(r.stdout).not.toContain("PrismaClientInitializationError");
    expect(r.stdout + r.stderr).not.toContain("needs to be constructed");
    expect(r.stdout).toContain("EXPERIENCE_RESERVATION_BACKFILL=measured");
    expect(r.stdout).toContain("POSITION_USED_AS_IDENTITY=false");
    expect(r.stdout).toContain("ROWS_IDENTITY_FROM_GUIDE_CONTEXT=");
    // The retired counter is gone from the operator's output too.
    expect(r.stdout).not.toContain("ROWS_ADOPTING_CURRENT_POSITION");
    expect(r.code).toBe(0);
  }, 240_000);

  it("measuring writes nothing at all", async () => {
    run(["--measure"]);
    expect(await prisma.experienceGuideReservation.count()).toBe(0);
  }, 240_000);

  it("a bad flag exits 2 with usage, and never touches the database", () => {
    const r = run(["--sideways"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--measure | --apply");
    expect(r.stdout).not.toContain("EXPERIENCE_RESERVATION_BACKFILL");
  }, 240_000);

  it("asking for both at once is refused rather than guessed", () => {
    const r = run(["--measure", "--apply"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--measure | --apply");
  }, 240_000);

  it("a failure prints a CODE, never a stack trace or a connection string", () => {
    // Pointed at a database that is not there. What an operator must see is a
    // canonical code; what they must NOT see is a stack with absolute paths, a
    // driver message, or the URL they are connecting with.
    const gone = withDatabase(base as string, "c3b_cli_absent_db");
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      stdout = execFileSync(
        "pnpm",
        [
          "--filter",
          "@psico/api",
          "content:experience:reserve",
          "--",
          "--measure",
        ],
        {
          cwd: API_DIR,
          env: { ...process.env, DATABASE_URL: gone },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? -1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
    }
    const all = stdout + stderr;
    expect(code).not.toBe(0);
    expect(all).toMatch(/FAILED [A-Z][A-Z0-9_]+ — nothing was written\./);
    expect(all).not.toContain("postgresql://");
    expect(all).not.toContain("at processTicksAndRejections");
    expect(all).not.toContain("node_modules");
  }, 240_000);
});
