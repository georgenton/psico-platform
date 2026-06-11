import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorAiService } from "./author-ai.service";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

function makeConfig(apiKey: string | undefined) {
  return {
    get: vi.fn((key: string) =>
      key === "ANTHROPIC_API_KEY" ? apiKey : undefined,
    ),
  };
}

describe("AuthorAiService", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("falls back to rule-based when ANTHROPIC_API_KEY missing", async () => {
    const svc = new AuthorAiService(makeConfig(undefined) as never);
    const res = await svc.generateSuggestion(
      "simplificar",
      "Texto largo de prueba sobre psicología cognitiva.",
      undefined,
    );
    expect(res.source).toBe("fallback");
    expect(res.suggestion.length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 EMPTY_TEXT when text is whitespace", async () => {
    const svc = new AuthorAiService(makeConfig(undefined) as never);
    await expect(
      svc.generateSuggestion("revisar", "   ", undefined),
    ).rejects.toThrow(/EMPTY_TEXT/);
  });

  it("returns model output when LLM succeeds", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "Texto revisado por la IA." }],
      usage: { input_tokens: 50, output_tokens: 20 },
    });
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    const res = await svc.generateSuggestion(
      "revisar",
      "Texto original del autor",
      undefined,
    );
    expect(res.source).toBe("model");
    expect(res.suggestion).toBe("Texto revisado por la IA.");
    expect(res.outputTokens).toBe(20);
  });

  it("strips common 'Aquí:' prefixes from LLM output", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "Aquí: Texto limpio" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    const res = await svc.generateSuggestion(
      "tono",
      "Original",
      undefined,
    );
    expect(res.suggestion).toBe("Texto limpio");
  });

  it("falls back when LLM returns empty content", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "  " }],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    const res = await svc.generateSuggestion(
      "ejemplo",
      "Texto sobre límites sanos",
      undefined,
    );
    expect(res.source).toBe("fallback");
    expect(res.suggestion).toContain("Por ejemplo");
  });

  it("falls back when LLM throws a non-5xx error", async () => {
    createMock.mockRejectedValue(new Error("400 bad_request"));
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    const res = await svc.generateSuggestion(
      "tono",
      "Texto",
      undefined,
    );
    expect(res.source).toBe("fallback");
  });

  it("503 when LLM returns 5xx", async () => {
    createMock.mockRejectedValue(new Error("503 service unavailable"));
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    await expect(
      svc.generateSuggestion("revisar", "Texto", undefined),
    ).rejects.toThrow(/AI_PROVIDER_UNAVAILABLE/);
  });

  it("includes context in the user prompt", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    await svc.generateSuggestion(
      "revisar",
      "fragmento",
      "Este libro trata sobre apego seguro",
    );
    const callArgs = createMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("apego seguro");
    expect(userMsg).toContain("fragmento");
  });

  it("uses Sonnet 4.6 with max_tokens cap", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const svc = new AuthorAiService(makeConfig("sk-test") as never);
    await svc.generateSuggestion("simplificar", "x", undefined);
    const args = createMock.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.max_tokens).toBe(600);
  });
});
