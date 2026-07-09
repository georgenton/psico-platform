/**
 * Parametric bootstrap for the OU estimator — gives per-parameter confidence
 * intervals. Given the fitted (μ, θ, σ), we resample B new OU paths at the
 * REAL observation timestamps, refit each, and read the percentile spread of
 * the estimates.
 *
 * Deterministic (seeded PRNG) so results are reproducible. Used by the Paper 1
 * simulation harness to characterise interval coverage, and available for the
 * live UI if we later want to show "±" on each parameter.
 */

import { fitOu, ouToAxes, type OuObservation } from "./ou";
import { mulberry32, simulateOuAt } from "./synthetic";

export interface OuInterval {
  lo: number;
  hi: number;
}

export interface OuBootstrapCI {
  mu: OuInterval;
  theta: OuInterval;
  sigma: OuInterval;
  inertiaDays: OuInterval;
  /** Bootstrap replicates that converged. */
  resamples: number;
  /** Confidence level (e.g. 0.9). */
  level: number;
}

export function bootstrapOuCI(
  obs: ReadonlyArray<OuObservation>,
  opts: { resamples?: number; seed?: number; level?: number } = {},
): OuBootstrapCI | null {
  const resamples = opts.resamples ?? 30;
  const level = opts.level ?? 0.9;

  const fit = fitOu(obs);
  if (!fit.converged) return null;

  const times = obs.map((o) => o.t);
  const rng = mulberry32(opts.seed ?? 1);

  const mu: number[] = [];
  const theta: number[] = [];
  const sigma: number[] = [];
  const inertiaDays: number[] = [];

  for (let b = 0; b < resamples; b++) {
    const sim = simulateOuAt(fit.params, times, rng);
    const f = fitOu(sim);
    if (!f.converged) continue;
    mu.push(f.params.mu);
    theta.push(f.params.theta);
    sigma.push(f.params.sigma);
    inertiaDays.push(f.inertiaDays);
  }
  if (mu.length < 3) return null;

  const loP = (1 - level) / 2;
  const hiP = 1 - loP;
  const iv = (arr: number[]): OuInterval => ({
    lo: percentile(arr, loP),
    hi: percentile(arr, hiP),
  });

  return {
    mu: iv(mu),
    theta: iv(theta),
    sigma: iv(sigma),
    inertiaDays: iv(inertiaDays),
    resamples: mu.length,
    level,
  };
}

export interface OuAxesBootstrapCI {
  baseline: OuInterval;
  regulation: OuInterval;
  stability: OuInterval;
  /** Bootstrap replicates that converged. */
  resamples: number;
  /** Confidence level (e.g. 0.9). */
  level: number;
}

/**
 * Etapa 3 — bootstrap CIs directly in AXIS space ([0,1] baseline/regulation/
 * stability). Each converged replicate is mapped through `ouToAxes` BEFORE
 * taking percentiles — the right thing for stability, which depends on σ and θ
 * jointly (transforming interval endpoints would be wrong for non-monotone
 * combinations). Deterministic via the seeded PRNG, so the cached map is
 * reproducible. Pass the SAME observation series the live fit used (raw when
 * stationary, detrended residuals when the v1 trend was accepted).
 */
export function bootstrapAxesCI(
  obs: ReadonlyArray<OuObservation>,
  opts: { resamples?: number; seed?: number; level?: number } = {},
): OuAxesBootstrapCI | null {
  const resamples = opts.resamples ?? 30;
  const level = opts.level ?? 0.9;

  const fit = fitOu(obs);
  if (!fit.converged) return null;

  const times = obs.map((o) => o.t);
  const rng = mulberry32(opts.seed ?? 1);

  const baseline: number[] = [];
  const regulation: number[] = [];
  const stability: number[] = [];

  for (let b = 0; b < resamples; b++) {
    const sim = simulateOuAt(fit.params, times, rng);
    const f = fitOu(sim);
    if (!f.converged) continue;
    const axes = ouToAxes(f);
    baseline.push(axes.baseline);
    regulation.push(axes.regulation);
    stability.push(axes.stability);
  }
  if (baseline.length < 3) return null;

  const loP = (1 - level) / 2;
  const hiP = 1 - loP;
  const iv = (arr: number[]): OuInterval => ({
    lo: percentile(arr, loP),
    hi: percentile(arr, hiP),
  });

  return {
    baseline: iv(baseline),
    regulation: iv(regulation),
    stability: iv(stability),
    resamples: baseline.length,
    level,
  };
}

/** Linear-interpolated percentile (p in [0,1]). */
export function percentile(values: ReadonlyArray<number>, p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  const frac = idx - lo;
  return s[lo] * (1 - frac) + s[hi] * frac;
}
