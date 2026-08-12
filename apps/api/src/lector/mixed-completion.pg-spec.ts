import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContentAccessService } from "../content-core/access/content-access.service";
import { LectorService } from "./lector.service";

/**
 * Finishing a chapter must hand back the NEXT chapter's identity.
 *
 * The client used to be told a number and had to turn it back into a URL, which
 * is exactly the conversion a restructure invalidates. Now completion returns
 * `nextReaderRef`, and this suite proves it crosses the legacy/native boundary
 * in both directions — the case a single-structure book cannot exercise.
 *
 * The fixture is deliberately interleaved:
 *
 *   1  legacy A   (Chapter row)
 *   2  native B   (ContentUnit only)
 *   3  legacy C   (Chapter row)
 *
 * Against real Postgres, because "which structure answers for position 2" is a
 * query, not a branch a mock can honestly stand in for.
 */

const DB = "mixed_completion_db";
const SLUG = "libro-mixto";
const USER = "u-mixed";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("completion across a mixed book", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let chapterAId = "";
  let chapterCId = "";
  let unitBId = "";

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
      data: { id: USER, email: "mixed@test.local", name: "M" },
    });
    // FREE throughout: this suite is about identity, not entitlement.
    const book = await prisma.book.create({
      data: {
        slug: SLUG,
        title: "Libro mixto",
        plan: "FREE",
        totalChapters: 3,
      },
    });

    for (const [order, title] of [
      [1, "A"],
      [3, "C"],
    ] as const) {
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order, title, isPublished: true },
      });
      if (order === 1) chapterAId = ch.id;
      else chapterCId = ch.id;
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto ${title}.`,
        },
      });
    }

    const work = await prisma.work.create({
      data: { workKey: "w-mixto", title: "Libro mixto", authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "libro-mixto-1e", // gitleaks:allow — a book slug, not a key
        slug: SLUG,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    const revision = await prisma.revision.create({
      data: {
        editionId: edition.id,
        number: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.edition.update({
      where: { id: edition.id },
      data: { publishedRevisionId: revision.id },
    });

    // The manifest places all three positions. Only position 2 has no Chapter
    // row, so only position 2 is served natively.
    for (const [order, key, title] of [
      [1, "u-a", "A"],
      [2, "u-b", "B"],
      [3, "u-c", "C"],
    ] as const) {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: key, isFreePreview: true },
      });
      if (order === 2) unitBId = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title },
      });
      const block = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: `bk-${key}` },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto ${title}.`,
          contentHash: `hash-${key}`,
        },
      });
      await prisma.revisionUnit.create({
        data: {
          revisionId: revision.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order,
        },
      });
    }
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("the fixture really is interleaved", async () => {
    // Otherwise the assertions below would prove nothing about the boundary.
    const orders = (
      await prisma.chapter.findMany({ select: { order: true } })
    ).map((c) => c.order);
    expect(orders.sort()).toEqual([1, 3]);
  });

  it("finishing legacy A points at native B — by unit id", async () => {
    const res = await lector.completeChapter(USER, SLUG, 1);

    expect(res.nextReaderRef).toEqual({ kind: "unit", id: unitBId });
    // The order is still reported, for display and for older clients.
    expect(res.nextChapter).toBe(2);
  });

  it("finishing native B points at legacy C — by chapter id", async () => {
    const res = await lector.completeChapter(USER, SLUG, 2, unitBId);

    expect(res.nextReaderRef).toEqual({ kind: "chapter", id: chapterCId });
    expect(res.nextChapter).toBe(3);
  });

  it("finishing the last chapter offers no next identity", async () => {
    const res = await lector.completeChapter(USER, SLUG, 3);

    expect(res.nextReaderRef).toBeNull();
    expect(res.nextChapter).toBeNull();
  });

  it("the refs name chapters that actually exist under those identities", async () => {
    // A ref is only worth returning if opening it works, so open both.
    const b = await lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "unit",
      id: unitBId,
    });
    expect(b.chapter.readerRef).toEqual({ kind: "unit", id: unitBId });

    const c = await lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "chapter",
      id: chapterCId,
    });
    expect(c.chapter.readerRef).toEqual({ kind: "chapter", id: chapterCId });

    // And A, so the whole chain is navigable.
    const a = await lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "chapter",
      id: chapterAId,
    });
    expect(a.chapter.readerRef).toEqual({ kind: "chapter", id: chapterAId });
  });
});
