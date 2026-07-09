/**
 * Ornstein–Uhlenbeck (OU) affect-dynamics estimator — Tier 2 prototype.
 *
 * Models a user's mood as a mean-reverting stochastic process:
 *
 *     dX = θ·(μ − X)·dt + σ·dW
 *
 *   μ  — emotional baseline (the attractor mood returns to)
 *   θ  — regulation speed (how fast you recover toward μ); 1/θ = emotional inertia
 *   σ  — volatility / reactivity
 *
 * Estimation uses the EXACT discrete transition of the continuous-time process,
 * so irregularly-spaced observations (Δt varies) are handled natively — a key
 * fit for our sparse, categorical diary data. Parameters are fit by maximum
 * likelihood via a dependency-free Nelder–Mead simplex.
 *
 * Privacy (ADR 0007): this operates ONLY on the ordinal mood series + timestamps.
 * It never touches ciphertext. It is NOT wired into the live emotional map yet —
 * it is an experimental building block for the affect-dynamics research track
 * (see docs/research/emotional-map-affect-dynamics.md).
 *
 * Time unit convention: callers pass observation times `t` in DAYS (float).
 * Then θ is expressed per-day and 1/θ (inertia) is in days.
 */

/** Ordinal mood tokens (DIARY_MOODS) mapped to a centered numeric scale. */
export const MOOD_SCALAR: Readonly<Record<string, number>> = {
  great: 1,
  good: 0.5,
  ok: 0,
  low: -0.5,
  hard: -1,
};

/** Map a mood token to the numeric scale; unknown tokens fall back to neutral. */
export function moodToScalar(mood: string): number {
  return MOOD_SCALAR[mood] ?? 0;
}

export interface OuObservation {
  /** Time in days (any origin — only differences matter). */
  t: number;
  /** Mood on the centered scale, typically in [-1, 1]. */
  x: number;
}

export interface OuParams {
  mu: number;
  theta: number;
  sigma: number;
}

export interface OuFit {
  params: OuParams;
  /** Log-likelihood at the optimum. */
  logLik: number;
  /** Number of observations used. */
  nObs: number;
  /** False when there were too few observations or the optimizer stalled. */
  converged: boolean;
  /** Emotional inertia = 1/θ (days). Higher = moods "stick" longer. */
  inertiaDays: number;
}

/** Below this we don't attempt a fit — the parameters are unidentifiable. */
export const MIN_OBS_FOR_FIT = 8;

const TWO_PI = 2 * Math.PI;
const VAR_FLOOR = 1e-9;

/**
 * Negative log-likelihood of the OU parameters given observations.
 * Includes the stationary term for the first point so μ is identifiable.
 */
export function ouNegLogLik(
  params: OuParams,
  obs: ReadonlyArray<OuObservation>,
): number {
  const { mu, theta, sigma } = params;
  if (!(theta > 0) || !(sigma > 0)) return Number.POSITIVE_INFINITY;
  const sigma2 = sigma * sigma;

  // Stationary distribution of the first observation: N(μ, σ²/2θ).
  const statVar = Math.max(sigma2 / (2 * theta), VAR_FLOOR);
  let nll = 0.5 * (Math.log(TWO_PI * statVar) + (obs[0].x - mu) ** 2 / statVar);

  for (let i = 1; i < obs.length; i++) {
    const dt = obs[i].t - obs[i - 1].t;
    if (dt <= 0) continue; // ignore duplicate / out-of-order stamps
    const e = Math.exp(-theta * dt);
    const mean = mu + (obs[i - 1].x - mu) * e;
    // Var = σ²/(2θ)·(1 − e^{−2θΔt}); use the θ→0 limit (σ²Δt) for stability.
    const transVar =
      theta < 1e-6
        ? Math.max(sigma2 * dt, VAR_FLOOR)
        : Math.max((sigma2 / (2 * theta)) * (1 - e * e), VAR_FLOOR);
    const resid = obs[i].x - mean;
    nll += 0.5 * (Math.log(TWO_PI * transVar) + (resid * resid) / transVar);
  }
  return nll;
}

