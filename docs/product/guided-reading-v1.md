# Guided Reading V1 — Blueprint canónico

```
GUIDED_READING_SPEC_VERSION=0.7

GUIDED_READING_BLUEPRINT_STATUS=APPROVED
GUIDED_READING_IMPLEMENTATION_STATUS=NOT_STARTED
GUIDED_READING_VISUAL_PROTOTYPE_STATUS=APPROVED

STORYBOARD_STATUS=APPROVED

AUTHORITATIVE_PRODUCT_SPEC=true
AUTHORITATIVE_PRODUCT_SPEC_STATUS=APPROVED
AUTHORITATIVE_PRODUCT_SPEC_EFFECTIVE=true
AUTHORITATIVE_PRODUCT_SPEC_EFFECTIVE_SINCE=2c58323ed644c7141052995a1042997424e18ac3

PRODUCT_OWNER=Jorge
PRODUCT_OWNER_APPROVAL=true
PRODUCT_OWNER_APPROVAL_DATE=2026-07-29
GR1_FINAL_VISUAL_APPROVAL_BY_JORGE=true
GR1_FINAL_VISUAL_APPROVAL_DATE=2026-07-29
GR1_STATUS=CLOSED

GUIDED_READING_DECISION_PACKET_APPROVED=true

LAST_UPDATED=2026-07-29

PRODUCTION_RUNTIME_CHANGED=false
PILOT_CONFIGURATION_CHANGED=false

GR1_PROTOTYPE_ROUTE=/prototipos/lectura-guiada
GR1_RUNTIME_INTEGRATION=false
GR1_API_INTEGRATION=false
GR1_DATABASE_INTEGRATION=false

PROTOTYPE_EVOLUTION_WRITE=false
PROTOTYPE_RESONANCE_WRITE=false
PROTOTYPE_CHECKIN_WRITE=false
PROTOTYPE_MAP_WRITES=0

COMPLETION_RESONANCE_AND_CHECKIN_SEPARATED=true
MOBILE_SELECTOR_HIDDEN_WHILE_GUIDE_OPEN=true
MOBILE_READER_TEXT_VISIBLE_BEHIND_SHEET=true

DECISIONS_CHANGED_WITHOUT_APPROVAL=0

IMPLEMENTATION_SNAPSHOT_MAIN_SHA=c7295cdc27090c5d2826c430156675a0539a2245
IMPLEMENTATION_SNAPSHOT_DEVELOP_SHA=f9f178ac2c86dca4e8a1842ce134158b06f7a0ae
```

## Alcance de autoridad

Jorge aprobó el paquete de decisiones el 2026-07-29. Este documento es la
**autoridad de producto** —experiencia, presentación multimedia y límites de
datos— y entra en vigor al mergearse a `develop`.

La aprobación autoriza el prototipo visual GR-1.

No autoriza todavía la integración runtime GR-3, porque el `anchorBlockKey`
editorial definitivo continúa pendiente.

Los ADR y contratos existentes **siguen siendo autoridad** sobre lifecycle,
persistencia, idempotencia, entitlement, receipts, locks y rollout. Cuando este
documento y un ADR se contradigan sobre esos temas, gana el ADR.

Este blueprint no describe lo que existe hoy. Describe el producto objetivo. Lo
que existe hoy está en §1.

---

## 1. Context Snapshot — estado real al SHA de referencia

Clasificación: `IMPLEMENTED` · `PARTIAL` · `NOT_IMPLEMENTED` · `DEFERRED`.

Nada aquí se marca implementado por haber aparecido en un diseño previo. Cada
fila se verificó contra el código en el SHA de arriba.

### 1.1 Lectura y contenido

| Capacidad                                       | Estado      | Autoridad                                                                    | Reutilizable | Deuda / limitación                                                                                                                |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Lector de texto por capítulo                    | IMPLEMENTED | `apps/web/src/components/dashboard/lector/LectorShell.tsx`                   | Sí           | Es el contenedor natural de Guided Reading                                                                                        |
| Render tipado de bloques                        | IMPLEMENTED | `apps/web/src/components/dashboard/lector/BlockRenderer.tsx`                 | Sí           | —                                                                                                                                 |
| Content Core (Work/Edition/Revision/Unit/Block) | IMPLEMENTED | `apps/api/src/content-core/`                                                 | Sí           | —                                                                                                                                 |
| Identidad estable del bloque                    | IMPLEMENTED | `packages/types/src/index.ts` (`ContentUnitRead`)                            | Sí           | `ContentUnitRead` ya provee `blockKey` y `blockVersionId`; `source: "content-core" \| "legacy"`                                   |
| Mapas de identidad en el lector                 | IMPLEMENTED | `apps/web/src/components/dashboard/lector/LectorShell.tsx`                   | Sí           | Construye `blockKeyById` y `blockVersionIdById`                                                                                   |
| Anclaje de marcas                               | IMPLEMENTED | `apps/api/src/content-core/anchors.ts`                                       | Sí           | Base para el anchor visual al pasaje                                                                                              |
| Progreso de lectura                             | IMPLEMENTED | `apps/api/src/lector/`                                                       | Sí           | —                                                                                                                                 |
| Highlights                                      | IMPLEMENTED | `apps/api/src/lector/highlights.controller.ts`                               | Sí           | Writes **source-aware**: `content-core` → `blockKey` (+ `blockVersionId` del read cuando corresponde); `legacy` → `legacyBlockId` |
| Anotaciones                                     | IMPLEMENTED | `apps/api/src/lector/annotations.controller.ts`                              | Sí           | —                                                                                                                                 |
| Eco dentro del lector                           | IMPLEMENTED | `apps/web/src/components/dashboard/lector/companion/ReaderCompanionDock.tsx` | Sí           | Precedente directo del panel Guide                                                                                                |
| Reflexión dentro del lector                     | IMPLEMENTED | idem (pestaña Reflexión)                                                     | Sí           | Cifrada E2E                                                                                                                       |
| Audio del capítulo cuando existe                | IMPLEMENTED | `apps/web/src/components/dashboard/lector/AudioBar.tsx`                      | Sí           | Los `.m4a` reales aún no están en R2                                                                                              |

### 1.2 Guide runtime

