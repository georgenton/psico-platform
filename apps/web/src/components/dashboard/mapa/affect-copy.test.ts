import { describe, expect, it } from "vitest";
import type { EmotionalMapAffectDynamics } from "@psico/types";
import {
  affectHeadline,
  baselineLevel,
  buildAffectStory,
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
    recoveryNeeded: 20,
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

describe("affectHeadline", () => {
  it("composes the strongest-signal sentence", () => {
    expect(affectHeadline("high", "fast")).toBe(
      "Sueles estar en un buen lugar, y cuando bajas, te recuperas rápido.",
    );
    expect(affectHeadline("high", "moderate")).toBe(
      "Sueles estar en un buen lugar.",
    );
    expect(affectHeadline("low", "slow")).toBe(
      "Estos días cuesta un poco más — y está bien ir a tu ritmo.",
    );
    expect(affectHeadline("medium", null)).toBe(
      "Así se está moviendo tu ánimo últimamente.",
    );
  });

  it("low-mood copy stays kind (non-diagnostic framing)", () => {
    const s = affectHeadline("low", null);
    expect(s).not.toMatch(/depres|ansied|trastorn|problema/i);
  });
});

describe("buildAffectStory", () => {
  it("matches the demo-estable persona (72/83/66) end to end", () => {
    const story = buildAffectStory(
      active({ baseline: 0.72, recovery: 0.83, stability: 0.66 }),
    );
    expect(story.headline).toBe(
      "Sueles estar en un buen lugar, y cuando bajas, te recuperas rápido.",
    );
    expect(story.rows.map((r) => r.phrase?.title)).toEqual([
      "Tu ánimo de base es bueno",
      "Te recuperas rápido",
      "Tienes altibajos normales",
    ]);
    expect(story.rows.map((r) => r.pct)).toEqual([72, 83, 66]);
  });

  it("degrades the recovery row to a gathering note when gated", () => {
    const story = buildAffectStory(
      active({ nObs: 12, recovery: null, inertiaDays: null }),
    );
    const recovery = story.rows.find((r) => r.key === "recovery")!;
    expect(recovery.phrase).toBeNull();
    expect(recovery.missing).toBe(8); // 20 needed − 12 observed
    // The other two rows still carry phrases.
    expect(story.rows.filter((r) => r.phrase).length).toBe(2);
  });
});
