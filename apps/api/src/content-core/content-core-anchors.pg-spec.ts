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
 * now carry a stable `contentBlockId` + `quote`, that dual-read resolves via both
 * the new FK and the legacy fallback, that a rerun is a no-op, and that no legacy
 * column/row was dropped. Own dedicated database (extensions are per-DB).
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
    let blockId: string;
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
      const book = await prisma.book.create({
        data: { slug: "anchor-book", title: "Anchor" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "C1" },
      });
      const block = await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "El miedo no es el enemigo.",
        },
      });
      blockId = block.id;

      // "el enemigo" is at [15, 25].
      const h = await prisma.highlight.create({
        data: {
          userId: user.id,
          blockId: block.id,
          startOffset: 15,
          endOffset: 25,
        },
      });
      highlightId = h.id;
      const a = await prisma.annotation.create({
        data: { userId: user.id, blockId: block.id, text: "una nota" },
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
      // Legacy blockId is untouched.
      expect(h!.blockId).toBe(blockId);

      const cb = await prisma.contentBlock.findUnique({
        where: { id: h!.contentBlockId! },
      });
      expect(cb!.legacyBlockId).toBe(blockId);
    });

    it("re-points the Annotation (quote stays null — block-level note)", async () => {
      const a = await prisma.annotation.findUnique({
        where: { id: annotationId },
      });
      expect(a!.contentBlockId).toBeTruthy();
      expect(a!.quote).toBeNull();
      expect(a!.blockId).toBe(blockId);
    });

    it("dual-read prefers contentBlockId when present", async () => {
      const h = await prisma.highlight.findUnique({
        where: { id: highlightId },
      });
      const resolved = await resolveAnchorContentBlockId(prisma, h!);
      expect(resolved).toBe(h!.contentBlockId);
    });

    it("dual-read falls back to the legacy blockId when contentBlockId is null", async () => {
      const resolved = await resolveAnchorContentBlockId(prisma, {
        contentBlockId: null,
        blockId,
      });
      const cb = await prisma.contentBlock.findUnique({
        where: { legacyBlockId: blockId },
      });
      expect(resolved).toBe(cb!.id);
    });

    it("is idempotent — the second run touches nothing new", async () => {
      expect(firstRun).toEqual({ highlights: 1, annotations: 1 });
      expect(secondRun).toEqual({ highlights: 0, annotations: 0 });
    });

    it("drops nothing — legacy rows + blockId FK remain intact", async () => {
      expect(await prisma.chapterBlock.count()).toBe(1);
      const h = await prisma.highlight.findUnique({
        where: { id: highlightId },
      });
      expect(h!.blockId).toBe(blockId);
    });
  },
);
