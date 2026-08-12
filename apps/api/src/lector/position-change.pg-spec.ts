import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContentAccessService } from "../content-core/access/content-access.service";
import { BooksService } from "../books/books.service";
import { HomeService } from "../home/home.service";
import { LectorService } from "./lector.service";

/**
 * The proof Phase B.A exists for: a chapter survives being moved.
 *
 * No reorder feature is being built here. These suites rearrange a book by
 * writing revisions and rows directly, which is the only way to ask the
 * question before the feature exists — and asking it now is the point, because
 * every guarantee in this PR is about what happens when a book changes shape.
 *
 * Against real Postgres throughout. "Which chapter does this identity name
 * after the move" is a query across three tables; a mock would only prove that
 * the stubs I wrote agree with the code I wrote.
 *
 * Two fixtures, because the two structures fail differently:
 *
 *   native  — B is a ContentUnit with no Chapter row; placement moves.
 *   legacy  — B is a Chapter row; `Chapter.order` moves.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

function connect(db: string) {
  const url = new URL(base as string);
  url.pathname = `/${db}`;
  return url.toString();
}

async function freshDatabase(db: string) {
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();
  const url = connect(db);
  execSync("pnpm exec prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
    stdio: "inherit",
  });
  const pool = new Pool({ connectionString: url });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}

async function dropDatabase(db: string) {
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.end();
}

// ─── native ─────────────────────────────────────────────────────────────────

suite("a NATIVE chapter that moves", () => {
  const DB = "pos_change_native_db";
  const SLUG = "libro-nativo-mov";
  const USER = "u-native-move";

  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let books: BooksService;
  let home: HomeService;
  let editionId = "";
  let bookId = "";
  const unitId: Record<string, string> = {};
  const versionId: Record<string, string> = {};
  let blockKeyB = "";
  let contentBlockIdB = "";
  let blockVersionIdB = "";

  const config = { get: () => undefined } as never;

  beforeAll(async () => {
    ({ prisma, pool } = await freshDatabase(DB));
    lector = new LectorService(
      prisma as never,
      config,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );
    books = new BooksService(prisma as never, config);
    home = new HomeService(
      prisma as never,
      { getForHome: async () => null } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "nmove@test.local", name: "N" },
    });
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "FREE", totalChapters: 3 },
    });
    bookId = book.id;

    const work = await prisma.work.create({
      data: { workKey: "w-nmove", title: "Libro", authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "libro-nativo-mov-1e", // gitleaks:allow — a book slug
        slug: SLUG,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    editionId = edition.id;

    for (const key of ["A", "B", "C"]) {
      const unit = await prisma.contentUnit.create({
        data: { editionId, unitKey: `key-${key}`, isFreePreview: true },
      });
      unitId[key] = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: `Capítulo ${key}` },
      });
      versionId[key] = version.id;
      const block = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: `bk-${key}` },
      });
      const bv = await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto de ${key}.`,
          contentHash: `hash-${key}`,
        },
      });
      if (key === "B") {
        blockKeyB = block.blockKey;
        contentBlockIdB = block.id;
        blockVersionIdB = bv.id;
      }
    }

    // Revision 1 — A, B, C.
    await publish(1, { A: 1, B: 2, C: 3 });
  }, 300_000);

  /** Publish a revision placing each unit at the given order. */
  async function publish(number: number, at: Record<string, number>) {
    const revision = await prisma.revision.create({
      data: {
        editionId,
        number,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    for (const [key, order] of Object.entries(at)) {
      await prisma.revisionUnit.create({
        data: {
          revisionId: revision.id,
          unitId: unitId[key],
          // The SAME version: this is a structural move, not an edit. Editing
          // B's text to test a reorder would prove the wrong thing.
          unitVersionId: versionId[key],
          order,
        },
      });
    }
    await prisma.edition.update({
      where: { id: editionId },
      data: { publishedRevisionId: revision.id },
    });
  }

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    await dropDatabase(DB);
  });

  const openB = () =>
    lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "unit",
      id: unitId.B,
    });

  it("B starts at position 2, and reading it leaves state behind", async () => {
    const before = await openB();
    expect(before.chapter.order).toBe(2);
    expect(before.chapter.contentUnitId).toBe(unitId.B);

    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2,
      contentUnitId: unitId.B,
      lastBlockId: blockKeyB,
      timeSpentDeltaSec: 30,
      progressPct: 0.5,
    });
    await prisma.highlight.create({
      data: {
        userId: USER,
        // `Highlight_anchor_present` requires a block anchor; the version is
        // the provenance beside it (CC-6C / #652), not a substitute for it.
        contentBlockId: contentBlockIdB,
        blockVersionId: blockVersionIdB,
        quote: "Texto",
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });

    const session = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId.B },
    });
    expect(session?.progressPct).toBeCloseTo(0.5);
  });

  it("MOVE: revision 2 places C, A, B", async () => {
    await publish(2, { C: 1, A: 2, B: 3 });
    const placed = await prisma.revisionUnit.findMany({
      where: {
        revision: { editionId, number: 2 },
      },
      select: { order: true, unitId: true },
      orderBy: { order: "asc" },
    });
    expect(placed.map((p) => p.unitId)).toEqual([unitId.C, unitId.A, unitId.B]);
  });

  it("the same stable URL still opens B — now at position 3", async () => {
    const after = await openB();

    expect(after.chapter.contentUnitId).toBe(unitId.B);
    expect(after.chapter.contentUnitKey).toBe("key-B");
    expect(after.chapter.readerRef).toEqual({ kind: "unit", id: unitId.B });
    // The position moved with the book; the identity did not.
    expect(after.chapter.order).toBe(3);
    expect(after.chapter.title).toBe("Capítulo B");
  });

  it("B keeps its session and progress; A inherits nothing", async () => {
    const bSession = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId.B },
    });
    expect(bSession?.progressPct).toBeCloseTo(0.5);

    // A now sits where B was. It must have no trace of B's reading.
    const aSession = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId.A },
    });
    expect(aSession).toBeNull();
    const aProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: unitId.A },
    });
    expect(aProgress).toBeNull();
  });

  it("B keeps its highlight, anchored to the same block version", async () => {
    // A native chapter's marks are served by the CC-6C surface, not by the
    // envelope, so this asserts the anchor itself: the row still points at
    // B's block and B's version. #652's guarantee, across a structural move.
    const row = await prisma.highlight.findFirstOrThrow({
      where: { userId: USER, contentBlockId: contentBlockIdB },
    });
    expect(row.blockVersionId).toBe(blockVersionIdB);

    const block = await prisma.contentBlock.findFirstOrThrow({
      where: { id: contentBlockIdB },
      select: { blockKey: true, unitId: true },
    });
    expect(block.blockKey).toBe(blockKeyB);
    // Still B's block, not the block of whoever now occupies position 2.
    expect(block.unitId).toBe(unitId.B);

    const onA = await prisma.highlight.count({
      where: { userId: USER, contentBlock: { unitId: unitId.A } },
    });
    expect(onA).toBe(0);
  });

  it("a STALE tab still writes to B, using the position B used to have", async () => {
    // The tab was opened before the move and has never reloaded: every
    // heartbeat it sends still says "position 2", which is now A.
    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2,
      contentUnitId: unitId.B,
      lastBlockId: blockKeyB,
      timeSpentDeltaSec: 20,
      progressPct: 0.8,
    });

    const bSession = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId.B },
    });
    expect(bSession?.progressPct).toBeCloseTo(0.8);
    const aSession = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId.A },
    });
    expect(aSession).toBeNull();
  });

  it("a STALE completion completes B, not whoever took its place", async () => {
    await lector.completeChapter(USER, SLUG, 2, unitId.B);

    const bProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: unitId.B },
    });
    expect(bProgress).not.toBeNull();
    const aProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: unitId.A },
    });
    expect(aProgress).toBeNull();
  });

  it("the positional URL means the CURRENT occupant, not B", async () => {
    // This is the other half of the contract: a position is a locator, and a
    // locator answers about now.
    const { readerRef } = await lector.getLocator(
      USER,
      "FREE" as never,
      SLUG,
      2,
    );
    expect(readerRef).toEqual({ kind: "unit", id: unitId.A });
  });

  it("Home and Book Detail still name B by the same identity", async () => {
    const detail = await books.getDetail(USER, SLUG);
    const rowB = detail.chaptersList.find(
      (c) => c.readerRef.kind === "unit" && c.readerRef.id === unitId.B,
    );
    expect(rowB).toBeDefined();
    // Listed at its CURRENT position, named by its unchanged identity.
    expect(rowB!.n).toBe(3);

    const card = (await home.getHome(USER)).continueBook;
    expect(card?.readerRef).toEqual({ kind: "unit", id: unitId.B });
    expect(card?.chapterN).toBe(3);
  });

  it("completion's next chapter comes from the CURRENT order", async () => {
    // B is last now, so there is nothing after it — even though before the
    // move position 2 was followed by 3.
    const res = await lector.completeChapter(USER, SLUG, 2, unitId.B);
    expect(res.nextChapter).toBeNull();
    expect(res.nextReaderRef).toBeNull();

    // And C, now first, is followed by A.
    const fromC = await lector.completeChapter(USER, SLUG, 1, unitId.C);
    expect(fromC.nextReaderRef).toEqual({ kind: "unit", id: unitId.A });
  });
});

