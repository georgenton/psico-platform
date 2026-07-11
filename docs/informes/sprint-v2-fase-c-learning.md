# Sprint V2 · Fase C — Aprendizaje ≠ Mapa Emocional (LearningDashboard)

**Fecha:** 2026-07-10
**Rama:** `feature/emotional-map-fase-c-learning`
**Decisión aplicada:** **L6** — con un ajuste sobre la recomendación original, documentado abajo.

---

## 1. Decisión L6: Evolución ES el LearningDashboard

La recomendación de Fase B decía "endpoint + página LearningDashboard propios". Al auditar el código para implementarla, apareció que **Mi Evolución ya es ese tablero en un 90 %**: `EvolucionStats` (reflexiones, capítulos, minutos, racha, días activos) + hitos + serie histórica, con página web, pantalla mobile y endpoint propios. Crear una segunda página "Aprendizaje" habría duplicado superficie y confundido al usuario con dos tableros casi idénticos.

**Resolución:** completar Evolución con los contadores que faltaban en vez de duplicar. El principio del V2 se cumple igual: la actividad de uso tiene su casa propia, y esa casa NO es el mapa.

## 2. Qué se construyó

### Backend

- **`EvolucionStats` +2 campos:** `conversacionesEco` (mensajes USER a Eco, all-time) y `marcasLectura` (highlights + annotations, all-time). En `@psico/types` + el twin del service. Sin migración (agregación pura); sin cambio OpenAPI (el endpoint no expone ese shape en Swagger).
- **Palanca `EMOTIONAL_MAP_V2` cableada en el scoring** (`emotionalMapV2?: boolean`, default false). Con el flag encendido:
  - `conexion`/`proposito` dejan de derivarse de lectura/Eco/highlights → confianza 0 ("Reuniendo datos" honesto hasta que existan resonancias confirmadas, Fase E). Sus `sources` cambian a copy de fuente explícita futura.
  - `voiceCount` sale de la confianza de claridad; `ecoDays` sale de compasión y consciencia.
  - **El payload del LLM no lleva contadores de actividad** — `stats` queda en `{entryCount, activeDays}`. Los campos de engagement pasaron a opcionales en `EmotionalMapMetadataPayload` y el prompt del `AnthropicProvider` los arma condicionalmente.
- El servicio pasa `emotionalMapV2: flagEnabled("EMOTIONAL_MAP_V2")`. **Default off = comportamiento público sin cambios de scoring.**

### UI (cambio público sin flag: la presentación)

- **Web `MapFeed`** — de chips de contadores bajo "Qué está alimentando tu mapa" a un puntero sereno: "Los conteos de lectura, escritura y de tus charlas con Eco viven ahora en Mi Evolución…" + link. La página del mapa ya no fetchea `/evolucion`.
- **Mobile mapa** — el card de feed (4 filas de contadores) se reemplaza por el mismo puntero; el CTA pasa a "Ver mi actividad en Evolución →". Se eliminó el fetch a `/evolucion` y el componente `FeedRow`.
- **Web `EvoQuarter` + mobile evolución** — dos filas nuevas: "N mensajes con Eco · conversaciones que iniciaste tú" y "N subrayados y notas · marcas que dejaste al leer".

### Ratchets

- **`copy-contract.spec.ts`** — snapshot 5 → 4 archivos: `MapFeed` desaparece (limpio); el mapa mobile pierde "minutos de lectura". Quedan: MapStage/MapDims/mapa mobile (% global + "Medido", Fase F) y las menciones benignas del modal de privacidad.
- **`emotional-map.v2-contract.spec.ts`** — 3 tests nuevos: (a) flag on ⇒ `+highlights/+mensajes/+minutos` no cambian ningún eje (la inversión prometida por la matriz), (b) flag on ⇒ el payload del provider es exactamente `{entryCount, activeDays}`, (c) el flag default es OFF. Las KNOWN VIOLATION 5.1/5.2/5.3 siguen pineadas para el default.

## 3. Verificación

| Suite                    | Resultado                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| API (Vitest)             | 800/801 (1 skipped sentinel) — +3 tests de palanca                     |
| Web (Vitest + RTL)       | 298/298 — MapFeed reescrito (−3), EvoQuarter +2, fixtures actualizados |
| Mobile (Jest + RNTL)     | 65/65                                                                  |
| Typecheck + lint ×3      | ✅ (7 warnings preexistentes API)                                      |
| OpenAPI `generate:check` | in sync (sin cambios de wire tipado)                                   |

## 4. Qué NO cambió

- **Sin migración Prisma, sin endpoint nuevo.** `EvolucionResponse` solo gana campos (backward-compatible).
- **El scoring por default sigue leyendo engagement** (violaciones 5.1 pineadas) — encender `EMOTIONAL_MAP_V2` es una decisión de producto por config. El modal ⓘ sigue describiendo las fuentes reales del cómputo actual (transparencia intacta).
- ADR 0007 intacto — solo counts y metadata.

## 5. Deuda / siguiente

- Encender `EMOTIONAL_MAP_V2` cuando el producto decida aceptar que conexión/propósito lean "Reuniendo datos" hasta la Fase E (resonancias).
- Fase D: Evidence Ledger + opt-in del análisis local (L4) + Narrator (L3).
- Fase F: % global + "Medido" + modal ⓘ V2 (últimas entradas del copy-contract).
- Labels "Este trimestre" en Evolución muestran cifras all-time (preexistente; alinear cuando el diseño V2 de Evolución llegue).
