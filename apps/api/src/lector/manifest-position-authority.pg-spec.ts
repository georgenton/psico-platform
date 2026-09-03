import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { BooksService } from "../books/books.service";
import { LectorService } from "./lector.service";
import { resolveChapterByRef } from "./reader-chapter-ref";

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
      const legacyBlock = await prisma.chapterBlock.create({
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
          // Enlazado como lo deja el backfill: este fixture representa capítulos
          // ADOPTADOS, y un espejo adoptado conserva el origen de cada bloque.
          // Sin el enlace la unidad afirmaría que Content Core escribió ese
          // texto de cero, que es justo lo contrario de lo que prueba la suite.
          legacyBlockId: legacyBlock.id,
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

  // ── a chapter removed from the published structure ──────────────────────

  /**
   * Adopted, then taken out. Not readable, and not writable either.
   *
   * The read already refused it. The writes did not: completion fell back to
   * `chapter.order` and would have marked a chapter the book no longer offers
   * as finished, while a stale tab kept accruing time against it. Retired
   * native units have always failed closed; legacy ones must match.
   */
  describe("adopted but removed from the published revision", () => {
    const GONE_SLUG = "libro-retirado";
    let goneChapterId = "";
    let survivorChapterId = "";
    let goneBookId = "";

    beforeAll(async () => {
      const book = await prisma.book.create({
        data: {
          slug: GONE_SLUG,
          title: "Retirado",
          plan: "FREE",
          totalChapters: 2,
          isPublished: true,
        },
      });
      goneBookId = book.id;
      const work = await prisma.work.create({
        data: { workKey: "w-ret", title: "Retirado", authorName: "A" },
      });
      const edition = await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: "libro-retirado-1e", // gitleaks:allow — a book slug
          slug: GONE_SLUG,
          label: "Primera",
          accessPlan: "FREE",
        },
      });

      const made: { unitId: string; versionId: string; key: string }[] = [];
      for (const [order, key] of [
        [1, "gone"],
        [2, "survivor"],
      ] as const) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order,
            title: `Cap ${key}`,
            isPublished: true,
          },
        });
        if (key === "gone") goneChapterId = ch.id;
        else survivorChapterId = ch.id;
        const retLegacyBlock = await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: "T",
          },
        });
        const unit = await prisma.contentUnit.create({
          data: {
            editionId: edition.id,
            unitKey: unitKeyFromLegacyChapterId(ch.id),
            isFreePreview: true,
          },
        });
        const version = await prisma.contentUnitVersion.create({
          data: { unitId: unit.id, title: `Cap ${key}` },
        });
        const cb = await prisma.contentBlock.create({
          data: {
            unitId: unit.id,
            blockKey: `bk-ret-${key}`,
            // Enlazado como el backfill: un capítulo adoptado conserva el origen
            // de su bloque. Sin él la unidad diría que Content Core escribió ese
            // texto de cero, y el lector la serviría a ella y no al capítulo.
            legacyBlockId: retLegacyBlock.id,
          },
        });
        await prisma.blockVersion.create({
          data: {
            contentBlockId: cb.id,
            unitVersionId: version.id,
            order: 1,
            kind: "PARAGRAPH",
            content: "T",
            contentHash: `h-ret-${key}`,
          },
        });
        made.push({ unitId: unit.id, versionId: version.id, key });
      }

      const publishRet = async (n: number, keep: string[]) => {
        const rev = await prisma.revision.create({
          data: {
            editionId: edition.id,
            number: n,
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
        let order = 1;
        for (const m of made.filter((x) => keep.includes(x.key))) {
          await prisma.revisionUnit.create({
            data: {
              revisionId: rev.id,
              unitId: m.unitId,
              unitVersionId: m.versionId,
              order: order++,
            },
          });
        }
        await prisma.edition.update({
          where: { id: edition.id },
          data: { publishedRevisionId: rev.id },
        });
      };

      // R1 has both; the reader opens the doomed chapter and leaves state.
      await publishRet(1, ["gone", "survivor"]);
      await lector.getChapterByRef(USER, "FREE" as never, GONE_SLUG, {
        kind: "chapter",
        id: goneChapterId,
      });
      // R2 drops it. Chapter row and Chapter.order stay exactly as they were.
      await publishRet(2, ["survivor"]);
    }, 120_000);

    const goneSession = () =>
      prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: goneChapterId },
      });

    it("the canonical route refuses it", async () => {
      await expect(
        lector.getChapterByRef(USER, "FREE" as never, GONE_SLUG, {
          kind: "chapter",
          id: goneChapterId,
        }),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });

    it("its old slot now belongs to whoever the manifest puts there", async () => {
      const { readerRef } = await lector.getLocator(
        USER,
        "FREE" as never,
        GONE_SLUG,
        1,
      );
      expect(readerRef).toEqual({ kind: "chapter", id: survivorChapterId });
    });

    it("a stale heartbeat writes nothing", async () => {
      const before = await goneSession();

      const res = await lector.heartbeat(USER, {
        bookId: goneBookId,
        chapterOrder: 1, // the position it used to hold
        chapterId: goneChapterId,
        lastBlockId: "b",
        timeSpentDeltaSec: 60,
        progressPct: 0.99,
      });

      // Soft-ack, same as a retired native unit — and not one column moved.
      expect(res.ok).toBe(true);
      const after = await goneSession();
      expect(after.progressPct).toBe(before.progressPct);
      expect(after.timeSpentSec).toBe(before.timeSpentSec);
      expect(after.lastBlockId).toBe(before.lastBlockId);
      expect(after.completedAt).toEqual(before.completedAt);
    });

    it("a stale completion is refused, and completes nothing", async () => {
      const before = await goneSession();
      const progressBefore = await prisma.userProgress.count({
        where: { userId: USER, chapterId: goneChapterId },
      });

      await expect(
        lector.completeChapter(USER, GONE_SLUG, 1, undefined, goneChapterId),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: goneChapterId },
        }),
      ).toBe(progressBefore);
      const after = await goneSession();
      expect(after.completedAt).toEqual(before.completedAt);
      expect(after.progressPct).toBe(before.progressPct);
      // And certainly not the chapter that took its place.
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: survivorChapterId },
        }),
      ).toBe(0);
    });

    it("resolveChapterByRef itself returns null for it", async () => {
      // Asserted on the resolver, not through a caller that might repair it.
      const target = await resolveChapterByRef(prisma as never, {
        bookId: goneBookId,
        bookSlug: GONE_SLUG,
        ref: { kind: "chapter", id: goneChapterId },
      });
      expect(target).toBeNull();
    });
  });

  // ── an unsynced row cannot take a position the manifest names ───────────

  describe("unsynced legacy collision", () => {
    const COL_SLUG = "libro-colision";
    let colBookId = "";
    let colUnitId = "";

    beforeAll(async () => {
      const book = await prisma.book.create({
        data: {
          slug: COL_SLUG,
          title: "Colisión",
          plan: "FREE",
          totalChapters: 2,
          isPublished: true,
        },
      });
      colBookId = book.id;
      // A legacy chapter at position 2 that Content Core never adopted.
      await prisma.chapter.create({
        data: {
          bookId: book.id,
          order: 2,
          title: "Sin sincronizar",
          isPublished: true,
        },
      });

      const work = await prisma.work.create({
        data: { workKey: "w-col", title: "Colisión", authorName: "A" },
      });
      const edition = await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: "libro-colision-1e", // gitleaks:allow — a book slug
          slug: COL_SLUG,
          label: "Primera",
          accessPlan: "FREE",
        },
      });
      const rev = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      // A native unit — unrelated to that chapter — at the SAME position.
      const unit = await prisma.contentUnit.create({
        data: {
          editionId: edition.id,
          unitKey: "u-colision",
          isFreePreview: true,
        },
      });
      colUnitId = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: "Nativo" },
      });
      const cb = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: "bk-col" },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: cb.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: "T",
          contentHash: "h-col",
        },
      });
      await prisma.revisionUnit.create({
        data: {
          revisionId: rev.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order: 2,
        },
      });
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: rev.id },
      });
    }, 120_000);

    it("the positional reader serves the manifest occupant", async () => {
      const res = await lector.getChapter(USER, "FREE" as never, COL_SLUG, 2);
      expect(res.chapter.readerRef).toEqual({ kind: "unit", id: colUnitId });
    });

    it("the locator agrees", async () => {
      const { readerRef } = await lector.getLocator(
        USER,
        "FREE" as never,
        COL_SLUG,
        2,
      );
      expect(readerRef).toEqual({ kind: "unit", id: colUnitId });
    });

    it("Book Detail agrees — one occupant, not two", async () => {
      // The bug this closes: the fallback used to overwrite the placement in
      // this list while the reader still served the manifest, so the detail
      // screen and the reader disagreed about what position 2 was.
      const detail = await books.getDetail(USER, COL_SLUG);
      const atTwo = detail.chaptersList.filter((c) => c.n === 2);
      expect(atTwo).toHaveLength(1);
      expect(atTwo[0].readerRef).toEqual({ kind: "unit", id: colUnitId });
    });

    it("the canonical route refuses it too — no surface disagrees", async () => {
      // The one route that addresses by identity rather than position. It used
      // to serve this chapter at its stale order 2 while the reader, the
      // locator, Book Detail and the card all served the unit — the canonical
      // link being the single surface that contradicted the rest.
      const ch = await prisma.chapter.findFirstOrThrow({
        where: { bookId: colBookId, order: 2 },
      });
      await expect(
        lector.getChapterByRef(USER, "FREE" as never, COL_SLUG, {
          kind: "chapter",
          id: ch.id,
        }),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

      // Asserted on the resolver itself, not only through its caller.
      expect(
        await resolveChapterByRef(prisma as never, {
          bookId: colBookId,
          bookSlug: COL_SLUG,
          ref: { kind: "chapter", id: ch.id },
        }),
      ).toBeNull();
    });

    it("and it is not writable either", async () => {
      const ch = await prisma.chapter.findFirstOrThrow({
        where: { bookId: colBookId, order: 2 },
      });
      const before = await prisma.readingSession.count({
        where: { userId: USER },
      });

      const beat = await lector.heartbeat(USER, {
        bookId: colBookId,
        chapterOrder: 2,
        chapterId: ch.id,
        lastBlockId: "b",
        timeSpentDeltaSec: 60,
        progressPct: 0.9,
      });
      expect(beat.ok).toBe(true);
      // Soft-ack, and no session conjured for a chapter the book does not list.
      expect(
        await prisma.readingSession.count({ where: { userId: USER } }),
      ).toBe(before);

      await expect(
        lector.completeChapter(USER, COL_SLUG, 2, undefined, ch.id),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
      // Same answer for an old client with no ids at all. Completing the unit
      // on its behalf would be the fail-open the named path already refuses:
      // marking finished a chapter the reader never opened.
      await expect(lector.completeChapter(USER, COL_SLUG, 2)).rejects.toThrow(
        /CHAPTER_NOT_FOUND/,
      );
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: ch.id },
        }),
      ).toBe(0);
      // And emphatically not the unit that legitimately holds position 2.
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, contentUnitId: colUnitId },
        }),
      ).toBe(0);
    });

    it("the card's structure agrees too", async () => {
      const list = await books.list(USER, {} as never);
      const card = list.books.find((b) => b.slug === COL_SLUG);
      // One chapter at position 2 — the unsynced row did not add a second.
      expect(card?.chapters).toBe(1);
    });
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