// ─── legacy ─────────────────────────────────────────────────────────────────

suite("a LEGACY chapter that moves", () => {
  const DB = "pos_change_legacy_db";
  const SLUG = "libro-legado-mov";
  const USER = "u-legacy-move";

  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let books: BooksService;
  let home: HomeService;
  let bookId = "";
  const chapterId: Record<string, string> = {};
  let blockIdB = "";

  const config = { get: () => undefined } as never;

  beforeAll(async () => {
    ({ prisma, pool } = await freshDatabase(DB));
    lector = new LectorService(
      prisma as never,
      config,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );
    books = new BooksService(prisma as never, config);
    home = new HomeService(
      prisma as never,
      { getForHome: async () => null } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "lmove@test.local", name: "L" },
    });
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "FREE", totalChapters: 3 },
    });
    bookId = book.id;

    for (const [order, key] of [
      [1, "A"],
      [2, "B"],
      [3, "C"],
    ] as const) {
      const ch = await prisma.chapter.create({
        data: {
          bookId,
          order,
          title: `Capítulo ${key}`,
          isPublished: true,
        },
      });
      chapterId[key] = ch.id;
      const block = await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto de ${key}.`,
        },
      });
      if (key === "B") blockIdB = block.id;
    }
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    await dropDatabase(DB);
  });

  const openB = () =>
    lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "chapter",
      id: chapterId.B,
    });

  it("B starts at position 2, and reading it leaves state behind", async () => {
    const before = await openB();
    expect(before.chapter.order).toBe(2);
    expect(before.chapter.id).toBe(chapterId.B);

    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2,
      chapterId: chapterId.B,
      lastBlockId: blockIdB,
      timeSpentDeltaSec: 30,
      progressPct: 0.5,
    });
    await prisma.highlight.create({
      data: {
        userId: USER,
        blockId: blockIdB,
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });

    const session = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(session?.progressPct).toBeCloseTo(0.5);
  });

  it("MOVE: C, A, B — through a collision-safe sequence", async () => {
    // `@@unique([bookId, order])` means the rows cannot simply be renumbered
    // in place. Park them above the range first, then land them.
    await prisma.$transaction(async (tx) => {
      for (const key of ["A", "B", "C"] as const) {
        await tx.chapter.update({
          where: { id: chapterId[key] },
          data: { order: { increment: 100 } },
        });
      }
      for (const [key, order] of [
        ["C", 1],
        ["A", 2],
        ["B", 3],
      ] as const) {
        await tx.chapter.update({
          where: { id: chapterId[key] },
          data: { order },
        });
      }
    });

    const rows = await prisma.chapter.findMany({
      where: { bookId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    expect(rows.map((r) => r.id)).toEqual([
      chapterId.C,
      chapterId.A,
      chapterId.B,
    ]);
  });

  it("the same stable URL still opens B — now at position 3", async () => {
    const after = await openB();

    expect(after.chapter.id).toBe(chapterId.B);
    expect(after.chapter.readerRef).toEqual({
      kind: "chapter",
      id: chapterId.B,
    });
    expect(after.chapter.order).toBe(3);
    expect(after.chapter.title).toBe("Capítulo B");
  });

  it("B keeps its session and progress; A inherits nothing", async () => {
    const bSession = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(bSession?.progressPct).toBeCloseTo(0.5);

    const aSession = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(aSession).toBeNull();
    const aProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(aProgress).toBeNull();
  });

  it("B keeps its highlight; A has none", async () => {
    const after = await openB();
    expect(after.highlights).toHaveLength(1);

    const a = await lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "chapter",
      id: chapterId.A,
    });
    expect(a.highlights).toHaveLength(0);
  });

  /**
   * The acceptance test for the C1 repair.
   *
   * Before it, a legacy write carried only `(bookId, chapterOrder)`. A tab open
   * across this move would have credited B's reading time to A — the stable URL
   * would have been correct while the writes behind it were not.
   */
  it("a STALE tab still writes to B, using the position B used to have", async () => {
    // A was opened by an earlier assertion, so it already has a session of its
    // own — the claim is that this write does not touch it, not that it has
    // never existed.
    const aBefore = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });

    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2, // stale: position 2 is A now
      chapterId: chapterId.B, // stable: still B
      lastBlockId: blockIdB,
      timeSpentDeltaSec: 20,
      progressPct: 0.8,
    });

    const bSession = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(bSession?.progressPct).toBeCloseTo(0.8);

    const aAfter = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(aAfter?.progressPct ?? null).toBe(aBefore?.progressPct ?? null);
    expect(aAfter?.timeSpentSec ?? null).toBe(aBefore?.timeSpentSec ?? null);
    // The number this write would have landed on before the C1 repair.
    expect(aAfter?.progressPct ?? 0).not.toBeCloseTo(0.8);
  });

  it("a STALE completion completes B, not whoever took its place", async () => {
    await lector.completeChapter(USER, SLUG, 2, undefined, chapterId.B);

    const bProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(bProgress).not.toBeNull();
    const aProgress = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(aProgress).toBeNull();
  });

  it("a stale completion's NEXT comes from B's current position", async () => {
    // Path says 2, but B is last — so there is nothing after it.
    const res = await lector.completeChapter(
      USER,
      SLUG,
      2,
      undefined,
      chapterId.B,
    );
    expect(res.nextChapter).toBeNull();
    expect(res.nextReaderRef).toBeNull();
  });

  it("the positional URL means the CURRENT occupant, not B", async () => {
    const { readerRef } = await lector.getLocator(
      USER,
      "FREE" as never,
      SLUG,
      2,
    );
    expect(readerRef).toEqual({ kind: "chapter", id: chapterId.A });
  });

  it("Home and Book Detail still name B by the same identity", async () => {
    const detail = await books.getDetail(USER, SLUG);
    const rowB = detail.chaptersList.find(
      (c) => c.readerRef.kind === "chapter" && c.readerRef.id === chapterId.B,
    );
    expect(rowB).toBeDefined();
    expect(rowB!.n).toBe(3);

    const card = (await home.getHome(USER)).continueBook;
    expect(card?.readerRef).toEqual({ kind: "chapter", id: chapterId.B });
    expect(card?.chapterN).toBe(3);
  });

  it("an old client that sends NEITHER identity keeps the old behaviour", async () => {
    // Position 2 is A now, so a positional write lands on A — correct, and
    // exactly what an un-updated client has always done.
    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2,
      lastBlockId: "irrelevant",
      timeSpentDeltaSec: 10,
      progressPct: 0.2,
    });

    const aSession = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(aSession?.progressPct).toBeCloseTo(0.2);
  });

  it("a request naming BOTH identities is refused, not guessed", async () => {
    await expect(
      lector.heartbeat(USER, {
        bookId,
        chapterOrder: 2,
        chapterId: chapterId.B,
        contentUnitId: "some-unit",
        lastBlockId: blockIdB,
        timeSpentDeltaSec: 5,
        progressPct: 0.9,
      }),
    ).rejects.toThrow(/AMBIGUOUS_READER_WRITE_IDENTITY/);

    await expect(
      lector.completeChapter(USER, SLUG, 2, "some-unit", chapterId.B),
    ).rejects.toThrow(/AMBIGUOUS_READER_WRITE_IDENTITY/);
  });
});
