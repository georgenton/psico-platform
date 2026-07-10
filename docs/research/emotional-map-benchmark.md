# Banco de pruebas del Mapa Emocional — personas (Etapa 0, offline)

**Estado:** Resultados v0.2 (tras Etapa 1) · **Fecha:** 2026-07-09
**Fuente:** `apps/api/src/emotional-map/benchmark/` (personas + benchmark spec, determinista).
**Reproducir:** `pnpm --filter @psico/api test -- --run benchmark`

> Este es el **cimiento** del plan por etapas: un banco de personas sintéticas que corre el **motor real** del mapa (`scoreEmotionalMap`, extraído del servicio) **sin base de datos**, y responde: _"un usuario que se comporta como X durante N días → qué le muestra la app"_. Cada etapa futura se valida contra este banco.
>
> Privacidad (ADR 0007): solo ánimo ordinal + timestamps + conteos. Cero texto.

## Cómo funciona

- **10 personas**, cada una con: días activos, patrón de ánimo (estable / volátil / mejorando / declive / plano), cadencia (registros/semana) y engagement (bajo/medio/alto).
- El generador produce la **metadata exacta** que consume el scoring real (serie de ánimo, reflexiones, conteos de Eco/lectura/voz), de forma **determinista**.
- Se corre `scoreEmotionalMap` (el mismo código de producción) y se captura la salida.

## Resultados (captura real — tras Etapa 1)

`recup` e `iner` en **gate** = "—" hasta 20 registros (θ necesita más historia).

| Persona                   | Días | #ánimo | Dinámica      | Conf | Tono | Recup | Estab | Inercia | Cobertura | pct |
| ------------------------- | ---- | ------ | ------------- | ---- | ---- | ----- | ----- | ------- | --------- | --- |
| Nuevo · 3 días            | 3    | 2      | **gathering** | 0%   | —    | —     | —     | —       | 12%       | 57% |
| Semana · casual           | 7    | 4      | **gathering** | 0%   | —    | —     | —     | —       | 69%       | 58% |
| Dos semanas               | 14   | 10     | active        | 25%  | 75%  | gate  | 54%   | gate    | 72%       | 57% |
| Un mes · constante        | 30   | 21     | active        | 53%  | 71%  | 59%   | 62%   | 0.7d    | 77%       | 59% |
| Trimestre · disciplinado  | 90   | 77     | active        | 100% | 75%  | 79%   | 64%   | 0.3d    | 100%      | 69% |
| Un mes · volátil          | 30   | 26     | active        | 65%  | 45%  | 83%   | 0%    | 0.2d    | 87%       | 49% |
| Dos meses · recuperándose | 60   | 43     | active        | 100% | 46%  | 20%   | 0%    | 3.9d    | 96%       | 48% |
| Un mes · en declive       | 30   | 21     | active        | 53%  | 55%  | 42%   | 14%   | 1.4d    | 88%       | 53% |
| Dos meses · esporádico    | 60   | 9      | active        | 23%  | 72%  | gate  | 81%   | gate    | 20%       | 64% |
| Un mes · casi plano       | 30   | 21     | active        | 53%  | 50%  | 96%   | 100%  | 0.0d    | 83%       | 65% |

## Qué confirma (bueno)

1. **Gates funcionan y son honestos.** 3 días (2 registros) y 1 semana (4 registros) → **"reuniendo datos"**, no un número inventado. A partir de ~2 semanas / 10 registros el bloque se **activa** con confianza baja, y la confianza sube con la historia (mes 53% → trimestre 100%).
2. **La cobertura sigue al engagement.** Nuevo/bajo → 12%; disciplinado/alto → 100%. El esporádico (mucho tiempo, poca actividad) → 20%: correcto, tiene poco con qué.
3. **Patrones interpretables donde el modelo tiene datos:** "recuperándose" (mejorando) sale con **inercia alta (3.9d)** — el modelo ve una tendencia lenta; "casi plano" sale con **estabilidad 100%**; "volátil" con estabilidad 0% y tono más bajo (45%).

## Hallazgo de la Etapa 0 (para la tesis) — por qué el modelo v1 importa

