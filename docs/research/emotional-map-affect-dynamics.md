# Fundamento científico del Mapa Emocional — dinámica afectiva, OU, observación ordinal y señales de resiliencia

**Estado:** Propuesta de investigación (v0.2) · **Fecha:** 2026-07-08 · **Autor:** Jorge (+ Claude)
**Relación:** complementa [PRD-tendencias-mapa-emocional.md](../PRD-tendencias-mapa-emocional.md) (producto) y la Fase A del mapa ([informes/emotional-map-hybrid-phase-a.md](../informes/emotional-map-hybrid-phase-a.md)).
**Restricción dura (redacción precisa):** el **contenido textual** del Diario/Eco permanece **cifrado E2E** (ADR 0007). El análisis usa únicamente **metadata mínima autorizada** —mood categórico, tags categóricos, timestamps y conteos de actividad— **o** corre **on-device** y sube solo parámetros agregados. La metadata que el servidor observa **no** está cifrada E2E frente al servidor: está minimizada y consentida, no oculta.

> Este documento da al Mapa Emocional un fundamento científico defendible y explora una tesis de maestría / publicación. **No es un plan de implementación de producto**: las etapas avanzadas (§4) son un roadmap de madurez, no código a construir hoy.
>
> **Historial de revisión.** v0.2 incorpora una revisión crítica externa: separa el modelo v0 (aproximación numérica) del v1 (estado latente + observación ordinal), corrige la redacción de privacidad, endurece los umbrales de datos, añade humildad sobre las señales tempranas y una tabla de lenguaje seguro.

---

## 0. Resumen ejecutivo

- El marco correcto para "profesionalizar" el mapa **no** son los metaheurísticos bioinspirados como pieza central, sino la **dinámica afectiva idiográfica**: modelar el ánimo como un estado latente continuo con dinámica de **Ornstein–Uhlenbeck (OU)**, observado a través de **categorías ordinales ruidosas**.
- Los parámetros estimados —línea base `μ`, velocidad de recuperación `θ`, volatilidad `σ`, inercia `1/θ`— pueden alimentar ejes interpretables del radar, **siempre con intervalos de incertidumbre** y **degradación a heurística** cuando los datos sean escasos.
- **Distinción clave (corrección central):** la transición gaussiana del OU es exacta para el **estado latente continuo**, **no** para una observación ordinal de 5 niveles. El mapeo `hard…great → −1…1` es una **aproximación práctica v0**; el modelo formal v1 es **OU latente + capa de observación ordinal (ordered probit/logit)**.
- Las **señales tempranas de pérdida de resiliencia (EWS)** se exploran como **indicadores experimentales**, no como predicción clínica, y solo con suficiente densidad temporal (la evidencia muestra sensibilidad limitada).
- Los **bioinspirados** entran como **capa de optimización/personalización** (selección de features, multiobjetivo bajo presupuesto de privacidad), no como el modelo emocional.
- **Novedad publicable = combinación**, no algoritmo nuevo: dinámica afectiva de tiempo continuo + observación ordinal + datos dispersos/irregulares + privacidad por diseño (on-device / metadata mínima) + población hispanohablante LATAM. _(La baja representación LATAM es una hipótesis de gap a verificar con una revisión breve, no un claim demostrado.)_
- **Ética:** el producto **no diagnostica**. Framing = _resiliencia / autoconocimiento_. Cualquier claim clínico exige comité de ética/IRB y consentimiento informado.

---

## 1. La realidad del dato (lo que sí tenemos)

Por ADR 0007, el servidor observa por usuario, **sin texto**:

| Señal                | Fuente                                     | Tipo                               | Frecuencia típica |
| -------------------- | ------------------------------------------ | ---------------------------------- | ----------------- |
| Estado de ánimo      | `MoodLog`, `DiaryEntry.mood`               | Categórico **ordinal** (5 niveles) | Baja, irregular   |
| Etiquetas            | `DiaryEntry.tags`                          | Categórico multi                   | Baja              |
| Timestamps           | Todas las tablas                           | Continuo                           | —                 |
| Conteos de actividad | Eco, voz, highlights, annotations, lectura | Conteo                             | Baja–media        |

**Caracterización formal:** serie de tiempo **idiográfica** (por-sujeto), **irregular** (Δt variable), **dispersa** y **categórica ordinal**. Esto favorece formulaciones de tiempo continuo, pero **no las convierte automáticamente en ganadoras** (ver §2.4 sobre benchmarking).

