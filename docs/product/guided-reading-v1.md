# Guided Reading V1 — Blueprint canónico

```
GUIDED_READING_SPEC_VERSION=0.1
GUIDED_READING_BLUEPRINT_STATUS=IN_REVIEW
GUIDED_READING_IMPLEMENTATION_STATUS=NOT_STARTED
GUIDED_READING_VISUAL_PROTOTYPE_STATUS=NOT_STARTED

AUTHORITATIVE_PRODUCT_SPEC=true
PRODUCT_OWNER=Jorge
LAST_UPDATED=2026-07-29

PRODUCTION_RUNTIME_CHANGED=false
PILOT_CONFIGURATION_CHANGED=false

IMPLEMENTATION_SNAPSHOT_MAIN_SHA=c7295cdc27090c5d2826c430156675a0539a2245
IMPLEMENTATION_SNAPSHOT_DEVELOP_SHA=f9f178ac2c86dca4e8a1842ce134158b06f7a0ae
```

## Alcance de autoridad

Este documento es **autoridad de producto**: experiencia, presentación
multimedia y límites de datos.

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

| Capacidad                                       | Estado      | Autoridad                                                                    | Reutilizable | Deuda / limitación                                              |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| Lector de texto por capítulo                    | IMPLEMENTED | `apps/web/src/components/dashboard/lector/LectorShell.tsx`                   | Sí           | Es el contenedor natural de Guided Reading                      |
| Render tipado de bloques                        | IMPLEMENTED | `apps/web/src/components/dashboard/lector/BlockRenderer.tsx`                 | Sí           | —                                                               |
| Content Core (Work/Edition/Revision/Unit/Block) | IMPLEMENTED | `apps/api/src/content-core/`                                                 | Sí           | El payload del lector aún no expone `blockKey`/`blockVersionId` |
| Anclaje de marcas                               | IMPLEMENTED | `apps/api/src/content-core/anchors.ts`                                       | Sí           | Base para el anchor visual al pasaje                            |
| Progreso de lectura                             | IMPLEMENTED | `apps/api/src/lector/`                                                       | Sí           | —                                                               |
| Highlights                                      | IMPLEMENTED | `apps/api/src/lector/highlights.controller.ts`                               | Sí           | Escritura aún por `blockId` legacy                              |
| Anotaciones                                     | IMPLEMENTED | `apps/api/src/lector/annotations.controller.ts`                              | Sí           | —                                                               |
| Eco dentro del lector                           | IMPLEMENTED | `apps/web/src/components/dashboard/lector/companion/ReaderCompanionDock.tsx` | Sí           | Precedente directo del panel Guide                              |
| Reflexión dentro del lector                     | IMPLEMENTED | idem (pestaña Reflexión)                                                     | Sí           | Cifrada E2E                                                     |
| Audio del capítulo cuando existe                | IMPLEMENTED | `apps/web/src/components/dashboard/lector/AudioBar.tsx`                      | Sí           | Los `.m4a` reales aún no están en R2                            |

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

| Capacidad                                    | Estado          |
| -------------------------------------------- | --------------- |
| Videoexplicación completa                    | NOT_IMPLEMENTED |
| Podcast del capítulo                         | NOT_IMPLEMENTED |
| Clips Guide                                  | NOT_IMPLEMENTED |
| Subtítulos                                   | NOT_IMPLEMENTED |
| Transcripción multimedia versionada          | NOT_IMPLEMENTED |
| Panel Guide dentro del lector                | NOT_IMPLEMENTED |
| Anchor visual al pasaje                      | NOT_IMPLEMENTED |
| Práctica inline                              | NOT_IMPLEMENTED |
| Feedback educativo de recall                 | NOT_IMPLEMENTED |
| Fallback de video                            | NOT_IMPLEMENTED |
| E2E de navegador de la experiencia integrada | NOT_IMPLEMENTED |

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

### 5.1 Aprobadas

