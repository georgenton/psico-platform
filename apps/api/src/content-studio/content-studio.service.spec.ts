import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ContentStudioService } from "./content-studio.service";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Content Studio — what the browser is NOT allowed to decide.
 *
 * The lifecycle itself is proven against real Postgres in
 * `content-core-draft.pg-spec.ts`; this file is about the boundary. An ADMIN
 * knows ids, so "they could have guessed it" is not a defence: a request may
 * only address the book and chapter its URL names.
 */

const draft = vi.hoisted(() => ({
  saveUnitDraft: vi.fn(),
  publishDraftRevision: vi.fn(),
  describeEditionDraft: vi.fn(),
  readUnitAtRevision: vi.fn(),
  readUnitTitlesAtRevision: vi.fn(),
}));

vi.mock("../content-core/content-draft", () => draft);

function prismaMock() {
  return {
    book: { findUnique: vi.fn(), findMany: vi.fn() },
    chapter: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    edition: { findUnique: vi.fn() },
    revision: { findUnique: vi.fn() },
  };
}

let prisma: ReturnType<typeof prismaMock>;
let service: ContentStudioService;

const EDITION = { id: "edition_a" };

beforeEach(() => {
  // Hoisted module mocks accumulate calls across tests otherwise.
  vi.clearAllMocks();
  prisma = prismaMock();
  service = new ContentStudioService(prisma as unknown as PrismaService);

  prisma.book.findUnique.mockResolvedValue({
    id: "book_1",
    slug: "libro",
    title: "Libro",
    subtitle: null,
    author: null,
  });
  prisma.chapter.findFirst.mockResolvedValue({
    id: "chapter_1",
    order: 1,
    title: "Cap 1",
    partNumber: null,
    partTitle: null,
  });
  prisma.chapter.findMany.mockResolvedValue([
    { id: "chapter_1", order: 1, title: "Título viejo" },
  ]);
  draft.readUnitTitlesAtRevision.mockResolvedValue(new Map());
  prisma.edition.findUnique.mockResolvedValue(EDITION);
  draft.describeEditionDraft.mockResolvedValue({
    publishedRevisionId: "r5",
    publishedRevisionNumber: 5,
    draftRevisionId: "r6",
    draftRevisionNumber: 6,
    changedUnitKeys: ["unit-a"],
  });
  draft.readUnitAtRevision.mockResolvedValue({
    title: "Cap 1",
    summary: null,
    durationMinutes: null,
    blocks: [],
  });
  draft.saveUnitDraft.mockResolvedValue({
    revisionId: "r7",
    revisionNumber: 7,
    blocksMatched: 1,
    blocksNew: 0,
    blocksTombstoned: 0,
  });
});

