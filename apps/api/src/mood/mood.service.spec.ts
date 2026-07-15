import { describe, expect, it, vi, beforeEach } from "vitest";
import { CHECKIN_ITEMS } from "@psico/types";
import { MoodService } from "./mood.service";

/**
 * MoodService · micro-checkins (Etapa 2). Covers the rotation contract:
 * cooldown (one question per ~20h), never-answered-first ordering, and the
 * logCheckin write + map-cache invalidation.
 */

function makeService(overrides: {
  findFirst?: unknown;
  groupBy?: Array<{ itemKey: string; _max: { createdAt: Date | null } }>;
}) {
  const prisma = {
    checkinResponse: {
      findFirst: vi.fn().mockResolvedValue(overrides.findFirst ?? null),
      groupBy: vi.fn().mockResolvedValue(overrides.groupBy ?? []),
      create: vi.fn().mockResolvedValue({
        id: "chk_1",
        itemKey: "claridad_nombrar",
        score: 3,
        createdAt: new Date("2026-07-09T12:00:00Z"),
      }),
    },
    onboardingMood: { findUnique: vi.fn().mockResolvedValue(null) },
    moodLog: { create: vi.fn() },
    user: { update: vi.fn() },
  };
  const emotionalMap = {
    // PR-0.1 — additive writes use the BEST-EFFORT invalidation: a stale map
    // here is a freshness bug, not a leak. The consent path uses the REQUIRED
    // one, which fails closed (see UsersService).
    invalidateBestEffort: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
  const service = new MoodService(prisma as never, emotionalMap as never);
  return { service, prisma, emotionalMap };
}

describe("MoodService · checkins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when a checkin was already answered in the cooldown window", async () => {
    const { service } = makeService({ findFirst: { id: "recent" } });
    const res = await service.nextCheckin("u1");
    expect(res.item).toBeNull();
  });

  it("asks a never-answered item first (catalog order tiebreak)", async () => {
    const { service } = makeService({
      groupBy: [
        {
          itemKey: "claridad_nombrar",
          _max: { createdAt: new Date("2026-07-01") },
        },
      ],
    });
    const res = await service.nextCheckin("u1");
    // First catalog item that has never been answered.
    expect(res.item?.key).toBe("claridad_causa");
    expect(res.item?.text).toBeTruthy();
  });

  it("rotates to the least-recently-answered item when all have history", async () => {
    const { service } = makeService({
      groupBy: CHECKIN_ITEMS.map((item, i) => ({
        itemKey: item.key,
        // compasion_amable (index 2) is the stalest answer.
        _max: {
          createdAt: new Date(`2026-07-0${i === 2 ? 1 : 5}T12:00:00Z`),
        },
      })),
    });
    const res = await service.nextCheckin("u1");
    expect(res.item?.key).toBe("compasion_amable");
  });

  it("logCheckin persists the answer and busts the emotional-map cache", async () => {
    const { service, prisma, emotionalMap } = makeService({});
    const res = await service.logCheckin("u1", "claridad_nombrar", 3);
    expect(prisma.checkinResponse.create).toHaveBeenCalledWith({
      data: { userId: "u1", itemKey: "claridad_nombrar", score: 3 },
      select: { id: true, itemKey: true, score: true, createdAt: true },
    });
    expect(res).toMatchObject({ ok: true, itemKey: "claridad_nombrar" });
    expect(emotionalMap.invalidateBestEffort).toHaveBeenCalledWith("u1");
  });
});

describe("MoodService · log (PR-2A normalization)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes MOOD_LOG normalization for a canonical check-in — explicit + eligible", async () => {
    const { service, prisma } = makeService({});
    prisma.moodLog.create.mockResolvedValue({
      id: "m1",
      mood: "good",
      createdAt: new Date("2026-07-15T12:00:00Z"),
    });
    prisma.user.update.mockResolvedValue({});

    await service.log("u1", "good");

    expect(prisma.moodLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          mood: "good", // raw preserved
          moodNormalized: "good",
          moodProvenance: "MOOD_LOG",
          moodExplicitlySelected: true,
          moodEligibleForDynamics: true,
          moodExclusionReason: null,
          moodVocabularyVersion: "diary-v1",
          moodNormalizerVersion: "norm-1",
        }),
      }),
    );
  });

  it("rejects an empty check-in and creates NO MoodLog row (rule #6)", async () => {
    const { service, prisma } = makeService({});
    await expect(service.log("u1", "")).rejects.toThrow(/MOOD_REQUIRED/);
    expect(prisma.moodLog.create).not.toHaveBeenCalled();
  });

  it.each(["calma", "energia", "zzz", "  "])(
    "rejects a non-canonical / non-eligible token '%s' — no MoodLog, no User.mood",
    async (token) => {
      const { service, prisma } = makeService({});
      await expect(service.log("u1", token)).rejects.toThrow(
        /MOOD_INVALID|MOOD_REQUIRED/,
      );
      expect(prisma.moodLog.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );

  it("the client cannot force eligibility — provenance/eligible are server-derived", async () => {
    // The service signature only accepts (userId, mood). There is no channel for
    // the client to pass provenance/eligible; the values come from the endpoint.
    const { service, prisma } = makeService({});
    prisma.moodLog.create.mockResolvedValue({
      id: "m2",
      mood: "great",
      createdAt: new Date(),
    });
    prisma.user.update.mockResolvedValue({});
    await service.log("u1", "great");
    const arg = prisma.moodLog.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.moodProvenance).toBe("MOOD_LOG");
    expect(arg.data.moodEligibleForDynamics).toBe(true);
  });
});
