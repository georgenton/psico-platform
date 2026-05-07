import { describe, it, expect, vi, beforeEach } from "vitest";
import { VectorStoreService } from "./vector-store.service";
import type { PrismaService } from "../../prisma";

const makeVec = (n = 1024) => Array.from({ length: n }, () => Math.random());

const mockPrisma = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  contentChunk: { count: vi.fn() },
} as unknown as PrismaService;

describe("VectorStoreService", () => {
  let service: VectorStoreService;

  beforeEach(() => {
    service = new VectorStoreService(mockPrisma);
    vi.clearAllMocks();
  });

  describe("hashContent", () => {
    it("returns the same hash for the same content", () => {
      const h1 = VectorStoreService.hashContent("hola");
      const h2 = VectorStoreService.hashContent("hola");
      expect(h1).toBe(h2);
    });

    it("returns different hashes for different content", () => {
      expect(VectorStoreService.hashContent("a")).not.toBe(
        VectorStoreService.hashContent("b"),
      );
    });
  });

  describe("upsertChunks", () => {
    it("returns 0 and skips DB for empty input", async () => {
      const count = await service.upsertChunks([]);
      expect(count).toBe(0);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("calls $executeRaw once per chunk and returns count", async () => {
      (mockPrisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const chunks = [
        {
          bookId: "book-1",
          content: "contenido uno",
          metadata: { order: 0 },
          embedding: makeVec(),
        },
        {
          bookId: "book-1",
          content: "contenido dos",
          metadata: { order: 1 },
          embedding: makeVec(),
        },
      ];

      const result = await service.upsertChunks(chunks);

      expect(result).toBe(2);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe("searchSimilar", () => {
    const mockRow = {
      id: "chunk-1",
      bookId: "book-1",
      chapterId: "ch-1",
      content: "texto relevante",
      metadata: { order: 0 },
      similarity: 0.91,
    };

    it("returns mapped SimilarChunk array", async () => {
      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        mockRow,
      ]);

      const results = await service.searchSimilar(makeVec(), 5);

      expect(results).toHaveLength(1);
      expect(results[0]!.similarity).toBe(0.91);
      expect(results[0]!.content).toBe("texto relevante");
    });

    it("passes bookId filter when provided", async () => {
      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        [],
      );

      await service.searchSimilar(makeVec(), 3, "book-1");

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("countChunks", () => {
    it("delegates to prisma.contentChunk.count", async () => {
      (
        mockPrisma.contentChunk.count as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(42);

      const result = await service.countChunks("book-1");

      expect(result).toBe(42);
    });
  });
});
