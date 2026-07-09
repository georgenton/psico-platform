# Bitácora — Mapa Emocional · Híbrido Fase A (honestidad + señales ricas + transparencia)

**Rama:** `feature/emotional-map-hybrid-phase-a`
**Fecha:** 2026-07-08
**Alcance:** backend (scoring rework) + web + mobile + tests. Sin migración Prisma, sin nuevos endpoints, sin tocar el cifrado E2E.

## Problema

El usuario probó el Mapa Emocional con **1 reflexión + 3 conversaciones simples con Eco** y obtuvo un radar casi todo al 50 %. Preguntó, textual:

- ¿Cómo lo mides?
- ¿Debería el usuario ver cómo se va llenando + un botón ⓘ con más info?
- ¿No está muy simple con estos datos? ¿Podemos hacerlo más completo (reflexiones + Eco + consumo de contenido)?
- ¿Cómo vas a leer el diario si está cifrado?

Diagnóstico: con <3 entradas, 4 de los 6 ejes devolvían un **NEUTRAL 0.5 fabricado**; Eco, voz y lectura no se usaban en el scoring; y el cifrado E2E impide leer el texto. El usuario eligió la dirección **"Híbrido: on-device + checkins"**. Esta es la **Fase A**: la base honesta, shippable ya, sin tocar el cifrado.

## Qué se construyó

### 1. Confianza por dimensión (fin del 50 % falso)

`EmotionalMapResult` ahora lleva, además de `values`/`pct`:

- `confidence: EmotionalMapAxes` — 0..1 por eje, cuánta señal real lo respalda.
- `dimensions: EmotionalMapDimension[]` — `{ key, value, confidence, sources }` en orden del radar, para la UI de transparencia.
- `coverage: number` — confianza media de los 6 ejes; gate del banner "aún reuniendo datos".

`compute()` calcula **confianza por eje** con una rúbrica conservadora (cada ratio satura en 1):

| Eje         | Confianza ∝                               | Valor    |
| ----------- | ----------------------------------------- | -------- |
| Calma       | `entradas / 8`                            | LLM      |
| Claridad    | `(entradas con tags + notas de voz) / 6`  | LLM      |
| Conexión    | `(sesiones lectura + mensajes Eco) / 8`   | mecánico |
| Propósito   | `sesiones lectura / 4`                    | mecánico |
| Compasión   | `(entradas difíciles + días con Eco) / 4` | LLM      |
| Consciencia | `(días con diario + días con Eco) / 10`   | LLM      |

Cuando `confidence < 0.15` (`CONFIDENCE_FLOOR`), el valor se **fuerza a 0** y el cliente muestra **"Reuniendo datos"** en vez de un número inventado. `pct` promedia **solo** los ejes cubiertos (los mapas con poca señal no se inflan).

### 2. Señales ricas (no solo diario)

`compute()` ahora también lee (metadata / counts, nunca texto):

- `EcoMessage` USER (engagement conversacional) + días distintos con Eco.
- `VoiceTranscription` (nombrar lo que se siente en voz alta).
- `Highlight` + `Annotation` (marginalia = enganche con el contenido).
- `ReadingSession` completadas (libros terminados) para Propósito.

Estas señales entran al payload del provider LLM (con su sección nueva en el prompt) y a las rúbricas mecánicas. El eje **Conexión** y **Consciencia** ahora se encienden desde Eco aunque el usuario solo tenga 1 reflexión — que era exactamente el escenario del usuario.

### 3. Transparencia (ⓘ + "cómo se llena")

- **Web** `MapInfoButton.tsx` (client): botón ⓘ en el header del stage → modal que explica cada dimensión, qué la alimenta hoy y la **garantía de privacidad** ("el análisis nunca lee el texto de tu diario ni de tus chats").
- **Web** `MapStage`: banner "tu mapa se está formando" cuando `coverage < 0.4`, y provider chip honesto ("Análisis con IA" vs "Análisis inicial").
- **Web** `MapDims`: cada eje muestra su barra + `sources`, o "Reuniendo datos" si está por debajo del floor.
- **Mobile** `app/(tabs)/mapa.tsx`: paridad completa — dims con estado "Reuniendo datos" + `sources`, banner de coverage, botón ⓘ que abre un `Modal` RN con las mismas explicaciones + privacidad.

## Privacidad (ADR 0007 intacto)

- El servicio **nunca** selecciona las columnas cipher/nonce. Solo mood, tags, timestamps y counts.
- `emotional-map.privacy.spec.ts` (grep de tokens prohibidos) sigue verde — hubo que reescribir un comentario que mencionaba literalmente los tokens vetados.
- El LLM recibe únicamente frecuencias categóricas (moodCounts, tagCounts, weekday) + counts agregados de Eco/voz/lectura. Nunca texto.

## Decisiones

1. **Confianza como primitiva de primera clase** en lugar de un flag booleano — permite al cliente decidir el umbral y, más adelante, mostrar "progreso hacia desbloquear el eje".
2. **Gate del LLM por señal, no por conteo fijo de entradas**: se llama al modelo si _algún_ eje interpretativo supera el floor. Si el modelo falla, los 4 ejes interpretativos colapsan a "Reuniendo datos" (confianza 0) — nunca un valor fabricado.
3. **TTL de cache adaptativo**: mapas en formación (`coverage < 0.4`) cachean 15 min; los establecidos, 24 h. Un usuario nuevo ve su mapa formarse en minutos tras su primera reflexión, sin recomputar en cada request.
4. **Sin migración ni endpoint nuevo** — todo se deriva de datos ya existentes; la Fase A no toca el cifrado.

## Tests

- `emotional-map.service.spec.ts` reescrito (8 tests): mapa vacío, un eje con 1 entrada = "reuniendo datos", Conexión/Consciencia encendidas solo con Eco, LLM con datos ricos, colapso a "reuniendo datos" al fallar el provider, Propósito mecánico, `pct` solo sobre ejes cubiertos, cache reuse.
- `MapDims.test.tsx` reescrito (5 tests) para el prop `dimensions`.
- `MapInfoButton.test.tsx` nuevo (3 tests): cerrado por defecto, abre con privacidad + %/reuniendo datos, cierra con ×.
- Fixtures `EmotionalMapResult` actualizados en `InicioV2.test.tsx` y `EvoChart.test.tsx`.

## Verificación

- API: 729/730 (1 skipped sentinel).
- Web: 256/256 (+3 MapInfoButton, MapDims reescrito).
- Mobile: 43/43.
- Typecheck + lint verdes en API + web + mobile.
- OpenAPI `generate:check` in sync.

## Deuda / siguiente

- **Fase B** (PR aparte): análisis on-device del texto (el cliente descifra, computa puntajes localmente, sube solo números).
- **Fase C** (PR aparte): micro-checkins validados (WHO-5 / auto-compasión) para anclar los ejes a instrumentos reales.
- `emotionalMap.invalidate()` sigue sin llamarse en writes de diario/eco — mitigado por el TTL corto en formación; wire explícito cuando duela.
- Rúbricas de confianza son heurísticas v1; calibrar con datos reales cuando Pulso lo permita.
