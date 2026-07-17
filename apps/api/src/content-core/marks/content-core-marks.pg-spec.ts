import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../backfill";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "../lib/block-key";
import {
  resolveAnnotationWriteAnchor,
  resolveHighlightWriteAnchor,
} from "./mark-anchor";
import { readUnitMarks } from "../read/content-marks";

/**
 * CC-6C stable mark storage (real PostgreSQL 18). Exercises the write resolver
 * (durable anchor + offset validation against the PUBLISHED BlockVersion + quote
 * capture, pure-core blocks, identity mismatch, edited-block validation) and the
 * read surface (marks keyed by blockKey), plus old-version survival (Restrict).
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6c_marks_db";
const API_DIR = process.cwd();
const USER = "user-cc6c";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-6C stable mark storage (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let editionKey: string;
  let unitKey: string;
  let b1: string; // backfilled legacy ChapterBlock id
  let key1: string; // blockKey of b1
  let cb1Id: string; // ContentBlock id of b1
  let bv1Id: string; // published BlockVersion id of b1
  let unitVersionId: string;
  let unitId: string;
  let b2: string; // pure-legacy ChapterBlock (never backfilled)
  let pureKey: string; // blockKey of the pure Content Core block

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

    await prisma.user.create({
      data: {
        id: USER,
        email: "cc6c@example.com",
        name: "CC6C User",
        passwordHash: "x",
      },
    });

    const book = await prisma.book.create({
      data: { slug: "cc6c-book", title: "CC6C" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    const block1 = await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "El primer bloque de prueba.",
      },
    });
    b1 = block1.id;
    key1 = blockKeyFromLegacyId(b1);

    await backfillContentCore(prisma);

    editionKey = "cc6c-book-1e";
    unitKey = unitKeyFromLegacyChapterId(ch.id);
    const cb1 = await prisma.contentBlock.findUniqueOrThrow({
      where: { legacyBlockId: b1 },
    });
    cb1Id = cb1.id;
    unitId = cb1.unitId;
    const bv1 = await prisma.blockVersion.findFirstOrThrow({
      where: { contentBlockId: cb1Id },
    });
    bv1Id = bv1.id;
    unitVersionId = bv1.unitVersionId;

    // Simulate an editorial edit: the published version's text is now shorter
    // than the legacy ChapterBlock. Highlights must validate against THIS text.
    await prisma.blockVersion.update({
      where: { id: bv1Id },
      data: { content: "Texto nuevo." },
    });

    // A pure Content Core block: no legacy binding, added to the published unit
    // version directly (as an editor would).
    pureKey = "pure-core-block-key-cc6c";
    const pureCb = await prisma.contentBlock.create({
      data: { blockKey: pureKey, unitId },
    });
    await prisma.blockVersion.create({
      data: {
        contentBlockId: pureCb.id,
        unitVersionId,
        order: 99,
        kind: "PARAGRAPH",
        content: "Bloque puro core.",
        contentHash: "hash-pure-core",
      },
    });

    // A pure-legacy ChapterBlock never backfilled to Content Core.
    const chapter2 = await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "C2" },
    });
    const block2 = await prisma.chapterBlock.create({
      data: {
        chapterId: chapter2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Bloque legacy sin core.",
      },
    });
    b2 = block2.id;
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("highlight by blockKey → core anchor + blockVersion + exact quote from the NEW text", async () => {
    const anchor = await resolveHighlightWriteAnchor(prisma, {
      blockKey: key1,
      startOffset: 0,
      endOffset: 5,
    });
    expect(anchor).toMatchObject({
      source: "content-core",
      blockKey: key1,
      contentBlockId: cb1Id,
      blockId: b1,
      blockVersionId: bv1Id,
      quote: "Texto", // sliced from "Texto nuevo." — NEVER the legacy text
    });
  });

  it("edited block: offsets valid against the OLD legacy length are rejected against the NEW text", async () => {
    // "El primer bloque de prueba." is 27 chars; "Texto nuevo." is 12.
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        startOffset: 0,
        endOffset: 20,
      }),
    ).rejects.toThrow(/OFFSET_OUT_OF_RANGE/);
  });

  it("blockKey + contradicting blockId → ANCHOR_IDENTITY_MISMATCH (fail-closed)", async () => {
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        blockId: b2,
        startOffset: 0,
        endOffset: 3,
      }),
    ).rejects.toThrow(/ANCHOR_IDENTITY_MISMATCH/);
  });

  it("pure Content Core block (legacyBlockId null) → highlight allowed, blockId null", async () => {
    const anchor = await resolveHighlightWriteAnchor(prisma, {
      blockKey: pureKey,
      startOffset: 0,
      endOffset: 6,
    });
    expect(anchor.source).toBe("content-core");
    expect(anchor.blockId).toBeNull();
    expect(anchor.contentBlockId).not.toBeNull();
    expect(anchor.blockVersionId).not.toBeNull();
    expect(anchor.quote).toBe("Bloque");
  });

  it("legacy-only client compatible: blockId with no ContentBlock validates against ChapterBlock text", async () => {
    const anchor = await resolveHighlightWriteAnchor(prisma, {
      blockId: b2,
      startOffset: 0,
      endOffset: 6,
    });
    expect(anchor).toMatchObject({
      source: "legacy",
      contentBlockId: null,
      blockId: b2,
      blockVersionId: null,
      quote: "Bloque", // from the ChapterBlock text
    });
  });

  it("annotation by blockKey resolves the durable anchor (block-level, no version)", async () => {
    const anchor = await resolveAnnotationWriteAnchor(prisma, {
      blockKey: key1,
    });
    expect(anchor).toMatchObject({
      source: "content-core",
      blockKey: key1,
      contentBlockId: cb1Id,
      blockId: b1,
    });
  });

  it("readUnitMarks returns core- AND legacy-anchored marks for the unit, keyed by blockKey", async () => {
    // Core-anchored highlight (contentBlockId) + legacy-anchored highlight (blockId).
    await prisma.highlight.create({
      data: {
        userId: USER,
        contentBlockId: cb1Id,
        blockVersionId: bv1Id,
        quote: "Texto",
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });
    await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: b1, // legacy anchor only — same ContentBlock
        quote: "nuevo",
        startOffset: 6,
        endOffset: 11,
        color: "BLUE",
      },
    });
    await prisma.annotation.create({
      data: { userId: USER, contentBlockId: cb1Id, text: "nota core" },
    });

    const marks = await readUnitMarks(prisma, USER, editionKey, unitKey);
    expect(marks.editionKey).toBe(editionKey);
    expect(marks.highlights.length).toBe(2);
    // Both highlights resolve to the same stable blockKey regardless of anchor.
    expect(marks.highlights.every((h) => h.blockKey === key1)).toBe(true);
    expect(marks.annotations.map((a) => a.blockKey)).toContain(key1);
  });

  it("readUnitMarks 404s (UNIT_NOT_FOUND) for a unit not in the edition — fail-closed", async () => {
    await expect(
      readUnitMarks(prisma, USER, editionKey, "no-such-unit-key"),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });

  it("old-version mark survives: a referenced BlockVersion can never be deleted (Restrict)", async () => {
    await prisma.highlight.create({
      data: {
        userId: USER,
        contentBlockId: cb1Id,
        blockVersionId: bv1Id,
        quote: "Texto",
        startOffset: 0,
        endOffset: 5,
        color: "PINK",
      },
    });
    await expect(
      prisma.blockVersion.delete({ where: { id: bv1Id } }),
    ).rejects.toThrow();
  });

  it("CHECK: a mark with neither blockId nor contentBlockId is rejected by the DB", async () => {
    await expect(
      prisma.highlight.create({
        data: {
          userId: USER,
          startOffset: 0,
          endOffset: 1,
          color: "YELLOW",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.annotation.create({ data: { userId: USER, text: "sin ancla" } }),
    ).rejects.toThrow();
  });
});