describe("ContentStudioService — the browser names nothing internal", () => {
  it("derives edition, unit key and placement from the route, ignoring the body", async () => {
    await service.saveChapterDraft("libro", 1, {
      expectedRevisionId: "r6",
      title: "Cap 1",
      blocks: [{ kind: "PARAGRAPH", content: "Texto." }],
    });

    const call = draft.saveUnitDraft.mock.calls[0]![1];
    expect(call.editionId).toBe("edition_a");
    // Derived from the chapter row, never sent by the client.
    expect(call.unitKey).toBeTypeOf("string");
    expect(call.unitKey.length).toBeGreaterThan(0);
    // Saving text may not move a chapter.
    expect(call.placement).toEqual({
      order: 1,
      partNumber: null,
      partTitle: null,
    });
  });

  it("passes the editor's token through untouched", async () => {
    await service.saveChapterDraft("libro", 1, {
      expectedRevisionId: "r6",
      title: "Cap 1",
      blocks: [{ kind: "PARAGRAPH", content: "Texto." }],
    });

    expect(draft.saveUnitDraft.mock.calls[0]![1].expectedRevisionId).toBe("r6");
  });

  it("keeps a media block's metadata intact through a text save", async () => {
    // IMAGE/AUDIO metadata is not administered yet, so it must survive rather
    // than be stripped by a schema that has not learned about it.
    const meta = { url: "https://cdn/x.png", alt: "una ilustración" };
    await service.saveChapterDraft("libro", 1, {
      expectedRevisionId: "r6",
      title: "Cap 1",
      blocks: [
        { kind: "PARAGRAPH", content: "Texto." },
        { kind: "IMAGE", content: "", meta },
      ],
    });

    expect(draft.saveUnitDraft.mock.calls[0]![1].blocks[1].meta).toEqual(meta);
  });

  it("reports a conflict as 409 and writes nothing", async () => {
    draft.saveUnitDraft.mockRejectedValueOnce(
      new Error("CONTENT_DRAFT_CONFLICT"),
    );

    await expect(
      service.saveChapterDraft("libro", 1, {
        expectedRevisionId: "stale",
        title: "Cap 1",
        blocks: [{ kind: "PARAGRAPH", content: "Texto." }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ContentStudioService — preview cannot reach across books", () => {
  it("refuses a revision belonging to another edition", async () => {
    // The id is real and the caller is ADMIN. It still is not theirs to read
    // through this route.
    prisma.revision.findUnique.mockResolvedValue({
      id: "r99",
      editionId: "edition_OTHER",
      status: "DRAFT",
      number: 99,
    });

    await expect(
      service.previewChapter("libro", 1, "r99"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a published revision asked for as a draft", async () => {
    prisma.revision.findUnique.mockResolvedValue({
      id: "r5",
      editionId: EDITION.id,
      status: "PUBLISHED",
      number: 5,
    });

    await expect(
      service.previewChapter("libro", 1, "r5"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a superseded draft", async () => {
    prisma.revision.findUnique.mockResolvedValue({
      id: "r4",
      editionId: EDITION.id,
      status: "DRAFT",
      number: 4,
    });
    // The active draft is r6, so r4 is somebody's stale tab.
    await expect(
      service.previewChapter("libro", 1, "r4"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("serves the active draft", async () => {
    prisma.revision.findUnique.mockResolvedValue({
      id: "r6",
      editionId: EDITION.id,
      status: "DRAFT",
      number: 6,
    });

    const preview = await service.previewChapter("libro", 1, "r6");

    expect(preview.revisionId).toBe("r6");
    expect(draft.readUnitAtRevision).toHaveBeenCalled();
  });
});

describe("ContentStudioService — publishing is edition-scoped", () => {
  it("refuses to publish a draft that is no longer the active one", async () => {
    await expect(service.publishBook("libro", "r4")).rejects.toMatchObject({
      response: { code: "CONTENT_DRAFT_CONFLICT" },
    });
    expect(draft.publishDraftRevision).not.toHaveBeenCalled();
  });

  it("publishes the active draft and reports what it changed", async () => {
    draft.publishDraftRevision.mockResolvedValue({
      revisionId: "r6",
      revisionNumber: 6,
    });

    const result = await service.publishBook("libro", "r6");

    expect(result.revisionNumber).toBe(6);
    expect(result.changedUnitCountBeforePublish).toBe(1);
  });
});

describe("ContentStudioService — reading a chapter", () => {
  it("prefers the active draft and returns it as the concurrency token", async () => {
    const chapter = await service.getChapter("libro", 1);

    expect(chapter.revisionId).toBe("r6");
    expect(chapter.revisionStatus).toBe("DRAFT");
  });

  it("falls back to the published revision when there is no draft", async () => {
    draft.describeEditionDraft.mockResolvedValue({
      publishedRevisionId: "r5",
      publishedRevisionNumber: 5,
      draftRevisionId: null,
      draftRevisionNumber: null,
      changedUnitKeys: [],
    });

    const chapter = await service.getChapter("libro", 1);

    expect(chapter.revisionId).toBe("r5");
    expect(chapter.revisionStatus).toBe("PUBLISHED");
  });

  it("404s a chapter the book does not have", async () => {
    prisma.chapter.findFirst.mockResolvedValue(null);

    await expect(service.getChapter("libro", 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("ContentStudioService — a text edit may not reshape the book", () => {
  it("carries the chapter's part through a save the browser never mentioned", async () => {
    // Parts live on the legacy Chapter row. If a save sent nulls here, editing
    // one paragraph would quietly flatten "Parte II" out of the book.
    prisma.chapter.findFirst.mockResolvedValue({
      id: "chapter_1",
      order: 4,
      title: "Cap 4",
      partNumber: 2,
      partTitle: "Parte II · Integrar",
    });

    await service.saveChapterDraft("libro", 4, {
      expectedRevisionId: "r6",
      title: "Cap 4",
      blocks: [{ kind: "PARAGRAPH", content: "Texto." }],
    });

    expect(draft.saveUnitDraft.mock.calls[0]![1].placement).toEqual({
      order: 4,
      partNumber: 2,
      partTitle: "Parte II · Integrar",
    });
  });
});

describe("ContentStudioService — the chapter list shows what is being edited", () => {
  it("prefers the revision's title over the stale legacy row", async () => {
    const unitKey = draft.saveUnitDraft.mock.calls.length; // unused, keeps lint quiet
    void unitKey;
    // The list must agree with the editor that produced it: `Chapter.title` is
    // the legacy row and goes stale the moment Content Studio renames a chapter.
    draft.readUnitTitlesAtRevision.mockImplementation(async () => {
      const { unitKeyFromLegacyChapterId } =
        await import("../content-core/lib/block-key");
      return new Map([
        [unitKeyFromLegacyChapterId("chapter_1"), "Título nuevo"],
      ]);
    });

    const state = await service.getBookState("libro");

    expect(state.chapters[0]!.title).toBe("Título nuevo");
    // Read from the DRAFT, because that is what the editor is editing.
    expect(draft.readUnitTitlesAtRevision).toHaveBeenCalledWith(
      expect.anything(),
      "r6",
    );
  });

  it("falls back to the legacy title only for a chapter Content Core never saw", async () => {
    draft.readUnitTitlesAtRevision.mockResolvedValue(new Map());

    const state = await service.getBookState("libro");

    expect(state.chapters[0]!.title).toBe("Título viejo");
  });

  it("reads published titles when there is no draft", async () => {
    draft.describeEditionDraft.mockResolvedValue({
      publishedRevisionId: "r5",
      publishedRevisionNumber: 5,
      draftRevisionId: null,
      draftRevisionNumber: null,
      changedUnitKeys: [],
    });

    await service.getBookState("libro");

    expect(draft.readUnitTitlesAtRevision).toHaveBeenCalledWith(
      expect.anything(),
      "r5",
    );
  });
});
