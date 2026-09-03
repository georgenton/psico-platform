import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import type { ChapterExperienceDefinition } from "@psico/types";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import { ExperienceAdminService } from "./experience-admin.service";
import { seedPracticeHeadings } from "../content-core/test-support/seed-practice-headings";

/**
 * C.3C+C.4 (#639) — can the binary being REPLACED still operate on the schema
 * this PR ships?
 *
 * ── Why the V2 service cannot answer this ───────────────────────────────────
 *
 * The rolling deploy puts the new migrations in place BEFORE the new binary
 * finishes rolling: for a window measured in minutes, V1 replicas serve editors
 * against a schema with `contentUnitId NOT NULL`, a CHECK naming ARCHIVED, and
 * rows whose status is a value V1 has never heard of. If V1 cannot write there,
 * the deploy is an outage; if it can write there WRONGLY, it is worse.
 *
 * Exercising the current service and calling it "V1" would prove nothing at
 * all — it is the code this PR changed. So the artefact under test is the real
 * one: the `experience` module exactly as it stands at the tip of PR-A,
 * materialised out of git and loaded beside the current build. Its relative
 * imports resolve to its own copies; `../prisma`, `../guide`, `../content-core`
 * resolve to the shared tree, which is what production would give it too.
 *
 * ── Finding PR-A's tip without a branch ref ─────────────────────────────────
 *
 * Not `origin/feat/...`: a branch name is a moving label and a CI checkout may
 * not have the ref. The commit that ADDS this PR's first migration is unique in
 * the history, and its parent is PR-A's tip by construction. That survives
 * rebases, renames and squashes of everything around it.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3c_experience_v1_compat_db";

/** A dot-directory: TypeScript's `src/**` glob, ESLint and vitest all skip it. */
const V1_DIR = join(API_DIR, "src", ".v1-artifact");
const MARKER_MIGRATION =
  "apps/api/prisma/migrations/20260820010000_c3c_experience_archived_status/migration.sql";

const BOOK = "emociones-en-construccion";
const HEADING = EXERCISE_INGESTION_CATALOG[BOOK][0].practice.sourceHeading;
/**
 * The OTHER book, and it is not scenery.
 *
 * A shipped definition is placed by resolving its guide's catalog targets to a
 * unit, and the whole set is resolved together — so a build whose Parejas
 * definition cannot be placed refuses binding writes in EVERY chapter, not only
 * that one. A fixture with a single book therefore describes an environment
 * production is not, and this gate would fail for a reason that has nothing to
 * do with V1 compatibility.
 */
const BOOK_B = "parejas-que-perduran";
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;

/**
 * Git, from the repository root.
 *
 * Pathspecs are relative to the working directory, and every path here is
 * written from the root — running from `apps/api` would silently match nothing
 * and turn the gate into a confusing failure about history.
 */
const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: API_DIR,
  encoding: "utf8",
}).trim();

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

function barrier() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  return { gate, open, reached, arrive };
}

/**
 * PR-A's tip, derived from the history rather than from a ref.
 *
 * Throws rather than skipping. A compatibility gate that quietly does nothing
 * when it cannot find its subject reads as coverage and is worse than absent.
 */
