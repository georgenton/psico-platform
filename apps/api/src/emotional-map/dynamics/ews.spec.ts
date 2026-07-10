import { describe, expect, it } from "vitest";

import { computeEws, EWS_MIN_OBS, kendallTau } from "./ews";
import { simulateOu, simulateOuThetaRamp } from "./synthetic";

describe("EWS — critical slowing down detector (Etapa 5)", () => {
  it("refuses to answer below the observation floor", () => {
    const obs = simulateOu({
      mu: 0,
      theta: 1,
      sigma: 0.5,
      n: EWS_MIN_OBS - 1,
      seed: 2,
    });
    const r = computeEws(obs);
    expect(r.status).toBe("insufficient");
    expect(r.tauAc).toBeNull();
    expect(r.tauVar).toBeNull();
    expect(r.needed).toBe(EWS_MIN_OBS);
  });

  it("flags a θ-ramp (losing resilience) and stays quiet on a stationary path", () => {
    const ramp = computeEws(
      simulateOuThetaRamp({
        mu: 0,
        sigma: 0.6,
        theta0: 1.5,
        theta1: 0.05,
        n: 120,
        dtMean: 0.5,
        seed: 6005, // a seed the detector catches (sensitivity is ~40%, E5b)
      }),
    );
    expect(ramp.status).toBe("rising");
    expect(ramp.tauAc ?? 0).toBeGreaterThan(0);

    const flat = computeEws(
      simulateOu({ mu: 0.2, theta: 1, sigma: 0.6, n: 120, seed: 5001 }),
    );
    expect(flat.status).toBe("steady");
  });

  it("kendallTau: +1 for strictly rising, −1 for strictly falling, ~0 for flat", () => {
    expect(kendallTau([1, 2, 3, 4, 5])).toBe(1);
    expect(kendallTau([5, 4, 3, 2, 1])).toBe(-1);
    expect(kendallTau([1, 1, 1, 1])).toBe(0);
    expect(Math.abs(kendallTau([1, 3, 2, 4, 3, 5]))).toBeLessThanOrEqual(1);
  });
});
