# ADR 0018 — Política de Resonance sobre ejes emocionales (decisión ARC)

**Estado:** Propuesto (2026-07-20) — pendiente de aprobación de Jorge en el PR.
Resuelve la decisión pendiente registrada en ADR 0017 §7
(`resonance_axis_conversion=PENDING_DECISION`) y desbloquea CC-7.2 una vez
aprobado y mergeado.

## Contexto — comportamiento ACTUAL auditado contra el código (no contra docs)

**Creación y confirmación** (`apps/api/src/resonances/resonances.service.ts`):

- `confirm()` — upsert idempotente por `(userId, conceptKey)`
  (resonances.service.ts:65); solo nace de un **tap explícito** del usuario en
  tres superficies: nudge post-subrayado (web `ResonanceNudge`), fila «🌱 Me
  resonó» (mobile `BlockActionsSheet`), y chip de la oferta de Eco
  (`done.resonanceOffer` — el servidor OFRECE, solo el tap persiste).
- `setImportant()` — toggle ⭐ vía `PATCH /api/resonances/:id`
  (resonances.service.ts:75-92), ownership verificado.
- `remove()` — borrado real con ownership por `deleteMany` scoped
  (resonances.service.ts:97-103). **Revocable siempre.**
- Las tres mutaciones disparan `emotionalMap.invalidateBestEffort(userId)` →
  el efecto sobre el mapa es **diferido a la siguiente lectura** (invalidación
  de cache fire-and-forget; recomputación en el próximo `getForUser`, sin job
  en background).

**Modelos** (`apps/api/src/emotional-map/model-registry.ts:245-272`): `ARC-C1`
v1.0 EXPERIMENTAL y `ARC-P1` v1.0 EXPERIMENTAL, con specs que pinean sus ids.

**Scoring** (`apps/api/src/emotional-map/emotional-map.scoring.ts`), solo bajo
`EMOTIONAL_MAP_V2` (default ON desde Fase G):

- Input: `resonances: [{conceptKey, important}]` (scoring.ts:152-156) —
  **sin** frecuencia, dwell, progreso ni recall. Solo conjuntos DISTINTOS de
  confirmaciones explícitas.
- `conexionRaw = clamp01(distinctConcepts / RESONANCE_GOOD_N)` con saturación
  (scoring.ts:377-381); `confConexion = clamp01(distinct / RESONANCE_CONF_N)`
  con `RESONANCE_CONF_N = 2` (scoring.ts:183, 362-363).
- `propositoRaw = clamp01(importantConcepts / IMPORTANT_GOOD_N)` con
  `IMPORTANT_GOOD_N = 3`; `confProposito` satura en `IMPORTANT_CONF_N = 1`
  (scoring.ts:190-191, 366-367).
- **Campos afectados:** `value` (los dos raw), `confidence` (las dos conf),
  `status` (el eje sale de «Reuniendo datos» al superar el floor de 0.15 —
  una sola confirmación ya lo enciende), `measured: true`, `evidence`
  (`{modelId: ARC-C1|ARC-P1, n}`), presencia de señal y `sources`/procedencia
  («Las resonancias que confirmaste sobre tus lecturas» / «Confirmado por ti ·
  Cap. N · fecha» en la UI).
- **Ejes NO afectados:** calma, claridad, compasión, consciencia — jamás leen
  resonancias.

**Tests que fijan el comportamiento:** `emotional-map.v2-contract.spec.ts`
(inversión `+highlights ⇒ el mapa no cambia` bajo V2; payload del provider sin
engagement), specs de scoring/servicio de Fases E y H (conexión medida desde
resonancias, propósito desde importantes), `model-registry` spec (ids ARC
pineados), `resonances.service.spec.ts` (upsert/ownership/invalidación).

**UI/API que lo expone:** `GET/POST/PATCH/DELETE /api/resonances`; web
«Mis resonancias» en el mapa (procedencia completa + Quitar + ⭐) y
`ResonanceNudge`; mobile paridad; radar hexagonal con puntas Conexión/Propósito
alimentadas por estos modelos.

