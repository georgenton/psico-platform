import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../backfill";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import { readContentUnit, type ReadUnit } from "./content-read";

/**
 * Content Core (CC-6A) — read adapter dual-read, on Postgres 18.
 *
 * Seeds a legacy book, reads it BEFORE backfill (legacy) and AFTER (content-core),
 * and asserts: core is served when published; the block arrays are byte-identical
 * across sources (parity); a not-backfilled book falls back to legacy; a DRAFT is
 * never served; a corrupt core unit throws CONTENT_CORE_INTEGRITY_ERROR instead of
 * silently falling back; reads perform zero writes. Own dedicated DB.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6a_read_db";
const API_DIR = process.cwd();

const B1 = "Primer bloque del capítulo, con suficiente texto para leer.";
const B2 = "Segundo bloque, distinto, con metadata estructurada adjunta.";
const B3 = "Tercer bloque final del capítulo, también distinto del resto.";
const B2_META = { videoUrl: "https://cdn.example/v.mp4" };
const EDITION_KEY = "read-book-1e";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-6A read adapter dual-read (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let editionId: string;
  let unitId: string;
  let unitKey: string;
  let publishedVersionId: string;
  let legacyRead: ReadUnit;
  let coreRead: ReadUnit;

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

    const book = await prisma.book.create({
      data: { slug: "read-book", title: "Read" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Capítulo uno" },
    });
    unitKey = unitKeyFromLegacyChapterId(ch.id);
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: B1 },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 1,
        kind: "VIDEO",
        content: B2,
        meta: B2_META,
      },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 2, kind: "PARAGRAPH", content: B3 },
    });

    // Read BEFORE backfill → legacy fallback.
    legacyRead = await readContentUnit(prisma, EDITION_KEY, unitKey);

    await backfillContentCore(prisma);

    // Read AFTER backfill → content-core.
    coreRead = await readContentUnit(prisma, EDITION_KEY, unitKey);

    const ed = await prisma.edition.findUnique({
      where: { editionKey: EDITION_KEY },
    });
    editionId = ed!.id;
    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId: ed!.publishedRevisionId!, unit: { unitKey } },
    });
    unitId = ru!.unitId;
    publishedVersionId = ru!.unitVersionId;
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("serves content-core when the edition is published", () => {
    expect(coreRead.source).toBe("content-core");
    expect(coreRead.revisionNumber).toBe(1);
    expect(coreRead.blocks).toHaveLength(3);
    expect(coreRead.blocks.map((b) => b.content)).toEqual([B1, B2, B3]);
    expect(coreRead.blocks[1].meta).toEqual(B2_META);
  });

  it("falls back to legacy for a book that was never backfilled", async () => {
    const book = await prisma.book.create({
      data: { slug: "solo-legacy", title: "Solo" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "L" },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "uno" },
    });
    const key = unitKeyFromLegacyChapterId(ch.id);
    const read = await readContentUnit(prisma, "solo-legacy-1e", key);
    expect(read.source).toBe("legacy");
    expect(read.revisionNumber).toBeNull();
    expect(read.blocks).toHaveLength(1);
  });

  it("block arrays are identical between legacy and content-core (parity)", () => {
    expect(legacyRead.source).toBe("legacy");
    expect(coreRead.source).toBe("content-core");
    // The rendered block payload is byte-identical EXCEPT `blockVersionId`, which
    // legitimately diverges (CC-6C): the Content Core read carries the source
    // version id the reader can pin a mark to; the legacy read has no versions.
    const strip = (b: (typeof coreRead.blocks)[number]) => {
      const { blockVersionId: _v, ...rest } = b;
      return rest;
    };
    expect(coreRead.blocks.map(strip)).toEqual(legacyRead.blocks.map(strip));
    expect(coreRead.blocks.every((b) => b.blockVersionId !== null)).toBe(true);
    expect(legacyRead.blocks.every((b) => b.blockVersionId === null)).toBe(
      true,
    );
    expect(coreRead.title).toBe(legacyRead.title);
    expect(coreRead.order).toBe(legacyRead.order);
  });

  it("reads perform zero writes", async () => {
    const snapshot = async () => ({
      revisions: await prisma.revision.count(),
      revisionUnits: await prisma.revisionUnit.count(),
      contentBlocks: await prisma.contentBlock.count(),
      blockVersions: await prisma.blockVersion.count(),
      chapterBlocks: await prisma.chapterBlock.count(),
    });
    const before = await snapshot();
    await readContentUnit(prisma, EDITION_KEY, unitKey);
    await readContentUnit(prisma, EDITION_KEY, unitKey);
    await readContentUnit(prisma, "solo-legacy-1e", unitKey).catch(() => null);
    expect(await snapshot()).toEqual(before);
  });

  it("EDITION_NOT_FOUND / UNIT_NOT_FOUND for unknown keys", async () => {
    await expect(
      readContentUnit(prisma, "no-such-book-1e", unitKey),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
    await expect(readContentUnit(prisma, "no-suffix", unitKey)).rejects.toThrow(
      /EDITION_NOT_FOUND/,
    );
    await expect(
      readContentUnit(prisma, EDITION_KEY, "bogus-unit-key"),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });

  it("case A: a unit added after backfill (no ContentUnit yet) falls back to legacy", async () => {
    // read-book is published; a NEW chapter has no ContentUnit → legacy is OK.
    const book = await prisma.book.findUnique({ where: { slug: "read-book" } });
    const ch = await prisma.chapter.create({
      data: { bookId: book!.id, order: 9, title: "Nuevo" },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "recién",
      },
    });
    const key = unitKeyFromLegacyChapterId(ch.id);
    const read = await readContentUnit(prisma, EDITION_KEY, key);
    expect(read.source).toBe("legacy");
    expect(read.blocks).toHaveLength(1);
  });

  it("case B: a ContentUnit retired from the published manifest → UNIT_NOT_FOUND (never legacy)", async () => {
    const retiredKey = "retired-unit-key-cc6a";
    // A ContentUnit exists in the edition but is absent from the published manifest.
    await prisma.contentUnit.create({
      data: { editionId, unitKey: retiredKey },
    });
    await expect(
      readContentUnit(prisma, EDITION_KEY, retiredKey),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });

  it("never serves an unpointed DRAFT revision", async () => {
    const draftRev = await prisma.revision.create({
      data: { editionId, number: 2, status: "DRAFT" },
    });
    const draftVersion = await prisma.contentUnitVersion.create({
      data: { unitId, title: "DRAFT title", summary: null },
    });
    const cb = await prisma.contentBlock.findFirst({ where: { unitId } });
    await prisma.blockVersion.create({
      data: {
        contentBlockId: cb!.id,
        unitVersionId: draftVersion.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "DRAFT-ONLY content that must never be served",
        contentHash: "draft-hash",
      },
    });
    await prisma.revisionUnit.create({
      data: {
        revisionId: draftRev.id,
        unitId,
        unitVersionId: draftVersion.id,
        order: 1,
      },
    });

    const read = await readContentUnit(prisma, EDITION_KEY, unitKey);
    expect(read.source).toBe("content-core");
    expect(read.revisionNumber).toBe(1); // still the published revision
    expect(read.blocks.map((b) => b.content)).toEqual([B1, B2, B3]);
    expect(read.title).not.toBe("DRAFT title");
  });

  it("a corrupt core unit throws CONTENT_CORE_INTEGRITY_ERROR (no legacy fallback)", async () => {
    // Delete the published version's blocks → core present but broken.
    await prisma.blockVersion.deleteMany({
      where: { unitVersionId: publishedVersionId },
    });
    await expect(readContentUnit(prisma, EDITION_KEY, unitKey)).rejects.toThrow(
      /CONTENT_CORE_INTEGRITY_ERROR/,
    );
  });

  // LAST — repoints Edition.publishedRevisionId at a DRAFT (irrecoverable).
  it("publishedRevisionId pointing at a DRAFT revision throws CONTENT_CORE_INTEGRITY_ERROR", async () => {
    // Build an OTHERWISE-valid DRAFT that contains the unit (real blocks, correct
    // linkage) so the ONLY failing invariant is status !== PUBLISHED.
    const draftRev = await prisma.revision.create({
      data: { editionId, number: 99, status: "DRAFT" },
    });
    const draftVersion = await prisma.contentUnitVersion.create({
      data: { unitId, title: "DRAFT title", summary: null },
    });
    const cb = await prisma.contentBlock.findFirst({ where: { unitId } });
    await prisma.blockVersion.create({
      data: {
        contentBlockId: cb!.id,
        unitVersionId: draftVersion.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "DRAFT-ONLY — must never be served",
        contentHash: "draft-hash-2",
      },
    });
    await prisma.revisionUnit.create({
      data: {
        revisionId: draftRev.id,
        unitId,
        unitVersionId: draftVersion.id,
        order: 1,
      },
    });
    // Move the published pointer onto the DRAFT — the corruption under test.
    await prisma.edition.update({
      where: { id: editionId },
      data: { publishedRevisionId: draftRev.id },
    });

    await expect(readContentUnit(prisma, EDITION_KEY, unitKey)).rejects.toThrow(
      /CONTENT_CORE_INTEGRITY_ERROR/,
    );
  });
});
