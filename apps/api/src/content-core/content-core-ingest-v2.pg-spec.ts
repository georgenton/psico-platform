import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "./backfill";
import { backfillAnchors } from "./anchors";
import { ingestUnitV2, type IngestBlockInput } from "./ingest-v2";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * Content Core (CC-5) — non-destructive ingest, on Postgres 18.
 *
 * Seeds a legacy book (3 blocks) + a Highlight anchored to block 2, backfills it
 * into Content Core, then drives ingest-v2 through reorder / edit / remove
 * (tombstone). Asserts block identity survives, blocks are never deleted, anchors
 * are never deleted, and each revision publishes atomically. Own dedicated DB.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc5_ingest_db";
const API_DIR = process.cwd();

const C1 = "Primer bloque de prueba número uno, aquí va el texto.";
const C1_EDIT = "Primer bloque de prueba número uno, aqui va el texto."; // 1-char (accent)
const C2 = "Segundo bloque, completamente distinto del resto, dos.";
const C3 = "Tercer bloque final, también distinto, el número tres.";

const PLACEMENT = { order: 1, partNumber: null, partTitle: null };

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}
function p(content: string): IngestBlockInput {
  return { kind: "PARAGRAPH", content };
}

suite("Content Core · CC-5 non-destructive ingest (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let editionId: string;
  let unitKey: string;
  let block2LegacyId: string;
  let highlightId: string;

  async function publishedKeys(): Promise<string[]> {
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId: ed!.publishedRevisionId!, unit: { unitKey } },
    });
    const bvs = await prisma.blockVersion.findMany({
      where: { unitVersionId: ru!.unitVersionId },
      include: { contentBlock: true },
      orderBy: { order: "asc" },
    });
    return bvs.map((bv) => bv.contentBlock.blockKey);
  }

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
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const user = await prisma.user.create({
      data: { email: "ingest@test.local", name: "Ingest" },
    });
    const book = await prisma.book.create({
      data: { slug: "ingest-book", title: "Ingest" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    unitKey = unitKeyFromLegacyChapterId(ch.id);
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: C1 },
    });
    const b2 = await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 1, kind: "PARAGRAPH", content: C2 },
    });
    block2LegacyId = b2.id;
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 2, kind: "PARAGRAPH", content: C3 },
    });

    const h = await prisma.highlight.create({
      data: { userId: user.id, blockId: b2.id, startOffset: 0, endOffset: 7 },
    });
    highlightId = h.id;

    await backfillContentCore(prisma);
    await backfillAnchors(prisma);

    const ed = await prisma.edition.findUnique({
      where: { editionKey: "ingest-book-1e" },
    });
    editionId = ed!.id;
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const file = "content/emociones-en-construccion/capitulo-01.md";
  const runIngest = (args: string, extraEnv: Record<string, string> = {}) =>
    execSync(
      `node scripts/ingest-chapter-md.mjs --file ${file} --order 1 ${args}`,
      {
        cwd: API_DIR,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: withDatabase(base as string, DB),
          ...extraEnv,
        },
      },
    );
  const stderrOf = (e: unknown) => String((e as { stderr?: unknown }).stderr);

  it("is FORBIDDEN in production — even with the override, even --dry-run", () => {
    let threw = false;
    try {
      // production + ALLOW=on → still refuses; the override cannot lift it.
      runIngest("", {
        PSICO_ENV: "production",
        ALLOW_LEGACY_DESTRUCTIVE_INGEST: "on",
      });
    } catch (e) {
      threw = true;
      expect(stderrOf(e)).toMatch(/LEGACY_INGEST_FORBIDDEN_IN_PRODUCTION/);
    }
    expect(threw).toBe(true);
  });

  it("a dry run writes nothing (no deleteMany/createMany)", async () => {
    const before = {
      chapterBlocks: await prisma.chapterBlock.count(),
      contentBlocks: await prisma.contentBlock.count(),
      revisions: await prisma.revision.count(),
    };
    const out = runIngest("--dry-run"); // non-production, no override
    expect(out).toBeTypeOf("string");
    expect({
      chapterBlocks: await prisma.chapterBlock.count(),
      contentBlocks: await prisma.contentBlock.count(),
      revisions: await prisma.revision.count(),
    }).toEqual(before);
  });

  it("a real non-production run without the override refuses (frozen)", () => {
    let threw = false;
    try {
      runIngest(""); // no --dry-run, no ALLOW, no PSICO_ENV
    } catch (e) {
      threw = true;
      expect(stderrOf(e)).toMatch(/LEGACY_INGEST_FROZEN/);
    }
    expect(threw).toBe(true);
  });

  it("reorder keeps every block key (no new, no tombstone) + publishes atomically", async () => {
    const before = (await publishedKeys()).slice().sort();
    const r = await ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title: "C1",
      placement: PLACEMENT,
      blocks: [p(C3), p(C1), p(C2)],
    });
    expect(r).toMatchObject({
      blocksMatched: 3,
      blocksNew: 0,
      blocksTombstoned: 0,
    });
    expect(r.revisionNumber).toBe(2);
    expect((await publishedKeys()).slice().sort()).toEqual(before);
    expect(await prisma.contentBlock.count()).toBe(3);

    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    const rev = await prisma.revision.findUnique({
      where: { id: ed!.publishedRevisionId! },
    });
    expect(rev!.status).toBe("PUBLISHED");
    expect(rev!.publishedAt).toBeTruthy();
  });

  it("a unique small edit keeps the block's key", async () => {
    const keysBefore = new Set(await publishedKeys());
    const r = await ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title: "C1",
      placement: PLACEMENT,
      blocks: [p(C3), p(C1_EDIT), p(C2)],
    });
    expect(r.blocksTombstoned).toBe(0);
    expect(r.blocksNew).toBe(0); // edited block matched by fuzzy, key carried
    const keysAfter = new Set(await publishedKeys());
    expect([...keysAfter].sort()).toEqual([...keysBefore].sort());
    expect(await prisma.contentBlock.count()).toBe(3);
  });

  it("removing a block tombstones it — the ContentBlock + its anchor survive", async () => {
    const cb2 = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: block2LegacyId },
    });
    const r = await ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title: "C1",
      placement: PLACEMENT,
      blocks: [p(C3), p(C1_EDIT)], // C2 removed
    });
    expect(r.blocksTombstoned).toBe(1);

    // The ContentBlock persists (never deleted) …
    expect(await prisma.contentBlock.count()).toBe(3);
    const stillThere = await prisma.contentBlock.findUnique({
      where: { id: cb2!.id },
    });
    expect(stillThere).toBeTruthy();
    // … but has NO BlockVersion in the new published revision (tombstoned).
    expect(await publishedKeys()).not.toContain(cb2!.blockKey);

    // The highlight anchored to it is NEVER deleted.
    const h = await prisma.highlight.findUnique({ where: { id: highlightId } });
    expect(h).toBeTruthy();
    expect(h!.contentBlockId).toBe(cb2!.id);
    expect(await prisma.highlight.count()).toBe(1);
  });
});
