import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import {
  publishDraftRevision,
  saveUnitDraft,
} from "../content-core/content-draft";
import { discardDraftUnit } from "../content-core/content-draft";
import {
  appendPlacement,
  effectiveEditorialRevision,
  listEditorialChapters,
  newNativeUnitKey,
  NEW_CHAPTER_SCAFFOLD,
} from "./native-authoring";
import { LectorService } from "../lector/lector.service";
import { ContentAccessService } from "../content-core/access/content-access.service";

/**
 * Content Studio creating a chapter, end to end, on a production-shaped book.
 *
 * The point of the whole prerequisite chain: a chapter can now be authored
 * without inventing a legacy `Chapter` row to satisfy code that no longer needs
 * one. This drives the real domain functions and then opens the result through
 * the real reader.
 */

const DB = "native_authoring_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("Content Studio · creating a chapter with no legacy row", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;

  let bookId = "";
  let editionId = "";
  let newUnitKey = "";
  let newOrder = 0;
  const USER = "user-authoring";
  const SLUG = "libro-autoria";

  const openReader = (order: number) =>
    lector.getChapter(USER, "PRO" as never, SLUG, order);

  /** The revision Content Studio is editing right now. */
  const editingRevision = () => effectiveEditorialRevision(prisma, editionId);

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
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "author@test.local", name: "A" },
    });

    // An ordinary existing book: two legacy chapters, backfilled and published.
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "PRO", totalChapters: 2 },
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
          content: `Texto ${order}`,
        },
      });
    }
    await backfillContentCore(prisma);

    const edition = await prisma.edition.findUniqueOrThrow({
      where: { editionKey: `${SLUG}-1e` },
    });
    editionId = edition.id;
    // The backfill may already have published its revision; publish only if
    // there is a draft waiting, so the fixture works either way.
    const draft = await prisma.revision.findFirst({
      where: { editionId, status: "DRAFT" },
      orderBy: { number: "desc" },
    });
    if (draft) {
      await publishDraftRevision(prisma, editionId, draft.id);
    }
    const ready = await prisma.edition.findUniqueOrThrow({
      where: { id: editionId },
    });
    expect(ready.publishedRevisionId).not.toBeNull();
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** The create the service performs, exercised through the same domain calls. */
  async function createChapter(title: string, expectedRevisionId?: string) {
    const effective = await editingRevision();
    const base = expectedRevisionId ?? effective.revisionId;
    const placement = await appendPlacement(prisma, base);
    const unitKey = newNativeUnitKey();
    const saved = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: base,
      unitKey,
      title,
      placement,
      blocks: NEW_CHAPTER_SCAFFOLD.map((b) => ({ ...b })),
    });
    return { unitKey, order: placement.order, ...saved };
  }

  describe("creating", () => {
    it("appends after the last chapter in the manifest, not after Book.totalChapters", async () => {
      const created = await createChapter("Capítulo nuevo");
      newUnitKey = created.unitKey;
      newOrder = created.order;
      expect(newOrder).toBe(3);
    });

    it("writes no legacy rows at all", async () => {
      // The whole point. Nothing here needs a Chapter, so nothing creates one.
      expect(await prisma.chapter.count({ where: { bookId } })).toBe(2);
      expect(
        await prisma.chapter.count({ where: { bookId, order: newOrder } }),
      ).toBe(0);
      const book = await prisma.book.findUniqueOrThrow({
        where: { id: bookId },
      });
      expect(book.totalChapters).toBe(2);
    });

    it("exists as a ContentUnit placed only in the draft", async () => {
      const unit = await prisma.contentUnit.findUniqueOrThrow({
        where: { editionId_unitKey: { editionId, unitKey: newUnitKey } },
      });
      const edition = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      expect(
        await prisma.revisionUnit.count({
          where: { revisionId: edition.publishedRevisionId!, unitId: unit.id },
        }),
      ).toBe(0);
      const effective = await editingRevision();
      expect(effective.isDraft).toBe(true);
      expect(
        await prisma.revisionUnit.count({
          where: { revisionId: effective.revisionId, unitId: unit.id },
        }),
      ).toBe(1);
    });

    it("does not change which chapter is the free preview", async () => {
      const unit = await prisma.contentUnit.findUniqueOrThrow({
        where: { editionId_unitKey: { editionId, unitKey: newUnitKey } },
      });
      expect(unit.isFreePreview).toBe(false);
      const designated = await prisma.contentUnit.count({
        where: { editionId, isFreePreview: true },
      });
      expect(designated).toBeLessThanOrEqual(1);
    });
  });

  describe("what each surface can see", () => {
    it("Content Studio lists the new chapter", async () => {
      const { chapters } = await listEditorialChapters(prisma, {
        bookId,
        bookSlug: SLUG,
      });
      const created = chapters.find((c) => c.order === newOrder);
      expect(created?.title).toBe("Capítulo nuevo");
      expect(created?.isNewDraftChapter).toBe(true);
      // Its title is editable; the legacy-backed ones are not, in Phase A.
      expect(created?.titleEditable).toBe(true);
      expect(chapters.find((c) => c.order === 1)?.titleEditable).toBe(false);
      // And media administration is honestly unavailable for it.
      expect(created?.mediaAdminAvailable).toBe(false);
      expect(chapters.find((c) => c.order === 1)?.mediaAdminAvailable).toBe(
        true,
      );
    });

    it("the reader does not", async () => {
      await expect(openReader(newOrder)).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });

    it("and the reader's chapter count is unchanged", async () => {
      const res = await openReader(1);
      expect(res.book.totalChapters).toBe(2);
    });
  });

  describe("editing it before anyone can read it", () => {
    it("saves a title and real text together, as one version", async () => {
      const effective = await editingRevision();
      await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: effective.revisionId,
        unitKey: newUnitKey,
        title: "La mente que aprende",
        placement: { order: newOrder, partNumber: null, partTitle: null },
        blocks: [
          {
            kind: "PARAGRAPH",
            content: "Una idea que vale la pena.",
            // Rich Text V1, unchanged, on a brand-new chapter.
            meta: {
              inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 3 }],
            },
          },
        ],
      });

      const { chapters } = await listEditorialChapters(prisma, {
        bookId,
        bookSlug: SLUG,
      });
      expect(chapters.find((c) => c.order === newOrder)?.title).toBe(
        "La mente que aprende",
      );
    });

    it("still shows nothing to a reader", async () => {
      await expect(openReader(newOrder)).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });
  });

  describe("publishing the book", () => {
    it("makes the new chapter readable through the ordinary reader", async () => {
      const effective = await editingRevision();
      await publishDraftRevision(prisma, editionId, effective.revisionId);

      const res = await openReader(newOrder);
      expect(res.chapter.title).toBe("La mente que aprende");
      expect(res.chapter.order).toBe(newOrder);
      // Its identity is the unit — #649's contract, consumed unchanged.
      expect(res.chapter.contentUnitId).not.toBeNull();
    });

    it("raises the reader's chapter count without touching the legacy column", async () => {
      const res = await openReader(1);
      expect(res.book.totalChapters).toBe(3);
      const book = await prisma.book.findUniqueOrThrow({
        where: { id: bookId },
      });
      expect(book.totalChapters).toBe(2);
    });

    it("gives it a reading session keyed by the unit", async () => {
      await openReader(newOrder);
      const unit = await prisma.contentUnit.findUniqueOrThrow({
        where: { editionId_unitKey: { editionId, unitKey: newUnitKey } },
      });
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, contentUnitId: unit.id },
      });
      expect(session.chapterId).toBeNull();
    });
  });

  describe("a title edited in draft stays in draft", () => {
    it("shows the new title to the editor and the old one to the reader", async () => {
      const effective = await editingRevision();
      await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: effective.revisionId,
        unitKey: newUnitKey,
        title: "Versión borrador",
        placement: { order: newOrder, partNumber: null, partTitle: null },
        blocks: [{ kind: "PARAGRAPH", content: "Una idea que vale la pena." }],
      });

      const { chapters } = await listEditorialChapters(prisma, {
        bookId,
        bookSlug: SLUG,
      });
      expect(chapters.find((c) => c.order === newOrder)?.title).toBe(
        "Versión borrador",
      );

      // The reader is still on the published revision.
      const res = await openReader(newOrder);
      expect(res.chapter.title).toBe("La mente que aprende");
    });

    it("reaches the reader only after the next publish", async () => {
      const effective = await editingRevision();
      await publishDraftRevision(prisma, editionId, effective.revisionId);
      const res = await openReader(newOrder);
      expect(res.chapter.title).toBe("Versión borrador");
    });
  });

  describe("discarding a chapter nobody has seen", () => {
    let discardableKey = "";
    let discardableOrder = 0;

    it("creates one, alongside an unrelated edit", async () => {
      const created = await createChapter("Me arrepentí");
      discardableKey = created.unitKey;
      discardableOrder = created.order;

      // An edit to a DIFFERENT chapter, in the same draft. This is what must
      // survive the discard — otherwise an editor changing their mind about one
      // chapter would lose their work on another.
      const effective = await editingRevision();
      await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: effective.revisionId,
        unitKey: newUnitKey,
        title: "Editado mientras tanto",
        placement: { order: newOrder, partNumber: null, partTitle: null },
        blocks: [{ kind: "PARAGRAPH", content: "Texto editado." }],
      });
    });

    it("removes it from the draft and keeps the other edits", async () => {
      const effective = await editingRevision();
      await discardDraftUnit(prisma, {
        editionId,
        expectedRevisionId: effective.revisionId,
        unitKey: discardableKey,
      });

      const { chapters } = await listEditorialChapters(prisma, {
        bookId,
        bookSlug: SLUG,
      });
      expect(
        chapters.find((c) => c.order === discardableOrder),
      ).toBeUndefined();
      // The unrelated edit survived.
      expect(chapters.find((c) => c.order === newOrder)?.title).toBe(
        "Editado mientras tanto",
      );
    });

    it("deletes nothing — the unit and its history remain", async () => {
      // Discard is a manifest decision, not a delete. Archived revisions must
      // keep resolving.
      expect(
        await prisma.contentUnit.count({
          where: { editionId, unitKey: discardableKey },
        }),
      ).toBe(1);
    });

    it("leaves the reader unaffected either way", async () => {
      await expect(openReader(discardableOrder)).rejects.toThrow(
        /CHAPTER_NOT_FOUND/,
      );
    });
  });

  describe("two editors creating at once", () => {
    it("produces one chapter, not two", async () => {
      const effective = await editingRevision();
      const results = await Promise.allSettled([
        createChapter("Simultáneo A", effective.revisionId),
        createChapter("Simultáneo B", effective.revisionId),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");
      // Exactly one wins; the other is told its base moved.
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);

      const { chapters } = await listEditorialChapters(prisma, {
        bookId,
        bookSlug: SLUG,
      });
      const created = chapters.filter((c) => c.title.startsWith("Simultáneo"));
      expect(created).toHaveLength(1);
    });
  });

  describe("legacy chapters are untouched by any of this", () => {
    it("still opens, still keyed by its Chapter row", async () => {
      const res = await openReader(1);
      expect(res.chapter.title).toBe("Uno");
      expect(res.chapter.contentUnitId).toBeNull();
    });
  });
});
