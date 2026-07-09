import { describe, expect, it } from "vitest";

import { bootstrapAxesCI, bootstrapOuCI } from "./bootstrap";
import { fitOu, ouToAxes } from "./ou";
import { simulateOu } from "./synthetic";

describe("bootstrapAxesCI — Etapa 3 axis-space intervals", () => {
  const obs = simulateOu({
    mu: 0.3,
    theta: 1,
    sigma: 0.4,
    n: 60,
    dtMean: 0.5,
    seed: 13,
  });

  it("brackets the point estimate and stays within [0,1]", () => {
    const ci = bootstrapAxesCI(obs, { seed: 3 });
    expect(ci).not.toBeNull();
    const point = ouToAxes(fitOu(obs));
    for (const key of ["baseline", "regulation", "stability"] as const) {
      const iv = ci![key];
      expect(iv.lo).toBeLessThanOrEqual(iv.hi);
      // Percentile intervals from replicates centered on the fitted params
      // should contain (or nearly contain) the point estimate.
      expect(point[key]).toBeGreaterThanOrEqual(iv.lo - 0.15);
      expect(point[key]).toBeLessThanOrEqual(iv.hi + 0.15);
      expect(iv.lo).toBeGreaterThanOrEqual(0);
      expect(iv.hi).toBeLessThanOrEqual(1);
    }
    expect(ci!.resamples).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic for a fixed seed (cache-reproducible)", () => {
    const a = bootstrapAxesCI(obs, { seed: 7 });
    const b = bootstrapAxesCI(obs, { seed: 7 });
    expect(a).toEqual(b);
  });

  it("returns null when the base fit cannot converge (too few obs)", () => {
    const few = obs.slice(0, 4);
    expect(bootstrapAxesCI(few, { seed: 3 })).toBeNull();
    expect(bootstrapOuCI(few, { seed: 3 })).toBeNull();
  });
});
