import { describe, expect, it } from "vitest";

import {
  fitOu,
  fitOuWithTrend,
  MIN_OBS_FOR_FIT,
  moodToScalar,
  ouNegLogLik,
  ouToAxes,
} from "./ou";
import { simulateOu } from "./synthetic";

describe("OU affect-dynamics estimator — Tier 2 prototype", () => {
  it("maps ordinal moods to a centered numeric scale", () => {
    expect(moodToScalar("great")).toBe(1);
    expect(moodToScalar("ok")).toBe(0);
    expect(moodToScalar("hard")).toBe(-1);
    // Unknown token → neutral, never a crash.
    expect(moodToScalar("banana")).toBe(0);
  });

  it("assigns lower negative log-likelihood to the true params than to wrong ones", () => {
    const obs = simulateOu({
      mu: 0.2,
      theta: 1.0,
      sigma: 0.6,
      n: 200,
      dtMean: 0.25,
      seed: 42,
    });
    const nllTrue = ouNegLogLik({ mu: 0.2, theta: 1.0, sigma: 0.6 }, obs);
    const nllWrong = ouNegLogLik({ mu: -0.8, theta: 0.05, sigma: 0.15 }, obs);
    expect(nllTrue).toBeLessThan(nllWrong);
  });

  it("recovers known parameters from a regularly-sampled OU path", () => {
    const truth = { mu: 0.2, theta: 1.0, sigma: 0.6 };
    const obs = simulateOu({ ...truth, n: 500, dtMean: 0.25, seed: 7 });
    const fit = fitOu(obs);

    expect(fit.converged).toBe(true);
    expect(fit.nObs).toBe(500);
    // Baseline is the best-identified parameter.
    expect(fit.params.mu).toBeCloseTo(truth.mu, 1);
    // θ and σ are noisier — assert they land in a sane band around truth.
    expect(fit.params.theta).toBeGreaterThan(0.5);
    expect(fit.params.theta).toBeLessThan(2.0);
    expect(fit.params.sigma).toBeGreaterThan(0.4);
    expect(fit.params.sigma).toBeLessThan(0.9);
    // Inertia = 1/θ.
    expect(fit.inertiaDays).toBeCloseTo(1 / fit.params.theta, 6);
  });

  it("recovers the baseline even under irregular (exponential) sampling", () => {
    const truth = { mu: -0.3, theta: 0.8, sigma: 0.5 };
    const obs = simulateOu({
      ...truth,
      n: 500,
      dtMean: 0.4,
      irregular: true,
      seed: 11,
    });
    const fit = fitOu(obs);
    expect(fit.converged).toBe(true);
    expect(fit.params.mu).toBeCloseTo(truth.mu, 1);
    expect(fit.params.theta).toBeGreaterThan(0.3);
    expect(fit.params.theta).toBeLessThan(1.8);
  });

  it("does not attempt a fit below the minimum observation count", () => {
    const obs = simulateOu({
      mu: 0,
      theta: 1,
      sigma: 0.5,
      n: MIN_OBS_FOR_FIT - 1,
      seed: 3,
    });
    const fit = fitOu(obs);
    expect(fit.converged).toBe(false);
    // Still returns a usable neutral fallback (caller degrades to Tier 1).
    expect(Number.isFinite(fit.params.mu)).toBe(true);
  });

  it("v1 (Etapa 4): detects a real upward trend and detrends the residual fit", () => {
    // Stationary OU path + a strong deterministic drift (1.5 mood levels over
    // 30 days). v0 read this drift as variance; v1 must isolate it.
    const base = simulateOu({
      mu: 0,
      theta: 1,
      sigma: 0.3,
      n: 40,
      dtMean: 0.75,
      seed: 21,
    });
    const span = base[base.length - 1].t - base[0].t;
    const slope = 1.5 / span;
    const drifted = base.map((o) => ({ t: o.t, x: o.x + slope * o.t }));

    const v1 = fitOuWithTrend(drifted);
    expect(v1.trending).toBe(true);
    expect(v1.slopePerDay).toBeGreaterThan(0);
    // levelNow tracks the top of the drift, not the window average.
    expect(v1.levelNow).toBeGreaterThan(0.5);
    // Detrended residual fit reads LESS spread than the raw fit sees.
    const raw = fitOu(drifted);
    const statVar = (f: typeof raw) =>
      f.params.sigma ** 2 / (2 * f.params.theta);
    expect(statVar(v1.fit)).toBeLessThan(statVar(raw));
  });

  it("v1 (Etapa 4): rejects the trend on a stationary path (no false direction)", () => {
    const obs = simulateOu({
      mu: 0.3,
      theta: 1,
      sigma: 0.4,
      n: 60,
      dtMean: 0.5,
      seed: 9,
    });
    const v1 = fitOuWithTrend(obs);
    expect(v1.trending).toBe(false);
    expect(v1.slopePerDay).toBe(0);
    // Falls back to the plain fit — levelNow is the fitted baseline μ.
    expect(v1.levelNow).toBeCloseTo(v1.fit.params.mu, 6);
  });

  it("bridges OU params to interpretable axes with the right monotonicity", () => {
    const base = fitOu(
      simulateOu({ mu: 0.4, theta: 1, sigma: 0.5, n: 300, seed: 5 }),
    );
    // Higher θ (faster regulation) → higher regulation axis.
    const fast = { ...base, params: { ...base.params, theta: 3 } };
    const slow = { ...base, params: { ...base.params, theta: 0.2 } };
    expect(ouToAxes(fast).regulation).toBeGreaterThan(
      ouToAxes(slow).regulation,
    );
    // Higher σ (more volatile) → lower stability axis.
    const calm = { ...base, params: { ...base.params, sigma: 0.2 } };
    const volatile = { ...base, params: { ...base.params, sigma: 0.9 } };
    expect(ouToAxes(calm).stability).toBeGreaterThan(
      ouToAxes(volatile).stability,
    );
    // All axes stay within [0, 1].
    for (const v of Object.values(ouToAxes(base))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
