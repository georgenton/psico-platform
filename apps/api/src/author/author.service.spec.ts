import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorService } from "./author.service";

type Tx = {
  authorBookChapter: {
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function makePrisma() {
  const tx: Tx = {
    authorBookChapter: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    user: { findUnique: vi.fn() },
    authorBook: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    authorBookChapter: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    authorPublicationRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") {
        return await (input as (t: Tx) => Promise<unknown>)(tx);
      }
      return [];
    }),
    _tx: tx,
  };
}

describe("AuthorService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AuthorService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AuthorService(prisma as never);
  });

  describe("getDashboard", () => {
    it("returns author + books", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        name: "Jorge",
        firstName: "Jorge",
        email: "j@p.com",
        role: "AUTHOR",
      });
      prisma.authorBook.findMany.mockResolvedValue([
        {
          id: "b1",
          title: "L1",
          subtitle: null,
          status: "DRAFT",
          cover: "warm",
          updatedAt: new Date(),
          publishedAt: null,
          archivedAt: null,
          _count: { chapters: 3 },
        },
      ]);
      const res = await svc.getDashboard("u1");
      expect(res.author.name).toBe("Jorge");
      expect(res.books).toHaveLength(1);
      expect(res.books[0].chapters).toBe(3);
      expect(res.aiHelpers).toHaveLength(4);
      expect(res.publicationSteps).toHaveLength(4);
    });

    it("throws when user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.authorBook.findMany.mockResolvedValue([]);
      await expect(svc.getDashboard("u1")).rejects.toThrow(/USER_NOT_FOUND/);
    });
  });

  describe("createBook", () => {
    it("creates book + placeholder chapter 1", async () => {
      prisma.authorBook.create.mockResolvedValue({ id: "b1" });
      const res = await svc.createBook("u1", { title: "Mi libro" });
      expect(res.bookId).toBe("b1");
      expect(prisma.authorBookChapter.create).toHaveBeenCalledWith({
        data: {
          bookId: "b1",
          n: 1,
          title: "Capítulo 1",
          blocks: [{ kind: "paragraph", content: "" }],
        },
      });
    });
  });

  describe("ownership guard", () => {
    it("getBook 404 when book doesn't belong to user", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "other-user",
      });
      await expect(svc.getBook("u1", "b1")).rejects.toThrow(/BOOK_NOT_FOUND/);
    });

    it("getBook 404 when book doesn't exist", async () => {
      prisma.authorBook.findUnique.mockResolvedValue(null);
      await expect(svc.getBook("u1", "b1")).rejects.toThrow(/BOOK_NOT_FOUND/);
    });

    it("returns book + chapters when ownership OK", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        title: "L1",
        status: "DRAFT",
        cover: "warm",
        language: "es",
      });
      prisma.authorBookChapter.findMany.mockResolvedValue([
        { n: 1, title: "Cap 1" },
        { n: 2, title: "Cap 2" },
      ]);
      const res = await svc.getBook("u1", "b1");
      expect(res.structure).toHaveLength(2);
    });
  });

  describe("updateChapter — optimistic concurrency", () => {
    beforeEach(() => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
      });
    });

    it("updates and increments version", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue({
        id: "c1",
        version: 5,
      });
      prisma.authorBookChapter.update.mockResolvedValue({ version: 6 });
      const res = await svc.updateChapter("u1", "b1", 1, {
        title: "New title",
        expectedVersion: 5,
      });
      expect(res.version).toBe(6);
    });

    it("409 when expectedVersion mismatches", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue({
        id: "c1",
        version: 7,
      });
      await expect(
        svc.updateChapter("u1", "b1", 1, {
          title: "x",
          expectedVersion: 5,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "CHAPTER_VERSION_CONFLICT",
        }),
      });
    });

    it("skips concurrency check when expectedVersion omitted", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue({
        id: "c1",
        version: 3,
      });
      prisma.authorBookChapter.update.mockResolvedValue({ version: 4 });
      const res = await svc.updateChapter("u1", "b1", 1, { title: "x" });
      expect(res.version).toBe(4);
    });

    it("404 when chapter doesn't exist", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue(null);
      await expect(
        svc.updateChapter("u1", "b1", 99, { title: "x" }),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });
  });

  describe("updateStructure", () => {
    beforeEach(() => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
      });
    });

    it("400 when numbering is non-contiguous", async () => {
      prisma.authorBookChapter.findMany.mockResolvedValue([]);
      await expect(
        svc.updateStructure("u1", "b1", {
          chapters: [
            { n: 1, title: "A" },
            { n: 3, title: "B" },
          ],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "STRUCTURE_NUMBERING_INVALID",
        }),
      });
    });

    it("deletes chapters removed from the structure", async () => {
      prisma.authorBookChapter.findMany.mockResolvedValue([
        { id: "c1", n: 1 },
        { id: "c2", n: 2 },
        { id: "c3", n: 3 },
      ]);
      const res = await svc.updateStructure("u1", "b1", {
        chapters: [
          { n: 1, title: "A" },
          { n: 2, title: "B" },
        ],
      });
      expect(prisma.authorBookChapter.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["c3"] } },
      });
      expect(res.count).toBe(2);
    });
  });

  describe("submitForReview", () => {
    beforeEach(() => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
        summary: "Resumen lo suficientemente largo para pasar la validación.",
        cover: "warm",
      });
    });

    it("400 when fewer than 3 chapters visible", async () => {
      prisma.authorBookChapter.count.mockResolvedValue(2);
      await expect(svc.submitForReview("u1", "b1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MIN_CHAPTERS_NOT_MET" }),
      });
    });

    it("400 when summary is too short", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
        summary: "short",
        cover: "warm",
      });
      prisma.authorBookChapter.count.mockResolvedValue(3);
      await expect(svc.submitForReview("u1", "b1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SUMMARY_MISSING" }),
      });
    });

    it("409 when book is already IN_REVIEW", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "IN_REVIEW",
        summary: "long enough summary for the check to pass without issues.",
        cover: "warm",
      });
      await expect(svc.submitForReview("u1", "b1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BOOK_NOT_DRAFT" }),
      });
    });

    it("transitions DRAFT → IN_REVIEW and creates audit row", async () => {
      prisma.authorBookChapter.count.mockResolvedValue(3);
      const res = await svc.submitForReview("u1", "b1");
      expect(res.ok).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("archiveBook", () => {
    it("noop when already archived", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "ARCHIVED",
      });
      const res = await svc.archiveBook("u1", "b1");
      expect((res as { alreadyArchived?: boolean }).alreadyArchived).toBe(true);
      expect(prisma.authorBook.update).not.toHaveBeenCalled();
    });

    it("sets ARCHIVED + archivedAt", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
      });
      await svc.archiveBook("u1", "b1");
      const call = prisma.authorBook.update.mock.calls[0][0];
      expect(call.data.status).toBe("ARCHIVED");
      expect(call.data.archivedAt).toBeInstanceOf(Date);
    });
  });
});
