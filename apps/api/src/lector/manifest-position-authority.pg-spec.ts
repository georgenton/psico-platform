import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { BooksService } from "../books/books.service";
import { LectorService } from "./lector.service";

/**
 * The published manifest decides where a chapter is. `Chapter.order` does not.
 *
 * Phase B.A made identity stable; this is the other half. Reorder does not
 * exist yet, so these fixtures construct the state it will create — a published
 * revision whose placements disagree with `Chapter.order` — and assert the
 * reader follows the manifest. Nothing here writes `Chapter.order`; the whole
 * point is that it is allowed to go stale.
 */

const DB = "manifest_position_db";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("published manifest is the position authority", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let books: BooksService;

  const USER = "u-manifest";
  const SLUG = "libro-deriva";
  const config = { get: () => undefined } as never;

  let bookId = "";
  let editionId = "";
  const chapterId: Record<string, string> = {};
  const unitId: Record<string, string> = {};
  const versionId: Record<string, string> = {};

  /** Publish a revision placing each unit at the given order. */
  async function publish(
    number: number,
    at: Record<string, number>,
  ): Promise<void> {
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
      config,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );
    books = new BooksService(prisma as never, config);

    await prisma.user.create({
      data: { id: USER, email: "manifest@test.local", name: "M" },
    });
    const book = await prisma.book.create({
      data: {
        slug: SLUG,
        title: "Libro",
        plan: "FREE",
        totalChapters: 2,
        isPublished: true,
      },
    });
    bookId = book.id;

    const work = await prisma.work.create({
      data: { workKey: "w-deriva", title: "Libro", authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "libro-deriva-1e", // gitleaks:allow — a book slug
        slug: SLUG,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    editionId = edition.id;

    // Two legacy chapters, each fully adopted: the ContentUnit's key is
    // derived from the Chapter id exactly as the backfill derives it.
    for (const [order, key] of [
      [1, "A"],
      [2, "B"],
    ] as const) {
      const ch = await prisma.chapter.create({
        data: { bookId, order, title: `Cap ${key}`, isPublished: true },
      });
      chapterId[key] = ch.id;
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto ${key}.`,
        },
      });

      const unit = await prisma.contentUnit.create({
        data: {
          editionId,
          unitKey: unitKeyFromLegacyChapterId(ch.id),
          isFreePreview: order === 1,
        },
      });
      unitId[key] = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: `Cap ${key}` },
      });
      versionId[key] = version.id;
      const block = await prisma.contentBlock.create({
        data: {
          unitId: unit.id,
          blockKey: `bk-${key}`,
          legacyBlockId: null,
        },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto ${key}.`,
          contentHash: `hash-${key}`,
        },
      });
    }

    // Revision 1 agrees with Chapter.order.
    await publish(1, { A: 1, B: 2 });
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const openByRef = (id: string) =>
    lector.getChapterByRef(USER, "FREE" as never, SLUG, {
      kind: "chapter",
      id,
    });

  it("before any drift, both authorities agree", async () => {
    expect((await openByRef(chapterId.A)).chapter.order).toBe(1);
    expect((await openByRef(chapterId.B)).chapter.order).toBe(2);
  });

  it("DRIFT: publish a revision placing B first — without touching Chapter.order", async () => {
    await publish(2, { B: 1, A: 2 });

    // The stale column is left exactly as it was. That is the premise.
    const rows = await prisma.chapter.findMany({
      where: { bookId },
      select: { id: true, order: true },
    });
    expect(rows.find((r) => r.id === chapterId.A)!.order).toBe(1);
    expect(rows.find((r) => r.id === chapterId.B)!.order).toBe(2);
  });

  // ── L1 / L2 · canonical routes ──────────────────────────────────────────

  it("L1 · canonical A serves A, at its NEW position", async () => {
    const res = await openByRef(chapterId.A);

    expect(res.chapter.readerRef).toEqual({
      kind: "chapter",
      id: chapterId.A,
    });
    // Chapter.order still says 1. The manifest says 2.
    expect(res.chapter.order).toBe(2);

    const session = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(session).not.toBeNull();
    expect(session!.contentUnitId).toBeNull();
  });

  it("L2 · canonical B serves B, at its NEW position", async () => {
    const res = await openByRef(chapterId.B);
    expect(res.chapter.readerRef).toEqual({
      kind: "chapter",
      id: chapterId.B,
    });
    expect(res.chapter.order).toBe(1);
  });

  // ── L3 / L4 / L5 · locator and positional reader ────────────────────────

  it("L3 · locator 1 resolves to B, not A", async () => {
    const { readerRef } = await lector.getLocator(
      USER,
      "FREE" as never,
      SLUG,
      1,
    );
    expect(readerRef).toEqual({ kind: "chapter", id: chapterId.B });
  });

  it("L4 · locator 2 resolves to A", async () => {
    const { readerRef } = await lector.getLocator(
      USER,
      "FREE" as never,
      SLUG,
      2,
    );
    expect(readerRef).toEqual({ kind: "chapter", id: chapterId.A });
  });

  it("L5 · the positional reader at 1 serves B", async () => {
    const res = await lector.getChapter(USER, "FREE" as never, SLUG, 1);
    expect(res.chapter.readerRef).toEqual({
      kind: "chapter",
      id: chapterId.B,
    });
  });

  // ── L6 / L7 · effective structure ───────────────────────────────────────

  it("L6 · Book Detail lists B then A, each by its own identity", async () => {
    const detail = await books.getDetail(USER, SLUG);

    expect(detail.chaptersList.map((c) => c.readerRef)).toEqual([
      { kind: "chapter", id: chapterId.B },
      { kind: "chapter", id: chapterId.A },
    ]);
    // One row each — no native twin surfacing alongside its legacy backing.
    expect(detail.chaptersList).toHaveLength(2);
  });

  it("L7 · a stale Chapter.order suppresses nothing", async () => {
    const rows = await prisma.chapter.findMany({
      where: { bookId },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    // Physically unchanged throughout.
    expect(rows.map((r) => r.id)).toEqual([chapterId.A, chapterId.B]);
  });

  // ── entitlement follows identity, never position ────────────────────────

  /**
   * A PRO book whose free preview belongs to a chapter, not to a slot.
   *
   * `A.isFreePreview = true`, `B.isFreePreview = false`, and the published
   * manifest puts B first. If any surface decided from position, a FREE reader
   * would be handed B — the paid chapter — and refused A, the one they were
   * always entitled to. Reordering a book must not sell or give away a chapter.
   */
  describe("free preview belongs to the chapter", () => {
    const PRO_SLUG = "libro-pro-deriva";
    const FREE_USER = "u-free";
    const proChapter: Record<string, string> = {};
    const proBlockId: Record<string, string> = {};
    const proBlockKey: Record<string, string> = {};
    let proEditionKey = "";
    const proUnitKey: Record<string, string> = {};

    beforeAll(async () => {
      await prisma.user.create({
        data: { id: FREE_USER, email: "free@test.local", name: "F" },
      });
      const book = await prisma.book.create({
        data: {
          slug: PRO_SLUG,
          title: "Pro",
          plan: "PRO",
          totalChapters: 2,
          isPublished: true,
        },
      });
      const work = await prisma.work.create({
        data: { workKey: "w-pro", title: "Pro", authorName: "A" },
      });
      const edition = await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: "libro-pro-deriva-1e", // gitleaks:allow — a book slug
          slug: PRO_SLUG,
          label: "Primera",
          accessPlan: "PRO",
        },
      });
      proEditionKey = edition.editionKey;
      const rev = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      for (const [order, key, free] of [
        [1, "A", true],
        [2, "B", false],
      ] as const) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order,
            title: `Pro ${key}`,
            isPublished: true,
          },
        });
        proChapter[key] = ch.id;
        const legacyBlock = await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: `Pro ${key}.`,
          },
        });
        proBlockId[key] = legacyBlock.id;

        const unitKey = unitKeyFromLegacyChapterId(ch.id);
        proUnitKey[key] = unitKey;
        const unit = await prisma.contentUnit.create({
          data: { editionId: edition.id, unitKey, isFreePreview: free },
        });
        const version = await prisma.contentUnitVersion.create({
          data: { unitId: unit.id, title: `Pro ${key}` },
        });
        const cb = await prisma.contentBlock.create({
          data: {
            unitId: unit.id,
            blockKey: `bk-pro-${key}`,
            // Backfilled: the Content Core block still points at its legacy row,
            // which is what makes blockKey and blockId two doors to one answer.
            legacyBlockId: legacyBlock.id,
          },
        });
        proBlockKey[key] = cb.blockKey;
        await prisma.blockVersion.create({
          data: {
            contentBlockId: cb.id,
            unitVersionId: version.id,
            order: 1,
            kind: "PARAGRAPH",
            content: `Pro ${key}.`,
            contentHash: `hash-pro-${key}`,
          },
        });
        await prisma.revisionUnit.create({
          data: {
            revisionId: rev.id,
            unitId: unit.id,
            unitVersionId: version.id,
            // The drift: B first, A second — while Chapter.order says 1, 2.
            order: key === "A" ? 2 : 1,
          },
        });
      }
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: rev.id },
      });
    }, 120_000);

    // Built per call: the describe body runs before `beforeAll` assigns
    // `prisma`, so capturing it here would capture `undefined`.
    const access = () => new ContentAccessService(prisma as never);
    const openPro = (id: string) =>
      lector.getChapterByRef(FREE_USER, "FREE" as never, PRO_SLUG, {
        kind: "chapter",
        id,
      });

    it("A keeps its free preview even though it is now second", async () => {
      const res = await openPro(proChapter.A);
      expect(res.chapter.order).toBe(2);
    });

    it("B stays paid even though it is now first", async () => {
      await expect(openPro(proChapter.B)).rejects.toThrow(/PRO_REQUIRED/);
    });

    it("the locator applies the same gate as the reader", async () => {
      // Position 1 is B — paid. Position 2 is A — free.
      await expect(
        lector.getLocator(FREE_USER, "FREE" as never, PRO_SLUG, 1),
      ).rejects.toThrow(/PRO_REQUIRED/);
      const at2 = await lector.getLocator(
        FREE_USER,
        "FREE" as never,
        PRO_SLUG,
        2,
      );
      expect(at2.readerRef).toEqual({ kind: "chapter", id: proChapter.A });
    });

    it("the positional reader agrees too", async () => {
      await expect(
        lector.getChapter(FREE_USER, "FREE" as never, PRO_SLUG, 1),
      ).rejects.toThrow(/PRO_REQUIRED/);
      const at2 = await lector.getChapter(
        FREE_USER,
        "FREE" as never,
        PRO_SLUG,
        2,
      );
      expect(at2.chapter.readerRef).toEqual({
        kind: "chapter",
        id: proChapter.A,
      });
    });

    it("marks reached by legacy blockId follow the chapter", async () => {
      await access().assertCanWriteMark({
        userId: FREE_USER,
        userPlan: "FREE",
        blockId: proBlockId.A,
      });
      await expect(
        access().assertCanWriteMark({
          userId: FREE_USER,
          userPlan: "FREE",
          blockId: proBlockId.B,
        }),
      ).rejects.toThrow(/PRO_REQUIRED/);
    });

    it("marks reached by blockKey give the SAME answer", async () => {
      // Two doors, one decision. A caller preferring one spelling must not get
      // a different entitlement than a caller preferring the other.
      await access().assertCanWriteMark({
        userId: FREE_USER,
        userPlan: "FREE",
        blockKey: proBlockKey.A,
      });
      await expect(
        access().assertCanWriteMark({
          userId: FREE_USER,
          userPlan: "FREE",
          blockKey: proBlockKey.B,
        }),
      ).rejects.toThrow(/PRO_REQUIRED/);
    });

    it("the Content Core read surface agrees", async () => {
      await access().assertCanReadUnit({
        userId: FREE_USER,
        userPlan: "FREE",
        editionKey: proEditionKey,
        unitKey: proUnitKey.A,
      });
      await expect(
        access().assertCanReadUnit({
          userId: FREE_USER,
          userPlan: "FREE",
          editionKey: proEditionKey,
          unitKey: proUnitKey.B,
        }),
      ).rejects.toThrow(/PRO_REQUIRED/);
    });

    it("no surface wrote isFreePreview while the structure moved", async () => {
      const units = await prisma.contentUnit.findMany({
        where: { unitKey: { in: [proUnitKey.A, proUnitKey.B] } },
        select: { unitKey: true, isFreePreview: true },
      });
      expect(units.find((u) => u.unitKey === proUnitKey.A)!.isFreePreview).toBe(
        true,
      );
      expect(units.find((u) => u.unitKey === proUnitKey.B)!.isFreePreview).toBe(
        false,
      );
    });
  });

  // ── L8 / L9 · writes still follow identity ──────────────────────────────

  it("L8 · completing A writes A, and its next comes from the CURRENT manifest", async () => {
    // The caller's path still carries a stale position; the id decides.
    const res = await lector.completeChapter(
      USER,
      SLUG,
      1,
      undefined,
      chapterId.A,
    );

    const onA = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(onA).not.toBeNull();
    const onB = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(onB).toBeNull();

    // A is last in the CURRENT structure, so there is nothing after it.
    expect(res.nextChapter).toBeNull();
    expect(res.nextReaderRef).toBeNull();
  });

  it("L9 · a stale heartbeat writes A only", async () => {
    const bBefore = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: chapterId.B },
    });
    const aBefore = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: chapterId.A },
    });

    await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 1, // stale: position 1 is B now
      chapterId: chapterId.A, // stable identity
      lastBlockId: "b",
      timeSpentDeltaSec: 20,
      progressPct: 0.8,
    });

    // A was completed in L8, so the monotonic guard correctly refuses to walk
    // its progress back down — time still accumulates, and that is what proves
    // the write landed here rather than on the chapter now at position 1.
    const a = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: chapterId.A },
    });
    expect(a.timeSpentSec).toBeGreaterThan(aBefore.timeSpentSec);
    expect(a.progressPct).toBeGreaterThanOrEqual(aBefore.progressPct);

    const b = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: chapterId.B },
    });
    expect(b.progressPct).toBe(bBefore.progressPct);
    expect(b.timeSpentSec).toBe(bBefore.timeSpentSec);
  });
});