**Mapeo ordinal → numérico (solo v0):** `great=1.0, good=0.5, ok=0.0, low=-0.5, hard=-1.0`. Es una aproximación práctica para el prototipo, **no** la formulación estadística final (ver §2.2).

---

## 2. El marco: la emoción como sistema dinámico

### 2.1 Proceso de Ornstein–Uhlenbeck (OU) — el estado latente

El ánimo latente `X(t)` como proceso de reversión a la media:

```
dX(t) = θ · (μ − X(t)) dt + σ dW(t)
```

- `μ` — **línea base / punto de retorno**.
- `θ > 0` — **velocidad de retorno / regulación estimada** (qué tan rápido vuelve a `μ`).
- `σ` — **volatilidad / reactividad**.
- `1/θ` — **inercia / tiempo de relajación**. La inercia emocional (resistencia de los estados al cambio) se ha asociado con malajuste, depresión y menor bienestar (Kuppens et al. — _[verificar cita]_).

**Transición del estado latente continuo** (base para muestreo irregular): dado `X(t)`, tras `Δt`,

```
X(t+Δt) | X(t) ~ Normal( μ + (X(t) − μ)·e^(−θΔt),  (σ²/2θ)·(1 − e^(−2θΔt)) )
```

Esta transición es **exacta para el estado latente continuo `X(t)`**. **No** es exacta para la categoría ordinal observada `Y(t)` (§2.2). El uso de OU de tiempo continuo para dinámica afectiva tiene respaldo (Oravecz, Tuerlinckx & Vandekerckhove propusieron modelos estocásticos tipo OU con parámetros interpretables como "home base", varianza y regulación, para mediciones en tiempos posiblemente irregulares — _[verificar cita]_).

**Mapeo a ejes interpretables (renombrado: sin "compasión" hasta validar con una escala):**

| Eje propuesto  | Parámetro                           | Comentario                            |
| -------------- | ----------------------------------- | ------------------------------------- |
| Tono emocional | `μ`                                 | Promedio latente                      |
| Volatilidad    | `σ`                                 | Reactividad / amplitud                |
| Recuperación   | `θ`                                 | Velocidad de retorno                  |
| Inercia        | `1/θ`                               | Persistencia del estado               |
| Confianza      | función de `n`, `Δt`, incertidumbre | **No** es parámetro OU, pero es clave |

### 2.2 Modelo v0 (aproximación) vs v1 (estado latente + observación ordinal)

**Modelo v0 — aproximación práctica (prototipo actual):**
`mood ordinal → número (−1…1) → OU gaussiano`. Útil para producto y prototipo. Debe declararse **explícitamente como aproximación**, no como modelo estadístico correcto.

**Modelo v1 — formulación académica (dirección formal):**

```
Estado latente:      dX(t) = θ(μ − X(t))dt + σ dW(t)
Observación ordinal: Y(t) = categoría k  si  τ[k−1] < X(t) + ε < τ[k]
```

donde `X(t)` es el ánimo latente continuo, `Y(t) ∈ {hard, low, ok, good, great}`, `τ` son umbrales ordinales y `ε` es ruido de medición. Esto es un **state-space con capa de observación ordinal (ordered probit/logit)** — el tratamiento correcto de datos Likert/EMA, porque tratarlos como continuos puede sesgar los parámetros dinámicos.

Frase de protección ante revisores: _"El prototipo usa una aproximación numérica ordinal (v0); la formulación completa modela el ánimo como estado latente continuo observado mediante categorías discretas (v1)."_

### 2.3 Critical Slowing Down y señales tempranas (EWS) — con humildad

Cerca de una **bifurcación** (transición hacia/desde un régimen depresivo), el sistema pierde resiliencia: la recuperación se hace más lenta. Observables (van de Leemput, Wichers, Scheffer, PNAS 2014): ↑ autocorrelación, ↑ varianza, ↑ correlación cruzada entre emociones.

**Humildad obligatoria (corrección):** la evidencia muestra **sensibilidad limitada**. Smit et al. (2025) usaron EMA 5×/día durante ~4 meses (~524 observaciones/persona) y las EWS precedieron recurrencia en **solo ~33%** de participantes en chequeos de robustez; los autores señalan la baja sensibilidad como reto clínico. Por tanto el paper y el producto deben decir:

