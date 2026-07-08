# PRD: Tendencias semanales del Mapa Emocional

**Estado:** Borrador (v0.1) · **Fecha:** 2026-07-01 · **Autor:** Jorge
**Módulos afectados:** `emotional-map`, `mood`, `eco` · **Modelos:** `MoodLog`, `OnboardingMood`

> Nota: borrador de ejemplo. Los puntos marcados con **[Supuesto]** deben confirmarse con datos reales de producto.

## Problem Statement

Hoy el usuario de Psico Platform registra su estado emocional (`MoodLog`), pero ve principalmente el "ahora": un punto aislado en el tiempo. No tiene una lectura de **cómo evoluciona** a lo largo de los días. Sin esa vista, la psicoeducación pierde su mayor palanca —el autoconocimiento por patrón— y el mapa emocional se siente como un termómetro y no como un espejo. **[Supuesto]** El engagement con el mapa cae tras el registro porque no hay una recompensa de insight.

## Goals

1. Que el usuario **entienda su tendencia emocional semanal** de un vistazo (mejora percibida de autoconocimiento).
2. **Aumentar el registro recurrente** de estado de ánimo (más `MoodLog` por usuario/semana).
3. **Conectar la tendencia con contenido**: que la vista sugiera un capítulo/ejercicio o una conversación con Eco relevante al patrón detectado.
4. Elevar la retención semanal (W1→W4) de usuarios que ven sus tendencias vs. los que no.

## Non-Goals

1. **No** es diagnóstico clínico ni detección de crisis — eso requiere flujo, disclaimers y responsabilidad aparte. _(Fuera de alcance por seguridad/ética.)_
2. **No** incluye comparación social ni benchmarks contra otros usuarios. _(Riesgo para un producto de salud mental.)_
3. **No** cubre tendencias mensuales/anuales en v1 — primero validar la semanal. _(Fasear.)_
4. **No** exporta datos ni genera informes PDF en v1. _(Fast-follow.)_

## User Stories

- Como **usuario que registra su ánimo**, quiero ver mi tendencia de la semana para entender si voy mejor o peor sin tener que recordar cada día.
- Como **usuario**, quiero que la app me señale un patrón ("tus tardes suelen ser más bajas") para tomar consciencia de él.
- Como **usuario**, quiero que desde mi tendencia se me ofrezca un capítulo o hablar con Eco sobre ese patrón, para actuar y no solo observar.
- Como **usuario nuevo con pocos registros**, quiero ver un estado vacío alentador que me explique qué veré cuando registre más, para no sentir que la función está rota.

## Requirements

### Must-Have (P0)

- **Vista de tendencia semanal**: gráfico de los últimos 7 días del estado emocional agregado por día.
  - _Aceptación:_ Dado un usuario con ≥3 registros en la semana, cuando abre el mapa emocional, ve una línea/barras con los 7 días y su promedio.
- **Estado vacío / datos insuficientes**: mensaje claro cuando hay <3 registros.
  - _Aceptación:_ Dado <3 registros, cuando entra a la vista, ve un mensaje que explica qué falta y un CTA para registrar ánimo.
- **Resumen en lenguaje natural** de la semana (1-2 frases). **[Supuesto]** generado con el SDK de Anthropic ya integrado en `eco`.
  - _Aceptación:_ El resumen refleja la dirección real (mejora/empeora/estable) y nunca hace afirmaciones clínicas.
- **Endpoint de agregación** en el API (`emotional-map`) que devuelve la serie semanal por usuario.
  - _Aceptación:_ Consulta indexada por `userId` + rango de fecha; responde <300ms en p95. **[Supuesto de SLA]**

### Nice-to-Have (P1)

- Detección de un patrón simple ("días entre semana vs. fin de semana", "mañanas vs. tardes").
- CTA contextual: sugerir capítulo/ejercicio o iniciar hilo con Eco según el patrón.
- Racha de registro (streak) para reforzar el hábito.

### Future Considerations (P2)

- Tendencias mensuales y estacionales (diseñar el modelo de agregación pensando en esto desde ya).
- Correlación entre ánimo y actividad de lectura/ejercicios.
- Exportar/compartir con un terapeuta (enlaza con el módulo `terapia`).

## Success Metrics

**Leading (días–semanas)**

- Adopción: **[Supuesto]** ≥40% de usuarios activos abren la vista de tendencias en los primeros 30 días.
- Activación del hábito: aumento del promedio de `MoodLog`/usuario/semana (objetivo: **+25%**).
- CTR del CTA contextual hacia contenido o Eco.

**Lagging (semanas–meses)**

- Retención W4 de quienes usan tendencias vs. quienes no (objetivo: **+10 pts**).
- Cambio en satisfacción/NPS entre usuarios que ven insights.

## Open Questions

- **[Data]** ¿Cómo se cuantifica el estado emocional hoy en `MoodLog` (escala, categorías)? Define si el "promedio" tiene sentido o hay que usar otra agregación.
- **[Ética/Legal]** ¿Qué salvaguardas ante tendencias fuertemente negativas? ¿Deriva a recursos de ayuda? (Bloqueante para P0 del resumen con IA.)
- **[Eng]** ¿Se calcula en tiempo real o vía job de BullMQ que precomputa la semana? (Impacta el SLA del endpoint.)
- **[Diseño]** ¿Gráfico de línea, barras o "heatmap" emocional? Depende de la escala de `MoodLog`.

## Timeline Considerations

- Dependencia: confirmar el esquema de `MoodLog` antes de diseñar la agregación.
- Fase 1 (P0): vista semanal + estado vacío + endpoint + resumen IA con salvaguardas.
- Fase 2 (P1): detección de patrón + CTA contextual + streak.
