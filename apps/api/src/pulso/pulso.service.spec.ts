import { beforeEach, describe, expect, it, vi } from "vitest";
import { PulsoService } from "./pulso.service";

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ecoMessageReport: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
    diaryEntry: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ecoMessage: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    voiceTranscription: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { durationSec: 0 } }),
    },
    readingSession: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as ConstructorParameters<typeof PulsoService>[0];
}

/**
 * Sprint S48 — the service now uses Redis to cache the overview response.
 * We mock the client with no-op get/set so each test starts from a clean
 * "no cache hit" state and writes are fire-and-forget.
 */
function buildRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  } as unknown as ConstructorParameters<typeof PulsoService>[1];
}

describe("PulsoService.getEcoReportSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a zero-filled summary when there are no reports", async () => {
    const svc = new PulsoService(buildPrisma(), buildRedis());
    const summary = await svc.getEcoReportSummary();

    expect(summary.total).toBe(0);
    expect(summary.byReason).toEqual({
      HALLUCINATION: 0,
      OFF_TONE: 0,
      SENSITIVE_CONTENT: 0,
      CRISIS_MISHANDLED: 0,
      OTHER: 0,
    });
  });

  it("aggregates groupBy results into total + per-reason counts", async () => {
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn().mockResolvedValue([
          { reason: "HALLUCINATION", _count: { _all: 3 } },
          { reason: "OFF_TONE", _count: { _all: 5 } },
          { reason: "OTHER", _count: { _all: 1 } },
        ]),
        findMany: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    const summary = await svc.getEcoReportSummary();

    expect(summary.total).toBe(9);
    expect(summary.byReason.HALLUCINATION).toBe(3);
    expect(summary.byReason.OFF_TONE).toBe(5);
    expect(summary.byReason.OTHER).toBe(1);
    expect(summary.byReason.CRISIS_MISHANDLED).toBe(0);
  });
});

describe("PulsoService.listEcoReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows shape with assistant text snippet, no ciphertext fields", async () => {
    const fixture = [
      {
        id: "r1",
        reason: "HALLUCINATION",
        comment: "made up",
        createdAt: new Date("2026-06-04T10:00:00Z"),
        userId: "u1",
        messageId: "m1",
        message: {
          id: "m1",
          threadId: "t1",
          assistantText: "  Hola, ¿cómo te sientes hoy?   ",
          kind: "ASSISTANT",
          createdAt: new Date("2026-06-04T09:59:00Z"),
        },
      },
    ];
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn().mockResolvedValue(fixture),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.listEcoReports({});

    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe("r1");
    expect(res.items[0]!.assistantTextSnippet).toBe(
      "Hola, ¿cómo te sientes hoy?",
    );
    expect(res.items[0]!.messageKind).toBe("ASSISTANT");
    // Privacy invariant — the row shape must NOT include any ciphertext.
    expect(JSON.stringify(res.items[0])).not.toContain("textCiphertext");
    expect(JSON.stringify(res.items[0])).not.toContain("textNonce");
  });

  it("paginates with nextCursor when there are more rows than limit", async () => {
    // Limit 2; service over-fetches by 1 to peek.
    const fixture = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      reason: "OFF_TONE",
      comment: null,
      createdAt: new Date(`2026-06-04T10:0${i}:00Z`),
      userId: "u1",
      messageId: `m${i}`,
      message: {
        id: `m${i}`,
        threadId: "t1",
        assistantText: "x",
        kind: "ASSISTANT",
        createdAt: new Date(),
      },
    }));
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn().mockResolvedValue(fixture),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.listEcoReports({ limit: 2 });

    expect(res.items).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe("r1"); // last row of page
  });

  it("passes reason filter through to prisma where clause", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: findManySpy,
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    await svc.listEcoReports({ reason: "CRISIS_MISHANDLED" });

    expect(findManySpy).toHaveBeenCalled();
    const call = findManySpy.mock.calls[0]![0] as { where: { reason: string } };
    expect(call.where).toEqual({ reason: "CRISIS_MISHANDLED" });
  });
});

