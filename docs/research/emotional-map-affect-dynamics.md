# Fundamento científico del Mapa Emocional — dinámica afectiva, OU y señales tempranas

**Estado:** Propuesta de investigación (v0.1) · **Fecha:** 2026-07-08 · **Autor:** Jorge (+ Claude)
**Relación:** complementa [PRD-tendencias-mapa-emocional.md](../PRD-tendencias-mapa-emocional.md) (producto) y la Fase A del mapa ([informes/emotional-map-hybrid-phase-a.md](../informes/emotional-map-hybrid-phase-a.md)).
**Restricción dura:** cifrado E2E del Diario/Eco (ADR 0007) — el análisis nunca lee texto, solo metadata categórica y conteos.

> Este documento existe para dar al Mapa Emocional un fundamento científico defendible y para explorar una posible tesis de maestría / publicación. No es un plan de implementación de producto — eso lo derivamos después por niveles.

---

## 0. Resumen ejecutivo

- El marco correcto para "profesionalizar" el mapa **no** son los metaheurísticos bioinspirados como pieza central, sino la **dinámica afectiva**: modelar el ánimo como un sistema dinámico continuo con **ecuaciones diferenciales estocásticas (SDE)** y monitorear su **resiliencia** vía _critical slowing down_.
- Cada eje del radar puede dejar de ser una heurística y convertirse en un **parámetro estimado de un proceso de Ornstein–Uhlenbeck (OU)**: línea base `μ`, velocidad de regulación `θ`, volatilidad `σ`.
- La **novedad publicable** no es un algoritmo nuevo, sino la **combinación**: dinámica afectiva + señales tempranas **corriendo on-device / sobre metadata cifrada E2E**, en **población hispanohablante (Ecuador/LATAM)**, con datos **dispersos y categóricos**. Ese es el hueco en la literatura.
- Los **bioinspirados** entran como **capa secundaria de personalización/optimización** (selección de features, multiobjetivo bajo presupuesto de privacidad), no como el modelo. Enmarcados así, suman; como titular, restan.
- **Ética:** cualquier claim de "predicción de depresión" exige IRB/comité de ética y consentimiento informado. En producto el framing es _resiliencia / autoconocimiento_, nunca diagnóstico.

---

## 1. La realidad del dato (lo que sí tenemos)

Por ADR 0007, el servidor observa por usuario, sin texto:

| Señal                | Fuente                                     | Tipo                           | Frecuencia típica |
| -------------------- | ------------------------------------------ | ------------------------------ | ----------------- |
| Estado de ánimo      | `MoodLog`, `DiaryEntry.mood`               | Categórico ordinal (5 niveles) | Baja, irregular   |
| Etiquetas            | `DiaryEntry.tags`                          | Categórico multi               | Baja              |
| Timestamps           | Todas las tablas                           | Continuo                       | —                 |
| Conteos de actividad | Eco, voz, highlights, annotations, lectura | Conteo                         | Baja–media        |

**Caracterización formal:** serie de tiempo **idiográfica** (por-sujeto), **irregular** (Δt variable), **dispersa** y **categórica ordinal**. Esto descarta métodos que asumen muestreo denso y regular (p.ej. AR(1) discreto directo) y **favorece formulaciones tiempo-continuo** (el OU maneja Δt irregular de forma natural — es una fortaleza, no un parche).

Mapa ordinal → numérico usado en el prototipo: `great=1.0, good=0.5, ok=0.0, low=-0.5, hard=-1.0` (centrado en 0; monotónico; revisable con datos reales).

---

## 2. El marco: la emoción como sistema dinámico

### 2.1 Proceso de Ornstein–Uhlenbeck (OU) — el modelo base

El ánimo `X(t)` como proceso de reversión a la media:

```
dX(t) = θ · (μ − X(t)) dt + σ dW(t)
```

- `μ` — **atractor / línea base emocional** (a dónde vuelves).
- `θ > 0` — **velocidad de regulación** (qué tan rápido regresas a `μ` tras una perturbación).
- `σ` — **volatilidad / reactividad emocional**.
- `1/θ` — **inercia emocional** (tiempo de relajación). Alta inercia (autocorrelación alta) es un marcador establecido asociado a depresión y neuroticismo (Kuppens et al.).

**Solución de transición** (clave para muestreo irregular): dado `X(t)`, tras un intervalo `Δt`,

```
X(t+Δt) | X(t) ~ Normal( μ + (X(t) − μ)·e^(−θΔt),  (σ²/2θ)·(1 − e^(−2θΔt)) )
```

Esto da una **verosimilitud exacta** para observaciones espaciadas irregularmente → estimamos `(μ, θ, σ)` por **MLE** o **inferencia bayesiana en espacio de estados** (filtro de Kalman / partículas). _No_ se necesita un metaheurístico para esto: el problema es suave y de baja dimensión.

