import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { INLINE_MARKS_META_KEY } from "@psico/types";

import { dropWhenIdle } from "../test/pg-drop";
import {
  blockVersionDrifts,
  expectedBlockVersionFields,
} from "./backfill-inspect";
import { contentHash } from "./lib/content-hash";
import { planEmphasisRepair, type EmphasisPlan } from "./markdown-repair";
import {
  applyEmphasisRepair,
  CONCURRENT_CHANGE,
  POSTIMAGE_MISMATCH,
  readEmphasisSnapshot,
  revertEmphasisRepair,
  UNPLANNED_REFERENCE,
  WRITE_LOST,
  type Preimage,
  type SnapshotClient,
} from "./markdown-repair-db";

/**
 * The cases a fake cannot prove.
 *
 * Three of the four defects this file guards against are about two sessions and
 * a clock: a highlight inserted after the plan was made, an edit that lands
 * between the check and the write, and a revert that must refuse to overwrite
 * whatever came later. A double can be made to answer anything; only a server
 * can be made to race.
 *
 * The fourth is the recovery rehearsal — initial state, apply, check, revert,
 * compare — which is worth nothing unless the comparison is against rows that
 * really went through PostgreSQL: `contentHash`, a `jsonb` column and a `null`
 * quote all round-trip through places a fake does not have.
 */

const DB = "emphasis_repair_db";
const API_DIR = process.cwd();
const USER = "user-emphasis";
const SLUG = "libro-enfasis";

const withDatabase = (url: string, dbName: string): string => {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
};

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const TEXT = "Un **modelo generativo** explica la conducta";
const REPAIRED = "Un modelo generativo explica la conducta";

