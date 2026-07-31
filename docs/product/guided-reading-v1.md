# Guided Reading V1 — Blueprint canónico

```
GUIDED_READING_SPEC_VERSION=1.0

GUIDED_READING_BLUEPRINT_STATUS=APPROVED
GUIDED_READING_IMPLEMENTATION_STATUS=IN_REVIEW
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

GR2_STATUS=CLOSED
GR2_IMPLEMENTATION_STATUS=CLOSED
GR2_MEDIA_STACK_APPROVED=true
GR2_VIDEO_PROVIDER=CLOUDFLARE_STREAM
GR2_OBJECT_STORAGE=CLOUDFLARE_R2
GR2_MEDIA_CATALOG_STATUS=IMPLEMENTED
GR2_EXTERNAL_ASSETS_STATUS=PENDING_EDITORIAL_ASSETS
GR2_RESPONSIVE_RELEASE_GATE_STATUS=IN_REVIEW
DASHBOARD_RESPONSIVE_SHELL_IMPLEMENTED=true
READER_MEDIA_MOBILE_IMPLEMENTED=true

GUIDED_READING_DECISION_PACKET_APPROVED=true

LAST_UPDATED=2026-07-31

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

La aprobación autoriza el prototipo visual GR-1. La integración runtime GR-3
quedó autorizada después, con el anchor editorial ya decidido:

```
GR3_IMPLEMENTATION_AUTHORIZED_BY_JORGE=true
GR3_RUNTIME_ANCHOR_STATUS=IMPLEMENTED_RELEASE_GATE_PASSED
```

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
MEDIA_HOSTING_PROVIDER=CLOUDFLARE_STREAM_AND_R2
VIDEO_HOSTING=CLOUDFLARE_STREAM
AUDIO_AND_ASSET_HOSTING=CLOUDFLARE_R2
MEDIA_CATALOG=CODE_OWNED
```

Decidido en GR-2: video en Cloudflare Stream con token firmado corto; audio,
transcripción y poster en R2 con URL firmada. El catálogo vive en código
revisado (`apps/api/src/lector/media/chapter-media.catalog.ts`), no en una base
de datos editorial.

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

MEDIA_ACTIVITY_DESTINATION=MI_EVOLUCION
GUIDE_ACTIVITY_DESTINATION=MI_EVOLUCION

MEDIA_AUTOMATIC_MAP_WRITE=false
GUIDED_READING_AUTOMATIC_MAP_WRITE=false

MEDIA_HOSTING_PROVIDER=CLOUDFLARE_STREAM_AND_R2
MEDIA_HOSTING_BLOCKS_GR1=false

LEGACY_READER_MODE_INTERNAL_VALUE=guia
LEGACY_READER_MODE_VISIBLE_LABEL=Escuchar
LEGACY_READER_MODE_LOCALSTORAGE_MIGRATION=false

GR1_VISUAL_ANCHOR_PLACEHOLDER_ALLOWED=true
GR3_RUNTIME_ANCHOR_STATUS=IMPLEMENTED_PENDING_RELEASE_GATE

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
- El anchor editorial está aprobado (§ anchor); GR-3 ya puede integrarlo.

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
ANCHOR_EDITORIAL_STATUS=APPROVED
ANCHOR_SOURCE_HEADING=El cuerpo y la emoción
ANCHOR_PASSAGE_LAST_SENTENCE=Nuestro cuerpo siente antes que nuestra mente entienda.
ANCHOR_BLOCK_KEY_RESOLUTION=PER_ENVIRONMENT_FROM_CONTENT_CORE