| Capacidad                 | Estado      | Autoridad                                                   | Reutilizable | Deuda / limitación                     |
| ------------------------- | ----------- | ----------------------------------------------------------- | ------------ | -------------------------------------- |
| `GuideSession`            | IMPLEMENTED | `apps/api/src/guide/guide-lifecycle.service.ts`             | Sí           | —                                      |
| Ledger `GuideSessionStep` | IMPLEMENTED | idem · ADR 0019                                             | Sí           | —                                      |
| `GuideCommandReceipt`     | IMPLEMENTED | `apps/api/src/guide/guide-command-receipt.repository.ts`    | Sí           | —                                      |
| Progreso server-owned     | IMPLEMENTED | `guide-lifecycle.service.ts`                                | Sí           | El cliente nunca decide el paso actual |
| Replay / idempotencia     | IMPLEMENTED | idem                                                        | Sí           | `idempotencyKey` debe ser UUID         |
| Recovery tras recarga     | IMPLEMENTED | `apps/web/src/components/dashboard/guide/guide-recovery.ts` | Sí           | —                                      |
| Recovery scoped al actor  | IMPLEMENTED | `apps/web/src/lib/guide-recovery-scope.server.ts`           | Sí           | —                                      |
| Entitlement               | IMPLEMENTED | `apps/api/src/guide/` guards                                | Sí           | —                                      |
| Rollout `off\|pilot\|on`  | IMPLEMENTED | `apps/api/src/guide/guide-rollout.ts`                       | Sí           | Se resuelve una vez al boot            |
| Firewall Guide → Mapa     | IMPLEMENTED | ADR 0018 · `apps/api/src/resonances/`                       | Sí           | Verificado en producción: deltas 0     |
| Una Guide productiva      | IMPLEMENTED | `apps/api/src/guide/guide-catalog.ts`                       | Sí           | `eec-c1-cuerpo-antes-que-mente@1`      |
| Un recall objetivo        | IMPLEMENTED | `apps/api/src/content-core/exercise-ingestion-catalog.ts`   | Sí           | Grading server-side                    |

### 1.3 Parcial

| Capacidad                             | Estado  | Autoridad                                                       | Limitación                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Presentación Guide                    | PARTIAL | `apps/web/src/components/dashboard/guide/guide-presentation.ts` | El copy vive hardcodeado en web y está fijado a `GUIDE_KEY`/`GUIDE_VERSION` constantes. El archivo declara explícitamente que es _copy, not domain_: el player falla cerrado si el servidor nombra un paso que no conoce. Añadir una segunda Guide exige tocar web.            |
| Catálogo de Guides                    | PARTIAL | `guide-catalog.ts`                                              | `PRODUCTION_GUIDE_DEFINITIONS` contiene exactamente una definición.                                                                                                                                                                                                            |
| Modo del lector llamado «Guía»        | PARTIAL | `LectorShell.tsx:219`                                           | `type ReaderMode = "libro" \| "guia"`, persistido en `localStorage["psico:lector:mode"]`, con etiquetas visibles **«📖 Modo Libro»** y **«🎧 Modo Guía»**. Hoy «Modo Guía» significa _audio narrado_, no Lectura guiada. Colisión de nombre que este blueprint resuelve en §3. |
| Experiencia Guide separada del lector | PARTIAL | `GuidePlayer.tsx`                                               | El player vive bajo `/dashboard/exploraciones`; para leer el pasaje hay que salir del flujo.                                                                                                                                                                                   |

### 1.4 No implementado

| Capacidad                                    | Estado                                   |
| -------------------------------------------- | ---------------------------------------- |
| Videoexplicación completa                    | NOT_IMPLEMENTED                          |
| Podcast del capítulo                         | NOT_IMPLEMENTED                          |
| Clips Guide                                  | NOT_IMPLEMENTED                          |
| Subtítulos                                   | NOT_IMPLEMENTED                          |
| Transcripción multimedia versionada          | NOT_IMPLEMENTED                          |
| Panel Guide dentro del lector                | NOT_IMPLEMENTED                          |
| Anchor visual al pasaje                      | NOT_IMPLEMENTED                          |
| Práctica inline                              | NOT_IMPLEMENTED                          |
| Feedback educativo de recall                 | NOT_IMPLEMENTED                          |
| Fallback de video                            | NOT_IMPLEMENTED                          |
| E2E de navegador de la experiencia integrada | NOT_IMPLEMENTED                          |
| Anchor editorial aprobado                    | NOT_IMPLEMENTED                          |
| Blueprint canónico                           | APPROVED                                 |
| Prototipo visual                             | NOT_IMPLEMENTED · READY_TO_IMPLEMENT     |
| Integración runtime                          | NOT_IMPLEMENTED · BLOCKED_PENDING_ANCHOR |

La deuda real del anclaje **no** es de contrato ni de identidad: ambos existen y
son source-aware. La deuda es editorial y visual —

```
Guided Reading todavía no tiene un anchor editorial aprobado ni el
comportamiento visual scroll/focus/highlight.
```

Nota sobre video: existe el bloque `ChapterBlockKind.VIDEO` con reproductor
inline y placeholder (`apps/web/src/components/dashboard/lector/VideoBlock.tsx`).
Eso es _video dentro del texto_, no la videoexplicación del capítulo ni un paso
de Guide. Se documenta para no contarlo dos veces.

---

## 2. Promesa de producto

```
UN CAPÍTULO, VARIAS FORMAS DE VIVIRLO
```

```
LEER

ESCUCHAR
  ├── Audiolibro
  └── Podcast

VER
  └── Videoexplicación

LECTURA GUIADA
  ├── Clip
  ├── Pasaje
  ├── Explicación
  ├── Práctica
  ├── Recall
  ├── Feedback
  └── Cierre
```

**Audiolibro** — narración fiel del texto.

**Podcast** — explicación o conversación alrededor de las ideas del capítulo.
No es una lectura literal.

**Videoexplicación** — versión audiovisual completa, sintética y explicativa
del capítulo.

**Lectura guiada** — experiencia interactiva _dentro del lector_ que combina
recursos multimedia, texto, práctica, recuerdo y feedback.

---

## 3. Naming

```
COPY_VISIBLE_READER_MODE_TEXT=Leer
COPY_VISIBLE_READER_MODE_AUDIO=Escuchar
COPY_VISIBLE_GUIDED_PRODUCT=Lectura guiada
```

El valor interno legacy `"guia"` (§1.3) puede conservarse temporalmente para no
romper la preferencia guardada de los usuarios, pero **no** debe definirse como
el nombre futuro de la experiencia educativa.

Este cambio no se implementa en GR-0. Solo se documenta.

---

## 4. Estrategia multimedia

```
UNA PRODUCCIÓN PRINCIPAL → VARIAS SALIDAS
```

Paquete editorial por capítulo:

