import { beforeEach, describe, expect, it, vi } from "vitest";
import { PulsoService } from "./pulso.service";

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ecoMessageReport: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
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
    // Sprint S50 — PlatformMetricDaily rows feed the sparklines + deltas.
    // Default empty so the existing tests see zero-filled series.
    platformMetricDaily: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Sprint S51 — CohortRetentionWeek powers the cohort heatmap.
    cohortRetentionWeek: {
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
    // Sprint S49 — the service deletes the overview cache key after
    // resolve/unresolve so the backlog count refreshes.
    del: vi.fn().mockResolvedValue(1),
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
    const call = findManySpy.mock.calls[0]![0] as { where: unknown };
    // Sprint S49 — default status="open" adds resolvedAt: null next to the
    // reason filter. We assert the shape with both clauses so future
    // regressions on either are caught.
    expect(call.where).toMatchObject({
      reason: "CRISIS_MISHANDLED",
      resolvedAt: null,
    });
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

  it("backlog counts only OPEN reports (resolvedAt IS NULL) — closes S48 deuda", async () => {
    const ecoMessageReportCountSpy = vi.fn().mockResolvedValue(5);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: ecoMessageReportCountSpy,
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();

    expect(ecoMessageReportCountSpy).toHaveBeenCalledWith({
      where: { resolvedAt: null },
    });
    expect(res.business.reportsBacklog).toBe(5);
  });
});

// ─── Sprint S49 — resolution flow tests ──────────────────────────────────

describe("PulsoService.markResolved", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a report resolved, stamps the admin + note, and busts the overview cache", async () => {
    const updateSpy = vi.fn().mockResolvedValue({
      id: "r1",
      reason: "OFF_TONE",
      comment: "weird tone",
      createdAt: new Date("2026-06-05T10:00:00Z"),
      userId: "u1",
      messageId: "m1",
      resolvedAt: new Date("2026-06-06T08:00:00Z"),
      resolvedBy: "admin-1",
      resolutionNote: "false positive",
      message: {
        id: "m1",
        threadId: "t1",
        assistantText: "Hola",
        kind: "ASSISTANT",
      },
    });
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: "r1" }),
        update: updateSpy,
        count: vi.fn(),
      } as never,
    });
    const redis = buildRedis();
    const svc = new PulsoService(prisma, redis);

    const res = await svc.markResolved("r1", "admin-1", "false positive");

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({
          resolvedBy: "admin-1",
          resolutionNote: "false positive",
          resolvedAt: expect.any(Date),
        }),
      }),
    );
    expect(res.resolvedBy).toBe("admin-1");
    expect(res.resolutionNote).toBe("false positive");
    expect(res.resolvedAt).not.toBeNull();
    // Cache bust so the overview backlog refreshes.
    expect(
      (redis as unknown as { del: ReturnType<typeof vi.fn> }).del,
    ).toHaveBeenCalledWith("pulso:overview");
  });

  it("throws NotFoundException when the report id doesn't exist", async () => {
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        count: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    await expect(
      svc.markResolved("nonexistent", "admin-1", null),
    ).rejects.toThrow(/REPORT_NOT_FOUND/);
  });
});

describe("PulsoService.markUnresolved", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears resolvedAt/By/Note and busts the overview cache", async () => {
    const updateSpy = vi.fn().mockResolvedValue({
      id: "r1",
      reason: "OFF_TONE",
      comment: null,
      createdAt: new Date(),
      userId: "u1",
      messageId: "m1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      message: {
        id: "m1",
        threadId: "t1",
        assistantText: "x",
        kind: "ASSISTANT",
      },
    });
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: "r1" }),
        update: updateSpy,
        count: vi.fn(),
      } as never,
    });
    const redis = buildRedis();
    const svc = new PulsoService(prisma, redis);

    const res = await svc.markUnresolved("r1");

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: {
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
        },
      }),
    );
    expect(res.resolvedAt).toBeNull();
    expect(res.resolvedBy).toBeNull();
    expect(res.resolutionNote).toBeNull();
    expect(
      (redis as unknown as { del: ReturnType<typeof vi.fn> }).del,
    ).toHaveBeenCalledWith("pulso:overview");
  });
});