/**
 * Fit OU parameters by maximum likelihood. Optimizes over (μ, log θ, log σ) so
 * θ and σ stay strictly positive. Returns `converged: false` (with a neutral
 * fallback) when there aren't enough observations — the caller then degrades to
 * the Tier-1 heuristic.
 */
export function fitOu(obs: ReadonlyArray<OuObservation>): OuFit {
  const sorted = [...obs].sort((a, b) => a.t - b.t);
  const n = sorted.length;
  if (n < MIN_OBS_FOR_FIT) {
    return {
      params: { mu: mean(sorted.map((o) => o.x)) || 0, theta: 1, sigma: 1 },
      logLik: Number.NEGATIVE_INFINITY,
      nObs: n,
      converged: false,
      inertiaDays: 1,
    };
  }

  const xs = sorted.map((o) => o.x);
  const init = initialGuess(sorted, xs);

  // Optimize in (μ, logθ, logσ) space.
  const objective = (p: readonly number[]): number =>
    ouNegLogLik(
      { mu: p[0], theta: Math.exp(p[1]), sigma: Math.exp(p[2]) },
      sorted,
    );

  const start: [number, number, number] = [
    init.mu,
    Math.log(init.theta),
    Math.log(init.sigma),
  ];
  const result = nelderMead(objective, start);

  const params: OuParams = {
    mu: result.x[0],
    theta: Math.exp(result.x[1]),
    sigma: Math.exp(result.x[2]),
  };
  return {
    params,
    logLik: -result.fx,
    nObs: n,
    converged: result.converged && Number.isFinite(result.fx),
    inertiaDays: 1 / params.theta,
  };
}

/**
 * Stability measurement-noise floor (Etapa 1). Our mood scale has levels 0.5
 * apart (great=1 … hard=−1). A normal ±1-level check-in swing (e.g. "good"→
 * "great") is mostly *reporting granularity*, not emotional volatility. We treat
 * a stationary spread below this standard deviation as measurement noise and
 * don't let it lower the stability axis. Tuned against the persona benchmark;
 * the v1 ordinal-latent model (Etapa 4) will replace this heuristic with a
 * principled measurement model. See docs/research/emotional-map-benchmark.md.
 */
export const STABILITY_MEASUREMENT_SD = 0.35;
/** Stationary SD (after removing measurement noise) at which stability hits 0. */
export const STABILITY_REF_SD = 0.6;

/**
 * Bridge OU parameters to interpretable [0,1] axes for the radar. EXPERIMENTAL
 * scalings — to be calibrated against real data. Documented so the mapping is
 * auditable rather than magic.
 */
export function ouToAxes(fit: OuFit): {
  baseline: number;
  regulation: number;
  stability: number;
} {
  const { mu, theta, sigma } = fit.params;
  // baseline: mood scale [-1,1] → [0,1].
  const baseline = clamp01((mu + 1) / 2);
  // regulation: saturating in θ (θ=1/day → 0.5). Faster recovery → higher.
  const regulation = clamp01(theta / (theta + 1));
  // stability (Etapa 1): base it on the STATIONARY spread of moods around the
  // baseline (σ_stat = √(σ²/2θ)) — the long-run "how far do moods wander" — not
  // the raw diffusion σ, which trades off against θ and conflated ordinal
  // jitter with true volatility (the Etapa-0 benchmark finding). Then subtract
  // a measurement-noise floor so ordinary ±1-level day-to-day swings don't read
  // as instability.
  const statVar = (sigma * sigma) / (2 * Math.max(theta, 1e-6));
  const trueVar = Math.max(0, statVar - STABILITY_MEASUREMENT_SD ** 2);
  const trueSd = Math.sqrt(trueVar);
  const stability = clamp01(1 - trueSd / STABILITY_REF_SD);
  return { baseline, regulation, stability };
}

// ─── Etapa 4 — v1 ordinal-latent: trend + OU on residuals ───────────────────

/**
 * The v0 OU model assumes stationarity, so a user who is steadily improving
 * (or declining) reads as "high variance" — the Etapa-0 benchmark showed
 * trending personas scoring ~0% stability. The v1 model decomposes the latent
 * mood into  x(t) = a + b·t + z(t)  where the linear part is the *direction*
 * of the season and z is a mean-zero OU (the day-to-day dynamics around it).
 *
 * The trend is only accepted when it is statistically significant (|t-stat| of
 * the OLS slope) AND practically meaningful (total movement across the window
 * of at least one ordinal mood level) — otherwise we keep the plain OU fit so
 * stationary users are unaffected. This treats ordinal category jumps as noise
 * around a latent path rather than real volatility, in the same spirit as the
 * Etapa-1 measurement floor.
 */
