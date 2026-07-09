# Paper 1 (methods) — Outline

**Estado:** Outline de trabajo (v0.1) · **Fecha:** 2026-07-08 · **Autor:** Jorge (+ Claude)
**Basado en:** [emotional-map-affect-dynamics.md](emotional-map-affect-dynamics.md) §9.
**Tipo:** paper de **métodos + validación sintética** (no requiere datos humanos → no requiere IRB para publicarse; el piloto empírico es el Paper 2).

> Objetivo de este paper: demostrar, **sin muestra grande real**, que se pueden estimar indicadores interpretables de dinámica afectiva (línea base, recuperación, volatilidad, inercia) a partir de registros de ánimo **ordinales, dispersos e irregulares**, con **incertidumbre explícita**, **degradación honesta** cuando faltan datos, y **preservando la privacidad** (el texto nunca sale del dispositivo / solo metadata mínima). La evidencia central es un **estudio de simulación** con recuperación de parámetros y comparación de modelos.

---

## 0. Metadatos

- **Título (EN):** _Privacy-Preserving Continuous-Time Affect Dynamics from Sparse Ordinal Mood Logs: A State-Space Approach with Synthetic Validation_
- **Título (ES):** _Dinámica afectiva de tiempo continuo preservadora de privacidad a partir de registros de ánimo ordinales y dispersos: un enfoque de espacio de estados con validación sintética_
- **Venues objetivo (en orden):** JMIR Mental Health · JMIR mHealth and uHealth · Journal of Affective Disorders (rama computacional) · workshops _ML for Health_ (NeurIPS/ICML) · conferencia LATAM de IA.
- **Encuadre:** IA aplicada + affective computing + privacy-preserving digital phenotyping. _(No "matemática inferencial dura" pura — decisión de posicionamiento a validar con el tutor.)_
- **Longitud objetivo:** 6–10 páginas + apéndice reproducible.

---

## 1. Abstract (esqueleto, 200–250 palabras)

Rellenar sobre esta plantilla:

> **Background.** Las apps de journaling recogen ánimo autoinformado, pero típicamente muestran un "ahora" estático; la dinámica afectiva (regulación, inercia) queda sin explotar. Los métodos existentes asumen EMA densa, texto en claro y muestras del Norte Global.
> **Objective.** Estimar indicadores interpretables de dinámica afectiva desde registros **ordinales, dispersos e irregulares**, con incertidumbre explícita y sin leer el texto privado del usuario.
> **Methods.** Modelamos el ánimo como estado latente continuo (Ornstein–Uhlenbeck) observado mediante categorías ordinales. Presentamos una aproximación práctica (v0) y una formulación latente-ordinal (v1). Estimamos parámetros por [MLE / bootstrap]. Validamos con un **estudio de simulación** que varía tamaño muestral, irregularidad, discretización ordinal y adherencia, comparando contra baselines discretos.
> **Results.** [Recuperación de μ/θ/σ con RMSE …; cobertura de intervalos …; sesgo de la aproximación v0 vs v1 …; umbrales de datos por debajo de los cuales degradar a heurística …].
> **Conclusions.** Es posible una capa de inferencia afectiva interpretable, preservadora de privacidad y honesta sobre la incertidumbre. No es diagnóstico; es autoconocimiento.

---

## 2. Contribuciones (3–4, concretas)

1. **Formulación latente-ordinal** de dinámica afectiva de tiempo continuo para datos **dispersos/irregulares**, distinguiendo aproximación práctica (v0) de modelo correcto (v1 con observación ordinal).
2. **Estudio de simulación** que caracteriza recuperación de parámetros, cobertura de incertidumbre y **sesgo por discretización ordinal**, y define **umbrales de suficiencia de datos** para degradar con honestidad.
3. **Comparación de modelos** contra baselines discretos (AR(1)) y contra el scoring lineal ingenuo — evitando el claim de que "tiempo continuo siempre gana".
4. **Arquitectura preservadora de privacidad** (motor que solo consume metadata mínima o corre on-device) + **contrato verificable** (test que impide el acceso a texto libre).

