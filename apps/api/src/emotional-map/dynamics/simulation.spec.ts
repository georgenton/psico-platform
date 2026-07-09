import { describe, expect, it } from "vitest";

import { fitOu, type OuObservation } from "./ou";
import { bootstrapOuCI } from "./bootstrap";
import { mulberry32, simulateOu, simulateOuAt } from "./synthetic";

/**
 * Paper 1 — synthetic-validation harness (methods paper §5).
 *
 * Runs the E1–E4 experiments from the outline, prints result tables, and
 * asserts loose reproducible bounds so this doubles as a regression guard.
 * Deterministic (seeded PRNG). Captured numbers live in
 * docs/research/paper-1-results.md.
 *
 * NOTE: this is a research/validation harness, not wired into the product.
 */

const TRUTH = { mu: 0.2, theta: 1.0, sigma: 0.6 };

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function rmse(errs: number[]): number {
  return Math.sqrt(mean(errs.map((e) => e * e)));
}
function round(v: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ─── AR(1) discrete baseline (ignores Δt) ───────────────────────────────────
function fitAr1(obs: ReadonlyArray<OuObservation>): { c: number; phi: number } {
  const x0: number[] = [];
  const x1: number[] = [];
  for (let i = 1; i < obs.length; i++) {
    x0.push(obs[i - 1].x);
    x1.push(obs[i].x);
  }
  const mx0 = mean(x0);
  const mx1 = mean(x1);
  let cov = 0;
  let varr = 0;
  for (let i = 0; i < x0.length; i++) {
    cov += (x0[i] - mx0) * (x1[i] - mx1);
    varr += (x0[i] - mx0) ** 2;
  }
  const phi = varr > 0 ? cov / varr : 0;
  return { c: mx1 - phi * mx0, phi };
}

describe("Paper 1 — OU synthetic-validation harness", () => {
  it("E1 · parameter recovery improves with sample size", () => {
    const R = 25;
    const ns = [30, 100, 300];
    const rows: Record<number, { mu: number; theta: number; sigma: number }> =
      {};
    for (const n of ns) {
      const em: number[] = [];
      const et: number[] = [];
      const es: number[] = [];
      for (let r = 0; r < R; r++) {
        const obs = simulateOu({ ...TRUTH, n, dtMean: 0.5, seed: 1000 + r });
        const f = fitOu(obs);
        em.push(f.params.mu - TRUTH.mu);
        et.push(f.params.theta - TRUTH.theta);
        es.push(f.params.sigma - TRUTH.sigma);
      }
      rows[n] = { mu: rmse(em), theta: rmse(et), sigma: rmse(es) };
    }
    // eslint-disable-next-line no-console
    console.log("\n[E1] RMSE by n (truth μ=0.2 θ=1.0 σ=0.6)");
    for (const n of ns) {
      // eslint-disable-next-line no-console
      console.log(
        `  n=${String(n).padStart(3)}  RMSE μ=${round(rows[n].mu)}  θ=${round(rows[n].theta)}  σ=${round(rows[n].sigma)}`,
      );
    }
    // μ recovery clearly improves from n=30 to n=300.
    expect(rows[300].mu).toBeLessThan(rows[30].mu);
    // σ is well-identified even at moderate n.
    expect(rows[100].sigma).toBeLessThan(0.2);
  });

  it("E2 · survives irregular (exponential) sampling", () => {
    const R = 25;
    const regErr: number[] = [];
    const irrErr: number[] = [];
    for (let r = 0; r < R; r++) {
      const reg = simulateOu({ ...TRUTH, n: 200, dtMean: 0.5, seed: 2000 + r });
      const irr = simulateOu({
        ...TRUTH,
        n: 200,
        dtMean: 0.5,
        irregular: true,
        seed: 2000 + r,
      });
      regErr.push(Math.abs(fitOu(reg).params.mu - TRUTH.mu));
      irrErr.push(Math.abs(fitOu(irr).params.mu - TRUTH.mu));
    }
    const maeReg = mean(regErr);
    const maeIrr = mean(irrErr);
    // eslint-disable-next-line no-console
    console.log(
      `\n[E2] MAE(μ)  regular=${round(maeReg)}  irregular=${round(maeIrr)}`,
    );
    expect(maeReg).toBeLessThan(0.2);
    expect(maeIrr).toBeLessThan(0.2);
  });

  it("E3 · bootstrap 90% CI for μ has reasonable coverage", () => {
    const R = 40;
    let covered = 0;
    let width = 0;
    for (let r = 0; r < R; r++) {
      const obs = simulateOu({ ...TRUTH, n: 120, dtMean: 0.5, seed: 3000 + r });
      const ci = bootstrapOuCI(obs, { resamples: 25, seed: 7 });
      if (!ci) continue;
      width += ci.mu.hi - ci.mu.lo;
      if (TRUTH.mu >= ci.mu.lo && TRUTH.mu <= ci.mu.hi) covered++;
    }
    const coverage = covered / R;
    // eslint-disable-next-line no-console
    console.log(
      `\n[E3] μ 90%-CI coverage=${round(coverage, 2)} · mean width=${round(width / R)}`,
    );
    // Nominal 90%; bootstrap under/over-coverage tolerated within a band.
    expect(coverage).toBeGreaterThanOrEqual(0.7);
    expect(coverage).toBeLessThanOrEqual(1.0);
  });

  it("E4 · one-step predictive RMSE — OU vs AR(1) baseline (out-of-sample)", () => {
    const R = 20;
    const ouErr: number[] = [];
    const arErr: number[] = [];
    for (let r = 0; r < R; r++) {
      const obs = simulateOu({ ...TRUTH, n: 200, dtMean: 0.5, seed: 4000 + r });
      const split = Math.floor(obs.length * 0.8);
      const train = obs.slice(0, split);
      const test = obs.slice(split - 1); // include the boundary pair

      const fit = fitOu(train);
      const ar = fitAr1(train);
      const eOu: number[] = [];
      const eAr: number[] = [];
      for (let i = 1; i < test.length; i++) {
        const dt = Math.max(test[i].t - test[i - 1].t, 1e-6);
        const ouPred =
          fit.params.mu +
          (test[i - 1].x - fit.params.mu) * Math.exp(-fit.params.theta * dt);
        const arPred = ar.c + ar.phi * test[i - 1].x;
        eOu.push(test[i].x - ouPred);
        eAr.push(test[i].x - arPred);
      }
      ouErr.push(rmse(eOu));
      arErr.push(rmse(eAr));
    }
    const ouRmse = mean(ouErr);
    const arRmse = mean(arErr);
    // eslint-disable-next-line no-console
    console.log(
      `\n[E4] out-of-sample 1-step RMSE  OU=${round(ouRmse)}  AR(1)=${round(arRmse)}`,
    );
    // Both sane; we do NOT assert OU beats AR(1) (Loossens et al.).
    expect(ouRmse).toBeLessThan(1.0);
    expect(arRmse).toBeLessThan(1.0);
  });

  it("simulateOuAt reproduces a path at given timestamps", () => {
    const times = [0, 0.3, 1.1, 1.4, 3.0, 3.2];
    const rng = mulberry32(42);
    const path = simulateOuAt(TRUTH, times, rng);
    expect(path).toHaveLength(times.length);
    expect(path.map((p) => p.t)).toEqual(times);
    for (const p of path) expect(Number.isFinite(p.x)).toBe(true);
  });
});