```
1 guion principal
1 videoexplicación completa
1 audio del video reutilizable como base del podcast
clips cortos para Guided Reading
transcripción
subtítulos
poster
show notes
```

El **audiolibro se mantiene separado**, porque es narración fiel del texto y no
deriva del guion explicativo.

```
MEDIA_HOSTING_PROVIDER=TBD
VIDEO_ASSET_URL=TBD
PODCAST_ASSET_URL=TBD
AUDIOBOOK_ASSET_URL=TBD
```

No se crea un CMS.

---

## 5. Decision Registry

### 5.1 Aprobadas (22)

| ID     | Decisión                                                                                                                                                                                                                                                                                                                             | Estado   | Fecha      | Razón                                                                         | Impacto                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| GR-001 | Un capítulo ofrece Leer, Escuchar, Ver y Lectura guiada                                                                                                                                                                                                                                                                              | APPROVED | 2026-07-29 | Distintas personas absorben distinto; el capítulo es la unidad, no el formato | Selector de modalidad en el lector   |
| GR-002 | Escuchar contiene Audiolibro y Podcast                                                                                                                                                                                                                                                                                               | APPROVED | 2026-07-29 | Son intenciones distintas: fidelidad vs explicación                           | Dos assets, un solo punto de entrada |
| GR-003 | Ver contiene una videoexplicación completa del capítulo                                                                                                                                                                                                                                                                              | APPROVED | 2026-07-29 | Alternativa real al texto, no un adorno                                       | Producción de video por capítulo     |
| GR-004 | Lectura guiada vive dentro del lector; no obliga a salir y regresar                                                                                                                                                                                                                                                                  | APPROVED | 2026-07-29 | Hoy el player está en otra ruta y rompe el hilo de lectura                    | Panel/sheet dentro del lector        |
| GR-005 | La Guide conserva sus tres checkpoints server-owned, pero la presentación puede contener múltiples escenas                                                                                                                                                                                                                           | APPROVED | 2026-07-29 | Separar narrativa de lifecycle evita rehacer el runtime                       | Escenas ≠ pasos                      |
| GR-006 | Video, transcripción y audio son alternativas; completar el 100 % del video no es condición de avance                                                                                                                                                                                                                                | APPROVED | 2026-07-29 | Accesibilidad y respeto por el ritmo del usuario                              | Sin gating por reproducción          |
| GR-007 | La Guide nunca comienza automáticamente                                                                                                                                                                                                                                                                                              | APPROVED | 2026-07-29 | Consentimiento explícito; evita sesiones fantasma                             | `GUIDE_AUTOSTART=false`              |
| GR-008 | Completar Guide, ver video, escuchar audio o podcast no modifica automáticamente el Mapa Emocional                                                                                                                                                                                                                                   | APPROVED | 2026-07-29 | Actividad ≠ estado interior (programa V2)                                     | Firewall se mantiene                 |
| GR-009 | Dentro de Guided Reading y de las modalidades multimedia, solo una resonancia confirmada explícitamente por la persona puede alimentar el Mapa Emocional                                                                                                                                                                             | APPROVED | 2026-07-29 | ADR 0018                                                                      | Un tap, revocable                    |
| GR-010 | Se valida el capítulo 1 antes de añadir otro libro o una segunda Guide productiva                                                                                                                                                                                                                                                    | APPROVED | 2026-07-29 | Evitar escalar un formato no validado                                         | Alcance cerrado                      |
| GR-011 | Primero storyboard y prototipo visual; después integración runtime                                                                                                                                                                                                                                                                   | APPROVED | 2026-07-29 | Barato equivocarse en papel                                                   | GR-1 antes que GR-3                  |
| GR-012 | No crear CMS, nuevas tablas ni un nuevo lifecycle para el primer prototipo                                                                                                                                                                                                                                                           | APPROVED | 2026-07-29 | El runtime actual ya cubre los tres checkpoints                               | Cero migraciones                     |
| GR-013 | La videoexplicación completa tiene una duración objetivo de 7–9 minutos. Guía editorial, no validación rígida de runtime                                                                                                                                                                                                             | APPROVED | 2026-07-29 | Ritmo de atención                                                             | Producción                           |
| GR-014 | El podcast tiene una duración objetivo de 8–12 minutos. Guía editorial, no validación rígida                                                                                                                                                                                                                                         | APPROVED | 2026-07-29 | Formato conversacional                                                        | Producción                           |
| GR-015 | El clip de Lectura guiada tiene una duración objetivo de 60–90 segundos                                                                                                                                                                                                                                                              | APPROVED | 2026-07-29 | Escena corta                                                                  | Producción                           |
| GR-016 | La práctica propone una pausa opcional de 45 s; se puede continuar sin temporizador. El tiempo no prueba que la práctica se hiciera correctamente                                                                                                                                                                                    | APPROVED | 2026-07-29 | No medir lo que no se puede medir                                             | UI                                   |
| GR-017 | Estilo inicial del video: Jorge en cámara + gráficos simples, palabras clave, esquemas y pasajes del libro. Orientación ≈30 % Jorge / 70 % apoyo visual — no es proporción técnica obligatoria                                                                                                                                       | APPROVED | 2026-07-29 | Cercanía + claridad                                                           | Producción                           |
| GR-018 | Desktop muestra el texto y un panel lateral de Lectura guiada                                                                                                                                                                                                                                                                        | APPROVED | 2026-07-29 | No perder el lugar                                                            | GR-1                                 |
| GR-019 | Móvil mantiene el texto visible y presenta la Lectura guiada como bottom sheet                                                                                                                                                                                                                                                       | APPROVED | 2026-07-29 | Móvil prioritario                                                             | GR-1                                 |
| GR-020 | El recall devuelve feedback editorial server-owned con `CORRECT` / `REVIEW`. Nunca score, porcentaje, `correctOptionKey`, juicio personal ni diagnóstico                                                                                                                                                                             | APPROVED | 2026-07-29 | Educativo, no evaluativo                                                      | GR-3                                 |
| GR-021 | La posición dentro de las escenas es estado de presentación, no de dominio. Local y scoped por `actorScope` + `guideKey` + `guideVersion` + `sessionId` + `checkpointKey`. Sin tabla ni migración. Fallback: si falta o es inválida, volver a la primera escena del checkpoint server-owned actual, nunca al inicio de toda la Guide | APPROVED | 2026-07-29 | Continuidad sin persistencia nueva                                            | GR-3                                 |
| GR-022 | La UI separa progreso de checkpoints y de escenas. `CHECKPOINT_PROGRESS_AUTHORITY=SERVER`, `SCENE_PROGRESS_AUTHORITY=PRESENTATION`. Copy: «Concepto · parte 2 de 3». No presentar ocho escenas como ocho pasos persistidos                                                                                                           | APPROVED | 2026-07-29 | Honestidad del progreso                                                       | GR-1/GR-3                            |

