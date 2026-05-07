import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { EmbeddingService } from "./embedding.service";
import type { Env } from "../../config";

// vi.hoisted ensures mockEmbed exists when vi.mock factory runs (hoisted before imports)
const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({ embed: mockEmbed })),
}));

const makeVector = (n = EmbeddingService.DIMENSIONS) =>
  Array.from({ length: n }, (_, i) => i / n);

describe("EmbeddingService", () => {
  let service: EmbeddingService;

  beforeEach(() => {
    const mockConfigService = {
      get: vi.fn().mockReturnValue("voyage-test-key"),
    } as unknown as ConfigService<Env, true>;
    service = new EmbeddingService(mockConfigService);
    vi.clearAllMocks();
  });

  it("embed returns a 1024-dim vector", async () => {
    const vec = makeVector();
    mockEmbed.mockResolvedValueOnce({ data: [{ embedding: vec }] });

    const result = await service.embed("texto de prueba");

    expect(result).toHaveLength(EmbeddingService.DIMENSIONS);
    expect(mockEmbed).toHaveBeenCalledWith({
      input: ["texto de prueba"],
      model: "voyage-3",
    });
  });

  it("embedBatch returns one vector per input", async () => {
    const vecs = [makeVector(), makeVector()];
    mockEmbed.mockResolvedValueOnce({
      data: vecs.map((embedding) => ({ embedding })),
    });

    const result = await service.embedBatch(["a", "b"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(EmbeddingService.DIMENSIONS);
  });

  it("embedBatch returns [] for empty input without calling the API", async () => {
    const result = await service.embedBatch([]);
    expect(result).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("embed propagates API errors", async () => {
    mockEmbed.mockRejectedValueOnce(new Error("Voyage API error"));
    await expect(service.embed("texto")).rejects.toThrow("Voyage API error");
  });
});