> "EWS es un **indicador experimental de fragilidad/resiliencia**, no un predictor clínicamente confiable por sí solo."

**Cuidado técnico (corrección):** una **autocorrelación lag-1 cruda no funciona con Δt irregular** — mezcla la correlación con el tiempo entre observaciones (`lun 8am→lun 9am` no es comparable con `lun 8am→vie 11pm` aunque ambos sean "lag-1"). Opciones correctas: (1) estimar `θ` en **ventanas móviles** con OU/CT-AR; (2) **autocorrelación ajustada por Δt**; (3) ventanas por **tiempo calendario**, no por número de puntos; (4) separar "no registró" de "ánimo estable"; (5) reportar EWS solo con densidad suficiente.

### 2.4 OU no es automáticamente superior — hay que hacer benchmarking

El argumento de tiempo continuo (OU maneja `Δt` variable vía `e^{−θΔt}`) es correcto, pero **no implica superioridad automática**. Hay literatura donde un **VAR(1) discreto superó al OU** en la mayoría de series afectivas evaluadas, aun con intervalos desiguales (Loossens et al. — _[verificar cita]_). Redacción defendible: _"OU es una opción natural y elegante para muestreo irregular, pero debe compararse empíricamente contra baselines discretos simples (AR(1), media móvil)."_

### 2.5 Modelos de red (mlVAR / DSEM) — extensión multivariada

Emociones/estados como nodos de una red; la **densidad de conexión** como marcador de (falta de) resiliencia (Bringmann — _[verificar cita]_). Requiere varias señales simultáneas → relevante cuando existan micro-checkins multivariados (§4, etapa 6).

---

## 3. Dónde entran (y dónde no) los bioinspirados

**Principio:** GA, PSO, ACO, evolución diferencial, NSGA-II son técnicas de **optimización**, no de **modelado**. Estimar `(μ, θ, σ)` con un GA cuando existe MLE/Bayes/Kalman sería débil ante revisores.

**Roles legítimos:** (1) selección personalizada de features/modelo bajo restricciones; (2) **optimización multiobjetivo (NSGA-II)** — Pareto entre precisión ↔ interpretabilidad ↔ presupuesto de privacidad ↔ batería; (3) tuning on-device. Como **capa de personalización** (etapa 7), suma; como titular del paper, resta.

---

## 4. Roadmap de madurez científica del Mapa Emocional

El Mapa Emocional se concibe como una **arquitectura por etapas de madurez**, donde cada capa se activa según datos, privacidad, consentimiento e incertidumbre. **Esto es narrativa de roadmap, no código a construir hoy** — sólo las etapas 1–2 tienen implementación (Fase A + prototipo OU); el resto es dirección de investigación.

| Etapa | Qué es                                          | Estado real                    | Datos / activación                             |
| ----- | ----------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| **0** | Contrato de privacidad y datos                  | ✅ ADR 0007 + test de contrato | Define qué puede leer cada módulo              |
| **1** | Mapa interpretable (heurística + confianza)     | ✅ Fase A (en vivo)            | Siempre disponible (fallback)                  |
| **2** | OU v0 (aproximación ordinal-numérica)           | 🧪 Prototipo (este PR)         | Gates de §7; experimental tras flag            |
| **3** | OU latente + observación ordinal (probit/logit) | 📋 Diseño                      | Requiere capa de observación ordinal           |
| **4** | Inferencia bayesiana / filtro de partículas     | 📋 Idea                        | Incertidumbre + pocos datos + estados latentes |
| **5** | EWS / resiliencia (experimental)                | 📋 Diseño                      | Solo con densidad temporal suficiente          |
| **6** | DSEM / mlVAR / redes emocionales                | 📋 Idea                        | Requiere micro-checkins multivariados          |
| **7** | NSGA-II / bioinspirados (personalización)       | 📋 Idea                        | Requiere historial suficiente                  |
| **8** | Texto libre 100% **on-device**                  | 📋 Idea                        | Consentimiento; sube solo agregados            |
| **9** | Validación clínica/investigativa                | 📋 Investigación               | IRB + consentimiento + escalas validadas       |

**Regla de producto:** ninguna etapa avanzada se presenta como "no disponible" de forma fría; si falta densidad, el sistema degrada con elegancia a la etapa anterior con confianza honesta ("con más registros podremos estimar mejor tu recuperación emocional"). Los claims clínicos **nunca** son etapa de producto público — viven solo en la etapa 9 (investigación).

