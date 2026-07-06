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
  diaryEntries?: Array<{
    mood: string;
    tags: string[];
    createdAt: Date;
  }>;
  readingSessions?: Array<{
    progressPct: number;
    completedAt: Date | null;
    timeSpentSec: number;
  }>;
  user?: { currentStreakDays: number } | null;
}) {
  return {
    diaryEntry: {
      findMany: vi.fn().mockResolvedValue(overrides.diaryEntries ?? []),
    },
    readingSession: {
      findMany: vi.fn().mockResolvedValue(overrides.readingSessions ?? []),
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

describe("EmotionalMapService — Sprint D", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    redis = makeRedis();
  });

  it("returns an empty-state radar (values=0, pct=0) when the user has no reading nor entries", async () => {
    prisma = makePrisma({});
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
    expect(result.values).toEqual([0, 0, 0, 0, 0, 0]);
    // Zero data → no symmetric 50% hex; UI renders "empieza a leer o escribir".
    expect(result.pct).toBe(0);
    expect(result.provider).toBe("fallback");
  });

  it("short-circuits the LLM when entries < 3", async () => {
    prisma = makePrisma({
      diaryEntries: [
        { mood: "good", tags: ["familia"], createdAt: new Date() },
        { mood: "low", tags: ["trabajo"], createdAt: new Date() },
      ],
    });
    const scoreSpy = vi.fn();
    const provider = makeProvider(async (p) => {
      scoreSpy(p);
      return { calma: 0.9, claridad: 0.9, compasion: 0.9, consciencia: 0.9 };
    });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const result = await service.compute("user-1");
    expect(scoreSpy).not.toHaveBeenCalled();
    expect(result.provider).toBe("fallback");
  });

  it("calls the LLM when entries ≥ 3 and uses its output for the 4 interpretive axes", async () => {
    prisma = makePrisma({
      diaryEntries: Array.from({ length: 5 }, (_, i) => ({
        mood: ["great", "good", "ok", "low", "hard"][i] ?? "ok",
        tags: ["trabajo"],
        createdAt: new Date(2026, 5, 1 + i),
      })),
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

  it("falls back to neutral on the 4 LLM axes when the provider throws", async () => {
    prisma = makePrisma({
      diaryEntries: Array.from({ length: 5 }, (_, i) => ({
        mood: "ok",
        tags: [],
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
    expect(result.values[0]).toBe(0.5);
    expect(result.values[1]).toBe(0.5);
    expect(result.values[4]).toBe(0.5);
    expect(result.values[5]).toBe(0.5);
    expect(result.provider).toBe("fallback");
  });

  it("computes Propósito as average reading progress (mechanical)", async () => {
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
    // Propósito is axis index 3 (Calma · Claridad · Conexión · Propósito · …).
    expect(result.values[3]).toBeCloseTo(0.5);
  });

  it("caches the computed result for 24h and reuses on subsequent calls", async () => {
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

    // Second call: served from cache, no new set.
    await service.getForUser("user-1");
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });
});
