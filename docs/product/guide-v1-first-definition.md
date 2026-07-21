# Guide V1 — primera definición productiva

```
GUIDE_KEY=eec-c1-cuerpo-antes-que-mente
GUIDE_VERSION=1
GUIDE_STEPS=3
GUIDE_EDITORIAL_APPROVED=true
GUIDE_EDITORIAL_AUTHOR=Jorge
GUIDE_EDITORIAL_REVIEWER=Jorge (self-review)
GUIDE_EDITORIAL_APPROVAL_DATE=2026-07-21
GUIDE_REGISTRY_STATUS=IMPLEMENTED_PENDING_MERGE
GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS
```

La mención `self-review` se conserva deliberadamente: fue una autorrevisión del
responsable del contenido, **no** una revisión independiente.

## 1. Propósito educativo

Una intervención guiada corta sobre el capítulo 1 de _Emociones en
Construcción_ (_¿Realmente sabemos qué es una emoción?_). Acompaña al lector en
tres movimientos: **explorar** la idea de que el cuerpo reacciona antes de que
la mente alcance a nombrar la emoción, **practicar** una exploración corporal
guiada, y **recordar** la idea con una pregunta objetiva. No diagnostica, no
evalúa psicológicamente al lector y no infiere su estado emocional.

## 2. Secuencia exacta y targets

| #   | stepKey                           | kind                  | completionPolicy                | target                                              |
| --- | --------------------------------- | --------------------- | ------------------------------- | --------------------------------------------------- |
| 1   | `explorar-cuerpo-antes-que-mente` | `CONCEPT_EXPLORATION` | `explicit_confirmation`         | `conceptKey=eec-cuerpo-antes-que-mente`             |
| 2   | `practicar-escucharte-por-dentro` | `CATALOG_PRACTICE`    | `catalog_practice_confirmation` | `exerciseKey=eec-c1-practice-escucharte-por-dentro` |
| 3   | `recordar-cuerpo-antes-que-mente` | `ACTIVE_RECALL`       | `objective_recall`              | `itemKey=eec-c1-recall-cuerpo-antes-que-mente`      |

Los tres pasos son `required: true` (V1 no tiene pasos opcionales) y su `order`
es contiguo `1..3`. Los targets son claves reales del catálogo: su contenido
editorial fue aprobado en PR #591 e ingerido por la vía productiva del backfill
de Content Core en PR #592 (merge `c1e0ed9`).

## 3. Semántica de cada `completionPolicy`

- **`explicit_confirmation`** (paso 1) — **autoinforme**. Aceptar el paso
  significa «marqué que exploré este concepto»; nunca afirma comprensión ni la
  mide.
- **`catalog_practice_confirmation`** (paso 2) — **autoinforme**. Una
  reflexión guiada completada no es verificable por el servidor (ADR 0017): el
  usuario confirma que la hizo.
- **`objective_recall`** (paso 3) — **calificado por el servidor**. Solo el
  comando dedicado de recall completa el paso; el servidor compara la
  `selectedOptionKey` contra la respuesta canónica del catálogo interno del
  QUIZ. El cliente nunca envía ni recibe la respuesta correcta.

La distinción es deliberada: **autoinforme ≠ recall calificado**. Los dos
primeros pasos registran una acción declarada por la persona; el tercero es el
único con corrección objetiva.

## 4. Contexto editorial derivado en el servidor

```
GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS
CLIENT_EDITORIAL_CONTEXT_ALLOWED=false
```

La definición **no contiene** `bookSlug`, `editionKey`, `unitKey` ni ningún id
de base de datos. El servidor resuelve `conceptKey`, `exerciseKey` e `itemKey`
con el `LearningCatalogResolver` real y **comprueba que los tres devuelvan
exactamente el mismo** `bookId`, `editionId`, `revisionId` y `unitId`. Si no
convergen, no hay contexto editorial único y la operación no procede.

CC-7.4C **debe aplicar esta misma comprobación antes de crear una sesión**.
Esta ejecución solo publica la definición y fija/prueba la política — no
implementa lifecycle, ni START, ni persistencia de sesión.

## 5. Versionado e inmutabilidad

`guideKey@guideVersion` es **inmutable**. Cambiar un paso, una política o un
target exige publicar una **nueva versión**, nunca editar esta. El registry
resuelve por par exacto (`getExact`); `latestStartableVersion` existe solo para
**iniciar** una sesión nueva. No hay fallback de versión, ni first-match, ni
edición «más cercana»: una sesión fija su versión al empezar y siempre resuelve
contra ese pin.

## 6. Privacidad

- La definición es **contenido de catálogo**: claves editoriales y políticas.
  Sin datos del usuario, sin texto libre, sin metadata abierta.
- **La respuesta correcta no está aquí.** `correctOptionKey` vive únicamente en
  el catálogo server-side del QUIZ y jamás se serializa hacia el cliente
  (contrato CC-7.3). Una prueba verifica que el JSON de la definición no
  contiene ni `correctOptionKey` ni el valor aprobado.
- **Sin inferencias emocionales**: ningún paso puntúa, clasifica ni deduce el
  estado emocional de la persona. No toca el Mapa Emocional, su scoring, el
  model-registry ni `CACHE_EPOCH`.
- **Sin LearningEvents durante la publicación**: publicar una definición es un
  cambio de catálogo en código; no escribe ninguna fila ni emite ningún evento.

## 7. Estado

- `GUIDE_REGISTRY_STATUS=IMPLEMENTED_PENDING_MERGE` — la definición está en
  código (`PRODUCTION_GUIDE_DEFINITIONS`, 1 entrada) y probada contra
  PostgreSQL real, pendiente de merge.
- **Todavía no hay lifecycle, endpoints ni deploy.** No existe START, ni
  sesión, ni ruta HTTP de Guide; ninguna ejecución tocó la base de producción.
- Lo siguiente (CC-7.4C) es el lifecycle de sesión, que deberá aplicar la
  política de contexto derivado antes de crear cualquier sesión.