ANCHOR_BLOCKS_GR1=false
ANCHOR_BLOCKS_GR3=false
```

La identidad estable del bloque ya existe (§1.1). La decisión editorial que
faltaba está tomada: se ancla el **tercer párrafo de «El cuerpo y la emoción»**,
el que describe adónde va la sangre con miedo, con enojo y con tristeza y cierra
con «Nuestro cuerpo siente antes que nuestra mente entienda». Es la tesis del
concepto en una sola frase, y vive bajo el encabezado que ya lleva su nombre.

`ANCHOR_BLOCK_KEY` no se fija como literal aquí a propósito. El `blockKey` de
Content Core se deriva del `ChapterBlock.id` (uuid v5 determinista, CC-1), así
que su valor es **por entorno**: escribirlo como constante lo volvería falso en
cuanto se ingiera el capítulo en otro sitio. La identidad que sí es estable —y
la que este documento fija— es la **editorial**: encabezado + pasaje. El runtime
resuelve el bloque desde ahí.

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

| Situación                       | Resultado                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Recarga en el mismo navegador   | vuelve al pasaje anclado                                                                                              |
| Estado local ausente o corrupto | vuelve al inicio del checkpoint `Concepto`, dentro de la MISMA sesión                                                 |
| Otro dispositivo                | no recupera la sesión, escena, checkpoint ni veredicto; muestra una nueva portada y requiere iniciar una sesión nueva |

```
CROSS_DEVICE_RESUME_V1=false
CROSS_DEVICE_SCENE_SYNC=false
CROSS_DEVICE_CHECKPOINT_SYNC=false
ANOTHER_DEVICE_BEHAVIOR=NEW_COVER_NEW_SESSION
```

Por qué otro dispositivo no recupera nada: la única forma de que un navegador
vuelva a su sesión es reproducir la clave de idempotencia con la que la inició,
y esa clave vive sólo en ese navegador. No existe endpoint de lectura del
lifecycle, así que un segundo dispositivo no tiene forma de descubrir que hay
una sesión abierta. Eso es el contrato de V1, no una limitación temporal.

«Nunca se reinicia toda la Guide por perder estado de presentación» describe un
caso más estrecho: la pérdida o corrupción del registro local **dentro de un
navegador que todavía puede recuperar su sesión con su clave START**. Ahí el
servidor sigue mandando sobre el checkpoint y sólo se pierde la escena visual.
No dice nada sobre otros dispositivos, que no tienen sesión que reiniciar.

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
NO nuevas migraciones del lifecycle Guide
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

Una excepción, aprobada explícitamente y acotada: la procedencia de una
resonancia confirmada dentro de una Guide. No toca el lifecycle Guide — añade
un valor al enum `ResonanceSource` para que «Mis resonancias» pueda decir de
dónde vino cada confirmación sin mentir.

```
RESONANCE_SOURCE_GUIDE_MIGRATION=APPROVED
RESONANCE_SOURCE_GUIDE_MIGRATION_FILES=1
```

---

## 12. Roadmap

```
GR0_STATUS=CLOSED
GR1_STATUS=CLOSED

GR2_STATUS=CLOSED
GR2_IMPLEMENTATION_STATUS=CLOSED
GR2_BLOCKER=PENDING_EDITORIAL_ASSETS

GR3_STATUS=COMPLETE_PENDING_MERGE
GR3_IMPLEMENTATION_STATUS=COMPLETE_PENDING_MERGE
GR3_EDITORIAL_ANCHOR_STATUS=APPROVED
GR3_RUNTIME_ANCHOR_STATUS=IMPLEMENTED_PENDING_RELEASE_GATE

OPEN_DECISION_BLOCKERS_FOR_GR3=0
RUNTIME_PRECONDITIONS_FOR_GR3=1
RUNTIME_PRECONDITION=CANONICAL_CHAPTER_CONTENT_INGESTED

GR3_SCREENSHOTS_STATUS=COMPLETE
GR3_RESPONSIVE_BROWSER_GATE_STATUS=PASS
GR3_FINAL_RUNTIME_REVIEW=APPROVED

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

Queda un asunto diferido, y no bloquea GR-1:

```
MEDIA_HOSTING_PROVIDER=CLOUDFLARE_STREAM_AND_R2

ANCHOR_EDITORIAL_STATUS=APPROVED
ANCHOR_SOURCE_HEADING=El cuerpo y la emoción
```

```
OPEN_BLOCKERS_FOR_GR1=0
OPEN_DECISIONS_FOR_GR2=0
OPEN_BLOCKERS_FOR_GR2=1
OPEN_BLOCKERS_FOR_GR3=0
```

El proveedor de hosting ya está decidido (GR-2). Lo que queda pendiente para
GR-2 no es una decisión sino producción: los masters editoriales
(`docs/product/chapter-01-media-package.md`). El anchor editorial quedó
aprobado el 2026-07-30 y ya no bloquea GR-3.

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

## 15ter. GR-2 Implementation