function resolveV1Sha(): string {
  const adds = git([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--",
    MARKER_MIGRATION,
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (adds.length !== 1) {
    throw new Error(
      `expected exactly one commit adding ${MARKER_MIGRATION}, found ${adds.length}`,
    );
  }
  return git(["rev-parse", `${adds[0]}^`]).trim();
}

/** Write PR-A's `experience` module into a directory the toolchain ignores. */
function materialiseV1(sha: string): void {
  rmSync(V1_DIR, { recursive: true, force: true });
  mkdirSync(V1_DIR, { recursive: true });
  const files = git(["ls-tree", "--name-only", sha, "apps/api/src/experience/"])
    .trim()
    .split("\n")
    .filter(Boolean)
    // Its own tests are not the artefact, and leaving them here would enrol
    // PR-A's suites into this run against the same disposable databases.
    .filter((f) => !/\.(spec|pg-spec|e2e-spec)\.ts$/.test(f))
    .filter((f) => f.endsWith(".ts"));
  if (files.length === 0) throw new Error("no V1 sources found");
  for (const file of files) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    // Depth is preserved (`src/.v1-artifact/x.ts` sits where `src/experience/x.ts`
    // did), so `../prisma` and friends resolve to the shared tree unchanged.
    writeFileSync(join(V1_DIR, name), git(["show", `${sha}:${file}`]), "utf8");
  }
}

interface V1Service {
  listForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<{
    contentUnitId: string | null;
    experiences: Array<{
      experienceKey: string;
      experienceVersion: number;
      status: string;
      source: string;
    }>;
  }>;
  createDraft(
    userId: string,
    input: ChapterExperienceDefinition,
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }>;
  saveDraft(
    id: string,
    input: ChapterExperienceDefinition,
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }>;
  publish(id: string): Promise<{ id: string; publishedAt: string }>;
}

suite("C.3C · the previous binary, on the schema this PR ships", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let v1: V1Service;
  let v1Protocol: string;
  let v2: ExperienceAdminService;
  let userId: string;
  let unit: string;

  async function eecDraft(
    over: Partial<ChapterExperienceDefinition> = {},
  ): Promise<ChapterExperienceDefinition> {
    const def = await productionExperienceRepository.getExact({
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });
    if (!def) throw new Error("fixture missing: EEC v1");
    return { ...def, status: "DRAFT", ...over };
  }

  beforeAll(async () => {
    materialiseV1(resolveV1Sha());
    const v1Module = (await import(
      /* @vite-ignore */ join(V1_DIR, "experience-admin.service.ts")
    )) as { ExperienceAdminService: new (p: PrismaService) => V1Service };
    const v1Lock = (await import(
      /* @vite-ignore */ join(V1_DIR, "experience-binding-lock.ts")
    )) as { EXPERIENCE_BINDING_PROTOCOL: string };
    v1Protocol = v1Lock.EXPERIENCE_BINDING_PROTOCOL;

    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    // Every migration, this PR's two included. This is the schema a V1 replica
    // meets during the rolling deploy.
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
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
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order, title: `C${order}`, isPublished: true },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Intro.",
        },
      });
      await prisma.chapterBlock.create({
        data: { chapterId: ch.id, order: 1, kind: "HEADING", content: heading },
      });
    }
    // El catálogo de ejercicios ancla cada práctica a un encabezado editorial.
    // Se siembran desde el propio catálogo para que añadir una microguía no
    // rompa un fixture que no tiene nada que ver con ella.
    for (const ch of await prisma.chapter.findMany({
      select: { id: true, bookId: true },
    })) {
      const b = await prisma.book.findUnique({
        where: { id: ch.bookId },
        select: { slug: true },
      });
      if (b) await seedPracticeHeadings(prisma, ch.id, b.slug);
    }
    await backfillContentCore(prisma);

    const u = await prisma.user.create({
      data: { email: "c3c-v1-compat@example.test", name: "CMS", plan: "FREE" },
    });
    userId = u.id;
    v1 = new v1Module.ExperienceAdminService(
      prisma as unknown as PrismaService,
    );
    v2 = new ExperienceAdminService(prisma as unknown as PrismaService);

    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: BOOK },
      select: { publishedRevisionId: true },
    });
    const placed = await prisma.revisionUnit.findFirstOrThrow({
      where: { revisionId: edition.publishedRevisionId!, order: 1 },
      select: { unitId: true },
    });
    unit = placed.unitId;
  }, 240_000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* the drop below is what matters */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
    rmSync(V1_DIR, { recursive: true, force: true });
  }, 240_000);

  beforeEach(async () => {
    await prisma.chapterExperienceVersion.deleteMany();
    await prisma.experienceGuideReservation.deleteMany();
  });

  it("the artefact really is the OTHER binary", async () => {
    // If this ever equals the current protocol, the gate has quietly started
    // testing this PR against itself.
    expect(v1Protocol).toBe("experience-binding-bridge-v1");
    const { EXPERIENCE_BINDING_PROTOCOL } =
      await import("./experience-binding-lock");
    expect(EXPERIENCE_BINDING_PROTOCOL).toBe("experience-binding-v2");
    expect(v1Protocol).not.toBe(EXPERIENCE_BINDING_PROTOCOL);
  });

  it("V1 can create, save and publish against the cutover schema", async () => {
    const created = await v1.createDraft(userId, await eecDraft());
    await v1.saveDraft(created.id, await eecDraft());
    const published = await v1.publish(created.id);
    expect(published.publishedAt).toBeTruthy();

    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, contentUnitId: true, guideKey: true },
    });
    // The CHECK requires both columns on a reserving row, so V1 writing them is
    // not incidental — the write would have been rejected otherwise.
    expect(row).toEqual({
      status: "PUBLISHED",
      contentUnitId: unit,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
    });
    const reservations = await prisma.experienceGuideReservation.findMany();
    expect(reservations).toHaveLength(1);
  });

  it("V1 lists an ARCHIVED row as ARCHIVED, and refuses to touch it", async () => {
    // Archived through the V2 path — the one that exists — then read and poked
    // by a binary that has never heard the word.
    const created = await v2.createDraft(userId, await eecDraft(), unit);
    await v2.archiveDraft(created.id);

    const listed = await v1.listForChapter(BOOK, 1);
    const row = listed.experiences.find((e) => e.source === "database");
    expect(row?.status).toBe("ARCHIVED");

    // Not editable. The old guard was "not PUBLISHED", which would have let an
    // archived row through; C.3A made it require DRAFT positively, and this is
    // where that pays.
    await expect(
      v1.saveDraft(created.id, await eecDraft()),
    ).rejects.toMatchObject({
      response: { code: "EXPERIENCE_VERSION_NOT_DRAFT" },
    });
    await expect(v1.publish(created.id)).rejects.toMatchObject({
      response: { code: "EXPERIENCE_VERSION_NOT_DRAFT" },
    });

    const after = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, guideKey: true, contentUnitId: true },
    });
    expect(after).toEqual({
      status: "ARCHIVED",
      guideKey: null,
      contentUnitId: unit,
    });
  });

  it("V1 can take the guide an archived V2 row gave back", async () => {
    // The end-to-end point of archiving. If the release were only a service
    // promise, this would fail on the reservation's unique index.
    //
    // Same lineage, next version — not a new key. In THIS chapter the guide is
    // also claimed by a definition the build ships, so no other lineage may
    // ever hold it; a test that used a fresh key would be asserting the
    // code-owned collision rather than the release. (Verified: it fails with
    // EXPERIENCE_GUIDE_BINDING_RESERVED, which is that rule working.)
    const first = await v2.createDraft(userId, await eecDraft(), unit);
    await v2.archiveDraft(first.id);
    expect(await prisma.experienceGuideReservation.count()).toBe(0);

    const second = await v1.createDraft(
      userId,
      await eecDraft({ experienceVersion: 2 }),
    );
    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: second.id },
      select: { guideKey: true, experienceVersion: true },
    });
    expect(row).toEqual({
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 2,
    });
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("a fresh lineage still cannot take a guide the build SHIPS", async () => {
    // The other half of the rule above, asserted rather than assumed: archiving
    // gives back the RESERVATION, not the code-owned claim behind it.
    const first = await v2.createDraft(userId, await eecDraft(), unit);
    await v2.archiveDraft(first.id);
    await expect(
      v1.createDraft(userId, await eecDraft({ experienceKey: "eec-c1-otra" })),
    ).rejects.toMatchObject({
      response: { code: "EXPERIENCE_GUIDE_BINDING_RESERVED" },
    });
  });

  // ── The mixed fleet, with real commands on both sides ────────────────────

  it("a V1 create and a V2 create for the same guide: exactly one wins", async () => {
    // Not two hand-taken locks. Two real editorial commands, one from each
    // binary, racing for the one guide this chapter has. They are safe together
    // for exactly one reason — the chapter key is byte-identical — and this is
    // the assertion that reason is true rather than commented.
    const b = barrier();
    const holder = prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`experience:binding:chapter:${unit}`}, 42))`;
        b.arrive();
        await b.gate;
      })
      .catch(() => undefined);

    await b.reached;
    const fromV1 = v1
      .createDraft(userId, await eecDraft())
      .then(() => "v1" as const)
      .catch(() => "v1-failed" as const);
    const fromV2 = v2
      .createDraft(
        userId,
        await eecDraft({ experienceKey: "eec-c1-otra" }),
        unit,
      )
      .then(() => "v2" as const)
      .catch(() => "v2-failed" as const);

    b.open();
    await holder;
    const outcome = await Promise.all([fromV1, fromV2]);

    // One of them took the guide; the other was refused by the bijection.
    expect(outcome.filter((o) => !o.endsWith("failed"))).toHaveLength(1);
    const reservations = await prisma.experienceGuideReservation.findMany({
      select: { guideKey: true },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.guideKey).toBe("eec-c1-cuerpo-antes-que-mente");
  });

  it("a V1 publish and a V2 archive of the same lineage serialise", async () => {
    // The pair that would corrupt: publishing re-reserves, archiving releases.
    // Whichever commits first, the other must see its result — never a
    // published row with no reservation, or an archived one still holding.
    const created = await v1.createDraft(userId, await eecDraft());

    const results = await Promise.allSettled([
      v1.publish(created.id),
      v2.archiveDraft(created.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, guideKey: true, contentUnitId: true },
    });
    const reservations = await prisma.experienceGuideReservation.count();
    if (row.status === "PUBLISHED") {
      expect(row.guideKey).toBe("eec-c1-cuerpo-antes-que-mente");
      expect(reservations).toBe(1);
    } else {
      expect(row.status).toBe("ARCHIVED");
      expect(row.guideKey).toBeNull();
      expect(reservations).toBe(0);
    }
    // Either way the identity survived.
    expect(row.contentUnitId).toBe(unit);
  });
});