| ID     | Decisión                                                                                                   | Estado   | Fecha      | Razón                                                                         | Impacto                              |
| ------ | ---------------------------------------------------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| GR-001 | Un capítulo ofrece Leer, Escuchar, Ver y Lectura guiada                                                    | APPROVED | 2026-07-29 | Distintas personas absorben distinto; el capítulo es la unidad, no el formato | Selector de modalidad en el lector   |
| GR-002 | Escuchar contiene Audiolibro y Podcast                                                                     | APPROVED | 2026-07-29 | Son intenciones distintas: fidelidad vs explicación                           | Dos assets, un solo punto de entrada |
| GR-003 | Ver contiene una videoexplicación completa del capítulo                                                    | APPROVED | 2026-07-29 | Alternativa real al texto, no un adorno                                       | Producción de video por capítulo     |
| GR-004 | Lectura guiada vive dentro del lector; no obliga a salir y regresar                                        | APPROVED | 2026-07-29 | Hoy el player está en otra ruta y rompe el hilo de lectura                    | Panel/sheet dentro del lector        |
| GR-005 | La Guide conserva sus tres checkpoints server-owned, pero la presentación puede contener múltiples escenas | APPROVED | 2026-07-29 | Separar narrativa de lifecycle evita rehacer el runtime                       | Escenas ≠ pasos                      |
| GR-006 | Video, transcripción y audio son alternativas; completar el 100 % del video no es condición de avance      | APPROVED | 2026-07-29 | Accesibilidad y respeto por el ritmo del usuario                              | Sin gating por reproducción          |
| GR-007 | La Guide nunca comienza automáticamente                                                                    | APPROVED | 2026-07-29 | Consentimiento explícito; evita sesiones fantasma                             | `GUIDE_AUTOSTART=false`              |
| GR-008 | Completar Guide, ver video, escuchar audio o podcast no modifica automáticamente el Mapa Emocional         | APPROVED | 2026-07-29 | Actividad ≠ estado interior (programa V2)                                     | Firewall se mantiene                 |
| GR-009 | Solo una confirmación explícita de resonancia puede alimentar el Mapa                                      | APPROVED | 2026-07-29 | ADR 0018                                                                      | Un tap, revocable                    |
| GR-010 | Se valida el capítulo 1 antes de añadir otro libro o una segunda Guide productiva                          | APPROVED | 2026-07-29 | Evitar escalar un formato no validado                                         | Alcance cerrado                      |
| GR-011 | Primero storyboard y prototipo visual; después integración runtime                                         | APPROVED | 2026-07-29 | Barato equivocarse en papel                                                   | GR-1 antes que GR-3                  |
| GR-012 | No crear CMS, nuevas tablas ni un nuevo lifecycle para el primer prototipo                                 | APPROVED | 2026-07-29 | El runtime actual ya cubre los tres checkpoints                               | Cero migraciones                     |

`APPROVED_DECISIONS_COUNT=12`

### 5.2 Propuestas — no aprobadas

| ID     | Propuesta                                           | Estado   | Nota                                 |
| ------ | --------------------------------------------------- | -------- | ------------------------------------ |
| GR-P01 | Video completo de 7–9 minutos                       | PROPOSED | Duración a validar con el guion real |
| GR-P02 | Podcast de 8–12 minutos                             | PROPOSED | —                                    |
| GR-P03 | Clip Guide de 60–90 segundos                        | PROPOSED | —                                    |
| GR-P04 | Práctica con temporizador opcional de 45 segundos   | PROPOSED | Debe poder omitirse                  |
| GR-P05 | Estilo de video: Jorge en cámara + gráficos simples | PROPOSED | Decisión de producción               |
| GR-P06 | Desktop: texto y panel lateral                      | PROPOSED | —                                    |
| GR-P07 | Móvil: texto y bottom sheet                         | PROPOSED | —                                    |
| GR-P08 | Feedback recall con outcome `CORRECT\|REVIEW`       | PROPOSED | Nunca score ni porcentaje            |

`PROPOSED_DECISIONS_COUNT=8`

---

## 6. Storyboard — capítulo 1