```
GR2_STATUS=CLOSED
GR2_IMPLEMENTATION_STATUS=CLOSED

GR2_MEDIA_CATALOG_STATUS=IMPLEMENTED
PRODUCTION_MEDIA_DEFINITIONS=3
PUBLISHED_MEDIA_DEFINITIONS=1
DRAFT_MEDIA_DEFINITIONS=2

STREAM_SIGNED_ACCESS_IMPLEMENTED=true
R2_SIGNED_ACCESS_REUSED=true
CHAPTER_AUDIO_ENDPOINT_PRESERVED=true

MEDIA_ACTIVITY_EVENT=chapter_media_completed
MEDIA_ACTIVITY_EVENT_COUNT=1
MEDIA_EVENT_GRANULARITY=COMPLETION_ONLY
LEARNING_EVENT_TYPES_SUPPORTED=8
MEDIA_COMPLETION_IDEMPOTENCY=SERVER_DERIVED
MEDIA_COMPLETION_CROSS_DEVICE_DUPLICATES=0

EVOLUTION_MEDIA_ACTIVITY_IMPLEMENTED=true
EVOLUTION_GUIDE_ACTIVITY_IMPLEMENTED=true

MEDIA_AUTOMATIC_MAP_WRITE=false
EMOTIONAL_MAP_CANONICAL_DELTA=0
EMOTIONAL_MAP_LEARNING_EVENT_READS=0

MIGRATION_FILES_ADDED=1
SCHEMA_TABLES_ADDED=0
SCHEMA_COLUMNS_ADDED=0

MEDIA_PACKAGE_STATUS=PENDING_EDITORIAL_ASSETS
CLOUDFLARE_RESOURCES_CHANGED=false
R2_OBJECTS_UPLOADED=0
PRODUCTION_CHANGED=false
DEPLOY_EXECUTED=false
```

### Lo que GR-2 implementó

La capa multimedia real del capítulo, reutilizando lo que ya existía:

| Formato          | Fuente                 | Firma                               | Estado hoy |
| ---------------- | ---------------------- | ----------------------------------- | ---------- |
| Audiolibro       | la fila `Audio` actual | `LectorService.getAudio` (6 h)      | PUBLISHED  |
| Podcast          | R2                     | `StorageService.getSignedUrl` (1 h) | DRAFT      |
| Videoexplicación | Cloudflare Stream      | token firmado ~15 min → iframe      | DRAFT      |

Tres rutas nuevas bajo el Lector: `GET …/:chapterOrder/media` (metadata, firma
nada), `GET …/media/:mediaKey/access` (la única respuesta con URL firmada) y
`POST …/media/:mediaKey/complete` (sin body).

El selector visible pasa a **Leer · Escuchar · Ver**. El valor local legacy
`"guia"` sigue significando Escuchar, así que ninguna preferencia guardada se
migra. «Lectura guiada» permanece en esta especificación y en el prototipo como
autoridad de GR-3, y deliberadamente **no** es un cuarto botón: un botón que no
lleva a ningún lado es peor que su ausencia.

### Actividad y Mapa

```
Mi Evolución registra qué hizo la persona.
Mapa Emocional registra únicamente señales que la persona decidió expresar.
```

Terminar un audiolibro, un podcast o un video emite un único evento
(`chapter_media_completed`) con granularidad de finalización. Ese evento va a Mi
Evolución —la tarjeta «Actividad de aprendizaje», seis contadores— y **nunca** al
Mapa Emocional. El firewall dinámico lo demuestra sobre PostgreSQL real: la
proyección canónica del Mapa queda idéntica byte a byte, y el control negativo
(un check-in explícito) sí la mueve.

La idempotencia la deriva el servidor de `mediaKey + mediaVersion`, así que la
misma persona terminando el mismo medio produce **una** fila tras recarga, doble
evento `ended`, segundo dispositivo o retry de red. Una versión nueva del master
es una actividad nueva, no un duplicado.

### Responsive del shell — puerta de release

```
GR2_RESPONSIVE_RELEASE_GATE_STATUS=IN_REVIEW
DASHBOARD_RESPONSIVE_SHELL_IMPLEMENTED=true
READER_MEDIA_MOBILE_IMPLEMENTED=true
```

El defecto no era desbordamiento horizontal: era **shrink-to-fit**. `.app` era
una grilla fija `248px 1fr` sin ninguna media query, así que un teléfono de
390 px no tenía layout móvil y el navegador caía a escalar la página. Medido en
Chrome, `window.innerWidth` daba **687** en un viewport de 390, `.side` seguía
visible a 390/430/768 y `.main` arrancaba en x=248 dejando ~142 px CSS al
lector. El solape del header, los selectores cortados y la tarjeta de Eco
«palabra por palabra» eran consecuencias de ese ~0.57 de escala, no defectos
independientes.

Por debajo de 1023 px la barra lateral pasa a ser un **cajón** fuera de lienzo:
botón rotulado en el header, `aria-expanded`, el foco entra al panel al abrir,
Escape lo cierra y devuelve el foco al botón, y el panel aparcado queda `inert`
(fuera del orden de tabulación). `.main` es `width: 100%; min-width: 0` — se
quita el piso de contenido mínimo en lugar de tapar el desborde con
`overflow-x: hidden`.

