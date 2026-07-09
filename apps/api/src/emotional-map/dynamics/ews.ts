/**
 * Early-warning signals (EWS) via critical slowing down — Etapa 5.
 *
 * A dynamical system losing resilience (approaching a transition) recovers
 * more slowly from perturbations. In a mood series that shows up as RISING
 * lag-1 autocorrelation and RISING variance over time (van de Leemput et al.
 * 2014, PNAS). We compute both metrics over rolling windows and test for a
 * monotone upward trend with Kendall's τ; the signal fires only when BOTH
 * trends exceed the threshold — the conservative reading.
 *
 * Honesty gates (paper §4.5): below EWS_MIN_OBS observations the answer is
 * "insufficient", full stop — EWS from short series is noise. The false-alarm
 * rate under stationarity is characterised by experiment E5 in
 * simulation.spec.ts (Tabla 2 of Paper 1), which calibrates EWS_TAU_THRESHOLD.
 *
 * NEVER a diagnosis. The product surfaces this only as a kind self-care
 * nudge; the detector itself is shared with the research harness.
 *
 * Privacy (ADR 0007): consumes only the numeric mood series + timestamps.
 */

import type { OuObservation } from "./ou";

export interface EwsResult {
  status: "insufficient" | "steady" | "rising";
  /** Kendall τ of the rolling lag-1 autocorrelation vs time. */
  tauAc: number | null;
  /** Kendall τ of the rolling variance vs time. */
  tauVar: number | null;
  nObs: number;
  /** Observations required before the signal can be computed at all. */
  needed: number;
  /** Rolling windows the trend statistics were computed over. */
  windows: number;
}

/**
 * Observation floor for EWS — matches the paper's data-sufficiency gates
 * ("60+ → EWS preliminar"). Below this the detector refuses to answer.
 */
export const EWS_MIN_OBS = 60;
/**
 * Kendall τ both rolling metrics must exceed to flag "rising". Calibrated on
 * the E5/E5b grid (simulation.spec.ts, R=150 null / R=60 θ-ramp, n=100):
 *
 *   τ≥0.50 → FP 12.7% · sens 65%      τ≥0.65 → FP 6.0% · sens 40%  ← chosen
 *   τ≥0.60 → FP  8.7% · sens 50%      τ≥0.70 → FP 5.3% · sens 35%
 *
 * For a self-care nudge the false alarm is the costly error, so we sit on the
 * conservative shoulder and accept limited sensitivity — a known EWS
 * limitation (paper §8) that we state rather than hide.
 */
export const EWS_TAU_THRESHOLD = 0.65;

/** Rolling-window fraction of the series (standard 50% in the EWS literature). */
const WINDOW_FRAC = 0.5;

/**
 * Compute the EWS trend statistics on a mood series. Pass the DETRENDED
 * series when a v1 trend was accepted — a level trend would otherwise inflate
 * both rolling metrics and fake a warning.
 */
export function computeEws(obs: ReadonlyArray<OuObservation>): EwsResult {
  const sorted = [...obs].sort((a, b) => a.t - b.t);
  const n = sorted.length;
  const insufficient: EwsResult = {
    status: "insufficient",
    tauAc: null,
    tauVar: null,
    nObs: n,
    needed: EWS_MIN_OBS,
    windows: 0,
  };
  if (n < EWS_MIN_OBS) return insufficient;

  const xs = sorted.map((o) => o.x);
  const w = Math.max(20, Math.floor(n * WINDOW_FRAC));
  const k = n - w + 1;
  if (k < 10) return insufficient;

  const acSeries: number[] = [];
  const varSeries: number[] = [];
  for (let start = 0; start < k; start++) {
    const win = xs.slice(start, start + w);
    varSeries.push(variance(win));
    acSeries.push(lag1(win));
  }

  const tauAc = kendallTau(acSeries);
  const tauVar = kendallTau(varSeries);
  const rising = tauAc >= EWS_TAU_THRESHOLD && tauVar >= EWS_TAU_THRESHOLD;

  return {
    status: rising ? "rising" : "steady",
    tauAc: round2(tauAc),
    tauVar: round2(tauVar),
    nObs: n,
    needed: EWS_MIN_OBS,
    windows: k,
  };
}

/**
 * Kendall τ of a metric series against its (implicit) time index — the
 * standard EWS trend statistic: +1 = strictly rising, −1 = strictly falling.
 */
export function kendallTau(series: ReadonlyArray<number>): number {
  const n = series.length;
  if (n < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = series[j] - series[i];
      if (d > 0) concordant++;
      else if (d < 0) discordant++;
      // ties contribute to neither
    }
  }
  const pairs = (n * (n - 1)) / 2;
  return pairs > 0 ? (concordant - discordant) / pairs : 0;
}

// ─── window stats ────────────────────────────────────────────────────────────

function variance(a: ReadonlyArray<number>): number {
  if (a.length < 2) return 0;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}

function lag1(a: ReadonlyArray<number>): number {
  if (a.length < 3) return 0;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) den += (a[i] - m) ** 2;
  for (let i = 1; i < a.length; i++) num += (a[i] - m) * (a[i - 1] - m);
  return den > 0 ? num / den : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
