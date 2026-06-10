import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorReviewService, kebabize } from "./author-review.service";

type Tx = {
  book: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  chapter: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  chapterBlock: {
    create: ReturnType<typeof vi.fn>;
  };
  authorBook: {
    update: ReturnType<typeof vi.fn>;
  };
  authorPublicationRequest: {
    update: ReturnType<typeof vi.fn>;
  };
};

function makePrisma() {
  const tx: Tx = {
    book: {
      create: vi.fn().mockResolvedValue({ id: "book1", slug: "mi-libro" }),
      update: vi.fn().mockResolvedValue({ id: "book1", slug: "mi-libro" }),
    },
    chapter: {
      create: vi.fn().mockResolvedValue({ id: "ch1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chapterBlock: {
      create: vi.fn().mockResolvedValue({}),
    },
    authorBook: {
      update: vi.fn().mockResolvedValue({}),
    },
    authorPublicationRequest: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    user: { findUnique: vi.fn() },
    book: { findUnique: vi.fn() },
    bookAuthor: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    authorBook: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    authorBookChapter: { findMany: vi.fn() },
    authorPublicationRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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

describe("AuthorReviewService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AuthorReviewService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AuthorReviewService(prisma as never);
  });

  describe("listRequests", () => {
    it("defaults to PENDING-only", async () => {
      prisma.authorPublicationRequest.findMany.mockResolvedValue([]);
      await svc.listRequests("PENDING", 50);
      const args = prisma.authorPublicationRequest.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ reviewState: "PENDING" });
      expect(args.take).toBe(50);
    });

    it("ALL removes status filter", async () => {
      prisma.authorPublicationRequest.findMany.mockResolvedValue([]);
      await svc.listRequests("ALL", 200);
      const args = prisma.authorPublicationRequest.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
    });

    it("maps payload shape", async () => {
      prisma.authorPublicationRequest.findMany.mockResolvedValue([
        {
          id: "r1",
          bookId: "b1",
          reviewState: "PENDING",
          submittedAt: new Date(),
          reviewedAt: null,
          feedback: null,
          book: {
            id: "b1",
            title: "Libro X",
            subtitle: null,
            summary: "Sum",
            cover: "warm",
            coverArtUrl: null,
            status: "IN_REVIEW",
            authorUserId: "u1",
            language: "es",
            categoryId: null,
            author: {
              id: "u1",
              email: "a@p.com",
              name: "A",
              firstName: "Alice",
            },
            _count: { chapters: 4 },
          },
        },
      ]);
      const res = await svc.listRequests("PENDING", 50);
      expect(res.items[0].book.author.name).toBe("Alice");
      expect(res.items[0].book.chapters).toBe(4);
    });
  });

  describe("approve — error paths", () => {
    it("404 when request not found", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue(null);
      await expect(svc.approve("r1", "admin1")).rejects.toThrow(
        /REQUEST_NOT_FOUND/,
      );
    });

    it("409 when request already decided", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        reviewState: "APPROVED",
        book: { status: "PUBLISHED", chapters: [] },
      });
      await expect(svc.approve("r1", "admin1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "REQUEST_ALREADY_DECIDED" }),
      });
    });

    it("409 when book not IN_REVIEW", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        reviewState: "PENDING",
        book: { status: "DRAFT", chapters: [], authorUserId: "u1" },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@p.com",
        firstName: "A",
        name: "A",
      });
      await expect(svc.approve("r1", "admin1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BOOK_NOT_IN_REVIEW" }),
      });
    });

    it("400 when fewer than 3 visible chapters", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        reviewState: "PENDING",
        book: {
          status: "IN_REVIEW",
          authorUserId: "u1",
          chapters: [
            { n: 1, title: "Cap 1", subtitle: null, isHidden: false, blocks: [] },
            { n: 2, title: "Cap 2", subtitle: null, isHidden: true, blocks: [] },
            { n: 3, title: "Cap 3", subtitle: null, isHidden: true, blocks: [] },
          ],
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@p.com",
        firstName: "A",
        name: "A",
      });
      await expect(svc.approve("r1", "admin1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MIN_CHAPTERS_NOT_MET" }),
      });
    });
  });

  describe("approve — happy path", () => {
    it("creates Book + Chapter + ChapterBlock and updates AuthorBook", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        reviewState: "PENDING",
        book: {
          id: "ab1",
          title: "Mi Libro",
          subtitle: null,
          summary: "Largo resumen",
          cover: "warm",
          coverArtUrl: null,
          status: "IN_REVIEW",
          authorUserId: "u1",
          categoryId: null,
          publishedBookId: null,
          chapters: [
            {
              n: 1,
              title: "C1",
              subtitle: null,
              isHidden: false,
              blocks: [
                { kind: "paragraph", content: "Hola" },
                { kind: "heading", content: "Título" },
              ],
            },
            {
              n: 2,
              title: "C2",
              subtitle: null,
              isHidden: false,
              blocks: [],
            },
            {
              n: 3,
              title: "C3",
              subtitle: null,
              isHidden: false,
              blocks: [],
            },
          ],
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@p.com",
        firstName: "Alice",
        name: "Alice",
      });
      prisma.book.findUnique.mockResolvedValue(null);
      prisma.bookAuthor.findUnique.mockResolvedValue(null);
      prisma.bookAuthor.upsert.mockResolvedValue({ id: "ba1" });
      const res = await svc.approve("r1", "admin1");
      expect(res.bookId).toBe("book1");
      expect(res.slug).toBe("mi-libro");
      expect(res.chapters).toBe(3);
      // Created Book
      expect(prisma._tx.book.create).toHaveBeenCalledTimes(1);
      // Created 3 chapters
      expect(prisma._tx.chapter.create).toHaveBeenCalledTimes(3);
      // Created 2 blocks total (chapter 1 has 2 blocks)
      expect(prisma._tx.chapterBlock.create).toHaveBeenCalledTimes(2);
      // Updated AuthorBook + request
      expect(prisma._tx.authorBook.update).toHaveBeenCalled();
      expect(prisma._tx.authorPublicationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewState: "APPROVED",
            reviewedBy: "admin1",
          }),
        }),
      );
    });

    it("updates existing Book when publishedBookId set (republish)", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        reviewState: "PENDING",
        book: {
          id: "ab1",
          title: "Mi Libro Republicado",
          subtitle: null,
          summary: "Resumen otra vez",
          cover: "warm",
          coverArtUrl: null,
          status: "IN_REVIEW",
          authorUserId: "u1",
          categoryId: null,
          publishedBookId: "existing-book-id",
          chapters: [
            { n: 1, title: "A", subtitle: null, isHidden: false, blocks: [] },
            { n: 2, title: "B", subtitle: null, isHidden: false, blocks: [] },
            { n: 3, title: "C", subtitle: null, isHidden: false, blocks: [] },
          ],
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@p.com",
        firstName: "Alice",
        name: "Alice",
      });
      prisma.bookAuthor.findUnique.mockResolvedValue({ id: "ba1" });
      prisma.bookAuthor.upsert.mockResolvedValue({ id: "ba1" });
      await svc.approve("r1", "admin1");
      expect(prisma._tx.book.create).not.toHaveBeenCalled();
      expect(prisma._tx.book.update).toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("404 when request not found", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue(null);
      await expect(svc.reject("r1", "admin1", "razon")).rejects.toThrow(
        /REQUEST_NOT_FOUND/,
      );
    });

    it("409 when not PENDING", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        reviewState: "REJECTED",
      });
      await expect(
        svc.reject("r1", "admin1", "razon"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "REQUEST_ALREADY_DECIDED" }),
      });
    });

    it("transitions IN_REVIEW → DRAFT + REJECTED", async () => {
      prisma.authorPublicationRequest.findUnique.mockResolvedValue({
        id: "r1",
        bookId: "ab1",
        reviewState: "PENDING",
      });
      const res = await svc.reject("r1", "admin1", "no apto");
      expect(res.ok).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("kebabize", () => {
    it("strips diacritics", () => {
      expect(kebabize("Áéíóú ñ")).toBe("aeiou-n");
    });
    it("collapses punctuation", () => {
      expect(kebabize("Hello, World! 2026")).toBe("hello-world-2026");
    });
    it("trims leading/trailing dashes", () => {
      expect(kebabize("---test---")).toBe("test");
    });
    it("returns empty on garbage", () => {
      expect(kebabize("---")).toBe("");
    });
    it("caps length at 60", () => {
      const long = "a".repeat(120);
      expect(kebabize(long).length).toBe(60);
    });
  });
});