Ningún control desaparece: los disparadores de ánimo y ambiente pliegan su
rótulo redundante (ambos ya traen `aria-label` explícito) y mantienen 40 px de
área táctil. El selector de modo, el selector Audiolibro/Podcast y las cinco
pestañas de Biblioteca **se desplazan dentro de sí mismos** en vez de ensanchar
la página. El marco del video declara su relación 16:9 y `width: 100%`, así que
el iframe no puede imponerle un `min-width` a la columna del lector.

Medido en Chrome a 390 / 430 / 768 / 1024 / 1365 px:

| Aserción                                   | 390 | 430 | 768 | 1024 | 1365 |
| ------------------------------------------ | --- | --- | --- | ---- | ---- |
| `document.scrollWidth === innerWidth`      | ✅  | ✅  | ✅  | ✅   | ✅   |
| `innerWidth` = ancho del dispositivo       | ✅  | ✅  | ✅  | ✅   | ✅   |
| barra lateral de escritorio oculta         | ✅  | ✅  | ✅  | —    | —    |
| `.main` dentro del viewport, `min-width:0` | ✅  | ✅  | ✅  | ✅   | ✅   |
| controles fuera del viewport               | 0   | 0   | 0   | 0    | 0    |
| controles interceptados por otro elemento  | 0   | 0   | 0   | 0    | 0    |

El test que produce esos números vive en
[`apps/web/e2e/responsive.mjs`](../../apps/web/e2e/responsive.mjs) (262
aserciones sobre cajas reales en Chrome, 3 viewports × 6 estados + el cajón).
Está **fuera** del grafo de `pnpm test` a propósito: CI no provisiona
navegadores. Se corre con
`pnpm --filter @psico/web test:responsive` y credenciales por entorno.

Barrido de regresión a 390 px sobre Inicio, Mi Evolución, Mapa Emocional,
Patrones IA, Reflexiones, Exploraciones, Biblioteca y Eco: las ocho cargan
(HTTP 200), ninguna desborda, el cajón abre y cierra en todas, y nada queda
inaccesible detrás de él. Biblioteca necesitó el mismo tratamiento que los
selectores del lector (sus cinco pestañas medían 443 px de contenido mínimo).

### El estado DRAFT del video, verificado

```
VIDEO_DEFINITION_STATUS=DRAFT
VIDEO_DEFINITION_SOURCE=null
VIDEO_DRAFT_STATE_HONEST=true
VIDEO_PLAYER_MOUNTED_WHILE_DRAFT=false
VIDEO_ACCESS_REQUESTS_WHILE_DRAFT=0
```

Medido en Chrome sobre el head, **sin ninguna fixture ni interceptación**, a
390 / 768 / 1365 px: `Leer → Ver` dice «Videoexplicación en producción», el
manifiesto llega de verdad (la descripción visible es la del catálogo), y el
cliente **no** monta el iframe de Stream, **no** pide acceso y **no** hace
ninguna petición a un dominio de proveedor. `DRAFT ⇒ source === null` sigue
comprobado en runtime por el catálogo.

**Y un error que sí era real.** El indicador rojo «1 error» que apareció en una
captura anterior de `Ver` no era una imagen vieja: se reproducía. Entrar al
lector con un modo ya guardado producía un desajuste de hidratación porque el
modo se sembraba desde `localStorage` **dentro del inicializador de `useState`**
— el servidor no tiene `localStorage`, así que renderizaba Leer mientras el
primer render del cliente renderizaba el modo guardado. React reportaba
«Text content did not match», descartaba el HTML del servidor de todo el
documento y, en desarrollo, pintaba el indicador de error sobre el lector.

Antes del fix, entrando a `Ver`: **13 avisos de hidratación** y `nextjs-portal`
en pantalla, en los tres viewports. Después: **cero**, en todos los estados y
todos los viewports. La preferencia no se pierde — se adopta en un efecto, tras
la hidratación. Tres tests jsdom fijan el contrato y el arnés de navegador real
ahora afirma, por viewport y por estado, que no hay desajuste de hidratación, ni
error no manejado, ni indicador de desarrollo en el DOM. La suite del navegador
real corre **316 aserciones**.

### La metadata del capítulo, alineada a su autoridad