**Mapeo a ejes interpretables del radar:**

| Eje del mapa                              | Parámetro OU | Interpretación                |
| ----------------------------------------- | ------------ | ----------------------------- |
| Estabilidad / Calma                       | `σ` bajo     | Poca volatilidad              |
| Auto-regulación (≈ Compasión operacional) | `θ` alto     | Recuperación rápida           |
| Línea base                                | `μ`          | Tono emocional promedio       |
| Inercia                                   | `1/θ`        | Cuánto "se pegan" los estados |

### 2.2 Critical Slowing Down y señales tempranas (EWS) — la frontera

Cuando un sistema dinámico se acerca a una **bifurcación** (transición de un régimen "sano" a uno "depresivo"), pierde resiliencia: la recuperación tras perturbaciones se vuelve más lenta. Observables (van de Leemput, Wichers, Scheffer, PNAS 2014):

- ↑ **autocorrelación temporal** (lag-1),
- ↑ **varianza**,
- ↑ **correlación cruzada** entre emociones (en el caso multivariado).

Modelo mental: una bola en un **paisaje de potencial** `dx/dt = −dU/dx + ruido`. Un pozo profundo = régimen estable; conforme el pozo se aplana (bifurcación silla-nodo / catástrofe de cúspide de Zeeman), la bola vaga más y tarda en volver → EWS. Trabajo confirmatorio reciente replica el efecto idiográficamente (Smit et al., 2025).

**Para el producto** esto se traduce, con cuidado ético, en un **indicador de resiliencia** (no un diagnóstico): "tu sistema emocional se ve más frágil/estable esta semana".

### 2.3 Modelos de red (mlVAR / DSEM) — extensión multivariada

Emociones/estados como nodos de una red que se refuerzan; la **densidad de conexión** como marcador de (falta de) resiliencia (Bringmann). Requiere más señales simultáneas → relevante cuando sumemos micro-checkins con varios ítems.

---

## 3. Dónde entran (y dónde no) los algoritmos bioinspirados

**Principio:** GA, PSO, ACO, evolución diferencial, etc. son técnicas de **optimización**, no de **modelado**. Poner un GA a estimar `(μ, θ, σ)` cuando existe MLE/Kalman sería "algoritmo buscando problema" y un revisor lo cuestionaría.

**Roles legítimos y defendibles:**

1. **Selección personalizada de features/modelo bajo restricciones** — qué señales predicen transiciones _para este usuario_, con presupuesto de cómputo on-device. Selección evolutiva de subconjuntos es apropiada (espacio combinatorio, objetivo no diferenciable).
2. **Optimización multiobjetivo (NSGA-II)** — frontera de Pareto entre _precisión predictiva ↔ interpretabilidad ↔ presupuesto de privacidad (cuánta info agregada sale del dispositivo)_. Esto es genuinamente novedoso y conecta con tu maestría sin forzarlo.
3. **Ajuste de hiperparámetros on-device** — bajo restricción de batería/latencia.

Enmarcado como **capa de personalización/optimización** (Tier 4), es una contribución honesta. Como titular del paper, no.

---

## 4. Arquitectura por niveles (encaja con lo ya construido)

| Tier  | Qué es                                                               | Estado                 | Privacidad                       |
| ----- | -------------------------------------------------------------------- | ---------------------- | -------------------------------- |
| **1** | Heurística interpretable + LLM, con confianza honesta                | ✅ Fase A (shippeado)  | metadata server-side             |
| **2** | OU en espacio de estados por usuario → ejes = parámetros de una SDE  | 🧪 Prototipo (este PR) | metadata server-side u on-device |
| **3** | Monitor de resiliencia (EWS: autocorrelación + varianza móviles)     | Diseño                 | on-device o server-side          |
| **4** | Capa bioinspirada de personalización (NSGA-II / selección evolutiva) | Idea                   | on-device, sube solo config      |

El Tier 1 permanece como fallback cuando el Tier 2/3 no tiene datos suficientes (la confianza por dimensión de la Fase A es exactamente el gate).

---

## 5. El gap publicable (por qué esto es novedoso)

La literatura de affect dynamics usa mayoritariamente: **EMA densa** (6–10 pings/día por semanas), **texto en claro**, muestras **europeas/norteamericanas**. Nuestro caso es distinto en tres ejes simultáneos:

1. **Privacidad por diseño**: EWS/OU calculados **on-device o sobre metadata cifrada E2E**; el texto nunca sale del dispositivo.
2. **Contexto LATAM / español**: población ecuatoriana, poco representada.
3. **Dato disperso y categórico**: formulación tiempo-continuo robusta a muestreo irregular.