```
Libro:            Emociones en construcción
Capítulo:         1 — ¿Realmente sabemos qué es una emoción?
Lectura guiada:   El cuerpo sabe antes que la mente
Duración:         8–10 minutos (PROVISIONAL)
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

Duración propuesta: 60–90 s (GR-P03).

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

Estructura propuesta — todos los tiempos **PROVISIONAL**:

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
pregunta inicial
ejemplo cotidiano
explicación científica
matiz importante
aplicación a la vida
cierre
```

No es una lectura literal del capítulo.

Formato aún abierto: Jorge solo, o Jorge + voz entrevistadora.

---

## 9. Datos y privacidad

| Acción               | Dato guardado                            | Mi Evolución | Mapa Emocional |
| -------------------- | ---------------------------------------- | ------------ | -------------- |
| Leer capítulo        | Progreso de lectura                      | Sí           | **No**         |
| Escuchar audiolibro  | Progreso educativo mínimo, si se aprueba | Posible      | **No**         |
| Ver video            | Progreso educativo mínimo, si se aprueba | Posible      | **No**         |
| Escuchar podcast     | Progreso educativo mínimo, si se aprueba | Posible      | **No**         |
| Completar Guide      | Sesión, ledger y eventos educativos      | Posible      | **No**         |
| Confirmar resonancia | `Resonance` explícita con procedencia    | —            | **Sí**         |

```
AUTOMATIC_MAP_WRITE=false
EXPLICIT_RESONANCE_ONLY=true
```

Este documento **no aprueba** nuevos eventos analíticos. Las filas marcadas
«si se aprueba» requieren una decisión posterior.

---

## 10. Desktop, móvil y accesibilidad

```
Desktop propuesto:  texto visible + panel lateral Guide      (GR-P06)
Móvil propuesto:    texto visible + bottom sheet Guide       (GR-P07)
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

| Fase | Contenido                                                                      |
| ---- | ------------------------------------------------------------------------------ |
| GR-0 | Blueprint documental                                                           |
| GR-1 | Prototipo visual sin lifecycle real; capturas desktop y móvil                  |
| GR-2 | Capa multimedia mínima: Leer/Escuchar/Ver/Guía, video + transcript fallback    |
| GR-3 | Guide integrada al lector: anchor, práctica inline, recall, feedback, recovery |
| GR-4 | Playwright, privacidad, firewall, desktop, móvil                               |
| GR-5 | Prueba moderada con Jorge + 3–5 personas                                       |
| GR-6 | Segundo capítulo o libro, solo tras validar GR-5                               |

---

## 13. Criterios de aceptación del blueprint

```
CANONICAL_PRODUCT_SPEC_CREATED=true
CURRENT_STATE_INVENTORY_COMPLETE=true
CONTEXT_INDEX_COMPLETE=true

APPROVED_DECISIONS_COUNT=12
PROPOSED_DECISIONS_COUNT=8

STORYBOARD_SCENES=8
MEDIA_MODALITIES=4

GUIDE_AUTOSTART=false
GUIDE_INSIDE_READER=true

AUTOMATIC_MAP_WRITE=false
EXPLICIT_RESONANCE_ONLY=true

