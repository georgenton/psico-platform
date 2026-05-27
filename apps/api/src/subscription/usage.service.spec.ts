import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage.service";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const SUB_START = new Date("2026-05-01T00:00:00Z");
const SUB_END = new Date("2026-06-01T00:00:00Z");

function makePrismaMock(opts: {
  hasActiveSub?: boolean;
  plan?: Plan;
  diaryCount?: number;
  progressInPeriod?: Array<{
    chapter: { bookId: string; book: { totalChapters: number } };
  }>;
  allTimeProgress?: Array<{ chapterId: string }>;
  chapterToBook?: Array<{ id: string; bookId: string }>;
}) {
  return {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(
        opts.hasActiveSub
          ? {
              currentPeriodStart: SUB_START,
              currentPeriodEnd: SUB_END,
              status: SubscriptionStatus.ACTIVE,
            }
          : null,
      ),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ plan: opts.plan ?? Plan.FREE }),
    },
    diaryEntry: {
      count: vi.fn().mockResolvedValue(opts.diaryCount ?? 0),
    },
    userProgress: {
      findMany: vi.fn().mockResolvedValue(opts.progressInPeriod ?? []),
      groupBy: vi.fn().mockResolvedValue(opts.allTimeProgress ?? []),
    },
    chapter: {
      findMany: vi.fn().mockResolvedValue(opts.chapterToBook ?? []),
    },
  };
}

function makeRedisMock() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(0),
    scanStream: vi.fn().mockReturnValue({
      // Async iterator returning no keys by default.
      [Symbol.asyncIterator]: async function* () {
        // Nothing to yield.
      },
    }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("UsageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("period resolution", () => {
    it("usa el periodo de la suscripción ACTIVE", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.period.source).toBe("subscription");
      expect(result.period.start).toEqual(SUB_START);
      expect(result.period.end).toEqual(SUB_END);
    });

    it("cae al mes calendario cuando no hay suscripción activa", async () => {
      const prisma = makePrismaMock({ hasActiveSub: false, plan: Plan.FREE });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.period.source).toBe("calendar-month");
      // El start es 1ro de mes UTC, el end es 1ro del mes siguiente.
      expect(result.period.start.getUTCDate()).toBe(1);
      expect(result.period.end.getUTCDate()).toBe(1);
    });
  });

  describe("quotas", () => {
    it("FREE: eco=20, voice=0, diary=null", async () => {
      const prisma = makePrismaMock({ plan: Plan.FREE });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBe(20);
      expect(result.voice.quota).toBe(0);
      expect(result.diary.quota).toBeNull();
    });

    it("PRO: eco=200, voice=120, diary=null", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBe(200);
      expect(result.voice.quota).toBe(120);
      expect(result.diary.quota).toBeNull();
    });

    it("B2B: todos los quotas null (unlimited)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.B2B });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBeNull();
      expect(result.voice.quota).toBeNull();
      expect(result.diary.quota).toBeNull();
    });
  });

  describe("counters", () => {
    it("diary entries vienen del count de DiaryEntry en el periodo", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        diaryCount: 9,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.diary.entriesThisPeriod).toBe(9);
    });

    it("eco/voice quedan en 0 hasta que aterricen S10/S8", async () => {
      const prisma = makePrismaMock({ plan: Plan.PRO, hasActiveSub: true });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.messagesThisPeriod).toBe(0);
      expect(result.voice.minutesThisPeriod).toBe(0);
    });

    it("booksCompleted suma 1 cuando el usuario terminó todos los capítulos en el periodo", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        progressInPeriod: [
          { chapter: { bookId: "book-1", book: { totalChapters: 2 } } },
        ],
        allTimeProgress: [{ chapterId: "ch-1" }, { chapterId: "ch-2" }],
        chapterToBook: [
          { id: "ch-1", bookId: "book-1" },
          { id: "ch-2", bookId: "book-1" },
        ],
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(1);
    });

    it("booksCompleted=0 si solo terminó parcialmente", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        progressInPeriod: [
          { chapter: { bookId: "book-1", book: { totalChapters: 3 } } },
        ],
        allTimeProgress: [{ chapterId: "ch-1" }, { chapterId: "ch-2" }],
        chapterToBook: [
          { id: "ch-1", bookId: "book-1" },
          { id: "ch-2", bookId: "book-1" },
        ],
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(0);
    });
  });

  describe("cache", () => {
    it("cache hit: devuelve el payload de Redis sin tocar Prisma", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      // Pre-pueblo el cache con un payload conocido.
      redis.get.mockResolvedValue(
        JSON.stringify({
          plan: "PRO",
          period: {
            start: SUB_START.toISOString(),
            end: SUB_END.toISOString(),
            source: "subscription",
          },
          books: { completedThisPeriod: 42 },
          eco: { messagesThisPeriod: 0, quota: 200 },
          voice: { minutesThisPeriod: 0, quota: 120 },
          diary: { entriesThisPeriod: 100, quota: null },
        }),
      );
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(42);
      expect(result.diary.entriesThisPeriod).toBe(100);
      // Las fechas vienen hidratadas como Date.
      expect(result.period.start).toBeInstanceOf(Date);
      // Y NO hubo aggregation desde Prisma (diaryEntry.count nunca corrió).
      expect(prisma.diaryEntry.count).not.toHaveBeenCalled();
    });

    it("cache hit con payload corrupto: cae a recomputar (no lanza)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      redis.get.mockResolvedValue("{not-json");
      const service = new UsageService(prisma as never, redis as never);

      // Si no lanza y nos devuelve un objeto válido, el fallback funciona.
      const result = await service.getUsage(USER_ID);
      expect(result.plan).toBe("PRO");
      expect(prisma.diaryEntry.count).toHaveBeenCalled();
    });

    it("escribe en cache después de recomputar (fire-and-forget)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      await service.getUsage(USER_ID);

      // Esperamos al microtask queue para que el fire-and-forget corra.
      await new Promise((resolve) => setImmediate(resolve));

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^usage:user-abc:/),
        expect.any(String),
        "EX",
        5 * 60,
      );
    });
  });
});
