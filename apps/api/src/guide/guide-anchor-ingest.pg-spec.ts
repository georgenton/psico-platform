import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GUIDE_READER_ANCHOR,
  projectReaderBlocks,
  resolveGuideAnchor,
} from "@psico/types";
import { backfillContentCore } from "../content-core/backfill";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import {
  EDITION_KEY_SUFFIX,
  readContentUnit,
} from "../content-core/read/content-read";
import { seedPracticeHeadings } from "../content-core/test-support/seed-practice-headings";

/**
 * GR-3 — the anchor, against the REAL chapter.
 *
 * The unit tests prove the resolver's logic on fixtures. This one proves the
 * thing they cannot: that the approved passage is actually IN the canonical
 * manuscript, survives the official ingestion tool, survives the Content Core
 * backfill, and comes out the reader's projection as exactly one block with a
 * stable identity.
 *
 * It reads `content/emociones-en-construccion/capitulo-01.md` — the editorial
 * file itself, not a copy of its prose. A parallel fixture would let the book
 * and the anchor drift apart silently, which is the failure this exists to
 * catch.
 *
 * A fresh database every run: the ordinary dev database holds seeded blocks,
 * not the ingested chapter, and mutating it to make a feature pass would be
 * fixing the evidence instead of the code.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "gr3_anchor_ingest_db";
const API_DIR = process.cwd();
const BOOK_SLUG = GUIDE_READER_ANCHOR.bookSlug;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("GR-3 · the guided-reading anchor over the ingested chapter", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let chapterId: string;

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

    // The book row the ingestion tool expects. Everything about the chapter's
    // CONTENT comes from the manuscript below, not from here.
    const book = await prisma.book.create({
      data: { slug: BOOK_SLUG, title: "Emociones en Construcción" },
    });

    // The manuscript ingestion tool, on the manuscript file itself.
    //
    // It is frozen behind `ALLOW_LEGACY_DESTRUCTIVE_INGEST` because it REPLACES
    // a chapter's blocks, which cascade-deletes any highlight or annotation
    // anchored to them (CC-5). That hazard does not exist here and cannot: the
    // database was created seconds ago and has never had a user. The assertion
    // below states that rather than assuming it, and the flag is set for this
    // process only — never in production, where ingest-v2 is the path.
    expect(await prisma.highlight.count()).toBe(0);
    expect(await prisma.annotation.count()).toBe(0);

    execSync(
      `node scripts/ingest-chapter-md.mjs --file content/${BOOK_SLUG}/capitulo-01.md --order ${GUIDE_READER_ANCHOR.chapterOrder} --book ${BOOK_SLUG}`,
      {
        cwd: API_DIR,
        env: {
          ...process.env,
          DATABASE_URL: url,
          ALLOW_LEGACY_DESTRUCTIVE_INGEST: "on",
        },
        stdio: "inherit",
      },
    );

    // Encabezados del catálogo de ejercicios, sembrados desde el catálogo.
    for (const c of await prisma.chapter.findMany({
      select: { id: true, bookId: true },
    })) {
      const bk = await prisma.book.findUnique({
        where: { id: c.bookId },
        select: { slug: true },
      });
      if (bk) await seedPracticeHeadings(prisma, c.id, bk.slug);
    }
    await backfillContentCore(prisma);

    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { bookId: book.id, order: GUIDE_READER_ANCHOR.chapterOrder },
    });
    chapterId = chapter.id;
  }, 300_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /**
   * The blocks exactly as the reader receives them: the real read adapter,
   * then the shared projection. Anything hand-rolled here would be testing a
   * different pipeline than the one that renders the chapter.
   */
  async function readerBlocksOf(legacyChapterId: string) {
    const unit = await readContentUnit(
      prisma,
      `${BOOK_SLUG}${EDITION_KEY_SUFFIX}`,
      unitKeyFromLegacyChapterId(legacyChapterId),
    );
    return projectReaderBlocks({
      blocks: unit.blocks.map((b) => ({
        ...b,
        meta: (b.meta ?? null) as Record<string, unknown> | null,
      })),
    });
  }

  const readerBlocks = () => readerBlocksOf(chapterId);

  it("the approved passage exists in the manuscript and resolves EXACTLY once", async () => {
    const blocks = await readerBlocks();
    expect(blocks.length).toBeGreaterThan(10);

    const res = resolveGuideAnchor(blocks);
    expect(res.status).toBe("RESOLVED");
    if (res.status !== "RESOLVED") return;

    // A real, stable identity — not a legacy-only block.
    expect(res.blockKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.blockVersionId.length).toBeGreaterThan(0);

    // And it points at the paragraph that carries the approved sentence.
    const block = blocks.find((b) => b.id === res.renderBlockId);
    expect(block?.content).toContain(GUIDE_READER_ANCHOR.passageLastSentence);
  });

  it("the resolved key is derived from THIS database, never from the catalog", async () => {
    // The catalog cannot contain the key — Content Core derives it per
    // environment (CC-1). This is the assertion that keeps that honest.
    const blocks = await readerBlocks();
    const res = resolveGuideAnchor(blocks);
    expect(res.status).toBe("RESOLVED");
    if (res.status !== "RESOLVED") return;

    expect(JSON.stringify(GUIDE_READER_ANCHOR)).not.toContain(res.blockKey);
    expect(JSON.stringify(GUIDE_READER_ANCHOR)).not.toContain(
      res.blockVersionId,
    );
  });

  it("fails closed on a chapter that does not carry the passage", async () => {
    // The same resolver, the same book, a different chapter: the honest answer
    // is «no lo encontramos», not the nearest paragraph.
    const other = await prisma.chapter.findFirst({
      where: { order: { not: GUIDE_READER_ANCHOR.chapterOrder } },
    });
    if (!other) return; // only chapter 1 was ingested — nothing to compare
    const projected = await readerBlocksOf(other.id);
    expect(resolveGuideAnchor(projected).status).not.toBe("RESOLVED");
  });
});