describe("PulsoService.listEcoReports — status filter (S49)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to status=open → where: { resolvedAt: null }", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: findManySpy,
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    await svc.listEcoReports({});

    const where = (findManySpy.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toMatchObject({ resolvedAt: null });
  });

  it("status=resolved → where: { resolvedAt: { not: null } }", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: findManySpy,
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    await svc.listEcoReports({ status: "resolved" });

    const where = (findManySpy.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toMatchObject({ resolvedAt: { not: null } });
  });

  it("status=all → no resolvedAt filter (combines cleanly with reason)", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: findManySpy,
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma, buildRedis());
    await svc.listEcoReports({ status: "all", reason: "HALLUCINATION" });

    const where = (findManySpy.mock.calls[0]![0] as Record<string, unknown>)
      .where as Record<string, unknown>;
    expect(where.reason).toBe("HALLUCINATION");
    expect(where).not.toHaveProperty("resolvedAt");
  });
});

// ─── Sprint S50 — sparklines + deltas ────────────────────────────────────

describe("PulsoService.getOverview series + deltas (Sprint S50)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero-filled 30-day series + null deltas when no history exists", async () => {
    const svc = new PulsoService(buildPrisma(), buildRedis());
    const res = await svc.getOverview();

    expect(res.series.windowDays).toBe(30);
    expect(res.series.dau).toHaveLength(30);
    expect(res.series.dau.every((v) => v === 0)).toBe(true);
    expect(res.series.paidUsers).toHaveLength(30);
    expect(res.series.diaryEntries).toHaveLength(30);
    expect(res.series.ecoMessages).toHaveLength(30);
    expect(res.series.ecoCrisis).toHaveLength(30);
    expect(res.series.reportsOpened).toHaveLength(30);
    expect(res.series.reportsResolved).toHaveLength(30);

    // 14 days of zero history → percentDelta returns null for all metrics.
    expect(res.deltas.dau).toBeNull();
    expect(res.deltas.diaryEntries).toBeNull();
    expect(res.deltas.ecoMessages).toBeNull();
    expect(res.deltas.reportsOpened).toBeNull();
    expect(res.deltas.reportsResolved).toBeNull();
  });

  it("zero-fills sparse days and maps PlatformMetricDaily rows by date key", async () => {
    // Build a 30-day window ending yesterday with only 2 days populated.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);

    const prisma = buildPrisma({
      platformMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          {
            day: twoDaysAgo,
            dau: 5,
            paidUsers: 10,
            diaryEntries: 12,
            ecoMessages: 8,
            ecoCrisis: 0,
            reportsOpened: 1,
            reportsResolved: 0,
          },
          {
            day: yesterday,
            dau: 9,
            paidUsers: 11,
            diaryEntries: 14,
            ecoMessages: 11,
            ecoCrisis: 1,
            reportsOpened: 2,
            reportsResolved: 1,
          },
        ]),
      },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();

    expect(res.series.dau).toHaveLength(30);
    // Last value is yesterday; second-to-last is two days ago.
    expect(res.series.dau[29]).toBe(9);
    expect(res.series.dau[28]).toBe(5);
    // Earlier days are zero-filled.
    expect(res.series.dau.slice(0, 28).every((v) => v === 0)).toBe(true);
  });

  it("computes percent-delta as last-7 vs prev-7 with 1-decimal rounding", async () => {
    // Build a fixture where the last 7 days sum to 70 and the prev 7 days
    // sum to 50 → delta = +40.0%. We pad the 16 oldest days with zeros
    // because percentDelta only looks at the last 14.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date(today.getTime() - (30 - i) * dayMs);
      let dau = 0;
      if (i >= 16 && i < 23) dau = 50 / 7; // prev 7 sum = 50
      if (i >= 23 && i < 30) dau = 10; // last 7 sum = 70
      rows.push({
        day,
        dau: Math.round(dau),
        paidUsers: 0,
        diaryEntries: 0,
        ecoMessages: 0,
        ecoCrisis: 0,
        reportsOpened: 0,
        reportsResolved: 0,
      });
    }
    const prisma = buildPrisma({
      platformMetricDaily: { findMany: vi.fn().mockResolvedValue(rows) },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();

    // dau prev-7 sum = 7×7 = 49 (rounding), last-7 = 70 → ≈ +42.9%.
    // Verify positive and 1-decimal precision.
    expect(res.deltas.dau).not.toBeNull();
    expect(res.deltas.dau!).toBeGreaterThan(0);
    expect(Math.round(res.deltas.dau! * 10)).toBe(res.deltas.dau! * 10);
  });

  it("returns 999 when prev-7 is zero but last-7 has activity (clamped +inf)", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date(today.getTime() - (30 - i) * dayMs);
      // All-zero prev 7; last 7 has 1 per day = sum 7.
      const dau = i >= 23 ? 1 : 0;
      rows.push({
        day,
        dau,
        paidUsers: 0,
        diaryEntries: 0,
        ecoMessages: 0,
        ecoCrisis: 0,
        reportsOpened: 0,
        reportsResolved: 0,
      });
    }
    const prisma = buildPrisma({
      platformMetricDaily: { findMany: vi.fn().mockResolvedValue(rows) },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getOverview();

    expect(res.deltas.dau).toBe(999);
  });
});