describe("PulsoService.getOverview (Sprint S48)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a fully-zeroed response when no data exists", async () => {
    const svc = new PulsoService(buildPrisma(), buildRedis());
    const res = await svc.getOverview();

    expect(res.users).toEqual({
      total: 0,
      newToday: 0,
      newThisWeek: 0,
      newThisMonth: 0,
    });
    expect(res.engagement).toEqual({ dau: 0, wau: 0, mau: 0 });
    expect(res.content).toEqual({
      diaryEntriesThisWeek: 0,
      ecoMessagesThisWeek: 0,
      ecoCrisisThisWeek: 0,
      voiceMinutesThisWeek: 0,
      readingSessionsThisWeek: 0,
    });
    expect(res.business).toEqual({ paidUsers: 0, reportsBacklog: 0 });
    expect(res.period.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("aggregates counts across user/engagement/content/business blocks", async () => {
    const prisma = buildPrisma({
      user: {
        // Service calls user.count 5 times in order: total, day, week, month,
        // paidUsers. We return distinct values to verify wiring.
        count: vi
          .fn()
          .mockResolvedValueOnce(150) // total
          .mockResolvedValueOnce(2) // newToday
          .mockResolvedValueOnce(8) // newThisWeek
          .mockResolvedValueOnce(20) // newThisMonth
          .mockResolvedValueOnce(35), // paidUsers
      },
      diaryEntry: {
        count: vi.fn().mockResolvedValue(42),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: "u1" },
            { userId: "u2" },
            { userId: "u3" },
          ]),
      },
      ecoMessage: {
        // Order: USER count, CRISIS count.
        count: vi
          .fn()
          .mockResolvedValueOnce(120) // USER (this week)
          .mockResolvedValueOnce(3), // CRISIS (this week)
        findMany: vi
          .fn()
          .mockResolvedValue([
            { thread: { userId: "u2" } },
            { thread: { userId: "u4" } },
          ]),
      },
      voiceTranscription: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "u3" }, { userId: "u5" }]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { durationSec: 720 } }), // 12 min
      },
      readingSession: {
        count: vi.fn().mockResolvedValue(18),
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "u1" }, { userId: "u6" }]),
      },
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(7),
      },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();

    expect(res.users).toEqual({
      total: 150,
      newToday: 2,
      newThisWeek: 8,
      newThisMonth: 20,
    });
    expect(res.content.diaryEntriesThisWeek).toBe(42);
    expect(res.content.ecoMessagesThisWeek).toBe(120);
    expect(res.content.ecoCrisisThisWeek).toBe(3);
    expect(res.content.voiceMinutesThisWeek).toBe(12);
    expect(res.content.readingSessionsThisWeek).toBe(18);
    expect(res.business.paidUsers).toBe(35);
    expect(res.business.reportsBacklog).toBe(7);
    // Engagement = distinct union across {u1,u2,u3,u4,u5,u6}. The service
    // calls each `findMany` 3 times (DAU/WAU/MAU); buildPrisma returns the
    // same fixture for each call, so dedupe set has 6 distinct users.
    expect(res.engagement.dau).toBe(6);
    expect(res.engagement.wau).toBe(6);
    expect(res.engagement.mau).toBe(6);
  });

  it("serves from cache when a previous response is in Redis", async () => {
    const prisma = buildPrisma();
    const cached = {
      generatedAt: new Date("2026-06-04T10:00:00Z").toISOString(),
      period: { from: "2026-05-05", to: "2026-06-04" },
      users: { total: 999, newToday: 1, newThisWeek: 2, newThisMonth: 3 },
      engagement: { dau: 50, wau: 200, mau: 500 },
      content: {
        diaryEntriesThisWeek: 10,
        ecoMessagesThisWeek: 20,
        ecoCrisisThisWeek: 0,
        voiceMinutesThisWeek: 5,
        readingSessionsThisWeek: 8,
      },
      business: { paidUsers: 12, reportsBacklog: 4 },
    };
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cached)),
      setex: vi.fn(),
    } as unknown as ConstructorParameters<typeof PulsoService>[1];
    const svc = new PulsoService(prisma, redis);

    const res = await svc.getOverview();

    expect(res.users.total).toBe(999);
    expect(res.engagement.dau).toBe(50);
    // Cache hit means we did NOT touch prisma.
    expect(
      (prisma as unknown as { user: { count: ReturnType<typeof vi.fn> } }).user
        .count,
    ).not.toHaveBeenCalled();
  });

  it("response contains NO per-user identifiers (privacy invariant)", async () => {
    const prisma = buildPrisma({
      user: {
        count: vi
          .fn()
          .mockResolvedValueOnce(100)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(25),
      },
      diaryEntry: {
        count: vi.fn().mockResolvedValue(10),
        findMany: vi.fn().mockResolvedValue([{ userId: "real-user-id-1" }]),
      },
      ecoMessage: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi
          .fn()
          .mockResolvedValue([{ thread: { userId: "real-user-id-2" } }]),
      },
      voiceTranscription: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([{ userId: "real-user-id-3" }]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { durationSec: 0 } }),
      },
      readingSession: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([{ userId: "real-user-id-4" }]),
      },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();
    const payload = JSON.stringify(res);

    // Privacy contract: response must NOT contain any per-user identifier
    // we used internally for the DAU/WAU/MAU dedupe set.
    expect(payload).not.toContain("real-user-id-1");
    expect(payload).not.toContain("real-user-id-2");
    expect(payload).not.toContain("real-user-id-3");
    expect(payload).not.toContain("real-user-id-4");
    expect(payload).not.toContain("userId");
    expect(payload).not.toContain("email");
  });
});
