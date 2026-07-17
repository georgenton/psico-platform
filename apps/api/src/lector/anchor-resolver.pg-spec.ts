import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../content-core/backfill";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "../content-core/lib/block-key";
import { resolveAnchorTarget } from "./anchor-resolver";

/**
 * CC-6B anchor bridge (real PostgreSQL 18). Seeds a backfilled book and asserts
 * resolveAnchorTarget maps blockKey/blockId to the storage anchor, fail-closed:
 * legacy id path, blockKey path, correspondence check, mismatch, not-found,
 * missing-target, and a pure-core block with no legacy binding.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6b_anchor_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-6B anchor bridge (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let b1: string; // legacy ChapterBlock id
  let b2: string;
  let key1: string; // blockKey of b1
  let cb1Id: string; // ContentBlock id of b1
  let unitId: string;

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
      data: { slug: "anchor-book", title: "Anchor" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    const block1 = await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "uno" },
    });
    const block2 = await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 1, kind: "PARAGRAPH", content: "dos" },
    });
    b1 = block1.id;
    b2 = block2.id;
    key1 = blockKeyFromLegacyId(b1);

    await backfillContentCore(prisma);

    const cb1 = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: b1 },
    });
    cb1Id = cb1!.id;
    const unit = await prisma.contentUnit.findFirst({
      where: { unitKey: unitKeyFromLegacyChapterId(ch.id) },
    });
    unitId = unit!.id;
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("legacy blockId → resolves + dual-writes contentBlockId", async () => {
    expect(await resolveAnchorTarget(prisma, { blockId: b1 })).toEqual({
      blockId: b1,
      contentBlockId: cb1Id,
    });
  });

  it("blockKey → resolves to the legacy anchor + contentBlockId", async () => {
    expect(await resolveAnchorTarget(prisma, { blockKey: key1 })).toEqual({
      blockId: b1,
      contentBlockId: cb1Id,
    });
  });

  it("blockKey + matching blockId → ok", async () => {
    expect(
      await resolveAnchorTarget(prisma, { blockKey: key1, blockId: b1 }),
    ).toEqual({ blockId: b1, contentBlockId: cb1Id });
  });

  it("blockKey + contradicting blockId → ANCHOR_IDENTITY_MISMATCH", async () => {
    await expect(
      resolveAnchorTarget(prisma, { blockKey: key1, blockId: b2 }),
    ).rejects.toThrow(/ANCHOR_IDENTITY_MISMATCH/);
  });

  it("unknown blockKey → BLOCK_NOT_FOUND", async () => {
    await expect(
      resolveAnchorTarget(prisma, { blockKey: "no-such-key" }),
    ).rejects.toThrow(/BLOCK_NOT_FOUND/);
  });

  it("neither blockKey nor blockId → ANCHOR_MISSING_TARGET", async () => {
    await expect(resolveAnchorTarget(prisma, {})).rejects.toThrow(
      /ANCHOR_MISSING_TARGET/,
    );
  });

  it("a pure Content Core block (no legacy binding) → ANCHOR_UNSUPPORTED_CORE_BLOCK", async () => {
    const pure = await prisma.contentBlock.create({
      data: { blockKey: "pure-core-block-key", unitId },
    });
    expect(pure.legacyBlockId).toBeNull();
    await expect(
      resolveAnchorTarget(prisma, { blockKey: "pure-core-block-key" }),
    ).rejects.toThrow(/ANCHOR_UNSUPPORTED_CORE_BLOCK/);
  });
});