---

## 3. Related work (buckets, no exhaustivo)

- **Affect dynamics / OU en tiempo continuo:** Oravecz, Tuerlinckx & Vandekerckhove _[verificar]_.
- **Inercia emocional:** Kuppens et al. _[verificar]_.
- **Critical slowing down / EWS:** van de Leemput/Wichers/Scheffer (PNAS 2014); Smit et al. (2025); crítica "Illusions of Criticality".
- **Continuo vs discreto:** Loossens et al. (VAR(1) discreto competitivo) _[verificar]_.
- **Requisitos de tamaño muestral en dinámica afectiva:** Pirla et al. _[verificar]_.
- **Digital phenotyping / privacidad:** revisión sistemática JMIR 2025; preprints (marcar como no revisados).
- **Gap:** privacidad por diseño + ordinal disperso + LATAM/español (hipótesis a verificar con mini-revisión).

---

## 4. Métodos

### 4.1 Modelo de datos

Serie idiográfica `{(t_i, Y_i)}`, `Y_i ∈ {hard, low, ok, good, great}`, `Δt_i` irregular. Definir "no registró" ≠ "ánimo estable".

### 4.2 Modelo v0 (aproximación)

Mapeo `−1…1` → OU gaussiano con transición exacta del estado latente. Declarar explícitamente como aproximación.

### 4.3 Modelo v1 (latente + observación ordinal)

`dX = θ(μ−X)dt + σ dW`; `Y = k` si `τ_{k−1} < X + ε < τ_k`. Umbrales `τ`, ruido `ε`. Estimación: MLE con filtro/estado latente o Bayes (ordered probit/logit).

### 4.4 Estimación e incertidumbre

- v0: MLE de `(μ,θ,σ)` (optimización dependency-free, ya implementada).
- Incertidumbre: **bootstrap** (o profile-likelihood) → intervalos por parámetro.
- Optimización en `(μ, log θ, log σ)` para positividad; manejo de casos degenerados.

### 4.5 Gates de suficiencia de datos

Tabla conservadora (§7 del doc base): <10 solo heurística; 10–29 baseline conf. baja; 30–59 OU con intervalos amplios; 60+ θ/σ + EWS preliminar; 300+ EWS plausible.

### 4.6 Arquitectura preservadora de privacidad

Motor consume solo `{mood, tags, timestamps, counts}` **o** agregados on-device. Contrato verificable (test anti-texto). Diagrama de flujo de datos.

---

## 5. Experimentos (el corazón — estudio de simulación)

| ID     | Pregunta                                               | Diseño                                                     | Métrica                         |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------- |
| **E1** | ¿Recuperamos `μ,θ,σ` y cómo escala con `n`?            | Simular OU conocido; `n ∈ {10,20,30,60,100,300}`           | Sesgo + RMSE por parámetro      |
| **E2** | ¿Sobrevive al muestreo irregular?                      | Δt regular vs exponencial (gaps largos)                    | RMSE vs regularidad             |
| **E3** | ¿Cuánto sesga la discretización ordinal?               | Continuo real vs 5-niveles; **v0 vs v1**                   | Sesgo de `θ`/`σ` por modelo     |
| **E4** | ¿Gana OU a baselines?                                  | v0 lineal · OU gaussiano · OU ordinal · **AR(1) discreto** | RMSE + logLik out-of-sample     |
| **E5** | ¿Cuántos falsos positivos de EWS bajo estacionariedad? | Serie estacionaria (sin transición)                        | Tasa de falsos positivos de EWS |
| **E6** | ¿Robustez a baja adherencia?                           | Missingness 20/50/70%                                      | Degradación de recuperación     |

**Escenarios de sujeto** (para tablas/figuras): estable · volátil · recuperación rápida · recuperación lenta · pocos datos · datos irregulares · gaps largos · ánimo casi constante.

**Reproducibilidad:** simulador determinista con semilla (ya en repo: `synthetic.ts`). Publicar semillas + script.

