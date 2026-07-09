# Paper 1 — Methods (manuscript draft §4)

**Status:** Draft v0.1 · **Date:** 2026-07-09
**Companion docs:** [outline](paper-1-methods-outline.md) · [synthetic results](paper-1-results.md) · [scientific foundation](emotional-map-affect-dynamics.md)
**Language note:** written in English for the target venues (JMIR Mental Health / mHealth, Journal of Affective Disorders). A Spanish version for the thesis is a direct translation.
**Citation note:** references marked `[cite]` are placeholders to be resolved before submission (see the foundation doc's source list).

> This is submission-oriented prose for the Methods section. Equations are written
> in plain notation for portability; port to LaTeX at typesetting. Numbers in
> §4.7 are the real, reproducible outputs of the simulation harness
> (`apps/api/src/emotional-map/dynamics/simulation.spec.ts`).

---

## 4. Methods

### 4.1 Data and preprocessing

We consider an **idiographic** (single-subject) design in which each participant
contributes a time-ordered sequence of self-reported mood observations
`{(t_i, Y_i)}_{i=1..N}`, where `t_i` is a timestamp and `Y_i` is an **ordinal**
mood category drawn from a five-level scale (`hard < low < ok < good < great`).
Observations are **sparse** (typically fewer than one per day) and **irregularly
spaced** (the inter-observation interval `Δt_i = t_{i+1} − t_i` varies widely).
We treat "no entry" as missing data, explicitly distinct from a stable mood.

For the practical approximation (§4.3.1) we map the ordinal levels to a centred
numeric scale `hard=−1, low=−0.5, ok=0, good=0.5, great=1`, and express time in
days so that rate parameters are per-day. This numeric mapping is an
approximation and is **not** the final statistical treatment of the ordinal
observation (§4.3.2).

**Privacy constraint.** The system enforces end-to-end encryption of the free
text of diary entries and companion-chat messages; that content is never
available to the analysis. The affect-dynamics model consumes **only** the
ordinal mood value and its timestamp — minimal, non-textual metadata — and a
software contract (an automated test) prevents the estimator module from
referencing any free-text field.

### 4.2 Continuous-time affect-dynamics model

We model the latent affective state `X(t)` as an **Ornstein–Uhlenbeck (OU)**
process, a mean-reverting stochastic differential equation with a long history
in the affect-dynamics literature `[cite: Oravecz, Tuerlinckx & Vandekerckhove]`:

```
dX(t) = θ · (μ − X(t)) · dt + σ · dW(t),      θ > 0, σ > 0,
```

where `W(t)` is a standard Wiener process. The three parameters have direct
psychological interpretations:

- **μ** — the emotional baseline (home base / return point);
- **θ** — the mean-reversion rate, i.e. the speed of affective recovery toward
  baseline; its reciprocal `1/θ` is the relaxation time, or **emotional
  inertia**, a marker previously linked to maladjustment and depression
  `[cite: Kuppens et al.]`;
- **σ** — the volatility, i.e. the intensity of affective fluctuation.

A key property for our setting is that the OU process admits an **exact discrete
transition** for arbitrary time gaps. Conditional on `X(t)`, after an interval
`Δt`,

```
X(t+Δt) | X(t) ~ Normal( m, v ),
  m = μ + (X(t) − μ) · exp(−θ·Δt),
  v = (σ² / 2θ) · (1 − exp(−2θ·Δt)).
```

This transition is **exact for the latent continuous state** and accommodates
irregular sampling natively through `Δt`, which motivates its use over discrete
autoregressive models that assume a fixed sampling interval. We stress, however,
that this exactness holds for `X(t)`, **not** for the observed ordinal category
`Y(t)` (§4.3), and that continuous-time formulations are not universally superior
to discrete baselines `[cite: Loossens et al.]`; we therefore benchmark against a
discrete AR(1) baseline (§4.7).

### 4.3 Observation models

#### 4.3.1 Model v0 — numeric approximation (deployed prototype)

The deployed system uses a pragmatic approximation in which the numeric mood
value is treated as a direct, noisy observation of the latent state
(`Y_num(t) ≈ X(t)`), so that the Gaussian transition of §4.2 serves as the
likelihood. This yields a fast, dependency-light estimator suitable for a
production service, and is what we deploy behind a feature flag. We report it as
an **approximation**, not as a correct treatment of ordinal data.

#### 4.3.2 Model v1 — latent state with ordinal observation

For the statistically correct formulation we retain the latent OU dynamics and
add an **ordered-categorical observation layer** (ordered probit/logit):

```
Latent:       dX(t) = θ(μ − X(t)) dt + σ dW(t),
Observation:  Y(t) = k   iff   τ_{k−1} < X(t) + ε(t) < τ_k,
```

with ordered thresholds `τ_0 = −∞ < τ_1 < … < τ_{K−1} < τ_K = +∞` for the
`K = 5` categories, and measurement noise `ε(t)`. Treating Likert/EMA responses
as continuous can bias dynamic-parameter estimates `[cite]`; the latent-ordinal
model addresses this. Estimation of v1 uses a state-space likelihood (e.g. a
Kalman/particle filter over the latent state with the ordinal emission, or a
Bayesian formulation). Implementing and benchmarking v1 against v0 is part of
the evaluation (§4.7, forthcoming), and the deployed product uses v0 with
explicit uncertainty and graceful degradation (§4.5).

### 4.4 Parameter estimation and uncertainty

For v0 we estimate `(μ, θ, σ)` by **maximum likelihood**. To keep `θ` and `σ`
strictly positive, we optimise in the reparameterised space `(μ, log θ, log σ)`
and minimise the negative log-likelihood — the sum of the Gaussian transition
terms plus a stationary term for the first observation, `X(t_1) ~ Normal(μ,
σ²/2θ)`, which aids identifiability of `μ`. Optimisation uses a dependency-free
**Nelder–Mead simplex** with a deterministic initial guess derived from the
sample mean, sample variance, and a lag-1 autocorrelation estimate scaled by the
median `Δt`. Degenerate inputs (fewer than the minimum observation count,
zero-variance series, duplicate timestamps, extreme gaps) are handled explicitly
and cause the estimator to report non-convergence rather than fabricate a value.

We quantify uncertainty with a **parametric bootstrap**: given the fitted
parameters, we simulate `B` new OU paths at the participant's **actual observation
timestamps**, refit each, and take percentile intervals of the resulting
parameter distributions. This produces per-parameter confidence intervals whose
empirical coverage we characterise in §4.7.

### 4.5 Data-sufficiency gating and graceful degradation

Because dynamic parameters — particularly `θ` and the derived inertia — require
substantial data to identify `[cite: Pirla et al.]` (corroborated by our
simulation in §4.7), the system applies conservative **data-sufficiency gates**.
Below a minimum observation count the model is not fit and the interface shows an
honest "gathering data" state with progress toward the threshold; above it, the
estimate is surfaced with a confidence value that grows with sample size, and the
axis derived from the fit degrades to an interpretable rule-based fallback
whenever the fit does not converge or confidence is below a floor. No fabricated
value is ever displayed. Communication is strictly non-diagnostic: the outputs
are framed as indicators of variability, recovery, and inertia for
self-knowledge, and the system's separate crisis-detection pathway is unaffected.

### 4.6 Privacy-preserving deployment architecture

The estimator is deployed as an isolated module that accepts only reduced
metadata (ordinal mood, timestamps, and non-textual activity counts). It never
imports, reads, logs, or transmits free-text fields, a property enforced by an
automated contract test. Sensitive text remains end-to-end encrypted; only the
minimal authorised metadata reaches the server-side estimator, and any future
text-derived signals are specified to run on-device and upload aggregated
numeric summaries only. A kill switch disables the layer at runtime without a
redeploy. This design lets an interpretable affect-dynamics layer operate in a
real, privacy-preserving application rather than only in simulation.

### 4.7 Synthetic-validation design

Because a large real cohort is not required to validate the method, our primary
evaluation is a **simulation study** using a deterministic, seeded generator
(reproducible: same seed → same data). Ground-truth parameters are `μ=0.2`,
`θ=1.0/day`, `σ=0.6`, with mean spacing 0.5 day and `R` replications per cell.
Four experiments characterise the estimator:

- **E1 — Parameter recovery vs sample size.** Root-mean-square error (RMSE) of
  each parameter over `n ∈ {30, 100, 300}`. Result: `μ` and `σ` are recovered
  well even at moderate `n` (σ RMSE ≈ 0.13/0.06/0.03; μ RMSE ≈ 0.15/0.10/0.06),
  whereas **θ is poorly identified at small `n`** (RMSE 1.16 at n=30 — larger
  than the true value — falling to 0.32 at n=100 and 0.17 at n=300). This
  empirically justifies the conservative gates of §4.5.
- **E2 — Irregular sampling.** Mean absolute error of `μ` under regular versus
  exponentially-spaced (bursty) sampling. Result: only a small degradation
  (0.045 → 0.062), confirming the continuous-time model tolerates realistic
  irregular data.
- **E3 — Interval coverage.** Empirical coverage of the parametric-bootstrap 90%
  interval for `μ`. Result: **≈78%** empirical coverage against the 90% nominal
  level — a moderate under-coverage that we report as a limitation and address
  with calibration (e.g. BCa or block bootstrap) in future work.
- **E4 — Model comparison.** Out-of-sample one-step predictive RMSE of the OU
  model versus a discrete AR(1) baseline (80/20 temporal split). Result: the two
  are **essentially equivalent** (0.339 vs 0.339 in this regime), consistent with
  prior findings `[cite: Loossens et al.]`; the OU model's contribution is
  interpretable, dynamically-grounded parameters rather than predictive
  superiority.

Two further experiments are planned to complete the validation: **E5**, the
false-positive rate of early-warning-signal indicators under a stationary null
(no true transition), and **E6**, robustness of parameter recovery under
missingness of 20/50/70%. A direct v0-vs-v1 comparison (§4.3) will quantify the
bias introduced by the numeric approximation relative to the latent-ordinal
model.

---

## Notes for co-authors

- The numbers in §4.7 (E1–E4) are current and reproducible; **E5/E6 and v1 are
  not yet run** — do not report them until the harness is extended.
- Resolve all `[cite]` placeholders against the foundation doc's source list;
  several were surfaced by external review and need author/year verification.
- Keep the non-diagnostic framing throughout; the paper's contribution is
  methodological (privacy-preserving, sparse-ordinal, continuous-time), not
  clinical prediction.