`APPROVED_DECISIONS_COUNT=22`

`PROPOSED_DECISIONS_COUNT=0`

---

## 5.3 MVP implementation constraints

```
MEDIA_ACTIVITY_TRACKING=MINIMAL
NEW_MEDIA_ANALYTICS_EVENTS_IN_MVP=1
MEDIA_ACTIVITY_EVENT=chapter_media_completed
MEDIA_EVENT_GRANULARITY=COMPLETION_ONLY
MEDIA_ACTIVITY_DESTINATION=MI_EVOLUCION

PODCAST_V1_FORMAT=JORGE_SOLO
PODCAST_V1_STYLE=CONVERSATIONAL_SCRIPT

MEDIA_PLAYBACK_RESUME=LOCAL_ONLY
MEDIA_PLAYBACK_RESUME_SERVER_SYNC=false

MEDIA_HOSTING_PROVIDER=TBD_UNTIL_GR2
MEDIA_HOSTING_BLOCKS_GR1=false

LEGACY_READER_MODE_INTERNAL_VALUE=guia
LEGACY_READER_MODE_VISIBLE_LABEL=Escuchar
LEGACY_READER_MODE_LOCALSTORAGE_MIGRATION=false

GR1_VISUAL_ANCHOR_PLACEHOLDER_ALLOWED=true
GR3_RUNTIME_ANCHOR_STATUS=PENDING_EDITORIAL_BLOCK_KEY

SECOND_GUIDE_PRODUCTIVE_ALLOWED=false
SECOND_BOOK_GUIDED_READING_ALLOWED=false
```

- El MVP añade un único evento de medios, de finalización, con destino Mi
  Evolución (§9). No hay analítica segundo a segundo.
- El progreso audiovisual **no** alimenta el Mapa.
- El segundo exacto de reproducción puede recordarse localmente, sin sync.
- El hosting se decide en GR-2, no durante GR-1.
- No se migra el valor `localStorage["psico:lector:mode"]`; el interno sigue
  siendo `guia` y la etiqueta visible pasa a «Escuchar».
- El prototipo puede usar un anchor visual fixture.
- GR-3 no puede integrar el anchor real mientras `ANCHOR_BLOCK_KEY=TBD`.

---

## 6. Storyboard — capítulo 1

```
STORYBOARD_STATUS=APPROVED
```

```
Libro:            Emociones en construcción
Capítulo:         1 — ¿Realmente sabemos qué es una emoción?
Lectura guiada:   El cuerpo sabe antes que la mente
Duración:         8–10 minutos (objetivo editorial flexible)
Checkpoints:      3 (server-owned)
Escenas:          8
```

**Objetivo** — comprender que una reacción corporal puede comenzar antes de que
la persona logre identificar o nombrar conscientemente la emoción.

### Escena 0 — Selector

```
¿Cómo quieres vivir este capítulo?

[Leer]  [Escuchar]  [Ver]  [Lectura guiada]
```

Dentro de Escuchar: `Audiolibro` · `Podcast`.

```
GUIDE_AUTOSTART=false
```

### Escena 1 — Portada

```
LECTURA GUIADA

El cuerpo sabe antes que la mente

Explora por qué una reacción emocional puede comenzar
antes de que logremos ponerle un nombre.

8–10 minutos
· video breve
· pasaje del libro
· práctica
· pregunta

[Empezar]
```

Solo `Empezar` crea la `GuideSession`.

### Escena 2 — Clip · «Antes de ponerle un nombre»

Duración objetivo: 60–90 s (GR-015).

> Imagina que escuchas un ruido inesperado detrás de ti. Tu cuerpo puede
> tensarse, cambiar la respiración o prepararse para moverse antes de que
> conscientemente comprendas lo ocurrido.
>
> Esa diferencia de tiempo ayuda a entender una de las ideas centrales del
> capítulo: una respuesta corporal puede comenzar antes de que podamos
> reconocerla y nombrarla.

```
[Reproducir]  [Leer transcripción]  [Escuchar solo audio]
```

### Escena 3 — Pasaje anclado

```
Ahora míralo en el libro

Este pasaje presenta la secuencia entre
la reacción corporal y la comprensión consciente.

[Ir al pasaje]
```

```
ANCHOR_EDITORIAL_STATUS=PENDING_APPROVAL
ANCHOR_BLOCK_KEY=TBD
ANCHOR_SOURCE_HEADING=TBD

ANCHOR_BLOCKS_GR1=false
ANCHOR_BLOCKS_GR3=true
```

La identidad estable del bloque ya existe (§1.1). Lo que falta es la decisión
editorial: qué bloque exacto se ancla y qué rango se enfoca. Mientras sea `TBD`,
la **integración runtime queda bloqueada**; el prototipo visual, no.

Comportamiento objetivo:

```
scroll al bloque exacto
foco accesible
highlight temporal
panel permanece abierto
ruta no cambia
progreso no se pierde
```

Explicación:

> La idea no es que el cuerpo «piense» o comprenda intelectualmente. La
> propuesta es que algunos cambios corporales pueden comenzar antes de que
> podamos reconocerlos y nombrarlos conscientemente.

Escenas 2 y 3 pertenecen al checkpoint `CONCEPT_EXPLORATION`.
Acción: `[He explorado esta idea]`.

### Escena 4 — Práctica inline · «Escucharte por dentro»

```
No necesitas encontrar una emoción concreta
ni ponerle un nombre perfecto.

1. Haz una pausa.
2. Observa una señal corporal presente.
3. Nota si cambia cuando le prestas atención.
4. Nómbrala solo si te resulta natural.

[Comenzar pausa de 45 segundos]   [Continuar sin temporizador]
```

```
La aplicación no guarda lo que observaste.

[Terminé la práctica]
```

Se registra **únicamente la confirmación**. No se guarda señal corporal,
emoción, texto, resultado ni efectividad.

Checkpoint: `CATALOG_PRACTICE`.

### Escena 5 — Recall

```
Según el capítulo, ¿cómo describe el libro
la relación entre el cuerpo y la comprensión consciente?
```

Tres opciones editoriales ya existentes. Acción: `[Responder]`.
Checkpoint: `ACTIVE_RECALL`. Grading server-side.

