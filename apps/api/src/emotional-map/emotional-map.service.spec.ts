import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmotionalMapService } from "./emotional-map.service";
import {
  bumpGeneration,
  generationKey,
  resolveCacheKey,
} from "./cache-identity";
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
  moodLogs?: Array<{ mood: string; createdAt: Date }>;
  user?: { currentStreakDays: number } | null;
  /** Fase D (L4) — text-analysis consent. Defaults to true so pre-Fase-D
   *  fixtures (which seed text features) keep exercising the text path. */
  localTextAnalysis?: boolean;
  textFeatureRows?: Array<Record<string, number | Date>>;
}) {
  return {
    // Used for both the 30-day Phase-A fetch and the 180-day OU fetch; the
    // mock returns the same rows for both, which is fine for these tests.
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
    moodLog: {
      findMany: vi.fn().mockResolvedValue(overrides.moodLogs ?? []),
    },
    checkinResponse: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    diaryTextFeature: {
      findMany: vi.fn().mockResolvedValue(overrides.textFeatureRows ?? []),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "tf-1" }),
      create: vi.fn().mockResolvedValue({ id: "tf-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    privacySettings: {
      findUnique: vi.fn().mockResolvedValue({
        localTextAnalysis: overrides.localTextAnalysis ?? true,
      }),
    },
    // Fase E — confirmed resonances (ARC). Default none.
    resonance: {
      findMany: vi.fn().mockResolvedValue([]),
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
    // PR-0.1 — invalidation is an INCR of the per-user generation, not a DEL.
    incr: vi.fn((key: string) => {
      const next = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    }),
    __store: store,
  } as unknown as {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    __store: Map<string, string>;
  };
}

/**
 * Fase G — the flag defaults flipped to the V2 contract. The legacy scoring
 * path survives ONLY as the env rollback lever (EMOTIONAL_MAP_V2=off), so the
 * legacy-behavior suites below pin that env explicitly: they characterize the
 * rollback path, not the defaults. Default-mode behavior is covered by the
 * "Fase F/G dual-run" describe at the bottom and by the v2-contract spec.
 */
function pinLegacyMode() {
  let prevV2: string | undefined;
  beforeEach(() => {
    prevV2 = process.env.EMOTIONAL_MAP_V2;
    process.env.EMOTIONAL_MAP_V2 = "off";
  });
  afterEach(() => {
    if (prevV2 === undefined) delete process.env.EMOTIONAL_MAP_V2;
    else process.env.EMOTIONAL_MAP_V2 = prevV2;
  });
}

describe("EmotionalMapService — hybrid rework (confidence per axis)", () => {
  pinLegacyMode();
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
    // PR-0.1 — two GETs per call now: the per-user generation, then the payload
    // under the key that generation produces.
    expect(redis.get).toHaveBeenCalledTimes(4);
  });

  // ── Tier 2 — Ornstein–Uhlenbeck wiring (live in production) ───────────────

  it("drives Calma from measured mood volatility once there's enough history", async () => {
    // 40 daily mood logs → OU fits and converges; Calma comes from σ.
    const moodLogs = Array.from({ length: 40 }, (_, i) => ({
      mood: ["great", "good", "ok", "low", "hard"][i % 5] ?? "ok",
      createdAt: new Date(2026, 0, 1 + i),
    }));
    prisma = makePrisma({ moodLogs });
    const provider = makeProvider(async () => ({
      calma: 0.9, // the LLM would say 0.9; OU should override this
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

    // Calma (index 0) is now sourced from the affect-dynamics model.
    expect(result.dimensions[0].key).toBe("calma");
    expect(result.dimensions[0].sources).toContain("Volatilidad medida");
    expect(result.dimensions[0].confidence).toBeGreaterThanOrEqual(0.15);
    // It is NOT the LLM's 0.9 impression.
    expect(result.values[0]).not.toBe(0.9);
    // The affect-dynamics block is active with the estimated parameters.
    expect(result.affectDynamics?.status).toBe("active");
    expect(result.affectDynamics?.nObs).toBe(40);
    expect(result.affectDynamics?.baseline).not.toBeNull();
    // Fase B' (L1): recovery/inertia are gated until ~100 observations —
    // theta is unidentifiable below that (paper-1-results E1), so 40 obs
    // yields baseline/stability but NO public recovery claim.
    expect(result.affectDynamics?.recoveryNeeded).toBe(100);
    expect(result.affectDynamics?.recovery).toBeNull();
    expect(result.affectDynamics?.inertiaDays).toBeNull();
  });

  it("surfaces a 'gathering' affect-dynamics block below the observation floor", async () => {
    prisma = makePrisma({
      moodLogs: [
        { mood: "ok", createdAt: new Date(2026, 0, 1) },
        { mood: "good", createdAt: new Date(2026, 0, 3) },
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
    expect(result.affectDynamics?.status).toBe("gathering");
    expect(result.affectDynamics?.nObs).toBe(2);
    expect(result.affectDynamics?.baseline).toBeNull();
  });

  it("falls back to the Tier 1 Calma when EMOTIONAL_MAP_OU=off", async () => {
    const prev = process.env.EMOTIONAL_MAP_OU;
    process.env.EMOTIONAL_MAP_OU = "off";
    try {
      const moodLogs = Array.from({ length: 40 }, (_, i) => ({
        mood: ["great", "good", "ok", "low", "hard"][i % 5] ?? "ok",
        createdAt: new Date(2026, 0, 1 + i),
      }));
      prisma = makePrisma({
        diaryEntries: moodLogs.map((m) => ({ ...m, tags: [] })),
        moodLogs,
      });
      const provider = makeProvider(async () => ({
        calma: 0.9,
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

      // Kill-switch on → Calma is the LLM's value, sourced from Tier 1 copy,
      // and the affect-dynamics block is absent entirely.
      expect(result.dimensions[0].sources).not.toContain("Volatilidad medida");
      expect(result.values[0]).toBe(0.9);
      expect(result.affectDynamics ?? null).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.EMOTIONAL_MAP_OU;
      else process.env.EMOTIONAL_MAP_OU = prev;
    }
  });
});

describe("EmotionalMapService.logTextFeatures — Etapa 6 (numbers only)", () => {
  const FEATURES = {
    wordCount: 60,
    selfFocus: 0.05,
    positive: 0.03,
    negative: 0.02,
    insight: 0.03,
    causal: 0.02,
    absolutist: 0.01,
    social: 0.02,
    selfKind: 0.02,
    selfCritic: 0,
  };
  const provider = makeProvider(async () => ({
    calma: 0.5,
    claridad: 0.5,
    compasion: 0.5,
    consciencia: 0.5,
  }));

  it("upserts by entryId and busts the map cache", async () => {
    const prisma = makePrisma({});
    const redis = makeRedis();
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      redis as never,
    );
    const res = await service.logTextFeatures("user-1", {
      ...FEATURES,
      entryId: "entry-abc",
    });
    expect(res).toEqual({ ok: true, id: "tf-1" });
    const upsert = (prisma as Record<string, any>).diaryTextFeature.upsert;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entryId: "entry-abc" },
        create: expect.objectContaining({ userId: "user-1", wordCount: 60 }),
      }),
    );
    // PR-0.1 — invalidation bumps the per-user generation rather than deleting
    // one key: deleting the key for the CURRENT config would leave entries
    // written under other configs readable if we flipped back to them.
    expect(redis.incr).toHaveBeenCalledWith(generationKey("user-1"));
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("rejects an entryId owned by another user (403)", async () => {
    const prisma = makePrisma({});
    (prisma as Record<string, any>).diaryTextFeature.findUnique = vi
      .fn()
      .mockResolvedValue({ userId: "other-user" });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    await expect(
      service.logTextFeatures("user-1", { ...FEATURES, entryId: "entry-x" }),
    ).rejects.toThrow("TEXT_FEATURE_NOT_YOURS");
  });

  it("creates a standalone row when no entryId is given", async () => {
    const prisma = makePrisma({});
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    await service.logTextFeatures("user-1", FEATURES);
    expect(
      (prisma as Record<string, any>).diaryTextFeature.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });

  it("Fase D (L4): rejects uploads without explicit consent (403)", async () => {
    const prisma = makePrisma({ localTextAnalysis: false });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    await expect(service.logTextFeatures("user-1", FEATURES)).rejects.toThrow(
      "TEXT_ANALYSIS_NOT_ENABLED",
    );
    expect(
      (prisma as Record<string, any>).diaryTextFeature.create,
    ).not.toHaveBeenCalled();
  });

  it("Fase D (L4): a missing PrivacySettings row means NO consent (403)", async () => {
    const prisma = makePrisma({});
    (prisma as Record<string, any>).privacySettings.findUnique = vi
      .fn()
      .mockResolvedValue(null);
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    await expect(service.logTextFeatures("user-1", FEATURES)).rejects.toThrow(
      "TEXT_ANALYSIS_NOT_ENABLED",
    );
  });
});

describe("EmotionalMapService — Fase D consent gates the text signal", () => {
  // Evidence-lite + text-scoring fixtures exercise the LEGACY path (H1/TXT
  // feeding axes) — pinned to the rollback env since Fase G.
  pinLegacyMode();
  const provider = makeProvider(async () => ({
    calma: 0.5,
    claridad: 0.5,
    compasion: 0.5,
    consciencia: 0.5,
  }));

  it("compute() never reads DiaryTextFeature rows without consent", async () => {
    const prisma = makePrisma({ localTextAnalysis: false });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    await service.compute("user-1");
    expect(
      (prisma as Record<string, any>).diaryTextFeature.findMany,
    ).not.toHaveBeenCalled();
  });

  it("Fase D — evidence lite: covered axes declare modelId + n; gathering axes carry null", async () => {
    // 4 hard-mood entries → calma/compasion/consciencia covered via LLM (H1).
    const day = (n: number) => new Date(Date.UTC(2026, 5, 1 + n));
    const prisma = makePrisma({
      diaryEntries: [0, 1, 2, 3].map((n) => ({
        mood: "hard",
        tags: [],
        createdAt: day(n),
      })),
    });
    const service = new EmotionalMapService(
      prisma as never,
      provider,
      makeRedis() as never,
    );
    const result = await service.compute("user-1");
    const compasion = result.dimensions.find((d) => d.key === "compasion")!;
    expect(compasion.evidence).toEqual({ modelId: "H1", n: 4 });
    // Conexion has zero signal → gathering → no evidence to justify.
    const conexion = result.dimensions.find((d) => d.key === "conexion")!;
    expect(conexion.evidence).toBeNull();
  });
});

describe("EmotionalMapService — Fase F dual-run window (LEGACY_UI gates the v2 marker)", () => {
  const provider: IEmotionalMapProvider = makeProvider(async () => ({
    calma: 0.5,
    claridad: 0.5,
    compasion: 0.5,
    consciencia: 0.5,
  }));

  function withFlags(
    env: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ) {
    const prev: Record<string, string | undefined> = {};
    for (const key of Object.keys(env)) {
      prev[key] = process.env[key];
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    return fn().finally(() => {
      for (const key of Object.keys(env)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
  }

  it("Fase G defaults: the V2 contract + marker ship with NO env set", async () => {
    await withFlags(
      { EMOTIONAL_MAP_V2: undefined, EMOTIONAL_MAP_LEGACY_UI: undefined },
      async () => {
        const service = new EmotionalMapService(
          makePrisma({}) as never,
          provider,
          makeRedis() as never,
        );
        const result = await service.compute("user-1");
        expect(result.v2).toBe(true);
        expect(result).toHaveProperty("momento");
        // V2 data contract live: proposito no longer derives from engagement.
        const proposito = result.dimensions.find((d) => d.key === "proposito")!;
        expect(proposito.confidence).toBe(0);
      },
    );
  });

  it("LEGACY_UI=on (explicit dual-run window): the marker is stripped, the V2 data stays", async () => {
    await withFlags(
      { EMOTIONAL_MAP_V2: undefined, EMOTIONAL_MAP_LEGACY_UI: "on" },
      async () => {
        const service = new EmotionalMapService(
          makePrisma({}) as never,
          provider,
          makeRedis() as never,
        );
        const result = await service.compute("user-1");
        expect(result).not.toHaveProperty("v2");
        const proposito = result.dimensions.find((d) => d.key === "proposito")!;
        expect(proposito.confidence).toBe(0);
      },
    );
  });

  it("EMOTIONAL_MAP_V2=off (rollback lever): the legacy scoring path still works", async () => {
    await withFlags(
      { EMOTIONAL_MAP_V2: "off", EMOTIONAL_MAP_LEGACY_UI: undefined },
      async () => {
        const service = new EmotionalMapService(
          makePrisma({
            readingSessions: [
              { progressPct: 60, completedAt: null, timeSpentSec: 900 },
            ],
          }) as never,
          provider,
          makeRedis() as never,
        );
        const result = await service.compute("user-1");
        expect(result).not.toHaveProperty("v2");
        // Legacy scoring: proposito derives from reading progress again.
        const proposito = result.dimensions.find((d) => d.key === "proposito")!;
        expect(proposito.confidence).toBeGreaterThan(0);
      },
    );
  });
});

/**
 * PR-0.1 — a config change must take effect on the NEXT request, not after the
 * 24h TTL.
 *
 * This is the regression test for a real production incident: we set
 * EMOTIONAL_MAP_NARRATOR=off, the deploy went green, and the API kept serving
 * narrated maps — because the cached payload had been computed under the old
 * config and the cache key had not changed. An "off" switch that keeps
 * emitting the thing you switched off is not an off switch, and the same held
 * for the rollback direction.
 */
describe("EmotionalMapService — cache identity (PR-0.1)", () => {
  const KEYS = ["EMOTIONAL_MAP_NARRATOR", "EMOTIONAL_MAP_CACHE_EPOCH"] as const;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of KEYS) saved.set(k, process.env[k]);
  });
  afterEach(() => {
    for (const k of KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("does not serve a payload cached under a different config (no TTL wait)", async () => {
    const prisma = makePrisma({});
    const redis = makeRedis();
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

    // Warm the cache with the Narrator ON.
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    await service.getForUser("user-1");
    const keyWithNarrator = await resolveCacheKey(redis as never, "user-1");
    expect(keyWithNarrator).toBeDefined();
    // Poison it so a cache HIT would be unmistakable.
    redis.__store.set(keyWithNarrator, JSON.stringify({ stale: true }));

    // Flip the Narrator off — nothing else changes, no TTL elapses.
    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    const fresh = (await service.getForUser("user-1")) as unknown as {
      stale?: boolean;
    };

    // The stale payload is unreachable: the key it lives under is no longer
    // the key this configuration derives.
    expect(fresh.stale).toBeUndefined();
    expect(fresh).toHaveProperty("dimensions");
    // The poisoned entry is still there — untouched, and it will expire on its
    // own TTL. We never had to scan or purge to make the flip take effect.
    expect(redis.__store.get(keyWithNarrator)).toBe(
      JSON.stringify({ stale: true }),
    );
    expect(redis.del).not.toHaveBeenCalled();
  });
});

/**
 * PR-0.1 — the DURABLE half of the identity.
 *
 * The P0 this closes: revoking the text-analysis consent used to depend on Redis
 * for its SAFETY. We committed the consent change and deleted the derived rows
 * in Postgres, then bumped a Redis counter to make the cached map unreachable.
 * If that INCR failed, the revocation was already committed while the cached map
 * — built from the very data the user had just revoked — stayed readable: worse,
 * `getForUser` consulted Redis BEFORE it ever re-read the consent, so the stale
 * payload kept being served for up to 24h.
 *
 * Now `PrivacySettings.emotionalMapPrivacyRevision` is bumped in the SAME
 * transaction as the revocation and is part of every cache key, and `getForUser`
 * reads it from Postgres BEFORE consulting Redis. Redis can be on fire; the
 * revoked map is still unreachable.
 */
describe("EmotionalMapService — privacy revision (PR-0.1, durable)", () => {
  it("never serves the pre-revocation payload, even when the Redis INCR failed", async () => {
    const store = new Map<string, string>();
    // A Redis where every INCR fails — i.e. the invalidation we USED to depend on
    // is completely unavailable.
    const redis = {
      get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: vi.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve("OK");
      }),
      incr: vi.fn(() => Promise.reject(new Error("redis down"))),
      del: vi.fn(),
      __store: store,
    };

    // The user consented, so their map was computed WITH the text features and
    // cached under privacy revision 0.
    let privacyRevision = 0;
    const prisma = makePrisma({
      localTextAnalysis: true,
      textFeatureRows: [
        {
          wordCount: 120,
          selfFocus: 0.3,
          positive: 0.4,
          negative: 0.1,
          insight: 0.5,
          causal: 0.4,
          absolutist: 0.05,
          social: 0.2,
          selfKind: 0.4,
          selfCritic: 0.1,
          createdAt: new Date(),
        },
      ],
    }) as unknown as Record<string, { findUnique: ReturnType<typeof vi.fn> }>;
    prisma.privacySettings.findUnique = vi.fn(({ select }: never) =>
      // The service reads the revision through this same model.
      Promise.resolve(
        (select as Record<string, boolean>)?.emotionalMapPrivacyRevision
          ? { emotionalMapPrivacyRevision: privacyRevision }
          : { localTextAnalysis: true },
      ),
    ) as never;

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

    await service.getForUser("user-1");
    const keyBeforeRevocation = [...store.keys()][0];
    expect(keyBeforeRevocation).toBeDefined();
    // Poison the cached payload so a HIT would be unmistakable.
    store.set(keyBeforeRevocation, JSON.stringify({ revoked: "should be gone" }));

    // ── The user revokes consent ────────────────────────────────────────────
    // UsersService bumps the revision inside the transaction; the Redis INCR that
    // follows FAILS (our incr always rejects). Under the old design, that left
    // the poisoned payload perfectly readable.
    privacyRevision = 1;
    await expect(
      bumpGeneration(redis as never, "user-1"),
    ).rejects.toThrow(/redis down/);

    // ── The user loads their map again ──────────────────────────────────────
    const fresh = (await service.getForUser("user-1")) as unknown as {
      revoked?: string;
    };

    // The pre-revocation payload is UNREACHABLE: the durable revision moved the
    // key, and Redis had no say in it.
    expect(fresh.revoked).toBeUndefined();
    expect(fresh).toHaveProperty("dimensions");
    // Postgres was consulted for the revision BEFORE Redis was consulted for the
    // payload — that ordering is the whole guarantee.
    expect(prisma.privacySettings.findUnique).toHaveBeenCalled();
    // The orphan is still on disk, unreachable, and expires on its own TTL.
    expect(store.get(keyBeforeRevocation)).toBe(
      JSON.stringify({ revoked: "should be gone" }),
    );
  });
});