**Contribución = arquitectura + contexto + robustez al dato**, no un algoritmo nuevo. La literatura reciente confirma que la _privacy-preserving phenotyping_ es tema abierto y caliente (JMIR 2025).

---

## 6. Diseño de estudio y publicación

- **Paradigma:** **idiográfico (N=1 series de tiempo)** — dominante en el campo (Wichers publica con N=1). Alcanzable sin muestra grande.
- **Validación del método:** primero **datos sintéticos** (simular OU con `(μ,θ,σ)` conocidos, muestrear irregularmente, verificar recuperación de parámetros) → luego **piloto** con usuarios consentidos.
- **Papers realistas:**
  1. _System/methods_: "Arquitectura preservadora de privacidad para modelado on-device de dinámica afectiva" — pipeline E2E + EWS, validado en sintético + piloto.
  2. _Empírico_: OU/EWS idiográfico sobre la cohorte piloto.
- **Venues:** JMIR Mental Health, JMIR mHealth, Journal of Affective Disorders (rama computacional), workshops _ML for Health_ (NeurIPS/ICML), conferencias LATAM de IA.
- **Tesis:** el Tier 2 + Tier 3 (+ Tier 4 opcional) es material de tesis completo.

---

## 7. Ética y seguridad (no negociable)

1. **No es diagnóstico.** Producto: framing _resiliencia / autoconocimiento_. Nunca "tienes riesgo de depresión".
2. **IRB / comité de ética + consentimiento informado** antes de publicar con datos reales de usuarios.
3. **Detección de crisis** sigue siendo su propio flujo (regex + LLM en Eco, ADR 0007); el mapa **no** reemplaza esa capa de seguridad.
4. **Privacidad**: si el modelo necesita el texto, corre **on-device** (Fase B) y sube solo números; si solo necesita ánimo/tags/timestamps, puede correr server-side sobre la metadata que ya tenemos.

---

## 8. Riesgos y límites honestos

- **Dispersión de datos**: EWS necesita densidad de muestreo → **motiva científicamente la Fase C (micro-checkins validados, WHO-5 / auto-compasión)**. La ciencia justifica la feature, no al revés.
- **Estabilidad de estimación** con pocos puntos: `(μ,θ,σ)` mal identificados con <~10–15 observaciones → reportar **intervalos de confianza** y degradar a Tier 1 bajo el umbral (la confianza por dimensión ya existe).
- **Cuantización ordinal**: 5 niveles introducen ruido; considerar tratarlo como _ordinal probit_ en el espacio de estados en una iteración posterior.
- **Bifurcación ≠ siempre presente**: no todo empeoramiento es una transición crítica (crítica reciente: "Illusions of Criticality"); reportar EWS como _indicador_, con incertidumbre.

---

## 9. Próximos pasos concretos

1. **Tier 2 prototipo** (este PR): estimador OU dependency-free + generador sintético + tests de recuperación de parámetros. No wired al endpoint (flag/experimental).
2. **Tier 3 diseño**: EWS móviles (autocorrelación + varianza) sobre la serie de ánimo; definir ventana e indicador de resiliencia.
3. **Fase C**: micro-checkins validados para densidad de muestreo (habilita EWS y red).
4. **Protocolo de ética/IRB**: redactar consentimiento + protocolo idiográfico con la universidad.
5. **Paper 1 (methods)**: escribir con validación sintética + descripción de arquitectura.

---

## Fuentes

- van de Leemput et al. — [Critical slowing down as early warning for the onset and termination of depression (PNAS 2014)](https://www.pnas.org/doi/10.1073/pnas.1312114110)
- Wichers et al. — [Critical Slowing Down as a Personalized Early Warning Signal for Depression (Psychotherapy and Psychosomatics)](https://karger.com/pps/article/85/2/114/294376/Critical-Slowing-Down-as-a-Personalized-Early)
- Smit et al. (2025) — [Critical Slowing Down in Momentary Affect as Early Warning Signal of Impending Transitions in Depression](https://journals.sagepub.com/doi/10.1177/21677026241305136)
- [Early Warning Signals Based on Momentary Affect Dynamics can Expose Nearby Transitions in Depression (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7842626/)
- [Illusions of Criticality: Crises Without Tipping Points (arXiv, crítica metodológica)](https://arxiv.org/pdf/2412.01833)
- [Digital Journaling Enables Privacy-Preserving Behavioral Phenotyping (JMIR preprint 2025)](https://preprints.jmir.org/preprint/102783)
- [Key Features of Digital Phenotyping for Monitoring Mental Disorders: Systematic Review (JMIR 2025)](https://www.jmir.org/2025/1/e77331)
