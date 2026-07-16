import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "./backfill";
import {
  backfillAnchors,
  resolveAnchorContentBlockId,
  type AnchorBackfillStats,
} from "./anchors";

/**
 * Content Core (CC-4) — the REAL anchor backfill + dual-read, on Postgres 18.
 *
 * Seeds a legacy Book/Chapter/ChapterBlock + a Highlight + an Annotation, runs the
 * content backfill (CC-3) then the anchor backfill (CC-4), and asserts the anchors
 * carry a stable `contentBlockId` + `quote`, that dual-read resolves stable /
 * legacy-fallback / throws on identity mismatch, that quotes fail closed on invalid
 * offsets, that a partial row completes on rerun, and that no legacy column/row was
 * dropped. Own dedicated database (extensions are per-DB).
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc4_anchors_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite(
  "Content Core · CC-4 anchor backfill + dual-read (real PostgreSQL)",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;
    let userId: string;
    let block1Id: string;
    let block2Id: string;
    let highlightId: string;
    let annotationId: string;
    let firstRun: AnchorBackfillStats;
    let secondRun: AnchorBackfillStats;

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
        data: { email: "anchor@test.local", name: "Anchor" },
      });
      userId = user.id;
      const book = await prisma.book.create({
        data: { slug: "anchor-book", title: "Anchor" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "C1" },
      });
      const block1 = await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "El miedo no es el enemigo.",
        },
      });
      block1Id = block1.id;
      const block2 = await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 1,
          kind: "PARAGRAPH",
          content: "Otro.",
        },
      });
      block2Id = block2.id;

      // "el enemigo" is at [15, 25].
      const h = await prisma.highlight.create({
        data: {
          userId: user.id,
          blockId: block1.id,
          startOffset: 15,
          endOffset: 25,
        },
      });
      highlightId = h.id;
      const a = await prisma.annotation.create({
        data: { userId: user.id, blockId: block1.id, text: "una nota" },
      });
      annotationId = a.id;

      await backfillContentCore(prisma); // ContentBlocks carry legacyBlockId
      firstRun = await backfillAnchors(prisma);
      secondRun = await backfillAnchors(prisma);
    }, 180_000);

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
      if (pool) await pool.end();
      const admin = new Pool({ connectionString: base });
      await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
      await admin.end();
    });

    it("re-points the Highlight to a stable ContentBlock + snapshots the quote", async () => {
      const h = await prisma.highlight.findUnique({
        where: { id: highlightId },
      });
      expect(h!.contentBlockId).toBeTruthy();
      expect(h!.quote).toBe("el enemigo");
      expect(h!.blockId).toBe(block1Id); // legacy untouched
      const cb = await prisma.contentBlock.findUnique({
        where: { id: h!.contentBlockId! },
      });
      expect(cb!.legacyBlockId).toBe(block1Id);
    });

    it("re-points the Annotation (quote stays null — block-level note)", async () => {
      const a = await prisma.annotation.findUnique({
        where: { id: annotationId },
      });
      expect(a!.contentBlockId).toBeTruthy();
      expect(a!.quote).toBeNull();
      expect(a!.blockId).toBe(block1Id);
    });

    it("full metrics on the first run; the second run only counts already-migrated", async () => {
      expect(firstRun).toEqual({
        highlightsLinked: 1,
        annotationsLinked: 1,
        quotesCaptured: 1,
        alreadyMigrated: 0,
        unresolved: 0,
        invalidOffsets: 0,
      });
      expect(secondRun).toEqual({
        highlightsLinked: 0,
        annotationsLinked: 0,
        quotesCaptured: 0,
        alreadyMigrated: 2,
        unresolved: 0,
        invalidOffsets: 0,
      });
    });

    it("dual-read → stable when both ids agree", async () => {
      const h = await prisma.highlight.findUnique({
        where: { id: highlightId },
      });
      const r = await resolveAnchorContentBlockId(prisma, h!);
      expect(r).toEqual({
        status: "stable",
        contentBlockId: h!.contentBlockId,
      });
    });

    it("dual-read → legacy-fallback when contentBlockId is null", async () => {
      const cb = await prisma.contentBlock.findUnique({
        where: { legacyBlockId: block1Id },
      });
      const r = await resolveAnchorContentBlockId(prisma, {
        contentBlockId: null,
        blockId: block1Id,
      });
      expect(r).toEqual({ status: "legacy-fallback", contentBlockId: cb!.id });
    });

    it("dual-read → ANCHOR_IDENTITY_MISMATCH when contentBlockId contradicts blockId", async () => {
      // contentBlockId points at block2's ContentBlock, but blockId is block1.
      const cb2 = await prisma.contentBlock.findUnique({
        where: { legacyBlockId: block2Id },
      });
      await expect(
        resolveAnchorContentBlockId(prisma, {
          contentBlockId: cb2!.id,
          blockId: block1Id,
        }),
      ).rejects.toThrow(/ANCHOR_IDENTITY_MISMATCH/);
    });

    it("quotes fail closed — invalid offsets leave quote null + count invalidOffsets", async () => {
      const bad = await prisma.highlight.create({
        data: { userId, blockId: block1Id, startOffset: 0, endOffset: 9999 },
      });
      const r = await backfillAnchors(prisma);
      expect(r.invalidOffsets).toBe(1);
      const h = await prisma.highlight.findUnique({ where: { id: bad.id } });
      expect(h!.contentBlockId).toBeTruthy(); // still linked
      expect(h!.quote).toBeNull(); // never fabricated
      // clean up so it doesn't skew later runs' counts
      await prisma.highlight.delete({ where: { id: bad.id } });
    });

    it("completes the quote of a partially-migrated row on rerun", async () => {
      const cb = await prisma.contentBlock.findUnique({
        where: { legacyBlockId: block1Id },
      });
      const partial = await prisma.highlight.create({
        data: {
          userId,
          blockId: block1Id,
          startOffset: 0,
          endOffset: 8,
          contentBlockId: cb!.id, // linked but quote not yet captured
        },
      });
      const r = await backfillAnchors(prisma);
      expect(r.quotesCaptured).toBeGreaterThanOrEqual(1);
      const h = await prisma.highlight.findUnique({
        where: { id: partial.id },
      });
      expect(h!.quote).toBe("El miedo"); // [0, 8)
      await prisma.highlight.delete({ where: { id: partial.id } });
    });

    it("has a contentBlockId index on both Highlight and Annotation", async () => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes
        WHERE indexname IN ('Highlight_contentBlockId_idx','Annotation_contentBlockId_idx')`,
      );
      expect(r.rows.map((x) => x.indexname).sort()).toEqual([
        "Annotation_contentBlockId_idx",
        "Highlight_contentBlockId_idx",
      ]);
    });

    it("drops nothing — legacy rows + blockId FK remain intact", async () => {
      expect(await prisma.chapterBlock.count()).toBe(2);
      const h = await prisma.highlight.findUnique({
        where: { id: highlightId },
      });
      expect(h!.blockId).toBe(block1Id);
    });
  },
);