**Datos de producción:** el seed demo confirma 2 resonancias por cuenta demo
(re-seeded tras Fase G) y existen confirmaciones orgánicas posibles; esta
auditoría (read-only, sin query a prod) no contó filas exactas — la
dependencia existe.

## Las dos preguntas, separadas

### Pregunta A — Learning Events (NO está en discusión)

```
LearningEvent → Resonance        = FORBIDDEN
LearningEvent → emotional axis   = FORBIDDEN
engagement    → emotional inference = FORBIDDEN
```

Ningún evento educativo crea resonancias ni toca ejes; el engagement jamás se
convierte en inferencia emocional. Esto ya es invariante de CC-7 (ADR 0017) y
esta decisión no lo modifica en nada.

### Pregunta B — Resonance confirmada explícitamente

¿Puede una confirmación directa del usuario contribuir a Conexión/Propósito, o
debe permanecer únicamente cualitativa?

## Alternativas evaluadas

### A — Resonance completamente cualitativa

Retirar/neutralizar ARC-C1/ARC-P1; las resonancias solo aparecen como lista
narrativa («Mis resonancias», que ya existe).

- Coherencia: máxima pureza («ningún contenido toca ejes»), pero confunde dos
  cosas distintas: la resonancia NO es engagement — es un acto de autoinforme
  («esto sobre mi mundo interior me resonó»/«esto es importante para mí»),
  semánticamente más cercano a un check-in que a telemetría.
- Producto: Conexión y Propósito pierden su ÚNICA fuente bajo V2 → quedan en
  «Reuniendo datos» permanente. El programa V2 (Fases E–H) construyó ARC
  precisamente porque esos ejes no tenían fuente legítima; vaciarlos recrea la
  presión de rellenarlos con algo peor (engagement) más adelante.
- Compatibilidad: cambio de producto visible (radar pierde 2 puntas activas),
  requiere neutralizar modelos, editar scoring/registry/UI/copy, actualizar
  ~15 tests de Fases E/H y el seed demo, e invalidar/recomputar snapshots
  (`CACHE_EPOCH++`). Deuda y churn reales para eliminar una señal honesta.

### B — Excepción explícita y acotada (comportamiento actual, RATIFICADO)

Resonance confirmada contribuye **solo** a Conexión/Propósito bajo modelos
registrados, con límites obligatorios que se convierten en invariantes:

1. solo confirmación explícita (tap);
2. nunca creación automática;
3. nunca desde LearningEvent;
4. ningún uso de frecuencia/dwell/progreso/recall (solo conteo de conjuntos
   DISTINTOS);
5. modelo+versión visibles en evidence/provenance;
6. contribution cap (saturación en `RESONANCE_GOOD_N` / `IMPORTANT_GOOD_N`);
7. confidence de evidencia limitada (satura en 2 y 1 — nunca finge certeza
   estadística);
8. revocable (DELETE/PATCH recomputan);
9. auditable (fila con source + fecha + procedencia en UI);
10. **ratchet que impide ampliar la excepción** a otros ejes u otras fuentes.

- Riesgo de inferencia: bajo — no hay inferencia; el valor ES el autoinforme
  contado. Privacidad: solo metadata de catálogo, cero texto.
- Compatibilidad: total — es el comportamiento desplegado; sin migración, sin
  recomputación, sin cambios de UI/copy/tests.
- El costo: mantener una excepción documentada. Se mitiga con el ratchet (10).

### C — Señal cualitativa paralela

Los ejes quedan nulos y las resonancias viven en una proyección paralela.

- La «proyección paralela» YA existe (sección «Mis resonancias»); C añade el
  costo de A (vaciar ejes, migrar, recomputar) más una superficie duplicada,
  sin ganar claridad sobre B — B ya muestra la misma procedencia en el eje.
- Complejidad neta mayor que A y B sin necesidad real demostrada.

## Decisión

```
RECOMMENDED_ARC_POLICY=EXPLICIT_AXIS_EXCEPTION
```

