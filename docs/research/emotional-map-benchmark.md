# Banco de pruebas del Mapa Emocional — personas (Etapa 0, offline)

**Estado:** Resultados v0.1 · **Fecha:** 2026-07-09
**Fuente:** `apps/api/src/emotional-map/benchmark/` (personas + benchmark spec, determinista).
**Reproducir:** `pnpm --filter @psico/api test -- --run benchmark`

> Este es el **cimiento** del plan por etapas: un banco de personas sintéticas que corre el **motor real** del mapa (`scoreEmotionalMap`, extraído del servicio) **sin base de datos**, y responde: _"un usuario que se comporta como X durante N días → qué le muestra la app"_. Cada etapa futura se valida contra este banco.
>
> Privacidad (ADR 0007): solo ánimo ordinal + timestamps + conteos. Cero texto.

## Cómo funciona

- **10 personas**, cada una con: días activos, patrón de ánimo (estable / volátil / mejorando / declive / plano), cadencia (registros/semana) y engagement (bajo/medio/alto).
- El generador produce la **metadata exacta** que consume el scoring real (serie de ánimo, reflexiones, conteos de Eco/lectura/voz), de forma **determinista**.
- Se corre `scoreEmotionalMap` (el mismo código de producción) y se captura la salida.

## Resultados (captura real)

| Persona                   | Días | #ánimo | Dinámica      | Conf | Tono | Recup | Estab | Inercia | Cobertura | pct |
| ------------------------- | ---- | ------ | ------------- | ---- | ---- | ----- | ----- | ------- | --------- | --- |
| Nuevo · 3 días            | 3    | 2      | **gathering** | 0%   | —    | —     | —     | —       | 12%       | 57% |
| Semana · casual           | 7    | 4      | **gathering** | 0%   | —    | —     | —     | —       | 69%       | 58% |
| Dos semanas               | 14   | 10     | active        | 25%  | 75%  | 95%   | 0%    | 0.1d    | 72%       | 48% |
| Un mes · constante        | 30   | 21     | active        | 53%  | 71%  | 59%   | 28%   | 0.7d    | 77%       | 53% |
| Trimestre · disciplinado  | 90   | 77     | active        | 100% | 75%  | 79%   | 0%    | 0.3d    | 100%      | 59% |
| Un mes · volátil          | 30   | 26     | active        | 65%  | 45%  | 83%   | 0%    | 0.2d    | 87%       | 49% |
| Dos meses · recuperándose | 60   | 43     | active        | 100% | 46%  | 20%   | 46%   | 3.9d    | 96%       | 56% |
| Un mes · en declive       | 30   | 21     | active        | 53%  | 55%  | 42%   | 25%   | 1.4d    | 88%       | 55% |
| Dos meses · esporádico    | 60   | 9      | active        | 23%  | 72%  | 74%   | 13%   | 0.4d    | 20%       | 47% |
| Un mes · casi plano       | 30   | 21     | active        | 53%  | 50%  | 96%   | 100%  | 0.0d    | 83%       | 65% |

## Qué confirma (bueno)

1. **Gates funcionan y son honestos.** 3 días (2 registros) y 1 semana (4 registros) → **"reuniendo datos"**, no un número inventado. A partir de ~2 semanas / 10 registros el bloque se **activa** con confianza baja, y la confianza sube con la historia (mes 53% → trimestre 100%).
2. **La cobertura sigue al engagement.** Nuevo/bajo → 12%; disciplinado/alto → 100%. El esporádico (mucho tiempo, poca actividad) → 20%: correcto, tiene poco con qué.
3. **Patrones interpretables donde el modelo tiene datos:** "recuperándose" (mejorando) sale con **inercia alta (3.9d)** — el modelo ve una tendencia lenta; "casi plano" sale con **estabilidad 100%**; "volátil" con estabilidad 0% y tono más bajo (45%).

## Hallazgo importante (para la tesis) — por qué el modelo v1 importa

La **Estabilidad** sale **0%** en varias personas que llamamos "estables" (ej. trimestre disciplinado, dos semanas). ¿Por qué? Porque el patrón "estable" salta ±1 nivel entre registros (ok↔good↔great), y el **modelo v0 (aproximación numérica)** interpreta ese salto de categoría como **volatilidad real** (σ alto → estabilidad baja). Solo "casi plano" (ánimo idéntico siempre) llega a 100%.

Esto es exactamente el argumento a favor del **modelo v1 ordinal-latente** (Etapa 4): un salto de "good" a "great" **no** debería contar como una gran sacudida emocional — es ruido de medición de una escala de 5 niveles. El v1 (ordered probit/logit) trataría esos saltos como observación ruidosa de un estado latente suave, y la Estabilidad dejaría de castigar la cadencia normal.

**Conclusión de producto (Etapa 1):** hoy conviene **surfacer Tono base y Recuperación con más confianza que Estabilidad** con poca data, o subir el umbral de Estabilidad — porque con el v0 la Estabilidad es la más ruidosa. El banco lo demuestra con números.

## Para qué sirve este banco

- **QA/regresión:** cualquier cambio futuro al scoring se corre contra las 10 personas; si una persona "estable de 3 meses" deja de dar confianza alta, el test falla.
- **Validación por etapas:** cada etapa nueva (v1 ordinal, EWS, etc.) se compara aquí — ej. "con v1, la Estabilidad del trimestre estable debe subir de 0% a >50%".
- **Tesis:** tabla de demostración "persona × comportamiento → salida" lista para el paper.

## Pendiente (siguiente sabor)

- **Banco end-to-end real:** inyectar estas personas en una base de datos de prueba y llamar a la **API real** (prueba el pipeline completo: queries, cache, endpoints). El offline ya cubre la lógica; el E2E cubre la fontanería.
- Añadir persona "checkin diario" cuando exista la Etapa 2 (micro-checkins).
