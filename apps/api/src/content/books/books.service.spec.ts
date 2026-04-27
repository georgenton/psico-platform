import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { BooksService } from "./books.service";
import { ChaptersService } from "../chapters/chapters.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockFreeBook = {
  id: "book-1",
  slug: "emociones-en-construccion",
  title: "Emociones en Construcción",
  description: "Una guía práctica.",
  coverUrl: null,
  totalChapters: 2,
  isPublished: true,
  plan: "FREE",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProBook = {
  id: "book-2",
  slug: "familias-ensambladas",
  title: "Familias Ensambladas",
  description: "Herramientas psicoeducativas.",
  coverUrl: null,
  totalChapters: 3,
  isPublished: true,
  plan: "PRO",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockChapter = {
  id: "ch-1",
  bookId: "book-1",
  order: 1,
  title: "Introducción",
  description: null,
  durationMinutes: 8,
  isPublished: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  book: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  chapter: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

// StorageService is not used by BooksService or ChaptersService.findOne
const mockStorage = {};

// ─── BooksService ─────────────────────────────────────────────────────────────

describe("BooksService", () => {
  let service: BooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BooksService(mockPrisma as never);
  });

  describe("findAllPublished", () => {
    it("lista libros publicados correctamente", async () => {
      mockPrisma.book.findMany.mockResolvedValue([mockFreeBook]);

      const result = await service.findAllPublished();

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isPublished: true } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("emociones-en-construccion");
    });

    it("no retorna libros no publicados", async () => {
      // DB applies the where clause; the service must pass it correctly
      mockPrisma.book.findMany.mockResolvedValue([]);

      const result = await service.findAllPublished();

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isPublished: true } }),
      );
      expect(result).toHaveLength(0);
    });

    it("filtra libros FREE visibles para usuario FREE (listing no filtra por plan)", async () => {
      // The public listing returns all published books regardless of their plan.
      // Plan gating only applies at the chapter level.
      mockPrisma.book.findMany.mockResolvedValue([mockFreeBook, mockProBook]);

      const result = await service.findAllPublished();

      expect(result).toHaveLength(2);
      const plans = result.map((b) => b.plan);
      expect(plans).toContain("FREE");
      expect(plans).toContain("PRO");
    });
  });

  describe("findBySlug", () => {
    it("retorna 404 si el libro no existe por slug", async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug("slug-inexistente")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("findBySlug incluye capítulos ordenados por order asc", async () => {
      const chap2 = { ...mockChapter, id: "ch-2", order: 2 };
      const bookWithChapters = {
        ...mockFreeBook,
        // Mock returns chapters already sorted, as Prisma would
        chapters: [mockChapter, chap2],
      };
      mockPrisma.book.findUnique.mockResolvedValue(bookWithChapters);

      const result = await service.findBySlug("emociones-en-construccion");

      // Verify the query requests chapters ordered by order asc
      expect(mockPrisma.book.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            chapters: expect.objectContaining({
              orderBy: { order: "asc" },
            }),
          }),
        }),
      );
      // Verify the response shape
      expect(result.chapters[0].order).toBe(1);
      expect(result.chapters[1].order).toBe(2);
    });
  });
});

// ─── ChaptersService — acceso por plan ────────────────────────────────────────
//
// The plan check lives in ChaptersService.findOne(), not in BooksService.
// These tests are co-located here because they are the plan-access counterpart
// to the listing tests above and complete the user's 7-test requirements.

describe("ChaptersService — acceso por plan", () => {
  let service: ChaptersService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    service = new ChaptersService(mockPrisma as never, mockStorage as never);
  });

  it("retorna 403 si usuario FREE intenta acceder a capítulo de libro PRO", async () => {
    mockPrisma.chapter.findFirst.mockResolvedValue({
      ...mockChapter,
      bookId: "book-2",
      book: { plan: "PRO", slug: "familias-ensambladas" },
      audios: [],
      exercises: [],
    });

    await expect(
      service.findOne("familias-ensambladas", 1, "FREE"),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.findOne("familias-ensambladas", 1, "FREE"),
    ).rejects.toThrow("Este contenido requiere plan PRO. Actualiza tu plan.");
  });

  it("retorna el capítulo correctamente si usuario PRO accede a libro PRO", async () => {
    const chapterWithBook = {
      ...mockChapter,
      bookId: "book-2",
      book: { plan: "PRO", slug: "familias-ensambladas" },
      audios: [],
      exercises: [],
    };
    mockPrisma.chapter.findFirst.mockResolvedValue(chapterWithBook);

    const result = await service.findOne("familias-ensambladas", 1, "PRO");

    expect(result.id).toBe("ch-1");
    expect(result.order).toBe(1);
    // book property is stripped before returning
    expect(result).not.toHaveProperty("book");
  });
});
