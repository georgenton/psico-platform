# Paper 1 — Resultados de la validación sintética

**Estado:** Resultados v0.1 · **Fecha:** 2026-07-09
**Fuente:** `apps/api/src/emotional-map/dynamics/simulation.spec.ts` (determinista, semillado).
**Reproducir:** `pnpm --filter @psico/api test -- --run dynamics/simulation`
**Parámetros verdaderos:** μ=0.2, θ=1.0/día, σ=0.6, dtMean=0.5 día, R réplicas por celda.

> Estos números alimentan §5–§6 del [outline del Paper 1](paper-1-methods-outline.md). Son de un **estudio de simulación** (sin datos humanos → sin IRB). La historia que cuentan es **honesta**: μ y σ se recuperan bien; **θ (recuperación) necesita muchos datos**; y OU **no** supera a un AR(1) discreto en predicción — exactamente lo que la revisión externa pidió no sobrevender.

---

## E1 — Recuperación de parámetros vs tamaño muestral (R=25)

RMSE por parámetro (verdad μ=0.2, θ=1.0, σ=0.6):

| n   | RMSE μ | RMSE θ   | RMSE σ |
| --- | ------ | -------- | ------ |
| 30  | 0.154  | **1.16** | 0.128  |
| 100 | 0.096  | 0.321    | 0.057  |
| 300 | 0.063  | 0.169    | 0.028  |

**Lectura:** μ y σ se identifican razonablemente incluso con n moderado. **θ es el parámetro difícil**: con n=30 su RMSE (1.16) es mayor que el valor verdadero (1.0) — esencialmente no identificado. Recién con n≥100 baja a ~0.32 y con n=300 a ~0.17. **Esto valida empíricamente los gates conservadores** del §7 del doc base (autocorrelación/inercia requieren ≳100 observaciones).

---

## E2 — Robustez al muestreo irregular (R=25, n=200)

| Muestreo                          | MAE(μ) |
| --------------------------------- | ------ |
| Regular (Δt fijo)                 | 0.045  |
| Irregular (Δt exponencial + gaps) | 0.062  |

**Lectura:** la formulación de tiempo continuo maneja el muestreo irregular con una degradación **pequeña** (0.045 → 0.062). Confirma que el OU es apropiado para el dato disperso/irregular real, sin colapsar con los gaps.

---

## E3 — Cobertura del intervalo de confianza bootstrap para μ (R=40, n=120, B=25, 90%)

| Métrica                          | Valor |
| -------------------------------- | ----- |
| Cobertura empírica (nominal 90%) | 0.78  |
| Ancho medio del IC               | 0.228 |

**Lectura:** el bootstrap paramétrico da una cobertura de **~78%** frente al 90% nominal — **sub-cobertura moderada**, típica del bootstrap con muestras pequeñas. Es un resultado honesto que se reporta como limitación: los intervalos son informativos pero **algo optimistas**; una calibración (más réplicas, bootstrap por bloques, o corrección BCa) es trabajo futuro.

---

## E4 — RMSE predictivo un-paso, OU vs AR(1) discreto (out-of-sample, R=20, n=200, split 80/20)

| Modelo                     | RMSE 1-paso (test) |
| -------------------------- | ------------------ |
| OU (tiempo continuo)       | 0.339              |
| AR(1) discreto (ignora Δt) | 0.339              |

**Lectura:** en predicción un-paso out-of-sample, OU y AR(1) son **prácticamente equivalentes** (idénticos a 3 decimales en este régimen). Esto **confirma el mensaje de la revisión externa** (Loossens et al.): OU es elegante y correcto para Δt irregular, pero **no** hay que venderlo como superior en predicción. Su valor está en los **parámetros interpretables** (μ/θ/σ/inercia), no en ganar un benchmark predictivo.

---

## Conclusiones para el paper

1. **μ y σ son estimables** con datos moderados; **θ exige n grande** → los gates de suficiencia son necesarios y ahora están justificados con números.
2. **Tiempo continuo maneja el dato irregular** con poca pérdida.
3. **Los intervalos bootstrap sub-cubren** un poco → reportar como limitación + calibrar (future work).
4. **OU ≈ AR(1) en predicción** → el aporte es interpretabilidad + privacidad + tiempo continuo, no superioridad predictiva.

## Pendiente (para robustecer antes de someter)

- E5: falsos positivos de EWS bajo estacionariedad (aún no en el arnés).
- E6: robustez a missingness 20/50/70%.
- Modelo v1 ordinal-latente (probit/logit) comparado contra v0 (E3 del outline).
- Calibración de los intervalos (BCa / bootstrap por bloques / más réplicas).
- Verificar las citas `[verificar]` del doc base.
