import { describe, expect, it } from "vitest";
import type { EmotionalMapAffectDynamics } from "@psico/types";
import {
  affectHeadline,
  baselineLevel,
  buildAffectStory,
  evidenceBaseLabel,
  recoveryLevel,
  stabilityLevel,
} from "./affect-copy";

function active(
  partial: Partial<EmotionalMapAffectDynamics>,
): EmotionalMapAffectDynamics {
  return {
    status: "active",
    nObs: 40,
    needed: 8,
    recoveryNeeded: 100,
    confidence: 1,
    baseline: 0.5,
    recovery: 0.5,
    stability: 0.5,
    inertiaDays: 1,
    ...partial,
  };
}

describe("affect-copy buckets", () => {
  it("buckets baseline / recovery / stability at the documented thresholds", () => {
    expect(baselineLevel(0.72)).toBe("high");
    expect(baselineLevel(0.5)).toBe("medium");
    expect(baselineLevel(0.3)).toBe("low");

    expect(recoveryLevel(0.83)).toBe("fast");
    expect(recoveryLevel(0.4)).toBe("moderate");
    expect(recoveryLevel(0.2)).toBe("slow");

    expect(stabilityLevel(0.9)).toBe("steady");
    expect(stabilityLevel(0.66)).toBe("variable");
    expect(stabilityLevel(0.1)).toBe("volatile");
  });
});

describe("evidenceBaseLabel (Fase B')", () => {
  it("labels the evidence base honestly by record count", () => {
    expect(evidenceBaseLabel(12)).toBe("base limitada");
    expect(evidenceBaseLabel(45)).toBe("base moderada");
    expect(evidenceBaseLabel(120)).toBe("base más sólida");
  });
});

describe("affectHeadline (Fase B' — descriptive, never evaluative)", () => {
  it("describes where the records concentrate, without judging the person", () => {
    expect(affectHeadline("high")).toBe(
      "Tus registros recientes se concentran en categorías agradables.",
    );
    expect(affectHeadline("low")).toContain("Gracias por seguir registrando");
    expect(affectHeadline("medium")).toBe(
      "Así se han movido tus registros últimamente.",
    );
  });

  it("leads with the trend when one was detected, in neutral terms", () => {
    const up = affectHeadline("medium", "up");
    expect(up).toContain("han tendido hacia categorías");
    expect(up).not.toMatch(/buena dirección|vas bien/i);
    const down = affectHeadline("high", "down");
    expect(down).toContain("menos agradables");
    expect(down).toContain("Gracias por seguir registrando");
  });

  it("low-mood copy stays kind (non-diagnostic framing)", () => {
    const s = affectHeadline("low", null);
    expect(s).not.toMatch(/depres|ansied|trastorn|problema/i);
  });
});

describe("buildAffectStory", () => {
  it("matches the demo-estable persona (72/83/66) with descriptive rows", () => {
    const story = buildAffectStory(
      active({ baseline: 0.72, recovery: 0.83, stability: 0.66 }),
    );
    expect(story.headline).toBe(
      "Tus registros recientes se concentran en categorías agradables.",
    );
    expect(story.rows.map((r) => r.phrase?.title)).toEqual([
      "Nivel central en categorías agradables",
      "Ritmo de retorno estimado: rápido",
      "Variación moderada alrededor de tu tendencia",
    ]);
    expect(story.rows.map((r) => r.pct)).toEqual([72, 83, 66]);
    expect(story.trend).toBeNull();
    expect(story.trendNote).toBeNull();
  });

  it("carries no early-warning field (EWS is off the public copy)", () => {
    const story = buildAffectStory(active({}));
    expect(story).not.toHaveProperty("ewsNote");
  });

  it("degrades the recovery row to a gathering note when gated", () => {
    const story = buildAffectStory(
      active({ nObs: 12, recovery: null, inertiaDays: null }),
    );
    const recovery = story.rows.find((r) => r.key === "recovery")!;
    expect(recovery.phrase).toBeNull();
    expect(recovery.pct).toBeNull();
    expect(recovery.missing).toBe(88); // 100 needed − 12 observed
    // The other two rows still carry phrases.
    expect(story.rows.filter((r) => r.phrase).length).toBe(2);
  });

  it("Etapa 4: surfaces the trend and its explainer", () => {
    const story = buildAffectStory(
      active({ baseline: 0.72, recovery: 0.83, stability: 0.66, trend: "up" }),
    );
    expect(story.trend).toBe("up");
    expect(story.headline).toContain("han tendido hacia");
    expect(story.trendNote).toContain("no cuenta como inestabilidad");
  });

  it("Etapa 3: rounds bootstrap margins to % points and drops noise", () => {
    const story = buildAffectStory(
      active({
        margins: { baseline: 0.08, recovery: 0.17, stability: 0.002 },
      }),
    );
    expect(story.rows.map((r) => r.margin)).toEqual([8, 17, null]);
  });
});