---

## 5. Privacidad — redacción precisa (corrección)

- El **texto** del Diario/Eco permanece **cifrado E2E**; el análisis **no** lo lee server-side.
- El análisis usa **metadata mínima autorizada** (mood, tags, timestamps, conteos) **o** corre **on-device** y sube solo parámetros agregados no reversibles.
- **No** afirmar que la metadata visible por el servidor está "cifrada E2E frente al servidor" — es minimizada/consentida, no oculta.
- El motor de dinámica afectiva **no** importa, lee, loguea ni envía a LLM campos de texto libre (`content`, `body`, `rawText`, `transcript`, `diaryText`, `ecoText`, `plaintext`, …). Hay un **test de contrato** que lo verifica (`dynamics/privacy.spec.ts`).

---

## 6. Lenguaje permitido vs prohibido (producto público)

| ✅ Permitido                                | ❌ Prohibido                         |
| ------------------------------------------- | ------------------------------------ |
| "variabilidad emocional"                    | "tienes depresión"                   |
| "recuperación emocional estimada más lenta" | "riesgo clínico"                     |
| "mayor inercia emocional"                   | "predicción diagnóstica"             |
| "tendencia reciente"                        | "alerta médica"                      |
| "confianza baja por pocos registros"        | "crisis detectada por el mapa"       |
| "indicador experimental de resiliencia"     | "diagnóstico psicológico automático" |

La detección de crisis sigue siendo **su propio flujo** (regex + LLM en Eco); el mapa **no** la reemplaza.

---

## 7. Gates de suficiencia de datos (conservadores — corrección)

Los umbrales de identificación de dinámica afectiva son **más altos** de lo que sugería la v0.1. La autocorrelación suele requerir >30 observaciones para precisión mínima, y la inercia >40 para potencia estadística de asociaciones de tamaño medio (Pirla et al. — _[verificar cita]_). Política propuesta:

| Datos por usuario | Qué mostrar                                               |
| ----------------- | --------------------------------------------------------- |
| < 10              | Solo Tier 1 / heurística                                  |
| 10–29             | `μ` aproximado + confianza **baja**                       |
| 30–59             | OU experimental, **intervalos amplios**                   |
| 60–99             | `θ`/`σ` más defendibles + EWS preliminar (si densidad OK) |
| 100–299           | Dinámica afectiva más seria, con incertidumbre            |
| 300+              | EWS metodológicamente plausible                           |

No son reglas universales, pero son más honestas que sugerir que ~15 puntos bastan para estimar bien regulación/inercia.

---

## 8. El gap publicable (hipótesis, no claim)

La literatura de affect dynamics usa mayoritariamente EMA densa, texto en claro y muestras europeas/norteamericanas. Nuestro caso difiere en tres ejes: **privacidad por diseño** (on-device / metadata mínima), **dato ordinal disperso e irregular**, y **población LATAM/español**.

**Hipótesis de gap** (a verificar con una mini-revisión sistemática antes de afirmarlo): baja representación de población hispanohablante/LATAM en estudios de dinámica afectiva con EMA y modelos de resiliencia.

---

## 9. Diseño de estudio y publicación

- **Paradigma:** idiográfico (N=1 series de tiempo), dominante en el campo. Alcanzable sin muestra grande.
- **Validación del método (primero):** simular OU con `(μ,θ,σ)` conocidos → timestamps irregulares realistas → discretizar a 5 categorías → missingness/baja adherencia → re-estimar con (a) scoring lineal v0, (b) OU continuo gaussiano, (c) OU ordinal probit, (d) AR(1) discreto baseline → medir error en `μ,θ,σ`, cobertura de intervalos, sensibilidad a pocos datos, falsos positivos de EWS.
- **Paper 1 (methods):** _"Privacy-preserving continuous-time affect dynamics from sparse ordinal mood logs: an on-device state-space approach."_ Realista: modelo OU latente con observación ordinal + timestamps irregulares + validación sintética + análisis de incertidumbre + arquitectura privacy-preserving + comparación vs heurística/media móvil/AR(1).
- **Paper 2 (empírico):** piloto idiográfico consentido (requiere ética/IRB).
- **Venues:** JMIR Mental Health / mHealth, Journal of Affective Disorders (computacional), workshops _ML for Health_, conferencias LATAM de IA.
- **Encuadre recomendado:** IA aplicada + affective computing + privacy-preserving digital phenotyping (no "matemática inferencial dura" pura). _Decisión de posicionamiento a validar con tu tutor._

