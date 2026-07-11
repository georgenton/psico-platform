import { describe, expect, it, vi } from "vitest";

import {
  scoreEmotionalMap,
  type EmotionalMapScoringInput,
} from "./emotional-map.scoring";
import type { IEmotionalMapProvider } from "./providers/provider.interface";
import { flagEnabled } from "../shared/flags";

/**
 * Fase B — characterization tests for the V2 data-source contract
 * (docs/product/learning-vs-emotional-map.md).
 *
 * Two kinds of test live here:
 *   1. KNOWN VIOLATION — pins the CURRENT legacy behavior that the V2 contract
 *      forbids. These document reality; when a violation is fixed, the test is
 *      inverted in the same PR (ratchet — violations can be removed, never
 *      silently added).
 *   2. Flag plumbing — proves the Fase B levers work, so flipping a flag in
 *      prod is a config change, not a code deploy.
 */

function mockProvider(
  result = { calma: 0.5, claridad: 0.5, compasion: 0.83, consciencia: 0.5 },
): IEmotionalMapProvider & { score: ReturnType<typeof vi.fn> } {
  return { name: "mock", score: vi.fn(async () => result) };
}

function baseInput(
  over: Partial<EmotionalMapScoringInput> = {},
): EmotionalMapScoringInput {
  return {
    entries: [],
    readingSessions: [],
    ecoMessages: [],
    voiceCount: 0,
    highlightCount: 0,
    annotationCount: 0,
    currentStreakDays: 0,
    moodSeries: [],
    checkins: [],
    textFeatures: [],
    ouEnabled: true,
    ...over,
  };
}

const day = (n: number) => new Date(Date.UTC(2026, 5, 1 + n));

describe("V2 data-source contract — characterization (ratchet)", () => {
  it("KNOWN VIOLATION 5.1: highlights/annotations move the 'conexion' axis", async () => {
    const sessions = [
      { progressPct: 50, completedAt: null, timeSpentSec: 600 },
      { progressPct: 20, completedAt: null, timeSpentSec: 300 },
    ];
    const without = await scoreEmotionalMap(
      baseInput({ readingSessions: sessions }),
      mockProvider(),
    );
    const withHighlights = await scoreEmotionalMap(
      baseInput({ readingSessions: sessions, highlightCount: 8 }),
      mockProvider(),
    );
    const conexion = (r: Awaited<ReturnType<typeof scoreEmotionalMap>>) =>
      r.dimensions.find((d) => d.key === "conexion")!.value;
    // Engagement changes a psychological axis — forbidden by V2. When Fase C
    // moves conexion to the LearningDashboard, invert this to toBe(equal).
    expect(conexion(withHighlights)).toBeGreaterThan(conexion(without));
  });

  it("KNOWN VIOLATION 5.3: the LLM provider creates the 'compasion' score", async () => {
    const provider = mockProvider();
    // 4 hard-mood entries → confCompasion = 1 → llmHasSignal.
    const entries = [0, 1, 2, 3].map((n) => ({
      mood: "hard",
      tags: [],
      createdAt: day(n),
    }));
    const result = await scoreEmotionalMap(baseInput({ entries }), provider);
    expect(provider.score).toHaveBeenCalledTimes(1);
    const compasion = result.dimensions.find((d) => d.key === "compasion")!;
    // The axis value IS the LLM output — forbidden by V2 (facts vs narrator).
    expect(compasion.value).toBe(0.83);
    expect(compasion.measured).toBe(false);
  });

  it("KNOWN VIOLATION 5.2: a global pct is exposed", async () => {
    const result = await scoreEmotionalMap(baseInput(), mockProvider());
    expect(result).toHaveProperty("pct");
  });

  it("Fase C — flag EMOTIONAL_MAP_V2=on: engagement no longer moves any axis", async () => {
    // The inversion promised by learning-vs-emotional-map.md: with the V2
    // lever on, +minutos/+highlights/+mensajes leave the map UNCHANGED.
    const sessions = [
      { progressPct: 50, completedAt: null, timeSpentSec: 600 },
      { progressPct: 20, completedAt: null, timeSpentSec: 300 },
    ];
    const bare = await scoreEmotionalMap(
      baseInput({ emotionalMapV2: true }),
      mockProvider(),
    );
    const engaged = await scoreEmotionalMap(
      baseInput({
        emotionalMapV2: true,
        readingSessions: sessions,
        highlightCount: 8,
        annotationCount: 4,
        ecoMessages: [0, 1, 2].map((n) => ({ createdAt: day(n) })),
        voiceCount: 5,
        currentStreakDays: 12,
      }),
      mockProvider(),
    );
    const axis = (
      r: Awaited<ReturnType<typeof scoreEmotionalMap>>,
      key: string,
    ) => r.dimensions.find((d) => d.key === key)!;
    for (const key of ["conexion", "proposito"] as const) {
      expect(axis(engaged, key).value).toBe(axis(bare, key).value);
      expect(axis(engaged, key).confidence).toBe(0);
    }
  });

  it("Fase C — flag EMOTIONAL_MAP_V2=on: the LLM payload carries no engagement counters", async () => {
    const provider = mockProvider();
    // 4 hard-mood entries → confCompasion ≥ floor even without ecoDays.
    const entries = [0, 1, 2, 3].map((n) => ({
      mood: "hard",
      tags: [],
      createdAt: day(n),
    }));
    await scoreEmotionalMap(
      baseInput({
        emotionalMapV2: true,
        entries,
        ecoMessages: [0, 1].map((n) => ({ createdAt: day(n) })),
        voiceCount: 3,
        currentStreakDays: 9,
        readingSessions: [
          { progressPct: 10, completedAt: null, timeSpentSec: 60 },
        ],
      }),
      provider,
    );
    expect(provider.score).toHaveBeenCalledTimes(1);
    const payload = provider.score.mock.calls[0][0] as {
      stats: Record<string, unknown>;
    };
    expect(payload.stats).toEqual({ entryCount: 4, activeDays: 4 });
  });

  it("Fase E — under V2, confirmed resonances become the conexion source (ARC-C1)", async () => {
    const result = await scoreEmotionalMap(
      baseInput({
        emotionalMapV2: true,
        resonances: [
          { conceptKey: "eec-cuerpo-antes-que-mente", confirmedAt: day(0) },
          { conceptKey: "eec-como-aprendiste-a-sentir", confirmedAt: day(1) },
          // duplicate concept must not double-count
          { conceptKey: "eec-cuerpo-antes-que-mente", confirmedAt: day(2) },
        ],
      }),
      mockProvider(),
    );
    const conexion = result.dimensions.find((d) => d.key === "conexion")!;
    expect(conexion.value).toBe(0.5); // 2 distinct concepts / 4
    expect(conexion.confidence).toBe(1); // saturates at 2
    expect(conexion.measured).toBe(true);
    expect(conexion.evidence).toEqual({ modelId: "ARC-C1", n: 2 });
    expect(conexion.sources).toContain("resonancias que confirmaste");
  });

  it("Fase E — legacy scoring ignores resonances (conexion stays engagement-based)", async () => {
    const without = await scoreEmotionalMap(baseInput({}), mockProvider());
    const withResonances = await scoreEmotionalMap(
      baseInput({
        resonances: [
          { conceptKey: "eec-cuerpo-antes-que-mente", confirmedAt: day(0) },
        ],
      }),
      mockProvider(),
    );
    const conexion = (r: Awaited<ReturnType<typeof scoreEmotionalMap>>) =>
      r.dimensions.find((d) => d.key === "conexion")!;
    expect(conexion(withResonances).value).toBe(conexion(without).value);
    expect(conexion(withResonances).confidence).toBe(
      conexion(without).confidence,
    );
  });

  it("Fase C — flag EMOTIONAL_MAP_V2 defaults to OFF (behavior unchanged)", () => {
    const prev = process.env.EMOTIONAL_MAP_V2;
    delete process.env.EMOTIONAL_MAP_V2;
    try {
      expect(flagEnabled("EMOTIONAL_MAP_V2")).toBe(false);
    } finally {
      if (prev !== undefined) process.env.EMOTIONAL_MAP_V2 = prev;
    }
  });

  it("flag EMOTIONAL_MAP_LLM_SCORING=off: provider never called, axes fall back to gathering", async () => {
    const provider = mockProvider();
    const entries = [0, 1, 2, 3].map((n) => ({
      mood: "hard",
      tags: [],
      createdAt: day(n),
    }));
    const result = await scoreEmotionalMap(
      baseInput({ entries, llmScoringEnabled: false }),
      provider,
    );
    expect(provider.score).not.toHaveBeenCalled();
    const compasion = result.dimensions.find((d) => d.key === "compasion")!;
    // No fabricated number: confidence collapses to 0 → value forced to 0
    // ("reuniendo datos" in the UI). Mandatory test 33.2.9 of the V2 program.
    expect(compasion.confidence).toBe(0);
    expect(compasion.value).toBe(0);
  });
});

