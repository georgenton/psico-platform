/**
 * Synthetic OU path generator — used to validate the estimator by recovering
 * known parameters. Deterministic given a seed (no Math.random), so tests are
 * reproducible.
 *
 * This is the standard "methods validation" step before touching real data
 * (see docs/research/emotional-map-affect-dynamics.md §6): simulate an OU
 * process with known (μ, θ, σ), sample it — optionally at irregular intervals —
 * and check that `fitOu` recovers the parameters.
 */

import type { OuObservation } from "./ou";

export interface SimulateOptions {
  mu: number;
  theta: number;
  sigma: number;
  /** Number of samples to produce. */
  n: number;
  /** Mean spacing between samples in days. */
  dtMean?: number;
  /** When true, spacings are exponentially distributed (irregular sampling). */
  irregular?: boolean;
  /** PRNG seed for reproducibility. */
  seed?: number;
  /** Starting value; defaults to the stationary draw around μ. */
  x0?: number;
}

/**
 * Simulate an exact OU path sampled at (optionally irregular) intervals.
 * Uses the closed-form transition so the sampling interval can vary freely.
 */
export function simulateOu(opts: SimulateOptions): OuObservation[] {
  const { mu, theta, sigma, n } = opts;
  const dtMean = opts.dtMean ?? 0.25;
  const rng = mulberry32(opts.seed ?? 1);
  const gauss = () => boxMuller(rng);

  const sigma2 = sigma * sigma;
  const statStd = Math.sqrt(sigma2 / (2 * theta));

  let x = opts.x0 ?? mu + statStd * gauss();
  let t = 0;
  const out: OuObservation[] = [{ t, x }];

  for (let i = 1; i < n; i++) {
    // Draw the next spacing.
    const dt = opts.irregular
      ? Math.max(-Math.log(1 - rng()) * dtMean, 1e-3)
      : dtMean;
    t += dt;
    const e = Math.exp(-theta * dt);
    const mean = mu + (x - mu) * e;
    const transStd = Math.sqrt((sigma2 / (2 * theta)) * (1 - e * e));
    x = mean + transStd * gauss();
    out.push({ t, x });
  }
  return out;
}

// ─── deterministic PRNG + Gaussian ──────────────────────────────────────────

/** mulberry32 — tiny deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller transform: one standard-normal draw from a uniform PRNG. */
export function boxMuller(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
