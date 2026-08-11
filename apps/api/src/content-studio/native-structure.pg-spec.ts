import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import {
  discardDraftUnit,
  publishDraftRevision,
  readUnitAtRevision,
  saveUnitDraft,
} from "../content-core/content-draft";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { ContentStudioService } from "./content-studio.service";
import { listEditorialChapters } from "./native-authoring";
import { LectorService } from "../lector/lector.service";
import { ContentAccessService } from "../content-core/access/content-access.service";

/**
 * The structural states Phase A must refuse to guess about.
 *
 * Every case here is one where POSITION and IDENTITY disagree. The reader
 * resolves a legacy chapter by `(bookId, order)` before it ever consults Content
 * Core, so a book whose legacy rows are not fully represented in the manifest
 * has positions that answer to two different things at once. Appending into that
 * is how you publish a chapter nobody can reach.
 */

const DB = "native_structure_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("Content Core structure · position is not identity", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let studio: ContentStudioService;
  let lector: LectorService;

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
    studio = new ContentStudioService(
      prisma as never,
      {
        get: () => "https://assets.example.com",
      } as never,
    );
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );

    await prisma.user.create({
      data: { id: "u-structure", email: "structure@test.local", name: "S" },
    });
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** A book with legacy chapters, backfilled and published. */
  async function makeBook(slug: string, chapterTitles: string[]) {
    const book = await prisma.book.create({
      data: {
        slug,
        title: slug,
        plan: "PRO",
        totalChapters: chapterTitles.length,
      },
    });
    const chapters = [];
    for (const [i, title] of chapterTitles.entries()) {
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order: i + 1, title },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto ${i + 1}`,
        },
      });
      chapters.push(ch);
    }
    await backfillContentCore(prisma);

    const edition = await prisma.edition.findFirstOrThrow({ where: { slug } });
    const draft = await prisma.revision.findFirst({
      where: { editionId: edition.id, status: "DRAFT" },
      orderBy: { number: "desc" },
    });
    if (draft) await publishDraftRevision(prisma, edition.id, draft.id);

    return { book, chapters, editionId: edition.id };
  }

  // ── 1. A readable legacy chapter Content Core never took in ──────────────

  describe("a legacy chapter the manifest does not contain", () => {
    let bookId = "";
    const SLUG = "libro-huerfano";
    let unitsBefore = 0;
    let revisionsBefore = 0;
    let draftBefore: string | null = null;

    beforeAll(async () => {
      // Chapters 1 and 2 are ingested normally. Chapter 3 is created AFTER the
      // backfill, so it is readable through the legacy path and completely
      // absent from Content Core — the exact state that makes appending unsafe.
      const made = await makeBook(SLUG, ["Uno", "Dos"]);
      bookId = made.book.id;
      const orphan = await prisma.chapter.create({
        data: { bookId, order: 3, title: "Tres, sin migrar" },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: orphan.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Texto 3",
        },
      });

      unitsBefore = await prisma.contentUnit.count({
        where: { editionId: made.editionId },
      });
      revisionsBefore = await prisma.revision.count({
        where: { editionId: made.editionId },
      });
      const draft = await prisma.revision.findFirst({
        where: { editionId: made.editionId, status: "DRAFT" },
      });
      draftBefore = draft?.id ?? null;
    }, 120_000);

    it("lists all three, and says which one is not synced", async () => {
      const state = await studio.getBookState(SLUG);

      expect(state.chapters.map((c) => c.order)).toEqual([1, 2, 3]);
      expect(state.chapters[0]!.ingested).toBe(true);
      expect(state.chapters[1]!.ingested).toBe(true);
      expect(state.chapters[2]!.ingested).toBe(false);
      expect(state.chapters[2]!.title).toBe("Tres, sin migrar");
    });

    it("offers no way to open the un-synced chapter", async () => {
      const state = await studio.getBookState(SLUG);

      expect(state.chapters[2]!.editable).toBe(false);
      // And the surface behind that link refuses with a state, not a 404 that
      // reads like a bug.
      await expect(studio.getChapter(SLUG, 3)).rejects.toMatchObject({
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });
    });

    it("turns chapter creation off, from the server", async () => {
      const state = await studio.getBookState(SLUG);
      expect(state.chapterCreationAvailable).toBe(false);
      expect(state.creationBlockedReason).toBe("PENDING_SYNC");
    });

    it("refuses a create, and writes nothing at all", async () => {
      const state = await studio.getBookState(SLUG);

      await expect(
        studio.createChapter(SLUG, {
          expectedRevisionId: state.editingRevisionId,
          title: "Cuatro",
        }),
      ).rejects.toMatchObject({
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });

      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      expect(
        await prisma.contentUnit.count({ where: { editionId: edition.id } }),
      ).toBe(unitsBefore);
      expect(
        await prisma.revision.count({ where: { editionId: edition.id } }),
      ).toBe(revisionsBefore);
      const draft = await prisma.revision.findFirst({
        where: { editionId: edition.id, status: "DRAFT" },
      });
      expect(draft?.id ?? null).toBe(draftBefore);
    });

    it("leaves the reader exactly where it was", async () => {
      // The point of not hiding it: chapter 3 is real, and still opens.
      const res = await lector.getChapter(
        "u-structure",
        "PRO" as never,
        SLUG,
        3,
      );
      expect(res.chapter.title).toBe("Tres, sin migrar");
      // Legacy identity, because that is genuinely what it is.
      expect(res.chapter.contentUnitId).toBeNull();
    });
  });

  // ── 2. Two different things claiming one position ────────────────────────

  describe("a legacy chapter and a different unit at the same order", () => {
    const SLUG = "libro-colision";

    beforeAll(async () => {
      const made = await makeBook(SLUG, ["Uno", "Dos"]);

      // A native unit placed at order 3…
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      const published = await prisma.edition.findUniqueOrThrow({
        where: { id: edition.id },
        select: { publishedRevisionId: true },
      });
      await saveUnitDraft(prisma, {
        editionId: edition.id,
        expectedRevisionId: published.publishedRevisionId!,
        unitKey: "native-at-three",
        title: "Nativo en la posición 3",
        placement: { order: 3, partNumber: null, partTitle: null },
        blocks: [{ kind: "PARAGRAPH", content: "Contenido nativo." }],
      });

      // …and a legacy chapter that also lives at order 3. Different identities,
      // same position: nothing can honestly say which one that position means.
      const collide = await prisma.chapter.create({
        data: { bookId: made.book.id, order: 3, title: "Legacy en la 3" },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: collide.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Texto legacy",
        },
      });
    }, 120_000);

    it("does not call the native unit legacy-backed just because the orders match", async () => {
      const book = await prisma.book.findUniqueOrThrow({
        where: { slug: SLUG },
      });
      const { chapters } = await listEditorialChapters(prisma, {
        bookId: book.id,
        bookSlug: SLUG,
      });

      const native = chapters.find((c) => c.unitKey === "native-at-three");
      expect(native).toBeDefined();
      expect(native!.order).toBe(3);
      // The whole repair: capabilities come from identity. This unit has no
      // legacy row, so its title is ours to edit and there is no media to
      // administer — regardless of what else sits at order 3.
      expect(native!.titleEditable).toBe(true);
      expect(native!.mediaAdminAvailable).toBe(false);
    });

    it("reports the conflict instead of picking a winner", async () => {
      const book = await prisma.book.findUniqueOrThrow({
        where: { slug: SLUG },
      });
      const structure = await listEditorialChapters(prisma, {
        bookId: book.id,
        bookSlug: SLUG,
      });

      expect(structure.structureConflict).toBe(true);
      expect(structure.chapterCreationAvailable).toBe(false);

      // Both are listed at order 3, because both really are there.
      const atThree = structure.chapters.filter((c) => c.order === 3);
      expect(atThree).toHaveLength(2);
      expect(new Set(atThree.map((c) => c.ingested))).toEqual(
        new Set([true, false]),
      );
    });

    it("still refuses to create", async () => {
      const state = await studio.getBookState(SLUG);
      expect(state.chapterCreationAvailable).toBe(false);

      await expect(
        studio.createChapter(SLUG, {
          expectedRevisionId: state.editingRevisionId,
          title: "Cuatro",
        }),
      ).rejects.toMatchObject({
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });
    });

    it("refuses to PUBLISH the draft, and moves nothing", async () => {
      // The one that matters most. Publishing here would move the pointer, tell
      // the editor the chapter is live, and — because the reader tries legacy
      // first — serve the OLD chapter at that position to everybody, forever.
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      const before = await prisma.edition.findUniqueOrThrow({
        where: { id: edition.id },
      });
      const draftBefore = await prisma.revision.findFirstOrThrow({
        where: { editionId: edition.id, status: "DRAFT" },
        orderBy: { number: "desc" },
      });
      const revisionsBefore = await prisma.revision.count({
        where: { editionId: edition.id },
      });

      await expect(
        studio.publishBook(SLUG, draftBefore.id),
      ).rejects.toMatchObject({
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });

      // Pointer unmoved.
      const after = await prisma.edition.findUniqueOrThrow({
        where: { id: edition.id },
      });
      expect(after.publishedRevisionId).toBe(before.publishedRevisionId);
      // Draft still active — the rollback did not archive it.
      const draftAfter = await prisma.revision.findFirstOrThrow({
        where: { editionId: edition.id, status: "DRAFT" },
        orderBy: { number: "desc" },
      });
      expect(draftAfter.id).toBe(draftBefore.id);
      expect(
        await prisma.revision.count({ where: { editionId: edition.id } }),
      ).toBe(revisionsBefore);
    });

    it("leaves the reader with the legacy chapter, not the native one", async () => {
      const res = await lector.getChapter(
        "u-structure",
        "PRO" as never,
        SLUG,
        3,
      );
      // Legacy Y, exactly as before — native X never became reachable.
      expect(res.chapter.title).toBe("Legacy en la 3");
      expect(res.chapter.contentUnitId).toBeNull();
    });

    it("keeps the native unit out of the published manifest", async () => {
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      const published = await prisma.edition.findUniqueOrThrow({
        where: { id: edition.id },
      });
      expect(
        await prisma.revisionUnit.count({
          where: {
            revisionId: published.publishedRevisionId as string,
            unit: { unitKey: "native-at-three" },
          },
        }),
      ).toBe(0);
    });
  });

  // ── 2b. Un-adopted, but nothing collides: publishing stays allowed ───────

  describe("an orphan legacy chapter that collides with nothing", () => {
    const SLUG = "libro-huerfano-publicable";

    beforeAll(async () => {
      const made = await makeBook(SLUG, ["Uno", "Dos"]);
      // Readable at order 3; the manifest holds only 1 and 2, and nothing else
      // claims 3. Creating is refused, but this state shadows nothing.
      const orphan = await prisma.chapter.create({
        data: { bookId: made.book.id, order: 3, title: "Tres, sin migrar" },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: orphan.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Texto 3",
        },
      });
    }, 120_000);

    it("publishes an ordinary text edit to an existing chapter", async () => {
      const book = await prisma.book.findUniqueOrThrow({
        where: { slug: SLUG },
      });
      const structure = await listEditorialChapters(prisma, {
        bookId: book.id,
        bookSlug: SLUG,
      });
      // The precondition that must NOT become a publication freeze.
      expect(structure.unsyncedLegacyCount).toBe(1);
      expect(structure.structureConflict).toBe(false);
      expect(structure.chapterCreationAvailable).toBe(false);

      const chapter = await studio.getChapter(SLUG, 1);
      const saved = await studio.saveChapterDraft(SLUG, 1, {
        expectedRevisionId: chapter.revisionId,
        blocks: [{ kind: "PARAGRAPH", content: "Texto corregido." }],
      });

      const published = await studio.publishBook(SLUG, saved.revisionId);
      expect(published.revisionId).toBe(saved.revisionId);

      // And the edit really went out: the published revision carries it.
      //
      // Read through Content Core rather than `LectorService`, because for a
      // chapter that still has a `Chapter` row the legacy reader serves
      // `ChapterBlock` — a pre-existing split between the two content surfaces,
      // not something this guard changes.
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      const after = await prisma.edition.findUniqueOrThrow({
        where: { id: edition.id },
      });
      expect(after.publishedRevisionId).toBe(saved.revisionId);

      const unit = await readUnitAtRevision(
        prisma,
        saved.revisionId,
        (
          await listEditorialChapters(prisma, {
            bookId: book.id,
            bookSlug: SLUG,
          })
        ).chapters[0]!.unitKey,
      );
      expect(unit!.blocks[0]!.content).toBe("Texto corregido.");
    }, 120_000);
  });

  // ── 3. Discarding a unit that was published in the meantime ──────────────

  describe("discard racing a publish", () => {
    const SLUG = "libro-carrera";
    let editionId = "";
    let draftId = "";

    beforeAll(async () => {
      const made = await makeBook(SLUG, ["Uno", "Dos"]);
      editionId = made.editionId;

      const edition = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      // Editor A creates a chapter. It is unpublished, so it is discardable.
      const saved = await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: edition.publishedRevisionId!,
        unitKey: "unit-racing",
        title: "Recién creado",
        placement: { order: 3, partNumber: null, partTitle: null },
        blocks: [{ kind: "PARAGRAPH", content: "Algo escrito." }],
      });
      draftId = saved.revisionId;
    }, 120_000);

    it("refuses once the unit has been published, even with a matching token", async () => {
      // Editor B publishes the very draft Editor A is holding. After this the
      // published pointer IS `draftId`, so A's `expectedRevisionId` still
      // matches — the optimistic check cannot catch this on its own.
      await publishDraftRevision(prisma, editionId, draftId);
      const afterPublish = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      expect(afterPublish.publishedRevisionId).toBe(draftId);

      const revisionsBefore = await prisma.revision.count({
        where: { editionId },
      });

      await expect(
        discardDraftUnit(prisma, {
          editionId,
          expectedRevisionId: draftId,
          unitKey: "unit-racing",
        }),
      ).rejects.toThrow(/CONTENT_DRAFT_UNIT_ALREADY_PUBLISHED/);

      // Nothing moved: no new draft, no pointer change, chapter still there.
      expect(await prisma.revision.count({ where: { editionId } })).toBe(
        revisionsBefore,
      );
      const after = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      expect(after.publishedRevisionId).toBe(draftId);
      expect(
        await prisma.revisionUnit.count({
          where: {
            revisionId: draftId,
            unit: { unitKey: "unit-racing" },
          },
        }),
      ).toBe(1);
    });

    it("and the reader keeps the chapter", async () => {
      const res = await lector.getChapter(
        "u-structure",
        "PRO" as never,
        SLUG,
        3,
      );
      expect(res.chapter.title).toBe("Recién creado");
    });

    it("surfaces it through Content Studio as an already-published chapter", async () => {
      const state = await studio.getBookState(SLUG);
      await expect(
        studio.discardNewChapter(SLUG, 3, state.editingRevisionId),
      ).rejects.toMatchObject({
        response: { code: "CONTENT_CHAPTER_ALREADY_PUBLISHED" },
      });
    });
  });

  // ── 4. The book list count ───────────────────────────────────────────────

  describe("the Content Studio book list count", () => {
    const SLUG = "libro-conteo";

    beforeAll(async () => {
      await makeBook(SLUG, ["Uno", "Dos"]);
    }, 120_000);

    it("counts the published manifest, not the legacy rows", async () => {
      const state = await studio.getBookState(SLUG);
      const created = await studio.createChapter(SLUG, {
        expectedRevisionId: state.editingRevisionId,
        title: "Tres, nativo",
      });
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: SLUG },
      });
      await publishDraftRevision(prisma, edition.id, created.revisionId);

      const { books } = await studio.listBooks();
      const row = books.find((b) => b.slug === SLUG)!;
      expect(row.totalChapters).toBe(3);

      // Without touching the legacy column, which is what made it stale.
      const book = await prisma.book.findUniqueOrThrow({
        where: { slug: SLUG },
      });
      expect(book.totalChapters).toBe(2);
      expect(await prisma.chapter.count({ where: { bookId: book.id } })).toBe(
        2,
      );
    });

    it("counts the DRAFT while one is open, because that is what the editor is editing", async () => {
      const state = await studio.getBookState(SLUG);
      await studio.createChapter(SLUG, {
        expectedRevisionId: state.editingRevisionId,
        title: "Cuatro, sin publicar",
      });

      const { books } = await studio.listBooks();
      expect(books.find((b) => b.slug === SLUG)!.totalChapters).toBe(4);

      // And the reader still sees only what is published.
      const published = await lector.getChapter(
        "u-structure",
        "PRO" as never,
        SLUG,
        1,
      );
      expect(published.book.totalChapters).toBe(3);
    });

    it("falls back to legacy rows for a book Content Core does not serve", async () => {
      const orphanBook = await prisma.book.create({
        data: { slug: "libro-sin-core", title: "Sin core", plan: "FREE" },
      });
      for (const order of [1, 2, 3, 4, 5]) {
        await prisma.chapter.create({
          data: { bookId: orphanBook.id, order, title: `Cap ${order}` },
        });
      }

      const { books } = await studio.listBooks();
      expect(
        books.find((b) => b.slug === "libro-sin-core")!.totalChapters,
      ).toBe(5);
    });
  });

  // ── 5. The derived key is what ties the two worlds together ──────────────

  it("classifies a backfilled chapter by its derived key", async () => {
    const SLUG = "libro-derivado";
    const made = await makeBook(SLUG, ["Uno"]);

    const { chapters } = await listEditorialChapters(prisma, {
      bookId: made.book.id,
      bookSlug: SLUG,
    });

    const [only] = chapters;
    expect(only!.unitKey).toBe(
      unitKeyFromLegacyChapterId(made.chapters[0]!.id),
    );
    expect(only!.titleEditable).toBe(false);
    expect(only!.mediaAdminAvailable).toBe(true);
  }, 120_000);
});
