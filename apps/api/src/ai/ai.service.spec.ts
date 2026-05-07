import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AIService } from "./ai.service";
import type { PrismaService } from "../prisma";
import type { EmbeddingService } from "./embedding/embedding.service";
import type { VectorStoreService } from "./vector-store/vector-store.service";
import type { ConfigService } from "@nestjs/config";

// ─── Anthropic SDK mock ───────────────────────────────────────────────────────

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeVec = () => Array.from({ length: 1024 }, () => 0.1);

const makeClaudeResponse = (text = "Respuesta del companion.") => ({
  content: [{ type: "text", text }],
  usage: { input_tokens: 100, output_tokens: 50 },
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockConversation = {
  id: "conv-1",
  userId: "user-1",
  title: "Primera pregunta",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  conversation: {
    create: vi.fn().mockResolvedValue(mockConversation),
    findFirst: vi.fn().mockResolvedValue(mockConversation),
    findMany: vi.fn().mockResolvedValue([mockConversation]),
  },
  conversationMessage: {
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    findMany: vi.fn().mockResolvedValue([]),
  },
} as unknown as PrismaService;

const mockEmbeddingService = {
  embed: vi.fn().mockResolvedValue(makeVec()),
} as unknown as EmbeddingService;

const mockVectorStore = {
  searchSimilar: vi.fn().mockResolvedValue([]),
} as unknown as VectorStoreService;

const mockConfigService = {
  get: vi.fn().mockImplementation((key: string) => {
    if (key === "ANTHROPIC_API_KEY") return "sk-test";
    if (key === "AI_MAX_CONTEXT_CHUNKS") return 5;
    return undefined;
  }),
} as unknown as ConfigService;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AIService", () => {
  let service: AIService;

  beforeEach(() => {
    service = new AIService(
      mockPrisma,
      mockEmbeddingService,
      mockVectorStore,
      mockConfigService,
    );
    vi.clearAllMocks();
    // Restore defaults after clearAllMocks
    (
      mockPrisma.conversation.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockConversation);
    (
      mockPrisma.conversation.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockConversation);
    (
      mockPrisma.conversation.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([mockConversation]);
    (
      mockPrisma.conversationMessage.createMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 2 });
    (
      mockPrisma.conversationMessage.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (mockEmbeddingService.embed as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeVec(),
    );
    (
      mockVectorStore.searchSimilar as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeClaudeResponse());
  });

  describe("chat — new conversation", () => {
    it("creates a conversation and returns reply + conversationId", async () => {
      const result = await service.chat("user-1", "¿Qué son las emociones?");

      expect(result.reply).toBe("Respuesta del companion.");
      expect(result.conversationId).toBe("conv-1");
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(mockPrisma.conversation.create).toHaveBeenCalledOnce();
    });

    it("embeds the user message and searches for similar chunks", async () => {
      await service.chat("user-1", "¿Cómo manejar la ansiedad?");

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        "¿Cómo manejar la ansiedad?",
      );
      expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(makeVec(), 5);
    });

    it("includes retrieved chunks as context in the Claude message", async () => {
      (
        mockVectorStore.searchSimilar as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([
        {
          id: "c1",
          bookId: "b1",
          chapterId: null,
          content: "texto del libro",
          metadata: {},
          similarity: 0.9,
        },
      ]);

      await service.chat("user-1", "pregunta");

      const call = mockCreate.mock.calls[0]![0];
      const userMsg = call.messages[call.messages.length - 1];
      expect(userMsg.content).toContain("CONTEXTO DE LOS LIBROS");
      expect(userMsg.content).toContain("texto del libro");
    });

    it("saves user and assistant messages to DB", async () => {
      await service.chat("user-1", "hola");

      expect(mockPrisma.conversationMessage.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ role: "USER", content: "hola" }),
          expect.objectContaining({ role: "ASSISTANT" }),
        ]),
      });
    });

    it("applies cache_control to the system prompt", async () => {
      await service.chat("user-1", "mensaje");

      const call = mockCreate.mock.calls[0]![0];
      expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    });
  });

  describe("chat — existing conversation", () => {
    it("reuses an existing conversation when conversationId is provided", async () => {
      await service.chat("user-1", "seguimiento", "conv-1");

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: "conv-1", userId: "user-1" },
      });
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for a conversation that belongs to another user", async () => {
      (
        mockPrisma.conversation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      await expect(service.chat("user-2", "mensaje", "conv-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getConversations", () => {
    it("returns conversations for the user", async () => {
      const result = await service.getConversations("user-1");
      expect(result).toHaveLength(1);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
    });
  });

  describe("getMessages", () => {
    it("throws NotFoundException when conversation not found", async () => {
      (
        mockPrisma.conversation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      await expect(
        service.getMessages("user-1", "conv-missing"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