**Se ratifica B.** Una Resonance confirmada explícitamente por el usuario es
autoinforme mediado por contenido — no engagement — y puede contribuir a
Conexión/Propósito bajo ARC-C1/ARC-P1 con los diez límites de arriba elevados
a **invariantes permanentes**:

- **INV-1:** solo `conexion` y `proposito` pueden citar `ARC-C1`/`ARC-P1` en
  `evidence`; ningún otro eje puede leer resonancias.
- **INV-2:** el input de scoring de resonancias es exactamente
  `{conceptKey, important}` — añadir frecuencia, timestamps de uso, dwell,
  progreso o recall a ese input está prohibido.
- **INV-3:** ninguna resonancia se crea sin un tap explícito del usuario;
  LearningEvent jamás crea ni modifica una Resonance.
- **INV-4:** las saturaciones (caps) y la procedencia visible no se retiran.
- **INV-5:** cualquier ampliación (nuevo eje, nueva fuente, nuevo input)
  exige un ADR nuevo + cambio del ratchet — nunca un edit silencioso.

Justificación condensada: significado psicológico correcto (autoinforme, no
telemetría), honestidad hacia el usuario (procedencia «Confirmado por ti» +
evidencia modelo+n + revocable), riesgo de inferencia mínimo (conteo de actos
explícitos), privacidad intacta (metadata de catálogo), explicabilidad máxima
(el usuario puede reconstruir el número contando sus propios taps), deuda
técnica nula (ratifica lo desplegado), y expansión futura bloqueada por
ratchet en vez de por costumbre.

## Impacto sobre el test de inversión de CC-7 (resuelve la contradicción)

La especificación original (learning-events.md §D) incluía «crear una
Resonance cualitativa y exigir `mapProjection` idéntica», lo que contradecía
ARC-C1/ARC-P1. La enmienda es **explícita** (como exigía la propia spec) y el
test queda en dos partes:

```
PARTE 1 — actividad educativa (SIEMPRE idéntico):
  A := mapProjection(user)
  → LearningEvents (7 tipos) + progreso + sesiones + quiz + highlights
    + annotations
  B := mapProjection(user)
  expect(B).toStrictEqual(A)          // sin excepción alguna

PARTE 2 — resonancia confirmada (DELTA CONFINADO):
  C := mapProjection(user) tras confirmar una Resonance
  → SOLO los ejes conexion/proposito pueden diferir de B
  → sus evidence citan exclusivamente ARC-C1/ARC-P1
  → TODOS los demás ejes y campos (momento, dinámica, coverage, lenguaje)
    permanecen byte-idénticos a B
  → tras revocar (DELETE), D := mapProjection(user) vuelve a igualar B
```

La Parte 2 es más fuerte que una exención: convierte la excepción en un
contrato verificable (delta confinado + reversibilidad) y ES el ratchet de
INV-1/INV-5 — si un eje distinto cambia, el build rompe.

## Plan posterior (NO ejecutado en este PR)

B no cambia comportamiento, así que no hay migración ni recomputación. Queda
solo trabajo de blindaje, dentro de CC-7.2:

1. **CC-7.2 (persistencia + firewall):** aterrizar el test de dos partes de
   arriba + ratchet estático `arc-exception-scope` (grep: `ARC-C1|ARC-P1` solo
   pueden aparecer en las líneas de conexion/proposito del scoring; el input
   de resonancias no gana campos).
2. Sin cambio de modelo/scoring (n/a bajo B).
3. Sin recomputación de snapshots (n/a bajo B).
4. Sin cambios de API/copy (la procedencia ya es visible).
5. Observación: la ya vigente del mapa; rollback: revertir el PR de CC-7.2
   (los ratchets son test-only).

## Estado de aprobación

- Redactado y auditado: 2026-07-20.
- **Aprobación: PENDIENTE — la decide Jorge al mergear este PR.** El merge de
  este ADR constituye la resolución de la decisión ARC; en ese momento
  `ARC_DECISION_REQUIRED_BEFORE_CC7_2` pasa a satisfecha y CC-7.2 puede
  proponerse.