---

## 10. Ética y seguridad (no negociable)

1. **No es diagnóstico.** Framing _resiliencia / autoconocimiento_.
2. **IRB / comité de ética + consentimiento informado** antes de publicar con datos reales.
3. **Detección de crisis** es su propio flujo; el mapa no lo reemplaza.
4. **Privacidad:** texto E2E; modelos sensibles on-device o sobre metadata mínima. Digital phenotyping enfatiza privacidad, consentimiento, transparencia, responsabilidad y sesgo como prioridades éticas centrales.

---

## 11. Riesgos y límites honestos

- **Ordinal tratado como continuo (v0):** sesga parámetros → corregir con v1 latente-ordinal para publicación.
- **Pocos datos:** identificación pobre → gates conservadores (§7) + degradación a Tier 1 + intervalos.
- **EWS:** sensibilidad limitada + lag-1 crudo inválido con Δt irregular → ventanas por tiempo + Δt-ajustado + marcarlo experimental.
- **OU vs discreto:** no asumir superioridad → benchmarking.
- **Bifurcación ≠ siempre presente:** crítica reciente ("Illusions of Criticality") advierte tipping points ilusorios → EWS como indicador con incertidumbre.
- **Sesgo de usuarios activos:** quien registra más no es representativo.
- **LATAM:** gap por verificar, no afirmar.

---

## 12. Próximos pasos concretos

1. **Doc (este PR):** corregido a v0.2 con separación v0/v1, privacidad precisa, gates conservadores, lenguaje seguro, roadmap de etapas.
2. **Código (este PR):** solo el **test de contrato de privacidad** del módulo `dynamics` (no lee texto libre). Prototipo OU v0 ya existe (experimental, no wired).
3. **Siguiente decisión:** endurecer el estimador (gates de confianza + incertidumbre/bootstrap) **o** empezar el outline del Paper 1 (methods) con la validación sintética de §9. Ambos sin construir las etapas 3–9 en código.
4. **Ética/IRB:** redactar consentimiento + protocolo idiográfico con la universidad antes de cualquier dato real.

---

## Fuentes

> Nota: las citas marcadas _[verificar cita]_ provienen de una revisión externa y deben confirmarse (autor, año, venue) antes de usarse en un manuscrito. Las que llevan URL fueron consultadas directamente.

**Verificadas (con URL):**

- van de Leemput et al. — [Critical slowing down as early warning for the onset and termination of depression (PNAS 2014)](https://www.pnas.org/doi/10.1073/pnas.1312114110)
- Wichers et al. — [Critical Slowing Down as a Personalized Early Warning Signal for Depression (Psychotherapy and Psychosomatics)](https://karger.com/pps/article/85/2/114/294376/Critical-Slowing-Down-as-a-Personalized-Early)
- Smit et al. (2025) — [Critical Slowing Down in Momentary Affect as Early Warning Signal of Impending Transitions in Depression](https://journals.sagepub.com/doi/10.1177/21677026241305136)
- [Early Warning Signals Based on Momentary Affect Dynamics can Expose Nearby Transitions in Depression (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7842626/)
- [Illusions of Criticality: Crises Without Tipping Points (arXiv, crítica metodológica)](https://arxiv.org/pdf/2412.01833)
- [Key Features of Digital Phenotyping for Monitoring Mental Disorders: Systematic Review (JMIR 2025)](https://www.jmir.org/2025/1/e77331)

**Por verificar (autor/año, sin confirmar):**

- Oravecz, Tuerlinckx & Vandekerckhove — modelos OU de tiempo continuo para dinámica afectiva. _[verificar cita]_
- Kuppens et al. — inercia emocional como marcador de malajuste/depresión. _[verificar cita]_
- Pirla et al. — requisitos de tamaño muestral para índices de dinámica afectiva (autocorrelación >30, inercia >40). _[verificar cita]_
- Loossens et al. — comparación OU continuo vs VAR(1) discreto en afecto. _[verificar cita]_
- Bringmann — modelos de red (mlVAR/DSEM) de emoción. _[verificar cita]_
- "Digital Journaling … Privacy-Preserving Behavioral Phenotyping" — **preprint JMIR no revisado por pares**; no citar como evidencia establecida hasta su publicación. _[verificar estado/fecha]_
