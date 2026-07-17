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
import { AnnotationsService } from "../../lector/annotations.service";

/**
 * CC-6C stable mark storage (real PostgreSQL 18). Exercises the write resolver
 * (durable anchor + client-supplied source version + offset validation + quote,
 * pure-core, identity mismatch), the read surface (marks keyed by blockKey), the
 * SetNull FK behaviour on a ChapterBlock delete, and annotation-update identity.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6c_marks_db";
const API_DIR = process.cwd();
const USER = "user-cc6c";

// Content the fixtures use (offsets are UTF-16 code units).
const R1_TEXT = "El primer bloque de prueba."; // v1 (R1) text of cb1
const R2_TEXT = "Texto de la segunda revisión."; // v2 (R2) text of cb1
const PURE_TEXT = "Bloque puro core.";
const LEGACY_TEXT = "Bloque legacy sin core.";

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
  let unitId: string;
  let b1: string; // backfilled legacy ChapterBlock id (in R1 + R2)
  let key1: string; // blockKey of b1
  let cb1Id: string; // ContentBlock id of b1
  let bv1Id: string; // R1 (v1) BlockVersion id of cb1
  let bv2Id: string; // R2 (v2) BlockVersion id of cb1
  let pureKey: string; // blockKey of the pure Content Core block
  let pureBvId: string; // R2 (v2) BlockVersion id of the pure-core block
  let b2: string; // pure-legacy ChapterBlock (never backfilled)

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
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: R1_TEXT },
    });
    b1 = block1.id;
    key1 = blockKeyFromLegacyId(b1);

    // Backfill → Edition + published R1 (v1) with bv1 for cb1.
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

    // A pure Content Core block (no legacy binding) added to the unit.
    pureKey = "pure-core-block-key-cc6c";
    const pureCb = await prisma.contentBlock.create({
      data: { blockKey: pureKey, unitId },
    });

    // Publish a SECOND revision R2 (v2) with NEW text for cb1 + a version for the
    // pure-core block. R1's bv1 stays around (a mark can still point at it).
    const edition = await prisma.edition.findUniqueOrThrow({
      where: { editionKey },
    });
    const v2 = await prisma.contentUnitVersion.create({
      data: { unitId, title: "C1 v2", summary: null },
    });
    const bv2 = await prisma.blockVersion.create({
      data: {
        contentBlockId: cb1Id,
        unitVersionId: v2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: R2_TEXT,
        contentHash: "hash-r2-cb1",
      },
    });
    bv2Id = bv2.id;
    const pureBv = await prisma.blockVersion.create({
      data: {
        contentBlockId: pureCb.id,
        unitVersionId: v2.id,
        order: 1,
        kind: "PARAGRAPH",
        content: PURE_TEXT,
        contentHash: "hash-r2-pure",
      },
    });
    pureBvId = pureBv.id;
    const r2 = await prisma.revision.create({
      data: {
        editionId: edition.id,
        number: 2,
        status: "PUBLISHED",
        publishedAt: new Date(0),
      },
    });
    await prisma.revisionUnit.create({
      data: { revisionId: r2.id, unitId, unitVersionId: v2.id, order: 1 },
    });
    await prisma.edition.update({
      where: { id: edition.id },
      data: { publishedRevisionId: r2.id },
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
        content: LEGACY_TEXT,
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

  it("stores the version the user read + its exact quote, NOT the currently-published one", async () => {
    // R2 is the published version, but the client sends the R1 version id.
    const anchor = await resolveHighlightWriteAnchor(prisma, {
      blockKey: key1,
      blockVersionId: bv1Id,
      startOffset: 0,
      endOffset: 5,
    });
    expect(anchor).toMatchObject({
      source: "content-core",
      blockKey: key1,
      contentBlockId: cb1Id,
      blockId: b1,
      blockVersionId: bv1Id, // R1, not R2
      quote: R1_TEXT.slice(0, 5), // "El pr" — from R1, never R2
    });
  });

  it("a Content Core write without a source version → SOURCE_BLOCK_VERSION_REQUIRED", async () => {
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        startOffset: 0,
        endOffset: 5,
      }),
    ).rejects.toThrow(/SOURCE_BLOCK_VERSION_REQUIRED/);
  });

  it("a source version that belongs to a different block → SOURCE_BLOCK_VERSION_MISMATCH", async () => {
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        blockVersionId: pureBvId, // belongs to the pure-core block, not cb1
        startOffset: 0,
        endOffset: 3,
      }),
    ).rejects.toThrow(/SOURCE_BLOCK_VERSION_MISMATCH/);
  });

  it("blockKey + contradicting blockId → ANCHOR_IDENTITY_MISMATCH", async () => {
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        blockId: b2,
        blockVersionId: bv1Id,
        startOffset: 0,
        endOffset: 3,
      }),
    ).rejects.toThrow(/ANCHOR_IDENTITY_MISMATCH/);
  });

  it("offsets are validated against the SENT version's text", async () => {
    await expect(
      resolveHighlightWriteAnchor(prisma, {
        blockKey: key1,
        blockVersionId: bv1Id,
        startOffset: 0,
        endOffset: R1_TEXT.length + 5, // past R1's length
      }),
    ).rejects.toThrow(/OFFSET_OUT_OF_RANGE/);
  });

  it("pure Content Core block → highlight allowed, blockId null", async () => {
    const anchor = await resolveHighlightWriteAnchor(prisma, {
      blockKey: pureKey,
      blockVersionId: pureBvId,
      startOffset: 0,
      endOffset: 6,
    });
    expect(anchor.source).toBe("content-core");
    expect(anchor.blockId).toBeNull();
    expect(anchor.contentBlockId).not.toBeNull();
    expect(anchor.blockVersionId).toBe(pureBvId);
    expect(anchor.quote).toBe("Bloque");
  });

  it("legacy-only client compatible: blockId, no version, validated against ChapterBlock text", async () => {
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
      quote: "Bloque",
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
    await prisma.highlight.create({
      data: {
        userId: USER,
        contentBlockId: cb1Id,
        blockVersionId: bv2Id,
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
        quote: "El",
        startOffset: 0,
        endOffset: 2,
        color: "BLUE",
      },
    });
    await prisma.annotation.create({
      data: { userId: USER, contentBlockId: cb1Id, text: "nota core" },
    });

    const marks = await readUnitMarks(prisma, USER, editionKey, unitKey);
    expect(marks.highlights.length).toBe(2);
    expect(marks.highlights.every((h) => h.blockKey === key1)).toBe(true);
    expect(marks.annotations.map((a) => a.blockKey)).toContain(key1);
  });

  it("readUnitMarks 404s (UNIT_NOT_FOUND) for a unit not in the edition", async () => {
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
        quote: "El pr",
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
        data: { userId: USER, startOffset: 0, endOffset: 1, color: "YELLOW" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.annotation.create({ data: { userId: USER, text: "sin ancla" } }),
    ).rejects.toThrow();
  });

  it("SetNull dual-anchor: deleting the ChapterBlock detaches the mark; contentBlockId intact", async () => {
    const chapter1 = await prisma.chapter.findFirstOrThrow({
      where: { order: 1 },
    });
    const bDual = await prisma.chapterBlock.create({
      data: {
        chapterId: chapter1.id,
        order: 50,
        kind: "PARAGRAPH",
        content: "detach me",
      },
    });
    const h = await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: bDual.id, // legacy anchor
        contentBlockId: cb1Id, // canonical anchor
        blockVersionId: bv1Id,
        quote: "El pr",
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });
    await prisma.chapterBlock.delete({ where: { id: bDual.id } });
    const after = await prisma.highlight.findUniqueOrThrow({
      where: { id: h.id },
    });
    expect(after.blockId).toBeNull(); // SET NULL detached it
    expect(after.contentBlockId).toBe(cb1Id); // canonical anchor intact
  });

  it("SetNull legacy-only: deleting the ChapterBlock is blocked by the CHECK; mark survives", async () => {
    const chapter1 = await prisma.chapter.findFirstOrThrow({
      where: { order: 1 },
    });
    const bLegacy = await prisma.chapterBlock.create({
      data: {
        chapterId: chapter1.id,
        order: 51,
        kind: "PARAGRAPH",
        content: "legacy only",
      },
    });
    const h = await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: bLegacy.id, // ONLY anchor (contentBlockId null)
        quote: "legac",
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });
    // SET NULL would violate the anchor CHECK, so the DELETE is refused.
    await expect(
      prisma.chapterBlock.delete({ where: { id: bLegacy.id } }),
    ).rejects.toThrow();
    const after = await prisma.highlight.findUniqueOrThrow({
      where: { id: h.id },
    });
    expect(after.blockId).toBe(bLegacy.id); // still anchored, mark survives
  });

  it("pure-core annotation create → update keeps the same blockKey (stays bucketed)", async () => {
    // CC-6E: the content-access gate is injected; a permissive stub keeps this
    // test focused on blockKey preservation (entitlement is tested separately).
    const access = {
      assertCanWriteMark: async () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AnnotationsService(prisma as any, {} as any, access);
    const created = await svc.create(USER, "PRO", {
      blockKey: pureKey,
      text: "primera nota",
    });
    expect(created.annotation.blockId).toBeNull();
    expect(created.annotation.blockKey).toBe(pureKey);

    const updated = await svc.update(USER, created.annotation.id, {
      text: "nota editada",
    });
    expect(updated.annotation.text).toBe("nota editada");
    expect(updated.annotation.blockKey).toBe(pureKey); // never ""
    expect(updated.annotation.blockId).toBeNull();
  });
});
