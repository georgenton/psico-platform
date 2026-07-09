import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmotionalMapService } from "./emotional-map.service";
import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "./providers/provider.interface";

function makeProvider(
  score: (payload: EmotionalMapMetadataPayload) => Promise<{
    calma: number;
    claridad: number;
    compasion: number;
    consciencia: number;
  }>,
): IEmotionalMapProvider {
  return { name: "test", score };
}

function makePrisma(overrides: {
  diaryEntries?: Array<{ mood: string; tags: string[]; createdAt: Date }>;
  readingSessions?: Array<{
    progressPct: number;
    completedAt: Date | null;
    timeSpentSec: number;
  }>;
  ecoMessages?: Array<{ createdAt: Date }>;
  voiceCount?: number;
  highlightCount?: number;
  annotationCount?: number;
  user?: { currentStreakDays: number } | null;
}) {
  return {
    diaryEntry: {
      findMany: vi.fn().mockResolvedValue(overrides.diaryEntries ?? []),
    },
    readingSession: {
      findMany: vi.fn().mockResolvedValue(overrides.readingSessions ?? []),
    },
    ecoMessage: {
      findMany: vi.fn().mockResolvedValue(overrides.ecoMessages ?? []),
    },
    voiceTranscription: {
      count: vi.fn().mockResolvedValue(overrides.voiceCount ?? 0),
    },
    highlight: {
      count: vi.fn().mockResolvedValue(overrides.highlightCount ?? 0),
    },
    annotation: {
      count: vi.fn().mockResolvedValue(overrides.annotationCount ?? 0),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides.user ?? null),
    },
  } as unknown as Parameters<typeof EmotionalMapService.prototype.compute>[0] &
    Record<string, unknown>;
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string, _: string, __: number) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    __store: store,
  } as unknown as {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    __store: Map<string, string>;
  };
}