---

## 6. Resultados planificados (figuras/tablas)

- **Fig 1** — diagrama de arquitectura privacy-preserving (flujo de datos, qué cruza la frontera del dispositivo).
- **Fig 2** — recuperación de parámetros vs `n` (E1), con bandas de incertidumbre.
- **Fig 3** — sesgo v0 vs v1 por discretización (E3).
- **Tabla 1** — comparación de modelos (E4): RMSE + logLik.
- **Tabla 2** — falsos positivos de EWS bajo el nulo (E5).
- **Fig 4** — ejemplo cualitativo: serie → radar con intervalos + estado "reuniendo datos".

---

## 7. Ética (Paper 1)

- **Sin datos humanos** en Paper 1 (solo simulación) → sin IRB para este manuscrito.
- Declarar el framing no-diagnóstico y la separación del flujo de crisis.
- Declarar la arquitectura de privacidad como parte del diseño, no un añadido.

---

## 8. Limitaciones (honestas)

Ordinal-como-continuo en v0; identificación pobre con pocos datos; EWS de sensibilidad limitada y sensible a Δt; OU no universalmente superior; simulación ≠ realidad (los usuarios reales pueden violar los supuestos OU); LATAM como hipótesis no probada aún.

---

## 9. Future work → Paper 2 (empírico)

Piloto idiográfico consentido (**requiere IRB/comité**): usuarios opt-in, texto nunca revisado por investigadores, micro-checkins, escalas validadas de bienestar, análisis por persona, reporte de incertidumbre, sin claims diagnósticos.

---

## 10. Mapeo a código existente (qué ya corre vs qué falta)

| Necesidad del paper                       | Estado                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| Estimador OU v0 (MLE)                     | ✅ `apps/api/src/emotional-map/dynamics/ou.ts`              |
| Generador sintético determinista          | ✅ `dynamics/synthetic.ts`                                  |
| Recuperación de parámetros (E1/E2)        | ✅ base en `ou.spec.ts` — falta el barrido `n` + tablas     |
| Contrato de privacidad                    | ✅ `dynamics/privacy.spec.ts`                               |
| Baseline AR(1) discreto (E4)              | ❌ por implementar                                          |
| Estimador OU ordinal v1 (E3/E4)           | ❌ por implementar (probit/logit)                           |
| Intervalos por bootstrap (§4.4)           | ❌ por implementar                                          |
| Arnés de falsos positivos EWS (E5)        | ❌ por implementar                                          |
| Script de experimentos + export de tablas | ❌ por implementar (fuera de la app; `scripts/` o notebook) |

---

## 11. Checklist de escritura (orden sugerido)

1. Fijar el claim principal en una frase (contribución #1).
2. Escribir **Métodos** (v0/v1 + estimación + privacidad) — es lo más estable.
3. Implementar el arnés de simulación E1–E4 (barrido `n`, irregular, ordinal, AR(1)) y generar tablas.
4. Escribir **Resultados** desde las tablas reales (no antes).
5. Mini-revisión bibliográfica para el gap LATAM.
6. **Verificar todas las citas `[verificar]`** (Oravecz, Kuppens, Pirla, Loossens, Bringmann).
7. Abstract + Intro al final.
8. Ethics + Limitations + Future work.
9. Apéndice reproducible (semillas + scripts).

---

## 12. Próxima decisión

Dos formas de avanzar, ambas sin construir las etapas 3–9:

- **A — Arnés de simulación (recomendado):** implementar E1–E4 en un `scripts/affect-dynamics-sim.mjs` (o notebook) que reusa `ou.ts` + `synthetic.ts`, añade el baseline AR(1) y emite las tablas del §6. Con eso tienes **resultados reales** para llenar el paper.
- **B — Redacción de Métodos:** escribir §4 completo del manuscrito primero (Markdown/LaTeX), y dejar los experimentos para después.

Recomiendo **A**: el simulador ya existe a medias, y un methods paper vive o muere por su estudio de simulación.