```
RECALL_ITEM_KEY=eec-c1-recall-cuerpo-antes-que-mente
RECALL_EDITORIAL_AUTHORITY=docs/product/exercise-content-first-guide-unit.md

CORRECT_OPTION_PUBLICLY_DOCUMENTED=false
CORRECT_OPTION_CLIENT_EXPOSED=false
```

### Escena 6 — Feedback

`CORRECT` (propuesta):

> Esta opción coincide con la idea central del capítulo.
>
> El cuerpo puede iniciar una respuesta antes de que logremos reconocer
> conscientemente la emoción.

`REVIEW` (propuesta):

> Miremos nuevamente la secuencia.
>
> El capítulo propone que la reacción corporal puede comenzar antes de que la
> mente logre identificar o nombrar lo que ocurre.

No mostrar: score, porcentaje, `correctOptionKey`, juicio personal, diagnóstico.

### Escena 7 — Cierre

```
COMPLETASTE ESTA LECTURA GUIADA

Hoy exploraste:

✓ La relación entre reacción corporal y consciencia
✓ Una práctica breve de observación
✓ Una pregunta para consolidar la idea

[Continuar leyendo]  [Volver al pasaje]  [Repetir la guía]
```

Resonancia, **separada** del cierre:

```
¿Esta idea fue personalmente significativa para ti?

[Esto me resonó]   [Ahora no]
```

Solo el primer botón puede crear una `Resonance`.

---

## 7. Videoexplicación completa

Estructura aprobada — los tiempos son **objetivo editorial flexible**, no
requisitos de código (GR-013):

```
00:00 — ¿Qué ocurre antes de que pensemos?
00:50 — El cuerpo inicia una respuesta
02:10 — Nombrar no es lo mismo que reaccionar
03:30 — Por qué no existe una única firma corporal universal
05:00 — El papel del contexto y la experiencia
06:30 — Qué observar en ti sin diagnosticarte
07:30 — Idea de cierre
```

---

## 8. Podcast

```
PODCAST_V1_FORMAT=JORGE_SOLO
PODCAST_V1_STYLE=CONVERSATIONAL_SCRIPT
```

```
pregunta inicial
ejemplo cotidiano
explicación científica
matiz importante
aplicación a la vida
cierre
```

Jorge explica el capítulo con un guion conversacional. No es lectura literal y
no requiere voz entrevistadora en V1.

Evolución posible futura, **no** implementada ahora: Jorge + entrevistador,
Jorge + especialista, preguntas de lectores.

---

## 8.5 Progreso y recuperación entre escenas

```
Servidor:       conserva el checkpoint real.
Presentación:   conserva la escena visual dentro del checkpoint.
```

Ejemplo: checkpoint `Concepto`, escena local `Pasaje anclado`.

| Situación                       | Resultado                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Recarga en el mismo navegador   | vuelve al pasaje anclado                                                                         |
| Estado local ausente o corrupto | vuelve al inicio del checkpoint `Concepto`                                                       |
| Otro dispositivo                | el servidor conserva `Concepto` pendiente; la presentación abre la primera escena del checkpoint |

```
CROSS_DEVICE_SCENE_SYNC=false
CROSS_DEVICE_CHECKPOINT_SYNC=true
```

Nunca se reinicia toda la Guide por perder estado de presentación.

---

## 9. Datos y privacidad

| Acción                   | Dato guardado                          | Mi Evolución | Mapa Emocional |
| ------------------------ | -------------------------------------- | ------------ | -------------- |
| Leer capítulo            | Progreso de lectura                    | Sí           | **No**         |
| Escuchar audiolibro      | `chapter_media_completed`              | Sí           | **No**         |
| Escuchar podcast         | `chapter_media_completed`              | Sí           | **No**         |
| Ver video                | `chapter_media_completed`              | Sí           | **No**         |
| Lectura guiada           | Solo sus eventos educativos existentes | Posible      | **No**         |
| Confirmar resonancia     | `Resonance` explícita con procedencia  | —            | **Sí**         |
| Registrar cómo me siento | Check-in explícito posterior           | —            | **Sí**         |

```
MEDIA_ACTIVITY_TRACKING=MINIMAL
NEW_MEDIA_ANALYTICS_EVENTS_IN_MVP=1
MEDIA_ACTIVITY_EVENT=chapter_media_completed
MEDIA_EVENT_GRANULARITY=COMPLETION_ONLY

MEDIA_ACTIVITY_KINDS=AUDIOBOOK|PODCAST|VIDEO
MEDIA_ACTIVITY_DESTINATION=MI_EVOLUCION

GUIDE_ACTIVITY_SOURCE=EXISTING_LEARNING_EVENTS
GUIDE_ACTIVITY_DESTINATION=MI_EVOLUCION

MEDIA_ACTIVITY_AUTOMATIC_MAP_WRITE=false
GUIDED_READING_AUTOMATIC_MAP_WRITE=false

MAP_ENTRY_REQUIRES_EXPLICIT_USER_ACTION=true
GUIDED_READING_EXPLICIT_RESONANCE_ONLY=true
OPTIONAL_POST_EXPERIENCE_CHECKIN=true
EXPERIENCE_CAUSAL_INFERENCE=false
GLOBAL_MAP_INPUTS_EXCLUSIVE_TO_RESONANCE=false
```

El alcance de esta regla es **Guided Reading y las modalidades multimedia**. El
Mapa Emocional conserva otras fuentes explícitas ajenas a Guided Reading —ánimo
autoinformado y micro-checkins— que siguen gobernadas por sus propios
contratos. Esta tabla no las restringe ni las modifica.

```
Mi Evolución registra qué hizo la persona.
Mapa Emocional registra únicamente señales que la persona decidió expresar.
```

El MVP añade **un solo** evento de medios, `chapter_media_completed`, y solo con
granularidad de finalización: audiolibro, podcast o video terminados. No hay
telemetría segundo a segundo ni porcentajes de reproducción. Ese evento va a Mi
Evolución —el registro de actividad— y **nunca** al Mapa Emocional.

La actividad de Guided Reading no estrena eventos: reutiliza los eventos
educativos que el runtime ya emite, y su destino es igualmente Mi Evolución.

Nada de esto entra al Mapa por sí solo. El Mapa solo recibe una acción
explícita: confirmar una resonancia o registrar cómo se siente la persona
después de la experiencia. El check-in posterior es opcional y no se interpreta
como efecto de la experiencia (`EXPERIENCE_CAUSAL_INFERENCE=false`): haber
terminado un video no explica un estado de ánimo.

Ampliar esta telemetría en el futuro exigiría una decisión explícita y una
actualización de esta matriz.

