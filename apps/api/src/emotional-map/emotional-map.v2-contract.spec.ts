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