```
CHAPTER_TITLE_IN_EVIDENCE=¿Realmente sabemos qué es una emoción?
CHAPTER_TITLE_MATCHES_TITLES_JSON=true
CHAPTER_TITLE_MATCHES_PRODUCT_SPEC=true
CHAPTER_TITLE_SOURCE=evidence_database_seed
AUTHOR_METADATA_VERIFIED=false
UNVERIFIED_AUTHOR_VISIBLE=false
PRODUCTION_CONTENT_CHANGED=false
```

Las capturas anteriores mostraban «Introducción: Entendiendo tus Emociones». Ese
título no lo produce ninguna autoridad del repositorio: el manifiesto de ingesta
[`titles.json`](../../apps/api/content/emociones-en-construccion/titles.json) y
el `seed` dicen «¿Realmente sabemos qué es una emoción?», igual que este
documento (§ Alcance). Venía de una **fila vieja de la base local de evidencia**,
anterior al auto-curado que el seed hace en cada despliegue desde 2026-07-13.
Volver a sembrar la alineó. No se tocó el capítulo fuente ni contenido
productivo.

**El autor no tiene autoridad en el repositorio.** El directorio de contenido no
lleva atribución, los markdown no tienen front matter, y los nombres que sí
aparecen se contradicen entre sí: «Marina Quintana» como `BookAuthor` sembrado y
—por separado— como terapeuta sembrado, «Dra. Marina Salazar» en un prototipo de
diseño. La autoría no se infiere. La fixture de evidencia lleva el fallback sin
autor que el propio contrato documenta (`artist: "Psico Platform"`), así que
ninguna captura afirma quién escribió el libro. La metadata productiva queda
intacta: el API sigue devolviendo lo que diga la fila del libro.

### Evidencia visual

```
SCREENSHOTS_CREATED=6
ALL_SCREENSHOTS_FROM_SINGLE_SHA=true
MOBILE_SCREENSHOT_CROPPED=false
STALE_SCREENSHOTS_REMAINING=0
DEVELOPMENT_OVERLAYS_IN_SCREENSHOTS=0
PII_IN_SCREENSHOTS=false
CANONICAL_CHAPTER_TITLE_VISIBLE=true
TRANSFORMATION_CLAIM_VISIBLE=false
```

Las seis capturas salen del **mismo árbol** (`4751f48`), contra el API real en
local y una cuenta sintética de desarrollo. Son de **viewport completo**: no hay
recorte. Donde la barra lateral aparece, el bloque de cuenta va **tapado con una
máscara opaca** — el layout completo queda a la vista y la dirección no; en
móvil no hay máscara porque el cajón está aparcado fuera de lienzo, y el script
lo comprueba (`accountRight = -17`) antes de disparar en vez de confiar. El
script **se niega a escribir** una captura si encuentra `nextjs-portal` en el
DOM, si aparece el título viejo, o si aparece cualquiera de los nombres de autor
sin autoridad. La 3 se niega además si aparece un iframe o falta el copy de
DRAFT; las del lector se niegan si el título canónico no está en el DOM; y la 5
se niega si aparece la palabra «transformación» (en el lector no aplica: la prosa
del capítulo la usa con toda legitimidad).

| #   | Vista                                         | Viewport   | Fixture | Captura                                                                                                 |
| --- | --------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Escuchar · audiolibro con reproductor abierto | 1365 × 900 | sí      | [01-reader-listen-audiobook.webp](assets/gr2-media/01-reader-listen-audiobook.webp)                     |
| 2   | Escuchar · podcast en producción              | 1365 × 900 | no      | [02-reader-listen-podcast-coming-soon.webp](assets/gr2-media/02-reader-listen-podcast-coming-soon.webp) |
| 3   | Ver · videoexplicación en producción          | 1365 × 900 | no      | [03-reader-watch-video.webp](assets/gr2-media/03-reader-watch-video.webp)                               |
| 4   | Cajón de navegación móvil abierto             | 390 × 844  | no      | [04-dashboard-mobile-drawer.webp](assets/gr2-media/04-dashboard-mobile-drawer.webp)                     |
| 5   | Mi Evolución · actividad de aprendizaje       | 1365 × 900 | no      | [05-evolution-learning-activity.webp](assets/gr2-media/05-evolution-learning-activity.webp)             |
| 6   | Lector multimedia en móvil                    | 390 × 844  | sí      | [06-reader-media-mobile.webp](assets/gr2-media/06-reader-media-mobile.webp)                             |

