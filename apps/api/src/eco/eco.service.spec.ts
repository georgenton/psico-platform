import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { Plan, EcoMessageKind } from "@prisma/client";
import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EcoService } from "./eco.service";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  EcoMessageKind: {
    USER: "USER",
    ASSISTANT: "ASSISTANT",
    CRISIS: "CRISIS",
    SUGGESTION: "SUGGESTION",
  },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

// Anthropic SDK gets fully mocked — we exercise the streaming path with
// a fake `messages.stream` that takes a controllable token feed.
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(),
      };
    },
  };
});

// ─── Test helpers ──────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const THREAD_ID = "thread-1";

function makePrisma(
  opts: {
    plan?: Plan;
    threadOwned?: boolean;
    userMessagesInPeriod?: number;
    hasActiveSub?: boolean;
  } = {},
) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ plan: opts.plan ?? Plan.PRO }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(
        opts.hasActiveSub
          ? {
              currentPeriodStart: new Date("2026-05-01"),
              currentPeriodEnd: new Date("2026-06-01"),
              status: "ACTIVE",
            }
          : null,
      ),
    },
    ecoThread: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.threadOwned === false
            ? null
            : { id: THREAD_ID, userId: USER_ID },
        ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockResolvedValue({ id: THREAD_ID, createdAt: new Date() }),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    ecoMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(opts.userMessagesInPeriod ?? 0),
    },
    ecoMessageReport: {
      create: vi.fn().mockResolvedValue({ id: "rep-1" }),
    },
  };
}