**GR-1 no implementa ninguno de estos writes.** El prototipo anuncia el destino
—«Esta experiencia se registrará en Mi Evolución.»— y no escribe nada.

---

## 10. Desktop, móvil y accesibilidad

```
Desktop:  texto visible + panel lateral Guide      (GR-018)
Móvil:    texto visible + bottom sheet Guide       (GR-019)
```

Requisitos:

```
subtítulos
transcripción
navegación por teclado
foco al pasaje
sin autoplay con sonido
video caído → transcripción
audio opcional
controles accesibles
```

---

## 10bis. Design reference

```
DESIGN_REFERENCE=Rise Guide-like guided micro-learning flow
REFERENCE_USE=inspiration_only
REFERENCE_CLONE=false
EXPERIENCE_TONE=ACCOMPANIED_NOT_ADMINISTRATIVE
```

La Guide no debe sentirse como un formulario, un checklist administrativo, ni
como salir y regresar.

Principios preservados: video breve y explicativo; escenas cortas; una acción
principal; progreso visible; transición explicación → práctica → recall; móvil
prioritario; acompañamiento, no formulario administrativo.

No se copian marcas, assets, capturas ni textos protegidos.

---

## 11. No objetivos

```
NO CMS
NO nuevo Guide lifecycle
NO nuevas tablas
NO migración
NO VIDEO_STEP en el primer MVP
NO analítica segundo a segundo
NO porcentaje de video obligatorio
NO DRM
NO IA generando video en producción
NO múltiples idiomas
NO mobile nativo
NO segunda Guide productiva
NO nuevo scoring del Mapa
```

---

## 12. Roadmap

```
GR0_STATUS=CLOSED
GR1_STATUS=CLOSED

GR2_STATUS=READY_FOR_MEDIA_HOSTING_DECISION
GR2_IMPLEMENTATION_STATUS=NOT_STARTED
GR2_BLOCKER=MEDIA_HOSTING_PROVIDER

GR3_STATUS=BLOCKED_RUNTIME_ANCHOR
GR4_STATUS=BLOCKED_BY_GR3
GR5_STATUS=BLOCKED_BY_GR4
GR6_STATUS=BLOCKED_BY_GR5
```

| Fase | Contenido                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GR-0 | Blueprint documental — aprobado                                                                                                                                                                                    |
| GR-1 | Prototipo visual navegable: sin lifecycle productivo, sin nuevas llamadas de API, sin base de datos, sin migración, sin despliegue. Capturas desktop y móvil, fixtures multimedia locales o assets de demostración |
| GR-2 | Capa multimedia mínima: Leer/Escuchar/Ver/Guía, video + transcript fallback                                                                                                                                        |
| GR-3 | Guide integrada al lector: anchor, práctica inline, recall, feedback, recovery                                                                                                                                     |
| GR-4 | Playwright, privacidad, firewall, desktop, móvil                                                                                                                                                                   |
| GR-5 | Prueba moderada con Jorge + 3–5 personas                                                                                                                                                                           |
| GR-6 | Segundo capítulo o libro, solo tras validar GR-5                                                                                                                                                                   |

---

## 13. Criterios de aceptación del blueprint

```
CANONICAL_PRODUCT_SPEC_CREATED=true
CURRENT_STATE_INVENTORY_COMPLETE=true
CONTEXT_INDEX_COMPLETE=true

APPROVED_DECISIONS_COUNT=22
PROPOSED_DECISIONS_COUNT=0

STORYBOARD_SCENES=8
MEDIA_MODALITIES=4

GUIDE_AUTOSTART=false
GUIDE_INSIDE_READER=true

GUIDED_READING_AUTOMATIC_MAP_WRITE=false
GUIDED_READING_EXPLICIT_RESONANCE_ONLY=true
GLOBAL_MAP_INPUTS_EXCLUSIVE_TO_RESONANCE=false

CONTENT_CORE_STABLE_BLOCK_IDENTITY_IMPLEMENTED=true
GUIDED_READING_ANCHOR_APPROVED=false

RECALL_EDITORIAL_AUTHORITY_DEFINED=true
CORRECT_OPTION_CLIENT_EXPOSED=false

CHECKPOINT_PROGRESS_AUTHORITY=SERVER
SCENE_PROGRESS_AUTHORITY=PRESENTATION

NEW_RUNTIME_CODE=0
NEW_SCHEMA=0
NEW_MIGRATIONS=0
```

---

## 14. Context Index