```
sha256
5331d2d924014893793c017282e7ad31bbd22958ca8aaf466a0d2884361110c5  01-reader-listen-audiobook.webp
127f9488eff815c966d8a7e2298138bf5920e7884ea3e8e2b8b5f2d4636285b3  02-reader-listen-podcast-coming-soon.webp
753f2dfcfb0ba11b240619cf500b4d40475ba37ef32becfdb015519dfbc6c04e  03-reader-watch-video.webp
1b46edf4c90e562b5f2a9345b81097408c19816e95a7ce3c381486505aa72775  04-dashboard-mobile-drawer.webp
f2af43efa50b8c54312cb9c57594ff15caf934ead219abd11585fefc0053bb9b  05-evolution-learning-activity.webp
90b8342cc68bb54229a5f6e7dec85153da595560550ce96910c84ce7edcfb17f  06-reader-media-mobile.webp
```

La 4 conserva su hash: el cajón tapa el lector, así que el cambio de título no
entra en cuadro y el render es idéntico byte a byte. Se disparó en la misma
corrida que las otras cinco.

Ruta del lector en 1, 2, 3, 4 y 6:
`/dashboard/biblioteca/emociones-en-construccion/lector/1` (sin parámetros de
consulta). En 5: `/dashboard/evolucion`.

La captura 5 muestra los **seis** contadores de «Actividad de aprendizaje»
—audiolibros, podcasts, videoexplicaciones, lecturas guiadas, prácticas e
intentos de recuerdo— en un solo cuadro; el script se niega a disparar si alguno
queda fuera. En el mismo cuadro se lee «Hitos de tu recorrido», el encabezado
corregido.

La captura 6 es el lector en Escuchar a 390 × 844 px CSS, sin recortar: sin
barra lateral de escritorio, con el botón de navegación, los tres modos
(Leer · Escuchar · Ver), los dos formatos (Audiolibro · Podcast) y la tarjeta de
Eco a ancho completo. El reproductor expandido queda por debajo del pliegue en
una pantalla de 844 px —el header del capítulo es sticky y tapa la fila de modos
en cuanto se hace scroll, así que ningún cuadro de 390 × 844 contiene ambas
cosas— pero su geometría **sí** está medida: `x=16 → derecha=374` dentro de un
viewport de 390, con las filas de velocidad y temporizador en una sola línea.

En la 6 el título sale **truncado con puntos suspensivos** («Cap. 1 · ¿Realmente
sabemos q…»): así lo recorta el header a 390 px por diseño. Es el título
canónico, recortado por el layout, no otro título.

Las capturas 1 y 6 alimentan el reproductor con una **fixture local** (un WAV
silencioso de 3 s servido desde localhost) porque el master del capítulo no está
en el almacenamiento local: sin URL de proveedor, sin UID, sin token, sin URL
firmada. Las otras cuatro son el estado real del código, sin fixture.

Esa fixture está **versionada** en
[`apps/web/e2e/fixtures/gr2-audio.json`](../../apps/web/e2e/fixtures/gr2-audio.json)
y fijada en CI contra `titles.json`, para que el título de la evidencia no pueda
divergir de su autoridad sin romper el build. Su línea de transcripción se
declara a sí misma como fixture en vez de imitar prosa del libro.

**Lo que no se fotografía y por qué.** La pantalla de transcripción vive en la
superficie de video, que sigue en `DRAFT`. Publicarla sólo del lado del cliente
para poder fotografiarla sería inventar un estado que el servidor no reconoce, y
además vuelve a producir un desajuste de hidratación. Se fotografía cuando exista
el master. Su lugar en el set lo toma el cajón móvil, que es el corazón de la
puerta responsive y es real de punta a punta.

### Lo que GR-2 NO implementó

```
CLOUDFLARE_RESOURCES_CREATED=false
ASSETS_UPLOADED=false
GUIDE_LIFECYCLE_IN_READER=false
RESONANCE_OR_CHECKIN_FROM_MEDIA=false
CMS=false
PER_SECOND_TRACKING=false
SEPARATE_MEDIA_PROGRESS_TABLE=false
SECOND_BOOK=false
```

