import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "./backfill";
import { ingestUnitV2, type IngestBlockInput } from "./ingest-v2";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * Content Core (CC-5) — ingest-v2 serialization + identity, on Postgres 18.
 *
 * Seeds a 2-chapter book (unit A + unit B), backfills a base revision, then
 * asserts: a unit ingest requires a published base revision; two CONCURRENT
 * ingests on different units both survive in the final manifest (Edition
 * FOR UPDATE lock); a failure before publish rolls back fully leaving the pointer
 * intact; and two IDENTICAL new blocks get distinct stable keys. Own dedicated DB.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc5_ingest_conc_db";
const API_DIR = process.cwd();

const A1 = "Alfa uno, del capítulo primero, con texto suficiente.";
const A2 = "Alfa dos, un bloque completamente distinto del resto.";
const A3 = "Alfa tres, el bloque final del primer capítulo aquí.";
const B1 = "Beta uno, del capítulo segundo, con texto suficiente.";
const B2 = "Beta dos, un bloque completamente distinto del resto.";
const A_NEW = "Alfa nuevo — bloque agregado por el ingest concurrente A.";
const B_NEW = "Beta nuevo — bloque agregado por el ingest concurrente B.";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}
function p(content: string): IngestBlockInput {
  return { kind: "PARAGRAPH", content };
}

suite(
  "Content Core · CC-5 ingest-v2 serialization + identity (real PG)",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;
    let editionId: string;
    let unitKeyA: string;
    let unitKeyB: string;

    const placeA = { order: 1, partNumber: null, partTitle: null };
    const placeB = { order: 2, partNumber: null, partTitle: null };

    async function publishedBlocks(
      uKey: string,
    ): Promise<Array<{ blockKey: string; content: string }>> {
      const ed = await prisma.edition.findUnique({ where: { id: editionId } });
      const ru = await prisma.revisionUnit.findFirst({
        where: {
          revisionId: ed!.publishedRevisionId!,
          unit: { unitKey: uKey },
        },
      });
      const bvs = await prisma.blockVersion.findMany({
        where: { unitVersionId: ru!.unitVersionId },
        include: { contentBlock: true },
        orderBy: { order: "asc" },
      });
      return bvs.map((bv) => ({
        blockKey: bv.contentBlock.blockKey,
        content: bv.content,
      }));
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

      const book = await prisma.book.create({
        data: { slug: "conc-book", title: "Conc" },
      });
      const chA = await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "A" },
      });
      const chB = await prisma.chapter.create({
        data: { bookId: book.id, order: 2, title: "B" },
      });
      unitKeyA = unitKeyFromLegacyChapterId(chA.id);
      unitKeyB = unitKeyFromLegacyChapterId(chB.id);
      await prisma.chapterBlock.createMany({
        data: [
          { chapterId: chA.id, order: 0, kind: "PARAGRAPH", content: A1 },
          { chapterId: chA.id, order: 1, kind: "PARAGRAPH", content: A2 },
          { chapterId: chA.id, order: 2, kind: "PARAGRAPH", content: A3 },
          { chapterId: chB.id, order: 0, kind: "PARAGRAPH", content: B1 },
          { chapterId: chB.id, order: 1, kind: "PARAGRAPH", content: B2 },
        ],
      });

      await backfillContentCore(prisma);
      const ed = await prisma.edition.findUnique({
        where: { editionKey: "conc-book-1e" },
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

    it("a unit ingest requires a published base revision", async () => {
      // A bare edition with no publishedRevisionId — a unit ingest must refuse.
      const work = await prisma.work.create({
        data: { workKey: "bare-w", title: "Bare", authorName: "N" },
      });
      const bare = await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: "bare-e",
          slug: "bare-e",
          label: "Bare",
        },
      });
      await expect(
        ingestUnitV2(prisma, {
          editionId: bare.id,
          unitKey: "some-unit",
          title: "X",
          placement: placeA,
          blocks: [p("x")],
        }),
      ).rejects.toThrow(/INGEST_REQUIRES_BASE_REVISION/);
    });

    it("two concurrent ingests on different units — both changes survive", async () => {
      await Promise.all([
        ingestUnitV2(prisma, {
          editionId,
          unitKey: unitKeyA,
          title: "A",
          placement: placeA,
          blocks: [p(A1), p(A2), p(A3), p(A_NEW)],
        }),
        ingestUnitV2(prisma, {
          editionId,
          unitKey: unitKeyB,
          title: "B",
          placement: placeB,
          blocks: [p(B1), p(B2), p(B_NEW)],
        }),
      ]);

      // The last-published revision copies the other's change forward, not clobbers.
      const ed = await prisma.edition.findUnique({ where: { id: editionId } });
      const rev = await prisma.revision.findUnique({
        where: { id: ed!.publishedRevisionId! },
        include: { units: true },
      });
      expect(rev!.number).toBe(3); // base 1 + two ingests
      expect(rev!.units).toHaveLength(2);

      const aContents = (await publishedBlocks(unitKeyA)).map((b) => b.content);
      const bContents = (await publishedBlocks(unitKeyB)).map((b) => b.content);
      expect(aContents).toContain(A_NEW);
      expect(bContents).toContain(B_NEW);
    });

    it("a failure before publish rolls back fully — the pointer stays intact", async () => {
      const ed = await prisma.edition.findUnique({ where: { id: editionId } });
      const pointerBefore = ed!.publishedRevisionId;
      const revsBefore = await prisma.revision.count();
      const blocksBefore = await prisma.contentBlock.count();

      // placement.order = 2 collides with unit B → throws AFTER the draft revision +
      // a brand-new ContentBlock ("ZZZ") were created inside the transaction.
      await expect(
        ingestUnitV2(prisma, {
          editionId,
          unitKey: unitKeyA,
          title: "A",
          placement: { order: 2, partNumber: null, partTitle: null },
          blocks: [p(A1), p(A2), p(A3), p(A_NEW), p("ZZZ debe revertirse")],
        }),
      ).rejects.toThrow(/MANIFEST_PLACEMENT_COLLISION/);

      const edAfter = await prisma.edition.findUnique({
        where: { id: editionId },
      });
      expect(edAfter!.publishedRevisionId).toBe(pointerBefore);
      expect(await prisma.revision.count()).toBe(revsBefore); // draft rolled back
      expect(await prisma.contentBlock.count()).toBe(blocksBefore); // ZZZ rolled back
    });

    it("two identical new blocks in the same unit get distinct stable keys", async () => {
      const dup = "DUPLICADO idéntico dentro de la misma unidad y revisión.";
      await ingestUnitV2(prisma, {
        editionId,
        unitKey: unitKeyA,
        title: "A",
        placement: placeA,
        blocks: [p(dup), p(dup)],
      });

      const blocks = await publishedBlocks(unitKeyA);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].content).toBe(dup);
      expect(blocks[1].content).toBe(dup);
      expect(blocks[0].blockKey).not.toBe(blocks[1].blockKey);
      expect(new Set(blocks.map((b) => b.blockKey)).size).toBe(2);
    });
  },
);
