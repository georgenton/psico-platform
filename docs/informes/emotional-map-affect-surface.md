# Bitácora — Dinámica afectiva visible + siembra de datos para probar en real

**Rama:** `feature/emotional-map-affect-surface`
**Fecha:** 2026-07-09
**Objetivo:** dejar el Tier 2 (OU) **listo para probar con datos reales** — hacer visible su salida y poder sembrar historial de ánimo fechado.

## Contexto

Tras enchufar el OU al motor ([emotional-map-tier2-live.md](emotional-map-tier2-live.md)), quedaban dos huecos para "probar con datos reales":

1. La salida del OU solo mejoraba un número del eje Calma — **no se veía** la dinámica afectiva como tal.
2. El OU necesita observaciones **repartidas en días** (Δt irregular). Clickear el mood chip 40 veces hoy no sirve: todos los timestamps caerían en el mismo instante (Δt≈0) y el fit no identifica σ/θ.

## Qué se construyó

**1. Bloque "Dinámica afectiva" visible (web + mobile).**

- `@psico/types`: nuevo `EmotionalMapAffectDynamics` + `EmotionalMapResult.affectDynamics?`. Campos: `status` (`gathering`|`active`), `nObs`, `needed`, `confidence`, `baseline`, `recovery`, `stability`, `inertiaDays`.
- Backend: `computeAffectDynamics()` (reemplaza a `fitMoodDynamics`) siempre devuelve un bloque cuando el kill-switch está encendido — `gathering` con progreso hasta el piso de observaciones, luego `active` con los cuatro parámetros. Cuando `active`, sigue drivando el eje Calma con la estabilidad medida.
- Web: `MapAffectDynamics.tsx` en `/dashboard/mapa` — badge "Experimental", disclaimer no-diagnóstico, barra de progreso en `gathering`, 4 métricas (Tono base / Recuperación / Estabilidad / Inercia) + confianza en `active`.
- Mobile: bloque paridad en `app/(tabs)/mapa.tsx`.

**2. Script de siembra de historial real de ánimo.**

- `apps/api/scripts/seed-mood-history.mjs` — inserta `MoodLog` fechados en los últimos N días para una cuenta (por email), con patrón (`stable`/`volatile`/`improving`/`declining`), muestreo irregular (skip aleatorio de días + jitter horario), `--reset` opcional, y **bust del cache** de emotional-map si `REDIS_URL` está seteado.
- Solo escribe mood ordinal + `createdAt` — nunca texto (ADR 0007).

## Cómo probar con datos reales (ahora)

```bash
# En staging/prod, con DATABASE_URL (y REDIS_URL para refresco inmediato):
cd apps/api
node scripts/seed-mood-history.mjs --email=TU_EMAIL --days=90 --pattern=volatile --reset
# → abre /dashboard/mapa: el bloque "Dinámica afectiva" pasa a "active"
```

O de forma orgánica: registra tu ánimo a lo largo de varios días. Al cruzar ~8 registros repartidos, el bloque se enciende.

## Verificación

- API **740/741** (+2 tests: bloque active + gathering) · Web **259/259** (+3 MapAffectDynamics) · Mobile **43/43** · typecheck + lint verdes en los 3 workspaces · OpenAPI in sync.
- **Sin migración Prisma** (reusa `DiaryEntry` + `MoodLog`). El campo `affectDynamics` es opcional en el tipo → sin churn en fixtures.

## Privacidad (ADR 0007 intacto)

El bloque se calcula solo con mood ordinal + timestamps. El script siembra solo eso. Cero texto, cero exposición nueva.

## Deuda / siguiente

- Intervalos de incertidumbre (bootstrap) por parámetro, no solo confianza por `nObs`.
- Modelo v1 ordinal-latente (probit/logit).
- Arnés de simulación E1–E4 para el Paper 1.
- Serie temporal de los parámetros OU (evolución semana a semana) cuando haya snapshots.