Los masters editoriales no existen todavía: el podcast y el video quedan `DRAFT`
y la interfaz dice «En producción». El paquete pendiente y el proceso para
activarlo están en [`chapter-01-media-package.md`](chapter-01-media-package.md).

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

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-29 | 0.1     | Initial blueprint from Jorge's product direction: multimodal chapter + integrated Guided Reading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-29 | 0.2     | Corrected Content Core facts, scoped Map rule, candidate authority status, editorial anchor, recall authority and scene/checkpoint continuity proposals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-07-29 | 0.3     | Jorge approved the Guided Reading decision packet. Promoted GR-P01…GR-P10 to GR-013…GR-022. Approved MVP constraints for media analytics, podcast format, local scene and playback state, ReaderMode compatibility, deferred hosting and the visual prototype anchor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-29 | 0.4     | Created the isolated Guided Reading visual prototype for product review. No runtime integration, API calls, persistence or production exposure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-29 | 0.5     | Corrected prototype interaction and layout after Jorge's visual review, and set the activity policy: media and Guided Reading activity go to Mi Evolucion with a single completion event; the Emotional Map only receives explicit user actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-29 | 0.6     | Final visual close of GR-1: resonance and the optional check-in became independent blocks (the check-in is no longer an answer to the resonance question), the mobile sheet hides the mode selector and keeps chapter text visible behind it, and the sheet moved to dynamic viewport units with two sizes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-29 | 0.7     | Jorge granted final visual approval for GR-1. Approved: desktop reader + side panel; mobile reader + bottom sheet; selector and four modalities; anchor post-click state; inline practice; recall and feedback; completion; and the separation of educational activity, resonance and the optional check-in. GR-1 closed. No runtime, API, database, production or Map integration was added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-31 | 1.0     | GR-3 closed for merge. The release gate became reproducible and is now one command: it builds a disposable database from the checkout under audit, starts the API with the exact allowed origin and an in-memory rate-limit store (nothing shared is touched), drives Chrome, and gives everything back. Teardown is VERIFIED rather than assumed — a signal sent is not a process stopped, a drop attempted is not a database gone — and the exit code is `PRIMARY_GATE_PASS && TEARDOWN_PASS`, with failing paths covered by unit tests. Eight captures, promoted as a directory swap so a partial bundle cannot exist, each screened for PII (address, tokens, signed URLs, internal identity) before it is written. The check-in is verified in the real browser: the guide closes, the route does not change, the topbar dialog opens with focus inside it, nothing is preselected and nothing is written before choosing or after Escape. The cross-device row was corrected: another device does NOT resume — it gets a new cover and a new session, because the only way back into a session is the idempotency key that never leaves the browser that started it. Not merged, not deployed, no production change. |
| 2026-07-30 | 0.9     | GR-3 integrated guided reading INTO the reader: the guide opens as a panel over the chapter instead of a route that leaves it. The anchor is editorial (heading + sentence) and resolved at runtime against the blocks the reader was served — Content Core derives `blockKey` per environment, so a literal would be false outside the database it came from. Block granularity: no character offsets. The run has ONE implementation (`useGuideRun`) shared with the standalone route. The recall command now answers `feedback.outcome` (`CORRECT` / `REVIEW`, read back from the accepted ledger so a replay agrees). Scene position is local, disposable and validated against server state; the verdict and its acknowledgement survive a reload. The check-in opens the existing topbar surface in place. One additive migration: `ResonanceSource.GUIDE`.                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-29 | 0.8     | GR-2 implemented the real chapter media layer: a code-owned catalog (audiobook PUBLISHED over the existing chapter audio; podcast and video DRAFT until their masters exist), private Cloudflare Stream access, R2 signing reused through the shared storage service, ONE new educational event (`chapter_media_completed`, completion granularity, server-derived idempotency), the Leer · Escuchar · Ver selector with the legacy `"guia"` value preserved, and the «Actividad de aprendizaje» card in Mi Evolución. One additive migration, no new table or column. Media activity goes to Mi Evolución and never to the Emotional Map.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Toda futura modificación del producto debe actualizar `SPEC_VERSION`,
`LAST_UPDATED`, el Decision Registry y este Change Log.

---

## 15quater. GR-3 Implementation

