# Sprint V2 · Fase G — el V2 es el producto (retiro del layout legacy)

**Fecha:** 2026-07-11
**Rama:** `feature/emotional-map-fase-g-legacy-retirement`
**Cierra:** la fase de transición del programa V2 — los defaults se flipean, el layout legacy desaparece de los clientes, el copy-ratchet llega a **cero** y la serie de Evolución deja el `pct` global por una métrica defendible.

---

## 1. Defaults flipped — el contrato V2 ES lo que se sirve

- `EMOTIONAL_MAP_V2` default **on** · `EMOTIONAL_MAP_LEGACY_UI` default **off** (flags.ts, diff deliberado y reviewable como fue diseñado en Fase B).
- **Palanca de rollback:** `EMOTIONAL_MAP_V2=off` en Railway revive el scoring legacy (engagement→ejes, LLM scoring, pct con significado) — el path se conserva SOLO para eso, caracterizado por los specs pineados a ese env.
- Con los defaults, para cualquier usuario: el LLM jamás puntúa, conexión = resonancias confirmadas, propósito reúne datos, texto descriptivo-only, tendencia gated a n≥60, marker `v2` + momento/lenguaje/narrative en el wire.

## 2. Layout legacy borrado (no ocultado)

- **Web:** `MapStage.tsx` + `MapDims.tsx` (+ su test) eliminados; `mapa/page.tsx` renderiza la UI V2 sin branch; el mini-map de Inicio pierde el radar de 6 ejes + "% Comprensión emocional" y muestra el resumen compacto de autoinforme; `MapInfoButton` queda con el copy V2 único (prop `v2` eliminada).
- **Mobile:** la rama stage (dark card con pct) + lista de 6 dims desapareció de `mapa.tsx`; copy del sub y del modal V2-only; estilos huérfanos podados; `AXIS_ICONS` fuera.
- **Tolerancia al rollback:** los clientes renderizan la UI V2 siempre; ante un rollback de datos (`EMOTIONAL_MAP_V2=off`) las secciones V2 simplemente muestran sus estados vacíos honestos (momento ausente → invitación; self-report igual en ambos modos; lenguaje/narrative ocultos).

## 3. Copy-ratchet en CERO

`KNOWN_VIOLATIONS = {}` — los últimos términos pineados («comprensión emocional», «medido») vivían en las ramas legacy borradas. Desde este PR, **cualquier término prohibido en una superficie pública del mapa rompe el build**; no queda excusa legacy. `FILES` cubre los 11 componentes públicos vigentes (web + mobile).

## 4. Evolución — «Cobertura de tu mapa» en vez del pct

- **Schema:** `EmotionalMapSnapshot.coverage Float?` (migración aditiva `20260711180000_fase_g_snapshot_coverage`). El cron mensual escribe `pct` (histórico) **y** `coverage`.
- **Wire:** `EvolucionEmotionalSeriesPoint.coverage: number | null` (0–100); `pct` queda como campo legacy de compat.
- **Charts (web `EvoChart` + mobile `EvoChartMobile`):** trazan cobertura con el copy honesto — «La cobertura mide cuánta señal respalda tu mapa — cuánta información tienes, no cómo estás». Las filas pre-Fase-G (coverage null) se **saltan**, jamás se fabrican; con <2 puntos usables cae al fallback con la cobertura actual del mapa.
- Con esto, `pct` ya no tiene NINGÚN consumidor de UI — queda en el wire/tabla solo por blobs cacheados, historial y la palanca de rollback. Candidato a remoción total cuando esa ventana cierre.

## 5. Seed demo

Cuentas demo con ≥14 días confirman 2 resonancias curadas de la Parte I (upsert idempotente, metadata de catálogo) — bajo el V2 vigente, Conexión se enciende en las demos. **Re-correr `node scripts/seed-demo-users.mjs` en Railway post-deploy.**

## 6. Tests

- **service spec:** helper `pinLegacyMode()` — las suites que caracterizan el scoring legacy quedan pineadas a `EMOTIONAL_MAP_V2=off` explícito (documentan el rollback path, no los defaults). El describe de dual-run se reescribió para los defaults nuevos: defaults → marker + contrato V2 · `LEGACY_UI=on` → ventana dual-run · `V2=off` → rollback con propósito derivando de lectura otra vez.
- **v2-contract:** el pin de defaults se invirtió — `EMOTIONAL_MAP_V2` ON / `LEGACY_UI` OFF sin env.
- **Web:** EvoChart tests reescritos a cobertura (+1: salta filas pre-Fase-G y nunca renderiza los pct legacy); InicioV2 mini-map testea el resumen de autoinforme sin % global; `MapDims.test` eliminado con su componente.

## 7. Verificación

| Suite                    | Resultado                                         |
| ------------------------ | ------------------------------------------------- |
| API (Vitest)             | 820/821 (1 skipped sentinel)                      |
| Web (Vitest + RTL)       | 306/306 (MapDims.test retirado con su componente) |
| Mobile (Jest + RNTL)     | 70/70                                             |
| Typecheck + lint ×3      | ✅ (0 errores)                                    |
| OpenAPI `generate:check` | in sync                                           |

## 8. Cambio público (¡este PR SÍ cambia el producto!)

A diferencia de B–F (que prepararon todo detrás de flags), Fase G **enciende el V2 para todos**:

- El mapa muestra las secciones V2 (momento, autoinforme, dinámica, resonancias, lenguaje) — sin % global, sin radar de 6 ejes, sin "Medido".
- El LLM deja de puntuar ejes; conexión sale solo de resonancias confirmadas; propósito reúne datos hasta tener fuente legítima (Fase H).
- Evolución pasa de "Comprensión emocional" a "Cobertura de tu mapa".
- Rollback: `EMOTIONAL_MAP_V2=off` en Railway (datos) — la UI V2 se mantiene, con estados honestos.

## 9. Privacidad (ADR 0007)

Sin cambios de superficie: la fase borra código y flipea flags ya auditados. `coverage` es un float agregado (0–1) sin PII; las resonancias del seed son metadata de catálogo.

## 10. Deuda / siguiente

- **Ops:** aplicar migraciones acumuladas (`20260711120000`, `20260711140000`, `20260711180000`) + re-seed en Railway.
- **Fase H:** Eco contextual (scopes + citas + propuestas confirmables) + flujo de «temas importantes confirmados» → fuente de Propósito.
- Remoción total de `pct` del wire cuando cierre la ventana de rollback.
- Narrator sigue default off (`EMOTIONAL_MAP_NARRATOR`) — encenderlo es config + spot-checks.
