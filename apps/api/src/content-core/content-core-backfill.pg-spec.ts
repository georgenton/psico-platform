import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore, type BackfillStats } from "./backfill";
import { blockKeyFromLegacyId } from "./lib/block-key";

/**
 * Content Core (CC-3) — the REAL backfill, end-to-end on Postgres 18.
 *
 * Seeds a legacy Book/Chapter/ChapterBlock fixture, runs the backfill, asserts the
 * new tables are populated correctly (incl. blockKey = uuidv5(legacy id)), then
 * runs it AGAIN to prove idempotency (no duplicate rows) and that no legacy row
 * was deleted. Own dedicated database (extensions are per-DB) — no cross-spec race.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc3_backfill_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-3 backfill (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let prismaPool: Pool;
  let firstRun: BackfillStats;
  let secondRun: BackfillStats;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });

    prismaPool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(prismaPool) });

    // Legacy fixture — slug matches a CHAPTER_CONCEPTS catalog entry.
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

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (prismaPool) await prismaPool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("creates Work + Edition + a published Revision", async () => {
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
    expect(edition!.publishedRevisionId).toBe(rev!.id);
  });

  it("creates a ContentUnit + version + RevisionUnit per chapter, with placement", async () => {
    const edition = await prisma.edition.findUnique({
      where: { editionKey: "emociones-en-construccion-1e" },
    });
    const units = await prisma.contentUnit.findMany({
      where: { editionId: edition!.id },
      orderBy: { unitKey: "asc" },
    });
    expect(units.map((u) => u.unitKey)).toEqual(["u-1", "u-2"]);

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
    expect(cb).toBeTruthy();
    expect(cb!.blockKey).toBe(blockKeyFromLegacyId(legacy!.id));

    const bvCount = await prisma.blockVersion.count({
      where: { contentBlockId: cb!.id },
    });
    expect(bvCount).toBe(1);
  });

  it("seeds Concept + ConceptLink from the catalog", async () => {
    const concept = await prisma.concept.findUnique({
      where: { conceptKey: "eec-cuerpo-antes-que-mente" },
    });
    expect(concept).toBeTruthy();

    const link = await prisma.conceptLink.findFirst({
      where: { conceptId: concept!.id },
    });
    expect(link?.unitId).toBeTruthy();
    expect(link?.role).toBe("PRIMARY");
  });

  it("is idempotent — the second run produces identical stats + no duplicate rows", async () => {
    expect(secondRun).toEqual(firstRun);
    expect(await prisma.contentBlock.count()).toBe(3);
    expect(await prisma.blockVersion.count()).toBe(3);
    expect(await prisma.contentUnit.count()).toBe(2);
    expect(await prisma.revisionUnit.count()).toBe(2);
    // Catalog has chapters 1/2/3; only 1 and 2 exist → 2 links.
    expect(await prisma.conceptLink.count()).toBe(2);
    expect(await prisma.edition.count()).toBe(1);
    expect(await prisma.revision.count()).toBe(1);
  });

  it("performs zero DELETE — the legacy rows remain intact", async () => {
    expect(await prisma.book.count()).toBe(1);
    expect(await prisma.chapter.count()).toBe(2);
    expect(await prisma.chapterBlock.count()).toBe(3);
  });
});