suite("emphasis repair · against real PostgreSQL", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let url = "";
  let chapterId = "";
  let unitId = "";
  let unitVersionId = "";

  /** One block, in both representations, as the backfill leaves them. */
  async function makeBlock(opts: {
    order: number;
    content: string;
    meta?: unknown;
    nativeMeta?: unknown;
  }): Promise<{
    chapterBlockId: string;
    contentBlockId: string;
    versionId: string;
  }> {
    const legacy = await prisma.chapterBlock.create({
      data: {
        chapterId,
        order: opts.order,
        kind: "PARAGRAPH",
        content: opts.content,
        meta: (opts.meta ?? null) as never,
      },
    });
    const native = await prisma.contentBlock.create({
      data: {
        unitId,
        blockKey: `bk-${legacy.id}`,
        legacyBlockId: legacy.id,
      },
    });
    const version = await prisma.blockVersion.create({
      data: {
        contentBlockId: native.id,
        unitVersionId,
        order: opts.order,
        kind: "PARAGRAPH",
        content: opts.content,
        contentHash: contentHash(opts.content),
        meta: (opts.nativeMeta ?? opts.meta ?? null) as never,
      },
    });
    return {
      chapterBlockId: legacy.id,
      contentBlockId: native.id,
      versionId: version.id,
    };
  }

  const plan = async (): Promise<EmphasisPlan> =>
    planEmphasisRepair(
      await readEmphasisSnapshot(prisma as unknown as SnapshotClient, SLUG),
    );

  const apply = async (
    p: EmphasisPlan,
    hook?: (tx: unknown) => void,
  ): Promise<Preimage[]> => {
    const taken: Preimage[] = [];
    await prisma.$transaction(async (tx) => {
      if (hook) hook(tx);
      await applyEmphasisRepair(tx as never, p, (pre) => taken.push(pre));
    });
    return taken;
  };

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    await prisma.user.create({
      data: { id: USER, email: "emphasis@test.local", name: "E" },
    });
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "FREE", isPublished: true },
    });
    const chapter = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    chapterId = chapter.id;
    const work = await prisma.work.create({
      data: {
        workKey: `w-${randomUUID().slice(0, 8)}`,
        title: "Libro",
        authorName: "A",
      },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: `ed-${randomUUID().slice(0, 8)}`,
        slug: `${SLUG}-1e`,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    const unit = await prisma.contentUnit.create({
      data: { editionId: edition.id, unitKey: "u-1" },
    });
    unitId = unit.id;
    const uv = await prisma.contentUnitVersion.create({
      data: { unitId: unit.id, title: "C1" },
    });
    unitVersionId = uv.id;
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.end();
  }, 60_000);

  beforeEach(async () => {
    await prisma.highlight.deleteMany({});
    await prisma.blockVersion.deleteMany({});
    await prisma.contentBlock.deleteMany({});
    await prisma.chapterBlock.deleteMany({});
  });

  // ── §2A · a reference that appeared after the plan ───────────────────────

  it("refuses when a highlight was created after the plan was made", async () => {
    const { chapterBlockId } = await makeBlock({ order: 1, content: TEXT });
    const p = await plan();
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0]!.highlights).toHaveLength(0);

    // Somebody reads the chapter and underlines a phrase. Committed, so any
    // honest query would see it — the old apply asked `id IN ()` and did not.
    const start = TEXT.indexOf("explica");
    await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: chapterBlockId,
        startOffset: start,
        endOffset: start + "explica".length,
        quote: "explica",
      },
    });

    await expect(apply(p)).rejects.toThrow(UNPLANNED_REFERENCE);

    // And nothing moved: the text still has its asterisks, so the new
    // highlight still points at the words it was drawn over.
    const after = await prisma.chapterBlock.findUniqueOrThrow({
      where: { id: chapterBlockId },
    });
    expect(after.content).toBe(TEXT);
    const h = await prisma.highlight.findFirstOrThrow({});
    expect(after.content.slice(h.startOffset, h.endOffset)).toBe("explica");
  }, 60_000);

  // ── §2B · an edit between the check and the write ────────────────────────

  it("refuses when the block is edited between the check and the write", async () => {
    const { chapterBlockId } = await makeBlock({ order: 1, content: TEXT });
    const p = await plan();

    // A second connection, because the race needs two sessions. The edit lands
    // after `applyOp` has read and checked the row and before it writes it: the
    // hook fires on the first conditional update.
    const other = new Pool({ connectionString: url });
    let fired = false;
    const interleave = async () => {
      if (fired) return;
      fired = true;
      await other.query(
        `UPDATE "ChapterBlock" SET content = $1 WHERE id = $2`,
        [`${TEXT} (editado)`, chapterBlockId],
      );
    };

    await expect(
      prisma.$transaction(async (tx) => {
        // A WRAPPER, never a mutation of Prisma's transaction client. The first
        // version of this test assigned over `tx.$executeRawUnsafe`, the patch
        // outlived the transaction, and every later test in the file called a
        // closure holding a client that had already rolled back — four failures
        // that looked like SQL defects and were this.
        const wrapped = {
          chapterBlock: tx.chapterBlock,
          blockVersion: tx.blockVersion,
          highlight: tx.highlight,
          contentBlock: tx.contentBlock,
          annotation: tx.annotation,
          readingSession: tx.readingSession,
          $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
            await interleave();
            return tx.$executeRawUnsafe(sql, ...params);
          },
        };
        await applyEmphasisRepair(wrapped as never, p, () => undefined);
      }),
    ).rejects.toThrow(WRITE_LOST);
    await other.end();

    // The editor's save survived, which is the whole point of conditioning the
    // write on the values that were read.
    const after = await prisma.chapterBlock.findUniqueOrThrow({
      where: { id: chapterBlockId },
    });
    expect(after.content).toBe(`${TEXT} (editado)`);
  }, 60_000);

  it("refuses when the block was edited before the apply even starts", async () => {
    const { chapterBlockId } = await makeBlock({ order: 1, content: TEXT });
    const p = await plan();
    await prisma.chapterBlock.update({
      where: { id: chapterBlockId },
      data: { content: `${TEXT} (otro)` },
    });
    await expect(apply(p)).rejects.toThrow(CONCURRENT_CHANGE);
  }, 60_000);

  // ── §3 · a mark that only exists on the native side ─────────────────────

  it("refuses identical text with a mark only in the native version, and keeps it", async () => {
    const start = TEXT.indexOf("conducta");
    const nativeMark = [
      {
        type: "UNDERLINE",
        startOffset: start,
        endOffset: start + "conducta".length,
      },
    ];
    const { versionId } = await makeBlock({
      order: 1,
      content: TEXT,
      meta: null,
      nativeMeta: { [INLINE_MARKS_META_KEY]: nativeMark },
    });

    const p = await plan();
    expect(p.ops).toHaveLength(0);
    expect(p.blockers[0]!.reason).toBe("NATIVE_DRIFT");
    expect(p.blockers[0]!.detail).toContain("content same");
    expect(p.blockers[0]!.detail).toContain("meta DIFFERENT");

    // Nothing written, and above all nothing deleted: the UNDERLINE is still
    // there. That mark is what the old `content`-only comparison would have
    // replaced with the legacy-derived result.
    const v = await prisma.blockVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    expect((v.meta as Record<string, unknown>)[INLINE_MARKS_META_KEY]).toEqual(
      nativeMark,
    );
    expect(v.content).toBe(TEXT);
  }, 60_000);

  // ── §4 · the recovery rehearsal ─────────────────────────────────────────

  it("initial → apply → check → revert → compare, with a null quote too", async () => {
    const ids = await makeBlock({
      order: 1,
      content: TEXT,
      meta: { audioId: "a-1" },
    });
    const start = TEXT.indexOf("conducta");
    // One highlight WITH a quote and one WITHOUT: a mark captured before quotes
    // were mandatory has none, and a revert that invented one would be making a
    // change nobody asked for.
    const withQuote = await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: ids.chapterBlockId,
        startOffset: start,
        endOffset: start + "conducta".length,
        quote: "conducta",
      },
    });
    const withoutQuote = await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: ids.chapterBlockId,
        startOffset: 0,
        endOffset: 2,
        quote: null,
      },
    });

    const initial = {
      legacy: await prisma.chapterBlock.findUniqueOrThrow({
        where: { id: ids.chapterBlockId },
      }),
      native: await prisma.blockVersion.findUniqueOrThrow({
        where: { id: ids.versionId },
      }),
      highlights: await prisma.highlight.findMany({ orderBy: { id: "asc" } }),
    };

    const p = await plan();
    expect(p.ops).toHaveLength(1);
    const preimages = await apply(p);

    // ── check ────────────────────────────────────────────────────────────
    const afterLegacy = await prisma.chapterBlock.findUniqueOrThrow({
      where: { id: ids.chapterBlockId },
    });
    const afterNative = await prisma.blockVersion.findUniqueOrThrow({
      where: { id: ids.versionId },
    });
    expect(afterLegacy.content).toBe(REPAIRED);
    expect(afterNative.content).toBe(REPAIRED);
    expect(afterNative.contentHash).toBe(contentHash(REPAIRED));
    // The unrelated metadata key survived the repair.
    expect((afterLegacy.meta as Record<string, unknown>).audioId).toBe("a-1");
    expect(
      blockVersionDrifts(
        afterNative,
        expectedBlockVersionFields(afterLegacy as never),
      ),
    ).toBe(false);
    // Identities untouched.
    expect(afterLegacy.id).toBe(initial.legacy.id);
    expect(afterNative.id).toBe(initial.native.id);
    // And the marks still select the same words.
    const movedQuote = await prisma.highlight.findUniqueOrThrow({
      where: { id: withQuote.id },
    });
    expect(REPAIRED.slice(movedQuote.startOffset, movedQuote.endOffset)).toBe(
      "conducta",
    );
    const movedNull = await prisma.highlight.findUniqueOrThrow({
      where: { id: withoutQuote.id },
    });
    expect(REPAIRED.slice(movedNull.startOffset, movedNull.endOffset)).toBe(
      "Un",
    );

    // ── revert ───────────────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      await revertEmphasisRepair(tx as never, p, preimages);
    });

    // ── compare ──────────────────────────────────────────────────────────
    const back = {
      legacy: await prisma.chapterBlock.findUniqueOrThrow({
        where: { id: ids.chapterBlockId },
      }),
      native: await prisma.blockVersion.findUniqueOrThrow({
        where: { id: ids.versionId },
      }),
      highlights: await prisma.highlight.findMany({ orderBy: { id: "asc" } }),
    };
    expect(back.legacy.content).toBe(initial.legacy.content);
    expect(back.legacy.meta).toEqual(initial.legacy.meta);
    expect(back.native.content).toBe(initial.native.content);
    expect(back.native.contentHash).toBe(initial.native.contentHash);
    expect(back.native.meta).toEqual(initial.native.meta);
    expect(back.highlights.map((h) => h.id)).toEqual(
      initial.highlights.map((h) => h.id),
    );
    expect(back.highlights.map((h) => [h.startOffset, h.endOffset])).toEqual(
      initial.highlights.map((h) => [h.startOffset, h.endOffset]),
    );
    // `null` came back as `null`.
    expect(back.highlights.map((h) => h.quote)).toEqual(
      initial.highlights.map((h) => h.quote),
    );
    // And planning again proposes the repair once more, from the start.
    expect((await plan()).ops).toHaveLength(1);
  }, 120_000);

  it("the revert refuses to overwrite a change made after the repair", async () => {
    const ids = await makeBlock({ order: 1, content: TEXT });
    const p = await plan();
    const preimages = await apply(p);

    // An editor improves the repaired paragraph. The revert must not silently
    // throw that away to put asterisks back.
    await prisma.chapterBlock.update({
      where: { id: ids.chapterBlockId },
      data: { content: `${REPAIRED} y algo más` },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await revertEmphasisRepair(tx as never, p, preimages);
      }),
    ).rejects.toThrow(POSTIMAGE_MISMATCH);

    const still = await prisma.chapterBlock.findUniqueOrThrow({
      where: { id: ids.chapterBlockId },
    });
    expect(still.content).toBe(`${REPAIRED} y algo más`);
  }, 60_000);

  it("a failure partway through leaves no partial repair", async () => {
    const first = await makeBlock({ order: 1, content: TEXT });
    const second = await makeBlock({
      order: 2,
      content: "Otro **texto** aquí",
    });
    const p = await plan();
    expect(p.ops).toHaveLength(2);

    // Make the SECOND op fail: its block is edited after planning.
    const secondOp = p.ops.find(
      (o) => o.chapterBlockId === second.chapterBlockId,
    )!;
    await prisma.chapterBlock.update({
      where: { id: secondOp.chapterBlockId },
      data: { content: "Otro **texto** aquí, editado" },
    });

    await expect(apply(p)).rejects.toThrow(CONCURRENT_CHANGE);

    // The first block is untouched: one transaction, all or nothing. A chapter
    // half in one convention and half in the other is not a state to have.
    const firstRow = await prisma.chapterBlock.findUniqueOrThrow({
      where: { id: first.chapterBlockId },
    });
    expect(firstRow.content).toBe(TEXT);
    const firstVersion = await prisma.blockVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    expect(firstVersion.content).toBe(TEXT);
  }, 60_000);

  // ── The volume rehearsal ────────────────────────────────────────────────

  it("rehearses apply and revert at the volume the plan proposes", async () => {
    const N = 732;
    const legacyIds = Array.from({ length: N }, (_, i) => `cb-vol-${i}`);
    await prisma.chapterBlock.createMany({
      data: legacyIds.map((id, i) => ({
        id,
        chapterId,
        order: i + 1,
        kind: "PARAGRAPH" as never,
        content: `Bloque ${i} con **énfasis ${i}** y *cursiva ${i}* al final.`,
      })),
    });
    await prisma.contentBlock.createMany({
      data: legacyIds.map((id) => ({
        id: `ccb-vol-${id}`,
        unitId,
        blockKey: `bk-${id}`,
        legacyBlockId: id,
      })),
    });
    await prisma.blockVersion.createMany({
      data: legacyIds.map((id, i) => {
        const content = `Bloque ${i} con **énfasis ${i}** y *cursiva ${i}* al final.`;
        return {
          id: `bv-vol-${id}`,
          contentBlockId: `ccb-vol-${id}`,
          unitVersionId,
          order: i + 1,
          kind: "PARAGRAPH" as never,
          content,
          contentHash: contentHash(content),
        };
      }),
    });

    const tPlan = Date.now();
    const p = await plan();
    const planMs = Date.now() - tPlan;
    expect(p.ops).toHaveLength(N);

    const tApply = Date.now();
    const preimages = await apply(p);
    const applyMs = Date.now() - tApply;
    expect(preimages).toHaveLength(N);

    // Converged, and with no drift anywhere.
    expect((await plan()).ops).toHaveLength(0);
    const sample = await prisma.blockVersion.findMany({
      where: { id: { in: ["bv-vol-cb-vol-0", "bv-vol-cb-vol-731"] } },
    });
    for (const v of sample) {
      expect(v.content).not.toContain("*");
      expect(v.contentHash).toBe(contentHash(v.content));
    }

    const tRevert = Date.now();
    await prisma.$transaction(
      async (tx) => {
        await revertEmphasisRepair(tx as never, p, preimages);
      },
      { timeout: 120_000 },
    );
    const revertMs = Date.now() - tRevert;

    // Back where it started, and the plan proposes the same work again.
    expect((await plan()).ops).toHaveLength(N);

    // Printed rather than asserted on: these are the operational limits the
    // runbook needs, and pinning a millisecond count to a laptop would be a
    // test about the laptop.
    console.log(
      `volumen ${N} bloques · plan ${planMs} ms · apply ${applyMs} ms · revert ${revertMs} ms`,
    );
    // What IS asserted: the whole thing fits inside one transaction without
    // needing a longer timeout than the default the CLI uses.
    expect(applyMs).toBeLessThan(120_000);
  }, 600_000);
});
