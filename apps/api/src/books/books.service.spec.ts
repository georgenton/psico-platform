import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { BooksService } from "./books.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
//
// We model two anchor books: one FREE one PRO. The list/detail tests use both
// so we can verify tier mapping and the locked-by-tier flag.

const freeAuthor = {
  id: "author-marina",
  slug: "marina-quintana",
  name: "Marina Quintana",
  title: "Dra. en Psicología Clínica",
  bio: "Autora ancla",
  avatarUrl: null,
  licenseNumber: "EC-12345",
  cover: "cool",
  isVerified: true,
};

const baseFreeBook = {
  id: "book-1",
  slug: "emociones-en-construccion",
  title: "Emociones en Construcción",
  subtitle: "Guía práctica",
  description: "Una descripción corta.",
  summary: "Un summary más largo.",
  cover: "cool",
  coverUrl: null,
  coverArtUrl: null,
  pages: 120,
  durationMinutes: 180,
  language: "es",
  totalChapters: 2,
  isPublished: true,
  plan: "FREE",
  authorId: "author-marina",
  categoryId: "cat-ansiedad",
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  author: freeAuthor,
  category: { id: "cat-ansiedad", slug: "ansiedad", label: "Ansiedad" },
  reviews: [{ rating: 5 }, { rating: 4 }],
  favorites: [],
  bookmarks: [],
  chapters: [
    {
      id: "ch-1",
      order: 1,
      title: "Capítulo 1",
      durationMinutes: 12,
      progress: [{ completedAt: new Date("2026-01-02") }],
    },
    {
      id: "ch-2",
      order: 2,
      title: "Capítulo 2",
      durationMinutes: 12,
      progress: [],
    },
  ],
};

const baseProBook = {
  ...baseFreeBook,
  id: "book-2",
  slug: "familias-ensambladas",
  title: "Familias Ensambladas",
  plan: "PRO",
  favorites: [],
  bookmarks: [],
  reviews: [],
  chapters: [],
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    book: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bookCategory: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "cat-ansiedad",
          slug: "ansiedad",
          label: "Ansiedad",
          _count: { books: 1 },
        },
      ]),
    },
    bookAuthor: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: freeAuthor.id,
          slug: freeAuthor.slug,
          name: freeAuthor.name,
          avatarUrl: null,
          cover: "cool",
          _count: { books: 1 },
        },
      ]),
    },
    bookReview: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    bookFavorite: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    bookBookmark: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    audio: { findFirst: vi.fn().mockResolvedValue(null) },
    exercise: { findFirst: vi.fn().mockResolvedValue(null) },
    chapter: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    userProgress: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

// ─── BooksService — list / catalog ────────────────────────────────────────────

describe("BooksService.list", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
  });

  it("returns books, pagination, categories and authors", async () => {
    prisma.book.findMany.mockResolvedValue([baseFreeBook]);
    prisma.book.count.mockResolvedValue(1);

    const result = await service.list("user-1", { page: 1, perPage: 24 });

    expect(result.books).toHaveLength(1);
    expect(result.books[0].slug).toBe("emociones-en-construccion");
    expect(result.books[0].tierRequired).toBe("free");
    expect(result.books[0].authorName).toBe("Marina Quintana");
    expect(result.pagination).toEqual({ page: 1, perPage: 24, total: 1 });
    expect(result.categories).toHaveLength(1);
    expect(result.authors).toHaveLength(1);
  });

  it("maps PRO plan to 'pro' tier", async () => {
    prisma.book.findMany.mockResolvedValue([baseProBook]);
    prisma.book.count.mockResolvedValue(1);

    const result = await service.list(null, {});

    expect(result.books[0].tierRequired).toBe("pro");
  });

  it("computes rating average from reviews array", async () => {
    prisma.book.findMany.mockResolvedValue([baseFreeBook]); // ratings [5,4]
    prisma.book.count.mockResolvedValue(1);

    const result = await service.list("user-1", {});

    expect(result.books[0].rating).toBe(4.5);
    expect(result.books[0].reviewCount).toBe(2);
  });

  it("returns null userProgress when unauthenticated", async () => {
    prisma.book.findMany.mockResolvedValue([baseFreeBook]);
    prisma.book.count.mockResolvedValue(1);

    const result = await service.list(null, {});

    expect(result.books[0].userProgress).toBeNull();
    expect(result.books[0].isFavorite).toBe(false);
    expect(result.books[0].isBookmarked).toBe(false);
  });

  it("applies categoryId filter to where clause", async () => {
    prisma.book.findMany.mockResolvedValue([]);
    prisma.book.count.mockResolvedValue(0);

    await service.list("user-1", { categoryId: "cat-ansiedad" });

    expect(prisma.book.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          categoryId: "cat-ansiedad",
        }),
      }),
    );
  });

  it("applies q search across title/subtitle/description (insensitive)", async () => {
    prisma.book.findMany.mockResolvedValue([]);
    prisma.book.count.mockResolvedValue(0);

    await service.list("user-1", { q: "duelo" });

    expect(prisma.book.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            expect.objectContaining({
              title: { contains: "duelo", mode: "insensitive" },
            }),
            expect.objectContaining({
              subtitle: { contains: "duelo", mode: "insensitive" },
            }),
            expect.objectContaining({
              description: { contains: "duelo", mode: "insensitive" },
            }),
          ],
        }),
      }),
    );
  });
});

// ─── BooksService — detail ───────────────────────────────────────────────────