describe("EmotionalMapService — hybrid rework (confidence per axis)", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    redis = makeRedis();
  });

  it("returns a fully empty map (values=0, pct=0, coverage=0) with no signal", async () => {
    prisma = makePrisma({});
    const scoreSpy = vi.fn();
    const provider = makeProvider(async () => {
      scoreSpy();
      return { calma: 0.5, claridad: 0.5, compasion: 0.5, consciencia: 0.5 };
    });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    expect(result.values).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.confidence).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.pct).toBe(0);
    expect(result.coverage).toBe(0);
    expect(result.dimensions).toHaveLength(6);
    expect(result.provider).toBe("rule-based");
    // Zero signal → never burn an LLM call.
    expect(scoreSpy).not.toHaveBeenCalled();
  });

  it("shows 'reuniendo datos' (value 0) for interpretive axes with a single bare entry", async () => {
    prisma = makePrisma({
      diaryEntries: [{ mood: "ok", tags: [], createdAt: new Date() }],
    });
    const scoreSpy = vi.fn();
    const provider = makeProvider(async () => {
      scoreSpy();
      return { calma: 0.9, claridad: 0.9, compasion: 0.9, consciencia: 0.9 };
    });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    // 1 entry → every axis stays below the confidence floor → no fabricated
    // number, and no LLM call.
    expect(scoreSpy).not.toHaveBeenCalled();
    expect(result.values[0]).toBe(0); // calma
    expect(result.dimensions[0].confidence).toBeLessThan(0.15);
  });

  it("lights up conexión + consciencia from Eco even with a single diary entry", async () => {
    // The exact user scenario: 1 reflection + a few Eco chats used to produce
    // a fake ~50% radar. Now Eco signal drives real axes instead.
    prisma = makePrisma({
      diaryEntries: [
        { mood: "good", tags: ["trabajo"], createdAt: new Date() },
      ],
      ecoMessages: Array.from({ length: 4 }, (_, i) => ({
        createdAt: new Date(2026, 5, 2 + i),
      })),
    });
    const provider = makeProvider(async () => ({
      calma: 0.8,
      claridad: 0.7,
      compasion: 0.6,
      consciencia: 0.65,
    }));
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    // Conexión (index 2) has 0 reading + 4 eco → conf = 4/8 = 0.5 ≥ floor.
    expect(result.dimensions[2].confidence).toBeGreaterThanOrEqual(0.15);
    expect(result.values[2]).toBeGreaterThan(0);
    // Consciencia (index 5): diaryDays(1) + ecoDays(4) = 5/10 = 0.5 ≥ floor.
    expect(result.dimensions[5].confidence).toBeGreaterThanOrEqual(0.15);
    expect(result.provider).toBe("test");
  });

  it("uses the LLM output for the 4 interpretive axes with rich data", async () => {
    prisma = makePrisma({
      diaryEntries: Array.from({ length: 6 }, (_, i) => ({
        mood: ["great", "good", "ok", "low", "hard", "good"][i] ?? "ok",
        tags: ["trabajo", "familia"],
        createdAt: new Date(2026, 5, 1 + i),
      })),
      voiceCount: 2,
    });
    const provider = makeProvider(async () => ({
      calma: 0.8,
      claridad: 0.7,
      compasion: 0.6,
      consciencia: 0.55,
    }));
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    expect(result.values[0]).toBe(0.8); // calma
    expect(result.values[1]).toBe(0.7); // claridad
    expect(result.values[4]).toBe(0.6); // compasion
    expect(result.values[5]).toBe(0.55); // consciencia
    expect(result.provider).toBe("test");
  });

  it("collapses interpretive axes to 'reuniendo datos' when the provider throws", async () => {
    prisma = makePrisma({
      diaryEntries: Array.from({ length: 6 }, (_, i) => ({
        mood: "ok",
        tags: ["trabajo"],
        createdAt: new Date(2026, 5, i + 1),
      })),
    });
    const provider = makeProvider(async () => {
      throw new Error("LLM down");
    });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    // No fabricated numbers when the model is unavailable.
    expect(result.values[0]).toBe(0); // calma
    expect(result.values[1]).toBe(0); // claridad
    expect(result.values[4]).toBe(0); // compasion
    expect(result.values[5]).toBe(0); // consciencia
    expect(result.confidence[0]).toBe(0);
    expect(result.provider).toBe("rule-based");
  });

  it("computes Propósito mechanically from reading progress", async () => {
    prisma = makePrisma({
      readingSessions: [
        { progressPct: 60, completedAt: null, timeSpentSec: 0 },
        { progressPct: 40, completedAt: null, timeSpentSec: 0 },
      ],
    });
    const provider = makeProvider(async () => ({
      calma: 0.5,
      claridad: 0.5,
      compasion: 0.5,
      consciencia: 0.5,
    }));
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    // Propósito is axis index 3. avgProgress 0.5 * 0.7 + 0 completions = 0.35.
    expect(result.values[3]).toBeCloseTo(0.35);
    expect(result.dimensions[3].confidence).toBeGreaterThanOrEqual(0.15);
  });

  it("pct averages only the covered axes (low-data maps don't inflate)", async () => {
    // Only reading signal → conexión + propósito covered; interpretive axes
    // stay at 0/uncovered. pct must reflect ONLY the two covered axes.
    prisma = makePrisma({
      readingSessions: [
        { progressPct: 100, completedAt: new Date(), timeSpentSec: 3600 },
        { progressPct: 100, completedAt: new Date(), timeSpentSec: 3600 },
        { progressPct: 80, completedAt: null, timeSpentSec: 1800 },
      ],
    });
    const provider = makeProvider(async () => ({
      calma: 0.5,
      claridad: 0.5,
      compasion: 0.5,
      consciencia: 0.5,
    }));
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");

    const covered = result.dimensions.filter((d) => d.confidence >= 0.15);
    expect(covered.map((d) => d.key).sort()).toEqual(["conexion", "proposito"]);
    const expectedPct = Math.round(
      (covered.reduce((a, d) => a + d.value, 0) / covered.length) * 100,
    );
    expect(result.pct).toBe(expectedPct);
  });

  it("caches the computed result for 24h and reuses it on subsequent calls", async () => {
    prisma = makePrisma({});
    const provider = makeProvider(async () => ({
      calma: 0.7,
      claridad: 0.7,
      compasion: 0.7,
      consciencia: 0.7,
    }));
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );

    await service.getForUser("user-1");
    expect(redis.set).toHaveBeenCalledTimes(1);

    await service.getForUser("user-1");
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });
});