En la captura v0.1, la **Estabilidad** salía **0%** en varias personas "estables" (trimestre disciplinado, dos semanas). ¿Por qué? Porque el patrón "estable" salta ±1 nivel entre registros (ok↔good↔great), y el **modelo v0** interpretaba ese salto de categoría como **volatilidad real** (basaba la estabilidad en la σ de difusión cruda). Solo "casi plano" (ánimo idéntico siempre) llegaba a 100%.

## Etapa 1 — corrección aplicada (ejes confiables primero)

Dos cambios, validados contra este banco:

**1. Estabilidad desde la dispersión estacionaria con piso de ruido de medición.** Ahora la estabilidad se calcula sobre `σ_stat = √(σ²/2θ)` (cuánto se aleja realmente el ánimo de su base a largo plazo) menos un piso de ruido ordinal — un salto ok↔good deja de contar como sacudida. Resultado antes→después:

| Persona           | Estab v0 | Estab v1 |
| ----------------- | -------- | -------- |
| Dos semanas       | 0%       | **54%**  |
| Un mes constante  | 28%      | **62%**  |
| Trimestre estable | 0%       | **64%**  |
| Un mes volátil    | 0%       | 0% ✓     |
| Casi plano        | 100%     | 100% ✓   |

Las personas estables ahora leen estables; el ancla volátil (0%) y el ancla plana (100%) se preservan. La separación estable↔volátil es real y la demuestra el banco.

**2. Gating por eje.** Tono base y Estabilidad se muestran desde ~8 registros (μ y σ_stat convergen rápido). **Recuperación e Inercia** (derivadas de θ, que tiene sesgo severo en series cortas) quedan en gate hasta 20 registros — la UI muestra "Reuniendo datos · ~N más" en vez de un número poco fiable.

**Límite honesto (motiva Etapa 4).** Las personas con **tendencia** (recuperándose, en declive) leen estabilidad baja (0–14%), porque el modelo OU asume estacionariedad y trata una tendencia como varianza alta alrededor de una media fija. La estabilidad no está "mal" — su ánimo sí recorre un rango amplio — pero un modelo **ordinal-latente con componente de tendencia** (Etapa 4) separaría "me estoy moviendo hacia arriba" de "reboto sin rumbo". Ese es el próximo salto de calidad, y el banco ya tiene la métrica para medirlo.

## Para qué sirve este banco

- **QA/regresión:** cualquier cambio futuro al scoring se corre contra las 10 personas; si una persona "estable de 3 meses" deja de dar confianza alta, el test falla.
- **Validación por etapas:** cada etapa nueva (v1 ordinal, EWS, etc.) se compara aquí — ej. "con v1, la Estabilidad del trimestre estable debe subir de 0% a >50%".
- **Tesis:** tabla de demostración "persona × comportamiento → salida" lista para el paper.

## Pendiente (siguiente sabor)

- **Banco end-to-end real:** inyectar estas personas en una base de datos de prueba y llamar a la **API real** (prueba el pipeline completo: queries, cache, endpoints). El offline ya cubre la lógica; el E2E cubre la fontanería.
- ~~Añadir persona "checkin diario" cuando exista la Etapa 2 (micro-checkins).~~ ✅ Hecho — `checkin-3sem` valida los ejes medidos de la Etapa 2.

## Etapa 4 — modelo v1 ordinal-latente con componente de tendencia (aplicado)

El límite honesto de la Etapa 1 queda cerrado. El modelo v1 descompone el ánimo latente en `x(t) = a + b·t + z(t)`: una **tendencia lineal** (la dirección de la temporada) más un **OU de media cero** (la dinámica día a día alrededor de ese camino). La tendencia solo se acepta cuando es estadísticamente significativa (|t-stat| ≥ 2 del slope OLS) **y** prácticamente relevante (≥ 1 nivel ordinal de movimiento total en la ventana) — las personas estacionarias caen al fit v0 sin cambios.

Consecuencias (validadas contra el banco, `benchmark.spec.ts`):