NEW_RUNTIME_CODE=0
NEW_SCHEMA=0
NEW_MIGRATIONS=0
```

---

## 14. Context Index

| Ruta                                                                         | Autoridad sobre                     | Qué decisión controla | Cuándo releerla                                     |
| ---------------------------------------------------------------------------- | ----------------------------------- | --------------------- | --------------------------------------------------- |
| `packages/types/src/guide.ts`                                                | Contrato de tipos Guide             | Step kinds admitidos  | Antes de proponer un paso nuevo (p. ej. VIDEO_STEP) |
| `apps/api/src/guide/guide-catalog.ts`                                        | Definición productiva pinneada      | GR-005, GR-010        | Antes de añadir una segunda Guide                   |
| `apps/api/src/guide/guide-lifecycle.service.ts`                              | Lifecycle, eventos emitidos         | GR-005, GR-008        | Antes de tocar checkpoints o eventos                |
| `apps/api/src/guide/guide-target-context.service.ts`                         | Resolución de targets               | GR-005                | Antes de cambiar cómo se ancla un paso              |
| `apps/api/src/guide/guide.controller.ts`                                     | Superficie HTTP, idempotencia       | GR-007                | Antes de cambiar comandos                           |
| `apps/api/src/guide/guide-rollout.ts`                                        | `off\|pilot\|on`, fail-closed       | Despliegue del piloto | Antes de cualquier cambio de rollout                |
| `apps/web/src/components/dashboard/guide/guide-presentation.ts`              | Copy de la Guide en web             | §1.3, GR-005          | Al añadir escenas o una segunda Guide               |
| `apps/web/src/components/dashboard/guide/GuidePlayer.tsx`                    | UI piloto actual                    | GR-004                | Al mover la Guide dentro del lector                 |
| `apps/web/src/components/dashboard/guide/guide-recovery.ts`                  | Recovery tras recarga               | GR-004                | Al cambiar dónde vive el player                     |
| `apps/web/src/components/dashboard/lector/LectorShell.tsx`                   | Contenedor del lector, `ReaderMode` | §3, GR-004            | Al implementar el selector o renombrar modos        |
| `apps/web/src/components/dashboard/lector/AudioBar.tsx`                      | Audio del capítulo                  | GR-002                | Al separar Audiolibro de Podcast                    |
| `apps/web/src/components/dashboard/lector/BlockRenderer.tsx`                 | Render de bloques                   | GR-006                | Al añadir anchor visual                             |
| `apps/web/src/components/dashboard/lector/companion/ReaderCompanionDock.tsx` | Panel dentro del lector             | GR-004, GR-P06/P07    | Al diseñar el panel Guide                           |
| `apps/api/src/content-core/anchors.ts`                                       | Anclaje a bloques                   | Escena 3              | Al implementar «Ir al pasaje»                       |
| `apps/api/src/content-core/exercise-ingestion-catalog.ts`                    | Práctica y recall editoriales       | Escenas 4–6           | Al editar la pregunta o la práctica                 |
| `docs/adr/0018-resonance-axis-policy.md`                                     | Resonance → Mapa                    | GR-008, GR-009        | Antes de tocar el firewall                          |
| `docs/adr/0019-guide-session-step-source.md`                                 | Origen del ledger de pasos          | GR-005                | Antes de cambiar el ledger                          |
| `apps/api/src/emotional-map/`                                                | Scoring del Mapa                    | GR-008                | Solo para confirmar que Guide no escribe            |
| `docs/product/guide-v1-first-definition.md`                                  | Primera definición                  | Histórico             | Contexto                                            |
| `docs/product/guide-v1-lifecycle.md`                                         | Lifecycle de producto               | GR-005                | Contexto                                            |
| `docs/product/guide-v1-web-experience.md`                                    | UI piloto actual                    | §1.3                  | Contexto; ver nota de supersesión                   |
| `docs/product/exercise-content-first-guide-unit.md`                          | Contenido de la primera unidad      | Escenas 4–6           | Al editar contenido                                 |

---

## 15. Preguntas abiertas

1. ¿El progreso de audiolibro, podcast y video genera evento educativo, o solo
   el texto y la Guide? (§9, filas «si se aprueba»)
2. ¿El podcast lleva voz entrevistadora? (§8)
3. ¿Dónde se hospedan los assets? (`MEDIA_HOSTING_PROVIDER=TBD`)
4. ¿El renombrado de `ReaderMode` migra la preferencia guardada o la deja caer
   al default? (§3)
5. ¿La escena 3 exige que el payload del lector exponga `blockKey` y
   `blockVersionId`? (§1.1, deuda abierta de CC-6E)

---

## 16. Change Log

| Fecha      | Versión | Cambio                                                                                            |
| ---------- | ------- | ------------------------------------------------------------------------------------------------- |
| 2026-07-29 | 0.1     | Initial blueprint from Jorge's product direction: multimodal chapter + integrated Guided Reading. |

Toda futura modificación del producto debe actualizar `SPEC_VERSION`,
`LAST_UPDATED`, el Decision Registry y este Change Log.
