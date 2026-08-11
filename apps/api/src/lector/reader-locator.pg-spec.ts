import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import { publishDraftRevision } from "../content-core/content-draft";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LectorService } from "./lector.service";

/**
 * The locator answers WHERE, and writes NOTHING.
 *
 * The web positional route redirects through this. The full reader read upserts
 * a `ReadingSession` and `ReaderPreferences`, so using it to discover a redirect
 * target would record that somebody started a chapter they only passed through —
 * it would surface in their history and in Continue Reading.
 *
 * Counted against real Postgres rather than asserted against a mocked `upsert`:
 * a mock proves the call I remembered to stub was not made, which is not the
 * same claim.
 */

const DB = "reader_locator_db";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("the read-only locator", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let bookId = "";
  const USER = "u-locator";
  const SLUG = "libro-locator";

  const counts = async () => ({
    readingSession: await prisma.readingSession.count(),
    readerPreferences: await prisma.readerPreferences.count(),
    userProgress: await prisma.userProgress.count(),
    highlight: await prisma.highlight.count(),
    annotation: await prisma.annotation.count(),
  });

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = new URL(base as string);
    url.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "locator@test.local", name: "L" },
    });
    // A FREE book so entitlement never denies — this suite is about writes.
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "FREE", totalChapters: 2 },
    });
    bookId = book.id;
    for (const [order, title] of [
      [1, "Uno"],
      [2, "Dos"],
    ] as const) {
      const ch = await prisma.chapter.create({
        data: { bookId, order, title },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `T${order}`,
        },
      });
    }
    await backfillContentCore(prisma);
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: SLUG },
    });
    const draft = await prisma.revision.findFirst({
      where: { editionId: edition.id, status: "DRAFT" },
      orderBy: { number: "desc" },
    });
    if (draft) await publishDraftRevision(prisma, edition.id, draft.id);
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("returns the identity of whatever is at that position", async () => {
    const { readerRef } = await lector.getLocator(
      USER,
      "FREE" as never,
      SLUG,
      1,
    );
    // Legacy-first, exactly like the reader: a Chapter row answers for it.
    expect(readerRef.kind).toBe("chapter");
    const chapter = await prisma.chapter.findFirstOrThrow({
      where: { bookId, order: 1 },
    });
    expect(readerRef.id).toBe(chapter.id);
  });

  it("writes NOTHING — no session, no preferences, no progress", async () => {
    const before = await counts();
    await lector.getLocator(USER, "FREE" as never, SLUG, 1);
    await lector.getLocator(USER, "FREE" as never, SLUG, 2);
    expect(await counts()).toEqual(before);
  });

  it("the full reader DOES write — which is why the locator exists", async () => {
    // The contrast that gives the test above its meaning.
    const before = await counts();
    await lector.getChapter(USER, "FREE" as never, SLUG, 1);
    const after = await counts();
    expect(after.readingSession).toBeGreaterThan(before.readingSession);
    expect(after.readerPreferences).toBeGreaterThan(before.readerPreferences);
  });

  it("refuses a position nothing occupies", async () => {
    await expect(
      lector.getLocator(USER, "FREE" as never, SLUG, 99),
    ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
  });

  it("refuses a book that does not exist", async () => {
    await expect(
      lector.getLocator(USER, "FREE" as never, "no-such-book", 1),
    ).rejects.toThrow(/BOOK_NOT_FOUND/);
  });
});