describe("V2 EWS gate — flag plumbing", () => {
  // 12 observations over 24 days → OU fit converges (≥8), confidence 0.3.
  const moodSeries = Array.from({ length: 12 }, (_, i) => ({
    mood: i % 2 === 0 ? "ok" : "good",
    createdAt: day(i * 2),
  }));

  it("Fase B' (L1): the EWS flag defaults to OFF — nothing reaches the public wire", () => {
    const prev = process.env.EMOTIONAL_MAP_EWS_PUBLIC;
    delete process.env.EMOTIONAL_MAP_EWS_PUBLIC;
    try {
      expect(flagEnabled("EMOTIONAL_MAP_EWS_PUBLIC")).toBe(false);
    } finally {
      if (prev !== undefined) process.env.EMOTIONAL_MAP_EWS_PUBLIC = prev;
    }
  });

  it("research view: the pure scoring still computes EWS when not overridden (benchmark)", async () => {
    // The scoring FUNCTION defaults to ewsPublic=true so research/benchmark
    // callers keep seeing the detector; the public wire is governed by the
    // flag (previous test), which the service passes explicitly.
    const result = await scoreEmotionalMap(
      baseInput({ moodSeries }),
      mockProvider(),
    );
    expect(result.affectDynamics?.status).toBe("active");
    expect(result.affectDynamics?.ews).not.toBeNull();
  });

  it("ewsPublic=false: the EWS block is withheld from the wire entirely", async () => {
    const result = await scoreEmotionalMap(
      baseInput({ moodSeries, ewsPublic: false }),
      mockProvider(),
    );
    expect(result.affectDynamics?.status).toBe("active");
    expect(result.affectDynamics?.ews).toBeNull();
    expect(JSON.stringify(result)).not.toContain("tauAc");
  });
});