| Ruta                                                                         | Autoridad sobre                         | Qué decisión controla | Cuándo releerla                                     |
| ---------------------------------------------------------------------------- | --------------------------------------- | --------------------- | --------------------------------------------------- |
| `packages/types/src/guide.ts`                                                | Contrato de tipos Guide                 | Step kinds admitidos  | Antes de proponer un paso nuevo (p. ej. VIDEO_STEP) |
| `apps/api/src/guide/guide-catalog.ts`                                        | Definición productiva pinneada          | GR-005, GR-010        | Antes de añadir una segunda Guide                   |
| `apps/api/src/guide/guide-lifecycle.service.ts`                              | Lifecycle, eventos emitidos             | GR-005, GR-008        | Antes de tocar checkpoints o eventos                |
| `apps/api/src/guide/guide-target-context.service.ts`                         | Resolución de targets                   | GR-005                | Antes de cambiar cómo se ancla un paso              |
| `apps/api/src/guide/guide.controller.ts`                                     | Superficie HTTP, idempotencia           | GR-007                | Antes de cambiar comandos                           |
| `apps/api/src/guide/guide-rollout.ts`                                        | `off\|pilot\|on`, fail-closed           | Despliegue del piloto | Antes de cualquier cambio de rollout                |
| `apps/web/src/components/dashboard/guide/guide-presentation.ts`              | Copy de la Guide en web                 | §1.3, GR-005          | Al añadir escenas o una segunda Guide               |
| `apps/web/src/components/dashboard/guide/GuidePlayer.tsx`                    | UI piloto actual                        | GR-004                | Al mover la Guide dentro del lector                 |
| `apps/web/src/components/dashboard/guide/guide-recovery.ts`                  | Recovery tras recarga                   | GR-004                | Al cambiar dónde vive el player                     |
| `apps/web/src/components/dashboard/lector/LectorShell.tsx`                   | Contenedor del lector, `ReaderMode`     | §3, GR-004            | Al implementar el selector o renombrar modos        |
| `apps/web/src/components/dashboard/lector/AudioBar.tsx`                      | Audio del capítulo                      | GR-002                | Al separar Audiolibro de Podcast                    |
| `apps/web/src/components/dashboard/lector/BlockRenderer.tsx`                 | Render de bloques                       | GR-006                | Al añadir anchor visual                             |
| `apps/web/src/components/dashboard/lector/companion/ReaderCompanionDock.tsx` | Panel dentro del lector                 | GR-004, GR-018/019    | Al diseñar el panel Guide                           |
| `apps/api/src/content-core/anchors.ts`                                       | Anclaje a bloques                       | Escena 3              | Al implementar «Ir al pasaje»                       |
| `apps/api/src/content-core/exercise-ingestion-catalog.ts`                    | Práctica y recall editoriales           | Escenas 4–6           | Al editar la pregunta o la práctica                 |
| `packages/types/src/index.ts` (`ContentUnitRead`)                            | Identidad estable del bloque y `source` | Escena 3, §1.1        | Antes de implementar el anchor                      |
| `docs/product/exercise-content-first-guide-unit.md`                          | Contenido editorial del recall          | Escena 5              | Antes de editar pregunta u opciones                 |
| Frontera checkpoint ↔ escena (`guide-lifecycle.service.ts` vs presentación)  | Quién manda sobre qué progreso          | GR-021, GR-022        | Antes de implementar navegación entre escenas       |
| `docs/adr/0018-resonance-axis-policy.md`                                     | Resonance → Mapa                        | GR-008, GR-009        | Antes de tocar el firewall                          |
| `docs/adr/0019-guide-session-step-source.md`                                 | Origen del ledger de pasos              | GR-005                | Antes de cambiar el ledger                          |
| `apps/api/src/emotional-map/`                                                | Scoring del Mapa                        | GR-008                | Solo para confirmar que Guide no escribe            |
| `docs/product/guide-v1-first-definition.md`                                  | Primera definición                      | Histórico             | Contexto                                            |
| `docs/product/guide-v1-lifecycle.md`                                         | Lifecycle de producto                   | GR-005                | Contexto                                            |
| `docs/product/guide-v1-web-experience.md`                                    | UI piloto actual                        | §1.3                  | Contexto; ver nota de supersesión                   |
| `docs/product/exercise-content-first-guide-unit.md`                          | Contenido de la primera unidad          | Escenas 4–6           | Al editar contenido                                 |

---

## 15. Asuntos diferidos

Resueltas en la aprobación del 2026-07-29 y retiradas de esta lista: eventos
educativos de medios (**no** en el MVP), formato del podcast (**Jorge solo**),
migración de `ReaderMode` (**no**), GR-P09 (aprobada como **GR-021**) y GR-P10
(aprobada como **GR-022**).

Quedan dos asuntos diferidos, ninguno bloquea GR-1:

```
MEDIA_HOSTING_PROVIDER=TBD_UNTIL_GR2

ANCHOR_BLOCK_KEY=TBD
ANCHOR_SOURCE_HEADING=TBD
```

```
OPEN_BLOCKERS_FOR_GR1=0
OPEN_DECISIONS_FOR_GR2=1
OPEN_BLOCKERS_FOR_GR3=1
```

El proveedor de hosting bloquea GR-2, no GR-1. El anchor exacto bloquea GR-3,
no GR-1.

### Notas de la revisión visual de GR-1

Diferidas por decisión de Jorge al aprobar el prototipo. Ninguna bloquea GR-2 ni
GR-3.

```
ANCHOR_SECONDARY_BUTTON_COPY_REFINEMENT_DEFERRED=true
DESKTOP_COMPLETION_INTERNAL_SCROLL_ACCEPTED=true
MOBILE_SHEET_DRAG_AND_SNAP_DEFERRED=true
```

- Tras localizar el pasaje, el botón secundario sigue diciendo «Ir al pasaje».
  Podrá convertirse en «Volver al pasaje» o «Resaltar de nuevo».
- En 1365 x 900 el bloque de check-in del cierre exige un pequeño scroll dentro
  del panel. Aceptado como está.
- El bottom sheet no incorpora arrastre ni puntos de anclaje: V1 no introduce un
  motor de gestos.

---

## 15bis. GR-1 Visual Evidence

```
GR1_PROTOTYPE_ROUTE=/prototipos/lectura-guiada
PROTOTYPE_AVAILABLE_IN_PRODUCTION=false
PROTOTYPE_LINKED_FROM_PRODUCT_NAV=false

VISUAL_EVIDENCE_SOURCE_SHA=d0e83ce50893db7c7bad8e4061c63ed9021189f4
SCREENSHOTS_REGENERATED_FROM_SINGLE_HEAD=true

PRACTICE_EXPLICIT_ROUTE_REQUIRED=true
PRACTICE_COMPLETE_BEFORE_ROUTE_CALLS=0
ANCHOR_ACTION_HIERARCHY_PASS=true
REPEAT_FLOW_FULL_RESET=true
MEDIA_CONTROLS_COHERENT=true
MOBILE_HORIZONTAL_OVERFLOW=0
COMPLETION_RESONANCE_AND_CHECKIN_SEPARATED=true
MOBILE_SELECTOR_HIDDEN_WHILE_GUIDE_OPEN=true
MOBILE_READER_TEXT_VISIBLE_BEHIND_SHEET=true

PROTOTYPE_EVOLUTION_WRITE=false
PROTOTYPE_RESONANCE_WRITE=false
PROTOTYPE_CHECKIN_WRITE=false
PROTOTYPE_MAP_WRITES=0

PROTOTYPE_ANCHOR_KIND=VISUAL_PLACEHOLDER
PROTOTYPE_ANCHOR_BLOCK_KEY=null
RUNTIME_ANCHOR_APPROVED=false

PROTOTYPE_CLIENT_GRADING=false
PROTOTYPE_RESONANCE_WRITE=false
EMOTIONAL_MAP_WRITE=false

CHECKPOINT_PROGRESS_AUTHORITY=SIMULATED_SERVER_FIXTURE
SCENE_PROGRESS_AUTHORITY=PRESENTATION

DESIGN_REFERENCE_USE=inspiration_only
REFERENCE_CLONE=false
EXPERIENCE_TONE=ACCOMPANIED_NOT_ADMINISTRATIVE
```

Capturas de la superficie aislada de revisión. Escritorio a 1365 x 900; movil a
390 x 844. Todo el contenido sale del fixture editorial local: no hay identidad,
ni datos reales, ni llamadas de red.

