import { describe, expect, it } from "vitest";
import {
  analyzeReflectionText,
  REFLECTION_FEATURE_KEYS,
  type ReflectionTextFeatures,
} from "@psico/types";

import { computeTextAxes, scoreEmotionalMap, TEXT_GOOD_N } from "./emotional-map.scoring"; // prettier-ignore
import type { IEmotionalMapProvider } from "./providers/provider.interface";

/**
 * Etapa 6 — the on-device analyzer is SHARED code (@psico/types) so web and
 * mobile compute identical numbers; these specs are its single test home.
 * The fixture sentences below are test data, not user text.
 */

describe("analyzeReflectionText — on-device analyzer (Etapa 6)", () => {
  it("returns null for effectively-empty text", () => {
    expect(analyzeReflectionText("")).toBeNull();
    expect(analyzeReflectionText("hola qué tal")).toBeNull(); // < 5 tokens
  });

  it("produces a numbers-only vector (privacy shape)", () => {
    const f = analyzeReflectionText(
      "Hoy me di cuenta de que estaba cansada porque no dormí bien.",
    )!;
    expect(Object.keys(f).sort()).toEqual([...REFLECTION_FEATURE_KEYS].sort());
    for (const v of Object.values(f)) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("detects insight + causal language (claridad markers)", () => {
    const f = analyzeReflectionText(
      "Me di cuenta de que me enojo porque no descanso. Ahora veo el patrón y tiene sentido, aprendí algo.",
    )!;
    expect(f.insight).toBeGreaterThan(0);
    expect(f.causal).toBeGreaterThan(0);
  });

  it("separates self-kind from self-critical talk (compasión markers)", () => {
    const kind = analyzeReflectionText(
      "Hoy fue duro pero hice lo que pude. Está bien no poder con todo, voy un paso a la vez y me perdono.",
    )!;
    const critic = analyzeReflectionText(
      "Otra vez fallé, soy un desastre y todo lo hago mal. Es mi culpa, no sirvo para esto.",
    )!;
    expect(kind.selfKind).toBeGreaterThan(kind.selfCritic);
    expect(critic.selfCritic).toBeGreaterThan(critic.selfKind);
  });

  it("matches accented and unaccented spellings alike", () => {
    const a = analyzeReflectionText(
      "Me sentí muy triste y con ansiedad durante la reunión de hoy.",
    )!;
    const b = analyzeReflectionText(
      "Me senti muy triste y con ansiedad durante la reunion de hoy.",
    )!;
    expect(a.negative).toBeCloseTo(b.negative, 4);
  });

  it("counts absolutist and social language", () => {
    const f = analyzeReflectionText(
      "Siempre me pasa lo mismo, nunca cambia nada. Hablé con mi hermana y mis amigos y me hizo bien.",
    )!;
    expect(f.absolutist).toBeGreaterThan(0);
    expect(f.social).toBeGreaterThan(0);
  });
});

// ─── scoring integration ─────────────────────────────────────────────────────

const stubProvider: IEmotionalMapProvider = {
  name: "stub",
  score: async () => ({
    calma: 0.6,
    claridad: 0.11,
    compasion: 0.12,
    consciencia: 0.13,
  }),
};

function textRow(over: Partial<ReflectionTextFeatures> = {}) {
  return {
    wordCount: 60,
    selfFocus: 0.05,
    positive: 0.03,
    negative: 0.03,
    insight: 0.03,
    causal: 0.02,
    absolutist: 0.01,
    social: 0.02,
    selfKind: 0.02,
    selfCritic: 0.0,
    createdAt: new Date(),
    ...over,
  };
}

describe("computeTextAxes + scoring precedence (Etapa 6)", () => {
  it("maps feature rows to measured axes with saturating confidence", () => {
    const axes = computeTextAxes(Array.from({ length: TEXT_GOOD_N }, textRow));
    expect(axes.claridad!.value).toBeGreaterThan(0.6);
    expect(axes.claridad!.confidence).toBe(1);
    expect(axes.consciencia!.value).toBeGreaterThan(0.5);
    // Kind-only self-talk reads compassionate (> neutral 0.5).
    expect(axes.compasion!.value).toBeGreaterThan(0.5);
  });

  it("stays quiet on compassion without self-talk evidence", () => {
    const axes = computeTextAxes([
      textRow({ selfKind: 0, selfCritic: 0 }),
      textRow({ selfKind: 0, selfCritic: 0 }),
    ]);
    expect(axes.compasion).toBeUndefined();
    expect(axes.claridad).toBeDefined();
  });

  it("text features make axes MEASURED, and checkins still take precedence", async () => {
    const base = {
      entries: [],
      readingSessions: [],
      ecoMessages: [],
      voiceCount: 0,
      highlightCount: 0,
      annotationCount: 0,
      currentStreakDays: 0,
      moodSeries: [],
      ouEnabled: false,
    };
    const withText = await scoreEmotionalMap(
      { ...base, textFeatures: Array.from({ length: 8 }, textRow) },
      stubProvider,
    );
    const claridad = withText.dimensions.find((d) => d.key === "claridad")!;
    expect(claridad.measured).toBe(true);
    expect(claridad.sources).toMatch(/analizado en tu dispositivo/);
    expect(claridad.value).toBeGreaterThan(0.6); // text signal, not the 0.11 stub

    // Explicit checkin answers outrank the text-derived signal.
    const withBoth = await scoreEmotionalMap(
      {
        ...base,
        textFeatures: Array.from({ length: 8 }, textRow),
        checkins: Array.from({ length: 5 }, (_, i) => ({
          itemKey: "claridad_nombrar",
          score: 4,
          createdAt: new Date(Date.now() - i * 86400_000),
        })),
      },
      stubProvider,
    );
    const claridad2 = withBoth.dimensions.find((d) => d.key === "claridad")!;
    expect(claridad2.sources).toMatch(/check-in diario/);
    expect(claridad2.value).toBe(1);
  });
});
