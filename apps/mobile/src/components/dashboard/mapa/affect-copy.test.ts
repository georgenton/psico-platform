import type { EmotionalMapAffectDynamics } from "@psico/types";
import {
  affectHeadline,
  baselineLevel,
  buildAffectStory,
  formatInertia,
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

describe("affect-copy (mobile)", () => {
  it("buckets at the same thresholds as the web helper", () => {
    expect(baselineLevel(0.72)).toBe("high");
    expect(baselineLevel(0.3)).toBe("low");
    expect(recoveryLevel(0.83)).toBe("fast");
    expect(recoveryLevel(0.2)).toBe("slow");
    expect(stabilityLevel(0.9)).toBe("steady");
    expect(stabilityLevel(0.1)).toBe("volatile");
  });

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
  });

  it("degrades the recovery row to a gathering note when gated", () => {
    const story = buildAffectStory(
      active({ nObs: 12, recovery: null, inertiaDays: null }),
    );
    const recovery = story.rows.find((r) => r.key === "recovery")!;
    expect(recovery.phrase).toBeNull();
    expect(recovery.missing).toBe(8);
  });

  it("keeps the low-mood headline kind (non-diagnostic framing)", () => {
    expect(affectHeadline("low", "slow")).not.toMatch(
      /depres|ansied|trastorn|problema/i,
    );
  });

  it("formats inertia as a human duration", () => {
    expect(formatInertia(0.2)).toBe("unas horas");
    expect(formatInertia(1.1)).toBe("un día");
    expect(formatInertia(3.9)).toBe("4 días");
  });
});