export interface TrendOuFit {
  /** OU fit — over the detrended residuals when `trending`, else the raw fit. */
  fit: OuFit;
  /** Latent-scale slope per day. 0 when the trend was rejected. */
  slopePerDay: number;
  /** True when the linear trend passed the significance + magnitude test. */
  trending: boolean;
  /**
   * Latent level at the most recent observation: `a + b·t_last` when trending
   * (where the user IS, not the window average), else the fitted μ.
   */
  levelNow: number;
  /**
   * The series the OU was actually fit on (detrended residuals when trending,
   * the raw sorted series otherwise). Feed this to the bootstrap so the ±
   * intervals describe the same fit the axes came from (Etapa 3).
   */
  obsForFit: OuObservation[];
  /**
   * OLS standard error of the trend prediction at t_last (mood-scale units).
   * Only set when trending — the baseline ± comes from here instead of the
   * bootstrap μ (which describes the residual mean, ~0 by construction).
   */
  levelNowSe?: number;
}

/** |t-statistic| of the OLS slope required to accept a trend. */
export const TREND_T_STAT = 2;
/**
 * Minimum total latent movement across the window (|b|·span) to accept a
 * trend. One ordinal mood level = 0.5 on the centered scale.
 */
export const TREND_MIN_TOTAL = 0.5;

/**
 * Fit the v1 trend+OU decomposition. Falls back to the plain OU fit (and
 * `trending: false`) for short series or when the slope is not significant.
 */
export function fitOuWithTrend(obs: ReadonlyArray<OuObservation>): TrendOuFit {
  const sorted = [...obs].sort((a, b) => a.t - b.t);
  const n = sorted.length;
  const plain = (): TrendOuFit => {
    const fit = fitOu(sorted);
    return {
      fit,
      slopePerDay: 0,
      trending: false,
      levelNow: fit.params.mu,
      obsForFit: sorted,
    };
  };
  if (n < MIN_OBS_FOR_FIT) return plain();

  // OLS of x on t.
  const tMean = mean(sorted.map((o) => o.t));
  const xMean = mean(sorted.map((o) => o.x));
  let sxx = 0;
  let sxy = 0;
  for (const o of sorted) {
    sxx += (o.t - tMean) ** 2;
    sxy += (o.t - tMean) * (o.x - xMean);
  }
  if (sxx <= 0) return plain();
  const b = sxy / sxx;
  const a = xMean - b * tMean;

  let sse = 0;
  for (const o of sorted) sse += (o.x - a - b * o.t) ** 2;
  const residVar = sse / Math.max(n - 2, 1);
  const seB = Math.sqrt(Math.max(residVar, VAR_FLOOR) / sxx);
  const tStat = seB > 0 ? b / seB : 0;
  const span = sorted[n - 1].t - sorted[0].t;

  const trending =
    Math.abs(tStat) >= TREND_T_STAT && Math.abs(b) * span >= TREND_MIN_TOTAL;
  if (!trending) return plain();

  // Fit the OU on the detrended residuals — day-to-day dynamics only.
  const residuals = sorted.map((o) => ({ t: o.t, x: o.x - (a + b * o.t) }));
  const fit = fitOu(residuals);
  // Where the trend puts the user TODAY, kept on the mood scale.
  const tLast = sorted[n - 1].t;
  const levelNow = clamp(a + b * tLast, -1, 1);
  // OLS prediction SE at t_last: √(s²·(1/n + (t_last − t̄)²/Sxx)).
  const levelNowSe = Math.sqrt(
    Math.max(residVar, VAR_FLOOR) * (1 / n + (tLast - tMean) ** 2 / sxx),
  );
  return {
    fit,
    slopePerDay: b,
    trending: true,
    levelNow,
    obsForFit: residuals,
    levelNowSe,
  };
}

// ─── initial guess ──────────────────────────────────────────────────────────