| #   | Vista                             | Captura                                                                                               |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Selector de modalidad + lector    | [01-selector-desktop.webp](assets/guided-reading-v1-prototype/01-selector-desktop.webp)               |
| 2   | Escuchar (audiolibro / podcast)   | [02-listen-desktop.webp](assets/guided-reading-v1-prototype/02-listen-desktop.webp)                   |
| 3   | Ver (videoexplicacion)            | [03-watch-desktop.webp](assets/guided-reading-v1-prototype/03-watch-desktop.webp)                     |
| 4   | Guide - escena 1, portada         | [04-guide-cover-desktop.webp](assets/guided-reading-v1-prototype/04-guide-cover-desktop.webp)         |
| 5   | Guide - escena 3, pasaje anclado  | [05-guide-anchor-desktop.webp](assets/guided-reading-v1-prototype/05-guide-anchor-desktop.webp)       |
| 6   | Guide - escena 4, practica inline | [06-guide-practice-desktop.webp](assets/guided-reading-v1-prototype/06-guide-practice-desktop.webp)   |
| 7   | Guide - escena 6, feedback REVIEW | [07-guide-feedback-desktop.webp](assets/guided-reading-v1-prototype/07-guide-feedback-desktop.webp)   |
| 8   | Guide - escena 7, cierre          | [08-guide-completed-desktop.webp](assets/guided-reading-v1-prototype/08-guide-completed-desktop.webp) |
| 9   | Guide en movil (bottom sheet)     | [09-guide-mobile.webp](assets/guided-reading-v1-prototype/09-guide-mobile.webp)                       |

Parametros deterministas usados para las capturas (solo preview, nunca contrato
productivo): `?mode=read|listen|watch`, `?mode=guide&scene=1..7`,
`&outcome=correct|review`.

Medicion real en navegador a 390 x 844 (no en jsdom, que no calcula layout).
Las diez superficies moviles —lectura, escuchar, ver y las siete escenas de la
Guide— miden `document.documentElement.scrollWidth = 390` con
`window.innerWidth = 390`. En las siete escenas de la Guide el selector compacto
esta oculto (`display: none`) y queda al menos un bloque de texto del capitulo
visible por encima del sheet; en lectura, escuchar y ver el selector vuelve a
mostrarse.

| Escena movil | Overflow | Selector | Borde superior del sheet | Bloques de texto visibles |
| ------------ | -------- | -------- | ------------------------ | ------------------------- |
| Portada      | 0        | oculto   | 360 px                   | 2                         |
| Clip         | 0        | oculto   | 236 px                   | 1                         |
| Pasaje       | 0        | oculto   | 236 px                   | 1                         |
| Practica     | 0        | oculto   | 203 px                   | 1                         |
| Recall       | 0        | oculto   | 203 px                   | 1                         |
| Feedback     | 0        | oculto   | 236 px                   | 1                         |
| Cierre       | 0        | oculto   | 236 px                   | 1                         |

```
MOBILE_HORIZONTAL_OVERFLOW=0
MOBILE_SCENES_MEASURED=10
MOBILE_SELECTOR_HIDDEN_WHILE_GUIDE_OPEN=true
MOBILE_READER_TEXT_VISIBLE_BEHIND_SHEET=true
```

Las nueve capturas se regeneraron desde un checkout limpio del head del PR
(`git worktree` nuevo, `pnpm install --frozen-lockfile`, build desde cero) y se
sirvieron desde ese build, no desde una carpeta de build previa:

```
SCREENSHOT_BUILD_SOURCE_SHA=d0e83ce50893db7c7bad8e4061c63ed9021189f4
SCREENSHOT_BUILD_CLEAN=true
ALL_SCREENSHOTS_FROM_SINGLE_CODE_SHA=true
STALE_SCREENSHOTS_REMAINING=0
```

Limite conocido del cierre en escritorio: a 1365 x 900 el bloque de resonancia
se ve completo y el de check-in empieza a asomar; quedan 161 px por debajo del
pliegue del panel, alcanzables con el scroll propio del cuerpo. En movil y en
pantallas mas altas ambos bloques caben.

Lo que las capturas **no** demuestran, porque GR-1 no lo implementa: sesion
real, receipts, idempotencia, recovery entre dispositivos, anchor de Content
Core, multimedia real, escritura de `Resonance` ni del Mapa Emocional.

---

## 16. Change Log

Mapa de promoción aplicado en 0.3 — los IDs `GR-P0x` ya no existen:

```
GR-P01 → GR-013    GR-P06 → GR-018
GR-P02 → GR-014    GR-P07 → GR-019
GR-P03 → GR-015    GR-P08 → GR-020
GR-P04 → GR-016    GR-P09 → GR-021
GR-P05 → GR-017    GR-P10 → GR-022
```

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-29 | 0.1     | Initial blueprint from Jorge's product direction: multimodal chapter + integrated Guided Reading.                                                                                                                                                                                                                                                                                             |
| 2026-07-29 | 0.2     | Corrected Content Core facts, scoped Map rule, candidate authority status, editorial anchor, recall authority and scene/checkpoint continuity proposals.                                                                                                                                                                                                                                      |
| 2026-07-29 | 0.3     | Jorge approved the Guided Reading decision packet. Promoted GR-P01…GR-P10 to GR-013…GR-022. Approved MVP constraints for media analytics, podcast format, local scene and playback state, ReaderMode compatibility, deferred hosting and the visual prototype anchor.                                                                                                                         |
| 2026-07-29 | 0.4     | Created the isolated Guided Reading visual prototype for product review. No runtime integration, API calls, persistence or production exposure.                                                                                                                                                                                                                                               |
| 2026-07-29 | 0.5     | Corrected prototype interaction and layout after Jorge's visual review, and set the activity policy: media and Guided Reading activity go to Mi Evolucion with a single completion event; the Emotional Map only receives explicit user actions.                                                                                                                                              |
| 2026-07-29 | 0.6     | Final visual close of GR-1: resonance and the optional check-in became independent blocks (the check-in is no longer an answer to the resonance question), the mobile sheet hides the mode selector and keeps chapter text visible behind it, and the sheet moved to dynamic viewport units with two sizes.                                                                                   |
| 2026-07-29 | 0.7     | Jorge granted final visual approval for GR-1. Approved: desktop reader + side panel; mobile reader + bottom sheet; selector and four modalities; anchor post-click state; inline practice; recall and feedback; completion; and the separation of educational activity, resonance and the optional check-in. GR-1 closed. No runtime, API, database, production or Map integration was added. |

Toda futura modificación del producto debe actualizar `SPEC_VERSION`,
`LAST_UPDATED`, el Decision Registry y este Change Log.