// ─── Sprint S51 — cohort retention ───────────────────────────────────────

describe("PulsoService.getCohortRetention (Sprint S51)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty rows + maxWeekOffset=0 when the table is empty", async () => {
    const svc = new PulsoService(buildPrisma(), buildRedis());
    const res = await svc.getCohortRetention();
    expect(res.rows).toEqual([]);
    expect(res.maxWeekOffset).toBe(0);
  });

  it("groups rows by cohortWeek and precomputes pct for each cell", async () => {
    const wk1 = new Date("2026-05-25T00:00:00.000Z"); // Monday
    const wk2 = new Date("2026-06-01T00:00:00.000Z");
    const prisma = buildPrisma({
      cohortRetentionWeek: {
        findMany: vi.fn().mockResolvedValue([
          // Newest-first by cohortWeek desc, then weekOffset asc.
          { cohortWeek: wk2, weekOffset: 0, cohortSize: 10, activeUsers: 10 },
          // wk1 has 8 members; offsets 0 and 1.
          { cohortWeek: wk1, weekOffset: 0, cohortSize: 8, activeUsers: 8 },
          { cohortWeek: wk1, weekOffset: 1, cohortSize: 8, activeUsers: 3 },
        ]),
      },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getCohortRetention();

    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]!.cohortWeek).toBe("2026-06-01");
    expect(res.rows[0]!.cohortSize).toBe(10);
    expect(res.rows[0]!.cells).toEqual([
      { weekOffset: 0, activeUsers: 10, pct: 100 },
    ]);
    expect(res.rows[1]!.cohortWeek).toBe("2026-05-25");
    expect(res.rows[1]!.cells).toEqual([
      { weekOffset: 0, activeUsers: 8, pct: 100 },
      { weekOffset: 1, activeUsers: 3, pct: 37.5 },
    ]);
    expect(res.maxWeekOffset).toBe(1);
  });

  it("guards divide-by-zero when cohortSize is 0 (returns pct=0)", async () => {
    const prisma = buildPrisma({
      cohortRetentionWeek: {
        findMany: vi.fn().mockResolvedValue([
          {
            cohortWeek: new Date("2026-06-01T00:00:00.000Z"),
            weekOffset: 0,
            cohortSize: 0,
            activeUsers: 0,
          },
        ]),
      },
    });
    const svc = new PulsoService(prisma, buildRedis());
    const res = await svc.getCohortRetention();
    expect(res.rows[0]!.cells[0]!.pct).toBe(0);
  });

  it("serves from cache when the Redis key exists", async () => {
    const cached = {
      generatedAt: new Date("2026-06-08T10:00:00Z").toISOString(),
      rows: [{ cohortWeek: "2026-06-01", cohortSize: 7, cells: [] }],
      maxWeekOffset: 0,
    };
    const prisma = buildPrisma();
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cached)),
      setex: vi.fn(),
      del: vi.fn(),
    } as unknown as ConstructorParameters<typeof PulsoService>[1];
    const svc = new PulsoService(prisma, redis);

    const res = await svc.getCohortRetention();

    expect(res.rows[0]!.cohortSize).toBe(7);
    // Cache hit means prisma untouched.
    expect(
      (
        prisma as unknown as {
          cohortRetentionWeek: { findMany: ReturnType<typeof vi.fn> };
        }
      ).cohortRetentionWeek.findMany,
    ).not.toHaveBeenCalled();
  });
});