function initialGuess(
  obs: ReadonlyArray<OuObservation>,
  xs: ReadonlyArray<number>,
): OuParams {
  const mu = mean(xs);
  const v = variance(xs);
  // Lag-1 autocorrelation over consecutive points → θ via median Δt.
  const dts: number[] = [];
  for (let i = 1; i < obs.length; i++) {
    const dt = obs[i].t - obs[i - 1].t;
    if (dt > 0) dts.push(dt);
  }
  const dtMed = dts.length ? median(dts) : 1;
  const r1 = clamp(lag1Autocorr(xs), 0.02, 0.98);
  const theta = Math.max(-Math.log(r1) / Math.max(dtMed, 1e-3), 1e-2);
  // Stationary variance V ≈ σ²/(2θ) ⇒ σ ≈ sqrt(2θV).
  const sigma = Math.max(Math.sqrt(2 * theta * Math.max(v, 1e-4)), 1e-2);
  return { mu, theta, sigma };
}

// ─── Nelder–Mead (dependency-free, deterministic) ───────────────────────────

interface NmResult {
  x: number[];
  fx: number;
  converged: boolean;
}

/**
 * Minimize `f` from `x0` with a Nelder–Mead simplex. Deterministic: no RNG, so
 * results are reproducible given the same inputs.
 */
export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: readonly number[],
  opts: { maxIter?: number; tol?: number; step?: number } = {},
): NmResult {
  const maxIter = opts.maxIter ?? 400;
  const tol = opts.tol ?? 1e-8;
  const step = opts.step ?? 0.1;
  const n = x0.length;

  const alpha = 1; // reflection
  const gamma = 2; // expansion
  const rho = 0.5; // contraction
  const sigmaShrink = 0.5; // shrink

  // Build the initial simplex: x0 and x0 + step·e_i.
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const pt = x0.slice();
    pt[i] += step !== 0 ? step : 0.05;
    simplex.push(pt);
  }
  let fvals = simplex.map((p) => f(p));

  let converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    // Order by objective value.
    const order = fvals
      .map((v, i) => [v, i] as const)
      .sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    fvals = order.map(([v]) => v);

    // Convergence: simplex is small enough.
    const spread = Math.abs(fvals[n] - fvals[0]);
    if (spread < tol) {
      converged = true;
      break;
    }

    // Centroid of all but the worst point.
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const worst = simplex[n];
    const reflected = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fRef = f(reflected);

    if (fRef < fvals[0]) {
      // Expand.
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const fExp = f(expanded);
      if (fExp < fRef) {
        simplex[n] = expanded;
        fvals[n] = fExp;
      } else {
        simplex[n] = reflected;
        fvals[n] = fRef;
      }
    } else if (fRef < fvals[n - 1]) {
      simplex[n] = reflected;
      fvals[n] = fRef;
    } else {
      // Contract.
      const contracted = centroid.map((c, j) => c + rho * (worst[j] - c));
      const fCon = f(contracted);
      if (fCon < fvals[n]) {
        simplex[n] = contracted;
        fvals[n] = fCon;
      } else {
        // Shrink toward the best point.
        const best = simplex[0];
        for (let i = 1; i <= n; i++) {
          simplex[i] = best.map(
            (b, j) => b + sigmaShrink * (simplex[i][j] - b),
          );
          fvals[i] = f(simplex[i]);
        }
      }
    }
  }

  // Return the current best.
  let bestIdx = 0;
  for (let i = 1; i <= n; i++) if (fvals[i] < fvals[bestIdx]) bestIdx = i;
  return { x: simplex[bestIdx], fx: fvals[bestIdx], converged };
}

// ─── small stats helpers ────────────────────────────────────────────────────

function mean(a: ReadonlyArray<number>): number {
  if (!a.length) return 0;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function variance(a: ReadonlyArray<number>): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}

function median(a: ReadonlyArray<number>): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function lag1Autocorr(a: ReadonlyArray<number>): number {
  if (a.length < 3) return 0.5;
  const m = mean(a);
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) den += (a[i] - m) ** 2;
  for (let i = 1; i < a.length; i++) num += (a[i] - m) * (a[i - 1] - m);
  if (den <= 0) return 0.5;
  return num / den;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