describe("BooksService.getDetail", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
  });

  it("returns 404 when book not found by id or slug", async () => {
    prisma.book.findUnique.mockResolvedValue(null);

    await expect(service.getDetail("user-1", "ghost-book")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns full detail with chaptersList, rating and author", async () => {
    prisma.book.findUnique
      .mockResolvedValueOnce(null) // first try (by id)
      .mockResolvedValueOnce(baseFreeBook); // second try (by slug)
    prisma.bookReview.groupBy.mockResolvedValue([
      { rating: 5, _count: { rating: 2 } },
    ]);
    prisma.bookReview.findMany.mockResolvedValue([]);

    const result = await service.getDetail(
      "user-1",
      "emociones-en-construccion",
    );

    expect(result.book.title).toBe("Emociones en Construcción");
    expect(result.book.tierRequired).toBe("free");
    expect(result.book.audioAvailable).toBe(false);
    expect(result.author?.name).toBe("Marina Quintana");
    // 2 chapters in the fixture
    expect(result.chaptersList).toHaveLength(2);
    expect(result.chaptersList[0].lockedByTier).toBe(false); // FREE plan
    expect(result.rating.avg).toBe(5);
    expect(result.rating.count).toBe(2);
  });

  it("hides licenseNumber for unverified author", async () => {
    const unverifiedBook = {
      ...baseFreeBook,
      author: { ...freeAuthor, isVerified: false },
    };
    prisma.book.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(unverifiedBook);
    prisma.bookReview.groupBy.mockResolvedValue([]);
    prisma.bookReview.findMany.mockResolvedValue([]);

    const result = await service.getDetail(null, "emociones-en-construccion");

    expect(result.author?.licenseNumber).toBeNull();
    expect(result.author?.isVerified).toBe(false);
  });
});

// ─── BooksService — reviews ──────────────────────────────────────────────────

describe("BooksService.createReview", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
  });

  it("rejects review when book has no published chapters", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
    prisma.chapter.count.mockResolvedValue(0);

    await expect(
      service.createReview("user-1", "book-1", { rating: 5, text: "Bueno" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects review when user has not completed all chapters", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
    prisma.chapter.count.mockResolvedValue(3);
    prisma.userProgress.count.mockResolvedValue(2); // missing one

    await expect(
      service.createReview("user-1", "book-1", { rating: 5, text: "Bueno" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("upserts the review when user completed every chapter", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
    prisma.chapter.count.mockResolvedValue(2);
    prisma.userProgress.count.mockResolvedValue(2);
    prisma.bookReview.upsert.mockResolvedValue({
      id: "review-1",
      rating: 5,
      text: "Excelente",
      createdAt: new Date(),
      user: { firstName: "Jorge", name: "Jorge Q", city: "Quito" },
    });

    const result = await service.createReview("user-1", "book-1", {
      rating: 5,
      text: "Excelente",
    });

    expect(prisma.bookReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_bookId: { userId: "user-1", bookId: "book-1" } },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.review.userInitials).toBe("J");
    expect(result.review.rating).toBe(5);
  });
});

// ─── BooksService — toggles ──────────────────────────────────────────────────

describe("BooksService toggles", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
  });

  it("toggleFavorite creates record when none exists, returns active=true", async () => {
    prisma.bookFavorite.findUnique.mockResolvedValue(null);
    prisma.bookFavorite.create.mockResolvedValue({});

    const result = await service.toggleFavorite("user-1", "book-1");

    expect(prisma.bookFavorite.create).toHaveBeenCalled();
    expect(result.active).toBe(true);
  });

  it("toggleFavorite deletes record when one exists, returns active=false", async () => {
    prisma.bookFavorite.findUnique.mockResolvedValue({ id: "fav-1" });
    prisma.bookFavorite.delete.mockResolvedValue({});

    const result = await service.toggleFavorite("user-1", "book-1");

    expect(prisma.bookFavorite.delete).toHaveBeenCalledWith({
      where: { id: "fav-1" },
    });
    expect(result.active).toBe(false);
  });

  it("toggleBookmark mirrors toggleFavorite contract", async () => {
    prisma.bookBookmark.findUnique.mockResolvedValue(null);
    prisma.bookBookmark.create.mockResolvedValue({});

    const result = await service.toggleBookmark("user-1", "book-1");

    expect(result.active).toBe(true);
  });
});

// ─── BooksService — start ────────────────────────────────────────────────────

describe("BooksService.startBook", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
  });

  it("rejects when no published chapters exist", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
    prisma.chapter.findFirst.mockResolvedValue(null);

    await expect(service.startBook("user-1", "book-1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("upserts UserProgress for chapter 1 and returns userProgress", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "book-1", slug: "test" });
    prisma.chapter.findFirst.mockResolvedValue({ id: "ch-1", order: 1 });
    prisma.userProgress.upsert.mockResolvedValue({});
    prisma.book.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseFreeBook);
    prisma.bookReview.groupBy.mockResolvedValue([]);
    prisma.bookReview.findMany.mockResolvedValue([]);

    const result = await service.startBook("user-1", "book-1");

    expect(prisma.userProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_chapterId: { userId: "user-1", chapterId: "ch-1" },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.userProgress).toBeDefined();
  });
});

// ─── BooksService — admin CMS ────────────────────────────────────────────────

describe("BooksService admin CRUD", () => {
  let service: BooksService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BooksService(prisma as never);
  });

  it("create rejects on slug conflict", async () => {
    prisma.book.findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      service.create({
        slug: "emociones",
        title: "X",
        plan: "FREE",
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it("update returns 404 when slug missing", async () => {
    prisma.book.findUnique.mockResolvedValue(null);

    await expect(
      service.update("ghost", { title: "Y" } as never),
    ).rejects.toThrow(NotFoundException);
  });
});
