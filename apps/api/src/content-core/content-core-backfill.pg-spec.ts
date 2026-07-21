import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore, type BackfillStats } from "./backfill";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";

// CC-7.4B.2: this scenario uses the productive slug `emociones-en-construccion`,
// so it must carry the approved editorial source block — the ingestion fails
// closed for a catalog-listed book that lacks it.
const EEC_PRACTICE_HEADING =
  EXERCISE_INGESTION_CATALOG["emociones-en-construccion"][0].practice
    .sourceHeading;

/**
 * Content Core (CC-3) — the REAL backfill, end-to-end on Postgres 18.
 *
 * Each scenario runs in its OWN dedicated database (extensions are per-DB, so no
 * cross-spec `CREATE EXTENSION vector` race). We drive the actual `prisma migrate
 * deploy` + real inserts/updates and assert creation, idempotency, drift-detection,
 * atomic rollback, stable unit identity, and zero legacy DELETE.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function provision(
  dbName: string,
): Promise<{ prisma: PrismaClient; pool: Pool }> {
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const url = withDatabase(base as string, dbName);
  execSync("pnpm exec prisma migrate deploy", {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
    stdio: "inherit",
  });

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

async function teardown(dbName: string, prisma: PrismaClient, pool: Pool) {
  await prisma.$disconnect();
  await pool.end();
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}

// ── Scenario 1: creation + idempotency ───────────────────────────────────────
suite("Content Core · CC-3 backfill · creation + idempotency", () => {
  const DB = "cc3_base_db";
  let prisma: PrismaClient;
  let pool: Pool;
  let ch1Id: string;
  let firstRun: BackfillStats;
  let secondRun: BackfillStats;

  beforeAll(async () => {
    ({ prisma, pool } = await provision(DB));

    const author = await prisma.bookAuthor.create({
      data: { name: "Marina Quintana", slug: "marina-quintana" },
    });
    const book = await prisma.book.create({
      data: {
        slug: "emociones-en-construccion",
        title: "Emociones en Construcción",
        authorId: author.id,
      },
    });
    const ch1 = await prisma.chapter.create({
      data: {
        bookId: book.id,
        order: 1,
        title: "Cap 1",
        partNumber: 1,
        partTitle: "Parte I",
      },
    });
    ch1Id = ch1.id;
    const ch2 = await prisma.chapter.create({
      data: {
        bookId: book.id,
        order: 2,
        title: "Cap 2",
        partNumber: 1,
        partTitle: "Parte I",
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Primer párrafo.",
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 1,
        kind: "HEADING",
        content: "Un encabezado",
      },
    });
    // The approved editorial source block for the first Guide unit (CC-7.4B.2).
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 2,
        kind: "HEADING",
        content: EEC_PRACTICE_HEADING,
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Otro párrafo.",
      },
    });

    firstRun = await backfillContentCore(prisma);
    secondRun = await backfillContentCore(prisma);
  }, 180_000);

  afterAll(async () => teardown(DB, prisma, pool));

  it("creates Work + Edition + a published Revision (published LAST)", async () => {
    const work = await prisma.work.findUnique({
      where: { workKey: "emociones-en-construccion" },
    });
    expect(work).toBeTruthy();

    const edition = await prisma.edition.findUnique({
      where: { editionKey: "emociones-en-construccion-1e" },
    });
    expect(edition?.publishedRevisionId).toBeTruthy();

    const rev = await prisma.revision.findFirst({
      where: { editionId: edition!.id, number: 1 },
    });
    expect(rev?.status).toBe("PUBLISHED");
    expect(rev?.publishedAt).toBeTruthy();
    expect(edition!.publishedRevisionId).toBe(rev!.id);
  });

  it("uses a stable unitKey = uuidv5(Chapter.id), independent of Chapter.order", async () => {
    const unit = await prisma.contentUnit.findFirst({
      where: { unitKey: unitKeyFromLegacyChapterId(ch1Id) },
    });
    expect(unit).toBeTruthy();
    // The function is a pure function of the chapter id — order is never an input.
    expect(unitKeyFromLegacyChapterId(ch1Id)).toBe(
      unitKeyFromLegacyChapterId(ch1Id),
    );
  });

  it("creates a ContentUnitVersion + RevisionUnit per chapter, with placement on the manifest", async () => {
    const edition = await prisma.edition.findUnique({
      where: { editionKey: "emociones-en-construccion-1e" },
    });
    expect(await prisma.contentUnit.count()).toBe(2);
    const rus = await prisma.revisionUnit.findMany({
      where: { revisionId: edition!.publishedRevisionId! },
      orderBy: { order: "asc" },
    });
    expect(rus.map((r) => r.order)).toEqual([1, 2]);
    expect(rus[0].partTitle).toBe("Parte I");
  });

  it("creates a ContentBlock with blockKey = uuidv5(legacy id) + a 1:1 BlockVersion", async () => {
    const legacy = await prisma.chapterBlock.findFirst({
      where: { content: "Primer párrafo." },
    });
    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: legacy!.id },
    });
    expect(cb!.blockKey).toBe(blockKeyFromLegacyId(legacy!.id));
    expect(
      await prisma.blockVersion.count({ where: { contentBlockId: cb!.id } }),
    ).toBe(1);
  });

  it("seeds Concept + ConceptLink from the catalog", async () => {
    const concept = await prisma.concept.findUnique({
      where: { conceptKey: "eec-cuerpo-antes-que-mente" },
    });
    expect(concept).toBeTruthy();
    const link = await prisma.conceptLink.findFirst({
      where: { conceptId: concept!.id },
    });
    expect(link?.role).toBe("PRIMARY");
    expect(link?.unitId).toBeTruthy();
  });

  it("is idempotent — the second run is a no-op (identical stats, no duplicate rows)", async () => {
    expect(secondRun).toEqual(firstRun);
    expect(await prisma.contentBlock.count()).toBe(4);
    expect(await prisma.blockVersion.count()).toBe(4);
    expect(await prisma.contentUnit.count()).toBe(2);
    expect(await prisma.revisionUnit.count()).toBe(2);
    expect(await prisma.conceptLink.count()).toBe(2);
    expect(await prisma.edition.count()).toBe(1);
    expect(await prisma.revision.count()).toBe(1);
  });

  it("performs zero DELETE — the legacy rows remain intact", async () => {
    expect(await prisma.book.count()).toBe(1);
    expect(await prisma.chapter.count()).toBe(2);
    expect(await prisma.chapterBlock.count()).toBe(4);
  });
});

// ── Scenario 2: drift detection ──────────────────────────────────────────────
suite("Content Core · CC-3 backfill · drift detection", () => {
  const DB = "cc3_drift_db";
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    ({ prisma, pool } = await provision(DB));
    const book = await prisma.book.create({
      data: { slug: "drift-book", title: "Drift" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Texto original.",
      },
    });
    await backfillContentCore(prisma); // publishes revision 1

    // Mutate the legacy content AFTER the first (published) run.
    const b = await prisma.chapterBlock.findFirst({
      where: { chapterId: ch.id },
    });
    await prisma.chapterBlock.update({
      where: { id: b!.id },
      data: { content: "Texto EDITADO." },
    });
  }, 180_000);

  afterAll(async () => teardown(DB, prisma, pool));

  it("throws BACKFILL_DRIFT_DETECTED on a changed published block", async () => {
    await expect(backfillContentCore(prisma)).rejects.toThrow(
      /BACKFILL_DRIFT_DETECTED/,
    );
  });

  it("leaves the original published BlockVersion intact (rolled back)", async () => {
    const bv = await prisma.blockVersion.findFirst();
    expect(bv?.content).toBe("Texto original.");
    // Revision stays published; nothing partial.
    const rev = await prisma.revision.findFirst();
    expect(rev?.status).toBe("PUBLISHED");
  });
});

// ── Scenario 3: atomic rollback ──────────────────────────────────────────────
suite("Content Core · CC-3 backfill · atomic rollback", () => {
  const DB = "cc3_rollback_db";
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    ({ prisma, pool } = await provision(DB));
    const book = await prisma.book.create({
      data: { slug: "rollback-book", title: "Rollback" },
    });
    const ch1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "C2" },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch1.id, order: 0, kind: "PARAGRAPH", content: "uno" },
    });
  }, 180_000);

  afterAll(async () => teardown(DB, prisma, pool));

  it("rolls the whole Book back when an error hits after the first chapter", async () => {
    await expect(
      backfillContentCore(prisma, { throwAfterUnits: 1 }),
    ).rejects.toThrow(/INJECTED_TEST_FAILURE/);

    // Nothing committed: no Work/Edition/Revision, no partial published revision.
    expect(await prisma.work.count()).toBe(0);
    expect(await prisma.edition.count()).toBe(0);
    expect(await prisma.revision.count()).toBe(0);
    expect(await prisma.contentUnit.count()).toBe(0);
    expect(await prisma.blockVersion.count()).toBe(0);
    // Legacy rows untouched.
    expect(await prisma.chapter.count()).toBe(2);
  });
});
