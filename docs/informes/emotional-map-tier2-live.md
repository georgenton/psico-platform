# Bitácora — Mapa Emocional Tier 2 (OU) en vivo

**Rama:** `feature/emotional-map-tier2-live`
**Fecha:** 2026-07-08
**Consolida:** Fase A (#443) + track de investigación (#444) + **el OU enchufado al motor en vivo**.

## Qué se hizo

El usuario pidió que la capa de dinámica afectiva (OU / Tier 2) **no quede como prototipo aislado**, sino que se implemente directamente en la app, en producción, probándose. Esta rama lo hace, manteniendo las salvaguardas honestas.

**Integración (backend):**

- `EmotionalMapService.compute()` ahora, además de las señales de la Fase A, **ajusta un modelo Ornstein–Uhlenbeck** a la serie ordinal de ánimo del usuario (unión de `DiaryEntry.mood` + `MoodLog.mood`, ventana 180 días, solo `{mood, createdAt}` — nunca texto).
- Cuando el fit **converge** con suficientes puntos, el eje **Calma** deja de ser la impresión del LLM y pasa a ser la **estabilidad medida** (baja volatilidad σ → alta calma), vía `ouToAxes().stability`. La fuente que ve el usuario en el ℹ️ cambia a _"Volatilidad medida de tu ánimo (modelo de dinámica afectiva)"_.
- **Degradación honesta:** si el OU está deshabilitado, hay pocos puntos (`< MIN_OBS_FOR_FIT`), no converge, o la confianza (`nObs/40`) cae bajo el floor 0.15 → **cae al Tier 1** (Calma interpretativa de la Fase A). El usuario nunca ve un eje roto.
- **Kill-switch de producción:** `EMOTIONAL_MAP_OU=off` desactiva la capa sin redeploy. Encendido por defecto → **vivo y probándose**.
- **Observabilidad:** log por fit (`nObs`, `sigma`, `theta`, `calma`) para ver la capa corriendo en prod.

**Privacidad (ADR 0007 intacto):** el OU lee solo mood ordinal + timestamps — la misma metadata que ya ve el servidor para Tier 1/Patrones. **Cero exposición nueva.** El test `dynamics/privacy.spec.ts` impide que el módulo referencie texto.

## Por qué el eje Calma

Es el mapeo más limpio y defendible OU→producto: la **volatilidad emocional medida** es directamente el parámetro σ del OU. Los demás ejes (Conexión, Propósito, etc.) no tienen un correlato OU directo, así que se quedan con la lógica de la Fase A. Esto da una integración honesta y mínima: **un eje pasa de "impresión de IA" a "medida de un modelo de ecuaciones diferenciales"**, sin inflar el resto.

## Tests

- `emotional-map.service.spec.ts` +2: "drive Calma desde volatilidad con suficiente historial" (40 mood logs → OU, sources = "Volatilidad medida", value ≠ impresión LLM) y "kill-switch `EMOTIONAL_MAP_OU=off` → fallback Tier 1".
- Prototipo OU (`ou.spec.ts`, `privacy.spec.ts`) y validación sintética intactos.

## Verificación

- API **739/740** (1 skipped sentinel) · typecheck + lint verdes en API + web + mobile.
- Sin cambios de UI (el radar renderiza igual; Calma solo trae un número mejor fundamentado + su `sources` actualizado, visible en el ℹ️).
- **Sin migración Prisma** — reusa `DiaryEntry` + `MoodLog` existentes.

## Cómo se prueba en producción

1. Deploy a Railway (API). Con `EMOTIONAL_MAP_OU` sin setear o distinto de `off`, la capa está activa.
2. Una cuenta con ≥8 registros de ánimo en 180 días verá el eje Calma calculado por el OU (log del servidor lo confirma: `EmotionalMap OU · nObs=… · sigma=… · theta=… · calma=…`).
3. Si algo se comporta mal, `EMOTIONAL_MAP_OU=off` lo apaga al instante sin redeploy.

## Justificación para el paper

Esto habilita el claim de **"sistema desplegado"** del Paper 1: la dinámica afectiva OU no es solo simulación — corre en una app real, sobre metadata mínima, con degradación y kill-switch. La validación de método sigue siendo el estudio sintético (§9 del doc base); la producción aporta la contribución de sistema.

## Deuda / siguiente

- Surface explícito de los parámetros OU (baseline/recovery/volatility/inertia) como bloque "dinámica afectiva" en la UI (hoy solo alimenta Calma).
- Intervalos de incertidumbre (bootstrap) — el gate de confianza es por `nObs`, aún no por varianza del estimador.
- Modelo v1 ordinal-latente (probit/logit) — el v0 numérico es aproximación.
- Arnés de simulación E1–E4 para las tablas del Paper 1.