```
GR3_STATUS=COMPLETE_PENDING_MERGE
GR3_IMPLEMENTATION_STATUS=COMPLETE_PENDING_MERGE
GR3_FINAL_RUNTIME_REVIEW=APPROVED
GR3_SCREENSHOTS_STATUS=COMPLETE
GR3_RESPONSIVE_BROWSER_GATE_STATUS=PASS
GR3_CHECKIN_BROWSER_GATE_PASS=true
GR3_RELEASE_GATE_TEARDOWN_VERIFIED=true

GR3_FOUNDATION_IMPLEMENTED=true
GR3_READER_RUNTIME_IMPLEMENTED=true
GR3_STANDALONE_GUIDE_PRESERVED=true

GR3_ANCHOR_LOCATOR_IMPLEMENTED=true
GR3_ANCHOR_MATCH_COUNT=1
GR3_BLOCK_KEY_HARDCODED=false
GR3_ROUTE_CHANGES_ON_ANCHOR=0

GR3_DESKTOP_PANEL_IMPLEMENTED=true
GR3_MOBILE_BOTTOM_SHEET_IMPLEMENTED=true

GR3_SCENES_IMPLEMENTED=8
GR3_CLIP_ASSET_STATUS=PENDING_EDITORIAL_ASSET
GR3_CLIP_TRANSCRIPT_FALLBACK=true

GR3_PRACTICE_OBSERVATION_FIELDS_STORED=0
GR3_PRACTICE_TIMER_SERVER_EVENTS=0

GR3_RECALL_FEEDBACK_IMPLEMENTED=true
GR3_RECALL_FRESH_REPLAY_MATCH=true
GR3_CORRECT_OPTION_EXPOSED=false

GR3_RESONANCE_EXPLICIT_ONLY=true
GR3_RESONANCE_SOURCE=guide
GR3_RESONANCE_NOW_NOT_WRITES=0

GR3_CHECKIN_REUSES_EXISTING_SURFACE=true
GR3_EXPERIENCE_CAUSAL_INFERENCE=false

GUIDED_READING_AUTOMATIC_MAP_WRITE=false
MAP_ENTRY_REQUIRES_EXPLICIT_USER_ACTION=true

NEW_GUIDE_LIFECYCLE=false
NEW_GUIDE_TABLES=0
NEW_GUIDE_EVENT_TYPES=0
NEW_GUIDE_MIGRATIONS=0
MIGRATION_FILES_ADDED=1
SCHEMA_ENUM_VALUES_ADDED=1
SCHEMA_TABLES_ADDED=0
SCHEMA_COLUMNS_ADDED=0
```

### El anchor

La identidad del pasaje es **editorial**, no una clave. Content Core deriva
`blockKey` como uuidv5 del `ChapterBlock.id` heredado (CC-1), así que el mismo
párrafo tiene una clave distinta en cada entorno donde se ingirió el capítulo.
Un literal en el catálogo sería cierto en una base y falso en la siguiente.

El catálogo (`packages/types/src/guide-anchor.ts`) guarda lo que un editor puede
verificar leyendo el libro:

```
ANCHOR_SOURCE_HEADING=El cuerpo y la emoción
ANCHOR_PASSAGE_LAST_SENTENCE=Nuestro cuerpo siente antes que nuestra mente entienda.
ANCHOR_EXPECTED_MATCH_COUNT=1
ANCHOR_BLOCK_KEY_RESOLUTION=PER_ENVIRONMENT_FROM_CONTENT_CORE
```

`resolveGuideAnchor` lo convierte en una referencia runtime contra los bloques
que el lector recibió, y **falla cerrado** en cada paso: cero coincidencias →
`UNRESOLVED`; más de una → `AMBIGUOUS`; un bloque sin `blockKey` o sin
`blockVersionId` → `UNRESOLVED`. Nunca «la primera coincidencia».

`guide-anchor-ingest.pg-spec.ts` lo prueba contra el manuscrito real: base
efímera → migraciones → herramienta de ingesta sobre
`content/emociones-en-construccion/capitulo-01.md` → backfill de Content Core →
lectura de la unidad publicada → **una** coincidencia. La base de desarrollo
ordinaria conserva los bloques del seed, y mutarla para que el feature pasara
sería arreglar la evidencia en vez del código.

### El feedback del recall

`POST /api/guide/sessions/:id/steps/:key/recall` devuelve ahora
`feedback.outcome`:

```
GUIDE_RECALL_PUBLIC_OUTCOMES=CORRECT|REVIEW
GUIDE_RECALL_CORRECT_OPTION_FIELDS=0
GUIDE_RECALL_SELECTED_OPTION_RESPONSE_FIELDS=0
FRESH_OUTCOME=REPLAY_OUTCOME
```

`REVIEW` y no `INCORRECT`: el ledger conserva el hecho calificado, la superficie
pública ofrece una invitación a volver a mirar. Se **lee del ledger aceptado**
en ambos caminos, así que un replay devuelve el mismo veredicto sin volver a
calificar. Sin ledger, sin `recallResult`, o con un step que no corresponde:
falla cerrado.

### Lo que NO cambió

El lifecycle Guide (`GuideSession` · `GuideSessionStep` ·
`GuideCommandReceipt`), sus cinco comandos, el gate de rollout, la recuperación
y el escritor de LearningEvent son exactamente los mismos. La única migración
del PR añade `GUIDE` al enum `ResonanceSource`, para que «Mis resonancias» pueda
decir de dónde vino cada confirmación sin mentir.