function makeUsage() {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

function makeEmbedding() {
  return { embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
}

function makeVector() {
  return { searchSimilar: vi.fn().mockResolvedValue([]) };
}

function makeConfig() {
  return {
    get: vi.fn((key: string) => {
      if (key === "ANTHROPIC_API_KEY") return "sk-ant-stub";
      if (key === "AI_MAX_CONTEXT_CHUNKS") return 5;
      return "";
    }),
  };
}

// `makeAnthropicMock` is a helper kept here for future tests that exercise
// the LLM streaming path (currently mocked in §"sendMessage — happy path"
// which isn't in this file because it requires extra Prisma plumbing).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeAnthropicMock(chunks: string[]) {
  let listener: ((chunk: string) => void) | null = null;
  const stream = {
    on: vi.fn((event: string, cb: (chunk: string) => void) => {
      if (event === "text") listener = cb;
      return stream;
    }),
    controller: { abort: vi.fn() },
    finalMessage: vi.fn(),
  };
  void Promise.resolve().then(() => {
    for (const c of chunks) listener?.(c);
  });
  stream.finalMessage.mockResolvedValue({
    usage: { input_tokens: 50, output_tokens: 20 },
  });
  return stream;
}

function makeService(
  overrides: {
    prisma?: ReturnType<typeof makePrisma>;
    usage?: ReturnType<typeof makeUsage>;
    embedding?: ReturnType<typeof makeEmbedding>;
    vector?: ReturnType<typeof makeVector>;
  } = {},
) {
  const prisma = overrides.prisma ?? makePrisma();
  const usage = overrides.usage ?? makeUsage();
  const embedding = overrides.embedding ?? makeEmbedding();
  const vector = overrides.vector ?? makeVector();
  const service = new EcoService(
    prisma as never,
    usage as never,
    embedding as never,
    vector as never,
    makeConfig() as never,
  );
  return { service, prisma, usage, embedding, vector };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("EcoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCaps", () => {
    it("returns the Eco persona (name + voice + caps)", () => {
      const { service } = makeService();
      const persona = service.getCaps();
      expect(persona.name).toBe("Eco");
      expect(persona.caps.length).toBeGreaterThan(0);
    });
  });

  describe("listThreads", () => {
    it("maps threads to rail items", async () => {
      const prisma = makePrisma();
      prisma.ecoThread.findMany.mockResolvedValue([
        {
          id: "t1",
          titleCiphertext: "abc",
          titleNonce: "n1",
          lastMessageAt: new Date(),
          _count: { messages: 5 },
        },
      ]);
      const { service } = makeService({ prisma });
      const res = await service.listThreads(USER_ID);
      expect(res.rail).toHaveLength(1);
      expect(res.rail[0]?.messageCount).toBe(5);
    });
  });

  describe("createThread", () => {
    it("creates a thread and returns id + createdAt", async () => {
      const { service, prisma } = makeService();
      const res = await service.createThread(USER_ID);
      expect(res.id).toBe(THREAD_ID);
      expect(prisma.ecoThread.create).toHaveBeenCalledWith({
        data: { userId: USER_ID },
        select: { id: true, createdAt: true },
      });
    });
  });

  describe("getThread", () => {
    it("404s when thread doesn't belong to user", async () => {
      const prisma = makePrisma({ threadOwned: false });
      const { service } = makeService({ prisma });
      await expect(
        service.getThread(USER_ID, "nope", undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns messages with hasMore=false when under page size", async () => {
      const prisma = makePrisma();
      prisma.ecoThread.findFirst.mockResolvedValue({
        id: THREAD_ID,
        titleCiphertext: null,
        titleNonce: null,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      });
      prisma.ecoMessage.findMany.mockResolvedValue([
        {
          id: "m1",
          kind: EcoMessageKind.ASSISTANT,
          textCiphertext: null,
          textNonce: null,
          assistantText: "hola",
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
      const { service } = makeService({ prisma });
      const res = await service.getThread(USER_ID, THREAD_ID, undefined);
      expect(res.hasMore).toBe(false);
      expect(res.messages).toHaveLength(1);
      expect(res.messages[0]?.kind).toBe("assistant");
    });
  });

  describe("sendMessage — quota gate", () => {
    it("rejects FREE users who already used 10 messages today", async () => {
      const prisma = makePrisma({
        plan: Plan.FREE,
        userMessagesInPeriod: 10,
      });
      const { service } = makeService({ prisma });
      const events = await firstValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "hola",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.data.event).toBe("error");
      // Service didn't reach the LLM — no message persisted.
      expect(prisma.ecoMessage.create).not.toHaveBeenCalled();
    });
  });

  describe("sendMessage — crisis detection (layer 1)", () => {
    it("intercepts a crisis plaintext BEFORE calling the LLM", async () => {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        userMessagesInPeriod: 0,
      });
      const embedding = makeEmbedding();
      const { service } = makeService({ prisma, embedding });

      const events = await lastValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "estoy pensando en suicidarme",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );

      // Expected sequence: crisis → done.
      const eventNames = events.map((e) => e.data.event);
      expect(eventNames).toEqual(["crisis", "done"]);
      // LLM was NOT consulted (embedding service is the canary).
      expect(embedding.embed).not.toHaveBeenCalled();
      // CRISIS message persisted in the thread for replay.
      const calls = prisma.ecoMessage.create.mock.calls;
      const kinds = calls.map(
        (c) => (c[0] as { data: { kind: string } }).data.kind,
      );
      expect(kinds).toContain("USER");
      expect(kinds).toContain("CRISIS");
    });
  });

  describe("reportMessage", () => {
    it("404s when message doesn't belong to user's thread", async () => {
      const prisma = makePrisma();
      prisma.ecoMessage.findMany.mockResolvedValue([]);
      // Override the findFirst-on-message lookup:
      (prisma.ecoMessage as { findFirst?: unknown }).findFirst = vi
        .fn()
        .mockResolvedValue(null);
      const { service } = makeService({ prisma });
      await expect(
        service.reportMessage(USER_ID, "msg-1", "HALLUCINATION", undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a report row", async () => {
      const prisma = makePrisma();
      (prisma.ecoMessage as { findFirst?: unknown }).findFirst = vi
        .fn()
        .mockResolvedValue({ id: "msg-1" });
      const { service } = makeService({ prisma });
      const res = await service.reportMessage(
        USER_ID,
        "msg-1",
        "OFF_TONE",
        "no era empático",
      );
      expect(res.ok).toBe(true);
      expect(prisma.ecoMessageReport.create).toHaveBeenCalledWith({
        data: {
          messageId: "msg-1",
          userId: USER_ID,
          reason: "OFF_TONE",
          comment: "no era empático",
        },
      });
    });
  });

  describe("deleteThread", () => {
    it("404s when not owned", async () => {
      const prisma = makePrisma({ threadOwned: false });
      const { service } = makeService({ prisma });
      await expect(service.deleteThread(USER_ID, "x")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes when owned", async () => {
      const { service, prisma } = makeService();
      await service.deleteThread(USER_ID, THREAD_ID);
      expect(prisma.ecoThread.delete).toHaveBeenCalledWith({
        where: { id: THREAD_ID },
      });
    });
  });

  // Smoke test that the service can be constructed without booting Anthropic.
  describe("construction", () => {
    it("instantiates without making network calls", () => {
      const { service } = makeService();
      expect(service).toBeInstanceOf(EcoService);
    });
  });

  // Suppress unused-variable warning for HttpException import in case the
  // future refactor surfaces it as a typed assertion. The error path test
  // above exercises the underlying ECO_QUOTA_EXCEEDED throw.
  it.skip("HttpException sentinel reference", () => {
    expect(HttpException).toBeDefined();
    expect(HttpStatus.PAYMENT_REQUIRED).toBe(402);
  });
});
