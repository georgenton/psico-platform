import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BOOK_SLUG_TAKEN,
  bootstrapBook,
  editionKeyFor,
  planBookBootstrap,
  type BootstrapInput,
} from "./bootstrap-book";
import { ingestUnitV2 } from "./ingest-v2";
import { readContentUnit } from "./read/content-read";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";

/**
 * Content Core — new-book bootstrap, on real PostgreSQL.
 *
 * The whole point of this suite is the part a mocked Prisma cannot prove: that a
 * failure mid-book leaves NOTHING behind, that a duplicate slug is stopped by the
 * database and not merely by our pre-flight check, and that a book created this
 * way is subsequently updatable by `ingestUnitV2` — i.e. the test edition can be
 * replaced by the final master without destroying reader anchors.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc_bootstrap_db";
const API_DIR = process.cwd();
const SLUG = "libro-de-prueba-bootstrap";
const ENV = { ALLOW_CONTENT_CORE_BOOK_INGEST: "on" };

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function input(slug: string, chapterCount: number): BootstrapInput {
  return {
    manifest: {
      slug,
      title: "Libro de prueba",
      author: "Equipo de pruebas",
      editionLabel: "Edición de prueba OCR",
      sourceQuality: "OCR_UNFINALIZED",
      chapters: Array.from({ length: chapterCount }, (_, i) => ({
        order: i + 1,
        title: `Capítulo ${i + 1}`,
        file: `${i + 1}.md`,
      })),
    },
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
      order: i + 1,
      title: `Capítulo ${i + 1}`,
      blocks: [
        {
          kind: "PARAGRAPH" as const,
          content: `Primer párrafo del capítulo ${i + 1}.`,
        },
        { kind: "QUOTE" as const, content: `Cita del capítulo ${i + 1}.` },
        {
          kind: "PARAGRAPH" as const,
          content: `Cierre del capítulo ${i + 1}.`,
        },
      ],
    })),
  };
}

suite("Content Core · new-book bootstrap (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;

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
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("1 · a dry-run writes nothing at all", async () => {
    const plan = await planBookBootstrap(prisma, input("solo-dry-run", 2));
    expect(plan.bootstrap_safe).toBe(true);
    expect(plan.total_block_count).toBe(6);
    expect(await prisma.book.count({ where: { slug: "solo-dry-run" } })).toBe(
      0,
    );
    expect(await prisma.edition.count()).toBe(0);
  });

  it("2+3+4 · creates the book with a complete, published revision #1", async () => {
    const stats = await bootstrapBook(prisma, input(SLUG, 3), { env: ENV });

    expect(stats.chapters).toBe(3);
    expect(stats.units).toBe(3);
    expect(stats.blocks).toBe(9);
    expect(stats.blockVersions).toBe(9);
    expect(stats.revisionUnits).toBe(3);

    const edition = await prisma.edition.findUnique({
      where: { editionKey: editionKeyFor(SLUG) },
    });
    expect(edition?.publishedRevisionId).toBe(stats.revisionId);

    const revision = await prisma.revision.findUnique({
      where: { id: stats.revisionId },
      include: { units: true },
    });
    expect(revision?.status).toBe("PUBLISHED");
    expect(revision?.publishedAt).not.toBeNull();
    // The FIRST revision must carry EVERY chapter — a partial manifest would
    // serve a book with an invisible hole in it.
    expect(revision?.units).toHaveLength(3);
    expect(revision?.units.map((u) => u.order).sort()).toEqual([1, 2, 3]);
  });

  it("5 · a duplicate slug fails closed and changes nothing", async () => {
    const before = {
      books: await prisma.book.count(),
      editions: await prisma.edition.count(),
      revisions: await prisma.revision.count(),
    };

    await expect(
      bootstrapBook(prisma, input(SLUG, 2), { env: ENV }),
    ).rejects.toThrow(BOOK_SLUG_TAKEN);

    expect(await prisma.book.count()).toBe(before.books);
    expect(await prisma.edition.count()).toBe(before.editions);
    expect(await prisma.revision.count()).toBe(before.revisions);
  });

  it("6 · a failure mid-book rolls the ENTIRE book back", async () => {
    const before = {
      books: await prisma.book.count(),
      chapters: await prisma.chapter.count(),
      blocks: await prisma.chapterBlock.count(),
      units: await prisma.contentUnit.count(),
      editions: await prisma.edition.count(),
      works: await prisma.work.count(),
    };

    await expect(
      bootstrapBook(prisma, input("libro-que-falla", 3), {
        env: ENV,
        throwAfterChapters: 2, // dies with one chapter still to write
      }),
    ).rejects.toThrow("INJECTED_TEST_FAILURE");

    // Not "most of it rolled back" — nothing at all, including the Work upsert.
    expect(await prisma.book.count()).toBe(before.books);
    expect(await prisma.chapter.count()).toBe(before.chapters);
    expect(await prisma.chapterBlock.count()).toBe(before.blocks);
    expect(await prisma.contentUnit.count()).toBe(before.units);
    expect(await prisma.edition.count()).toBe(before.editions);
    expect(await prisma.work.count()).toBe(before.works);
    expect(
      await prisma.book.count({ where: { slug: "libro-que-falla" } }),
    ).toBe(0);
  });

  it("7 · every block carries the canonical Content Core identity", async () => {
    const chapters = await prisma.chapter.findMany({
      where: { book: { slug: SLUG } },
      orderBy: { order: "asc" },
    });
    expect(chapters).toHaveLength(3);

    for (const ch of chapters) {
      const unit = await prisma.contentUnit.findFirst({
        where: { unitKey: unitKeyFromLegacyChapterId(ch.id) },
      });
      // unitKey derived from the legacy Chapter.id — identical to a backfill.
      expect(unit).not.toBeNull();

      const legacyBlocks = await prisma.chapterBlock.findMany({
        where: { chapterId: ch.id },
        orderBy: { order: "asc" },
      });
      for (const lb of legacyBlocks) {
        const cb = await prisma.contentBlock.findUnique({
          where: { blockKey: blockKeyFromLegacyId(lb.id) },
        });
        expect(cb?.legacyBlockId).toBe(lb.id);
        expect(cb?.unitId).toBe(unit!.id);
      }
    }
  });

  it("8+9 · the reader resolves every chapter through Content Core", async () => {
    const chapters = await prisma.chapter.findMany({
      where: { book: { slug: SLUG } },
      orderBy: { order: "asc" },
    });

    for (const ch of chapters) {
      const unit = await readContentUnit(
        prisma,
        editionKeyFor(SLUG),
        unitKeyFromLegacyChapterId(ch.id),
      );
      expect(unit.title).toBe(ch.title);
      expect(unit.blocks).toHaveLength(3);
      expect(unit.blocks.map((b) => b.kind)).toEqual([
        "PARAGRAPH",
        "QUOTE",
        "PARAGRAPH",
      ]);
      // Every block must carry the stable identity the reader anchors against —
      // without it, highlights cannot be created at all.
      for (const b of unit.blocks) {
        expect(b.blockKey).toBeTruthy();
        expect(b.blockVersionId).toBeTruthy();
      }
    }
  });

  it("10 · the final edition can replace a chapter via ingestUnitV2, keeping identity", async () => {
    const ch = await prisma.chapter.findFirstOrThrow({
      where: { book: { slug: SLUG }, order: 1 },
    });
    const unitKey = unitKeyFromLegacyChapterId(ch.id);
    const edition = await prisma.edition.findUniqueOrThrow({
      where: { editionKey: editionKeyFor(SLUG) },
    });

    const beforeKeys = (
      await readContentUnit(prisma, editionKeyFor(SLUG), unitKey)
    ).blocks.map((b) => b.blockKey);

    const result = await ingestUnitV2(prisma, {
      editionId: edition.id,
      unitKey,
      title: "Capítulo 1 · edición final",
      placement: { order: 1, partNumber: null, partTitle: null },
      blocks: [
        // identical first block (matches), edited second, identical third
        { kind: "PARAGRAPH", content: "Primer párrafo del capítulo 1." },
        { kind: "QUOTE", content: "Cita del capítulo 1, ya revisada." },
        { kind: "PARAGRAPH", content: "Cierre del capítulo 1." },
      ],
    });

    expect(result.revisionNumber).toBe(2);
    expect(result.blocksMatched).toBeGreaterThanOrEqual(2);

    const after = await readContentUnit(prisma, editionKeyFor(SLUG), unitKey);
    expect(after.title).toBe("Capítulo 1 · edición final");
    // The unchanged blocks keep their identity, so anchors on them survive the
    // swap from the OCR test edition to the final master.
    expect(after.blocks[0].blockKey).toBe(beforeKeys[0]);
    expect(after.blocks[2].blockKey).toBe(beforeKeys[2]);
    // And nothing was deleted — that is the whole non-destructive contract.
    expect(
      await prisma.contentBlock.count({ where: { unit: { unitKey } } }),
    ).toBeGreaterThanOrEqual(3);
  });
});