| Persona                | Estab. Etapa 1 | Estab. v1    | Tono v1                       | Tendencia             |
| ---------------------- | -------------- | ------------ | ----------------------------- | --------------------- |
| Recuperándose (2 m)    | ~0%            | **80%**      | **98%** (nivel actual)        | **up**                |
| En declive (1 mes)     | bajo           | **59%**      | **19%** (honesto: está abajo) | **down**              |
| Volátil (1 mes)        | 0%             | 0% ✓         | 45%                           | — (rebota, no tiende) |
| Estables (14d/30d/90d) | 54/62/64%      | sin cambio ✓ | sin cambio                    | —                     |
| Casi plano             | 100%           | 100% ✓       | 50%                           | —                     |

Dos ganancias humanas concretas:

1. **La estabilidad se mide sobre tu camino.** "Voy mejorando" ya no lee como "soy inestable" — la estabilidad usa los residuos detrendados. La persona recuperándose pasa de ~0% a 80%.
2. **El tono refleja dónde estás, no tu promedio.** Para una persona en recuperación de 2 meses, el promedio de ventana diluía su presente (~50%); el v1 reporta el nivel actual de la tendencia (98%). Igual de honesto hacia abajo: el declive lee 19%.

En la UI (web + mobile), la dirección lidera el titular («Vas en buena dirección: tu ánimo viene subiendo estas semanas») con una nota que explica que subir/bajar no cuenta como inestabilidad. El wire expone `affectDynamics.trend: "up" | "down" | null`.

Pendiente para la investigación (Etapa R): el probit ordinal completo con umbrales estimados — el v1 aproxima la medición ordinal con el piso de ruido de la Etapa 1 + la descomposición de tendencia, que es lo que el banco demandaba.

## Etapa 3 — intervalos ± (bootstrap) surfaceados (aplicado)

`bootstrapAxesCI` mapea cada réplica bootstrap por `ouToAxes` antes de tomar percentiles (correcto para la estabilidad, que depende de σ y θ conjuntamente) y corre sobre la misma serie que usó el fit (residuos detrendados cuando el v1 aceptó tendencia; el ± del tono con tendencia sale del SE de predicción OLS). Los chips de la UI leen «72% ±8».

Comportamiento validado contra el banco (half-widths 90%):

| Persona                  | Tono ±      | Estabilidad ±                |
| ------------------------ | ----------- | ---------------------------- |
| Dos semanas (n=10)       | ±11         | **±38**                      |
| Un mes constante (n=21)  | ±7          | ±25                          |
| Trimestre (n=77)         | ±5          | **±20**                      |
| Casi plano               | ±0          | ±0 (certeza real)            |
| Volátil                  | ±16         | ±2 (confiadamente inestable) |
| Recuperándose (trend up) | ±9 (SE OLS) | ±20                          |

La historia de honestidad en una línea: **más registros → intervalos más angostos**, y el banco lo garantiza por regresión (`benchmark.spec.ts` §Etapa 3). Con esto las Etapas 0–4 del roadmap v1 quedan completas; siguen 5 (EWS) y 6 (on-device) como investigación.

## Etapa 5 — EWS / resiliencia (critical slowing down) (aplicado)

Detector en `dynamics/ews.ts`: autocorrelación lag-1 + varianza sobre ventanas rodantes (50%) de la serie detrendada, tendencia por Kendall τ, dispara solo si **ambas** suben con τ ≥ 0.65. Gate honesto a **≥60 registros** (los gates de suficiencia del paper). Calibrado con el experimento E5: **6.0% de falsos positivos** bajo el nulo estacionario, sensibilidad ~40% bajo colapso de θ (limitación conocida de los EWS, declarada).

Persona nueva en el banco: **`senal-temprana`** (90 días: mitad estable, mitad caminata persistente que se amplifica — la firma del critical slowing down). Resultados:

| Persona                | n   | EWS          | τ_AC / τ_var  |
| ---------------------- | --- | ------------ | ------------- |
| Señal temprana (90d)   | 90  | **rising**   | 0.87 / 0.84   |
| Trimestre disciplinado | 77  | steady       | −0.83 / −0.51 |
| Todos con n < 60       | —   | insufficient | —             |

En el producto, `affectDynamics.ews` alimenta una **nota de autocuidado no-diagnóstica** (web + mobile) que solo aparece con la señal en subida: una invitación amable, nunca una alarma. El flujo de crisis existente queda intacto y separado.
