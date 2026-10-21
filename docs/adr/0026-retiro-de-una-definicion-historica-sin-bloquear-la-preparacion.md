# ADR 0026 — Retirar una definición histórica sin bloquear la preparación de las nuevas

- **Estado:** propuesto. No aplicado al runtime.
- **Fecha:** 2026-10-21
- **Alcance:** `apps/api/src/experience/experience-code-owned-identity.ts`,
  `experience-production-catalog.ts`, `EXERCISE_INGESTION_CATALOG`.
- **Caso mínimo:** `apps/api/src/experience/experience-code-owned-lifecycle.spec.ts`.

## El problema, medido

Una instalación aprovisionada de cero con las herramientas canónicas **no puede
crear ningún borrador de experiencia, de ningún capítulo**.

La cadena es corta y cada eslabón es una decisión que alguien tomó a conciencia:

1. `PRODUCTION_EXPERIENCE_DEFINITIONS` envía `eec-c1-cuerpo-antes-que-mente` con
   `status: "PUBLISHED"`.
2. `codeOwnedClaimsByUnit` resuelve **todas** las publicadas como conjunto y, si
   una no se puede ubicar, lanza `EXPERIENCE_CODE_OWNED_UNRESOLVED` y rechaza la
   escritura de vinculación en todos los capítulos. El docblock del módulo lo
   llama deliberado: decidir relevancia por posición de capítulo es el fallo que
   ese diseño vino a cerrar.
3. Ubicar esa definición exige resolver los objetivos de su guía, y su par de
   ejercicios está **retirado a propósito** en `EXERCISE_INGESTION_CATALOG`: «a
   fresh environment cannot anchor this practice — and must not try», porque su
   práctica ancla a un encabezado que el manuscrito canónico v1.0 ya no contiene.

Las tres cosas son correctas por separado. Juntas producen un entorno nuevo en el
que la preparación es imposible, y el síntoma —un `create-drafts` que refusa un
capítulo que no tiene nada que ver— no señala a ninguna de ellas.

Verificado en dos bases locales desechables: en una construida desde cero con la
semilla canónica, el conjunto no resuelve y `create-drafts` refusa; en un clon de
una base donde el par del piloto fue ingerido antes de su retirada, el conjunto
resuelve y las cinco experiencias de C01 se crean sin tocar nada más.

## Lo que NO se propone

- Capturar `EXPERIENCE_CODE_OWNED_UNRESOLVED` y continuar. Eso apaga la
  protección de colisiones en todos los capítulos para arreglar uno.
- Borrar la definición del catálogo. Dejaría sin resolver las sesiones que la
  fijaron.
- Re-anclar o editar el piloto. Su `guideKey@guideVersion` es inmutable y su
  contenido ya no existe en el manuscrito; reconstruirlo sería una decisión
  editorial nueva, con su propia aprobación.
- Hacer de la base la única autoridad. La migración al CMS es gradual
  precisamente para no apostar la sesión de un lector a un camino que nunca se
  ha ejercido.

## Alternativas

### A — Archivar el piloto, como ya se hizo con Parejas

`pqp-c1-contacto-sostenido` está en el catálogo con `status: "ARCHIVED"`, y
`productionCodeOwnedCatalog.definitions` filtra por `PUBLISHED`. Una definición
archivada, por tanto, **ya no entra en el conjunto de reclamaciones** y deja de
bloquear. El caso mínimo lo comprueba.

Qué conserva: `productionGuideRegistry.getExact` no mira el estado, así que una
sesión fijada sigue resolviendo su versión y sus objetivos. `getExact` del
repositorio híbrido busca primero en base y cae al código, también sin mirar el
estado. Y `RETIRED_FOR_NEW_STARTS` sigue impidiendo altas nuevas.

Qué cambia, y hay que decirlo: `listPublishedForChapter` deja de ofrecerla, así
que desaparece de Exploraciones. Hoy aparece con su control ya deshabilitado
(#786), de modo que el cambio va de «ofrecida y no ejecutable» a «no ofrecida».

**Lo que esta alternativa NO resuelve por sí sola:** al salir del conjunto de
reclamaciones, su identidad deja de estar protegida ahí. Un borrador nuevo podría
pedir `eec-c1-cuerpo-antes-que-mente` o su `guideKey`.

### B — Archivar, y apoyarse en la reserva de linaje

`ExperienceGuideReservation` es unívoca por `(contentUnitId, experienceKey)` y
por `(contentUnitId, guideKey)`, con `onDelete: Restrict` desde las versiones.
Es un candado en base que hace exactamente lo que el conjunto de reclamaciones
hace en código: impedir que dos linajes compartan clave dentro de un capítulo.
Al crear las cinco de C01 en una base local se escribieron cinco reservas.

La propuesta es A **más** la garantía de que el piloto tenga su reserva en todo
entorno donde haya existido, de modo que la protección no dependa de que su
definición siga declarada como publicada.

Coste: en un entorno nuevo el piloto no tiene reserva porque nunca existió allí
— y tampoco hay nada histórico que proteger. La protección hace falta donde hay
historia, y es justo donde la fila existe o puede derivarse.

### C — Estrechar el rechazo a la guía afectada

En vez de refusar todas las escrituras, refusar sólo las que tocan el pin que no
se pudo ubicar. Conserva literalmente la garantía declarada —un borrador nuevo no
puede tomar la guía de una definición enviada— y elimina el radio de acción.

Coste: cambia una decisión arquitectónica documentada, y su docblock argumenta
que resolver el conjunto entero es lo que evita volver a razonar por posición.
Habría que comprobar que ningún llamante depende del rechazo global como señal
de «el catálogo está incompleto».

## Recomendación

**B**, y sólo después de comprobar en el entorno real que el piloto tiene su
reserva o que puede crearse sin tocar sus sesiones. A sin B deja la identidad
histórica sin candado; C es correcta pero toca una invariante documentada y
merece su propia decisión, no una colada dentro de un arreglo de preparación.

Ninguna de las tres se aplica en este cambio.

## Invariantes que cualquier opción debe conservar

- Las sesiones existentes siguen resolviendo su versión y sus objetivos.
- No se admite una sesión nueva del piloto retirado.
- No se puede capturar una identidad ni un linaje histórico con un borrador
  nuevo.
- Una reclamación activa que no resuelve sigue fallando cerrada.
- La identidad no vuelve a derivarse de la posición del capítulo.
- No se borra ni se edita en silencio ninguna escena ni ningún progreso.

## Cómo se comprueba

`experience-code-owned-lifecycle.spec.ts` fija hoy tres cosas sin cambiar
comportamiento: que una publicada sin ubicar rechaza la operación entera, que el
error nombra a la culpable, y que una archivada no entra en el conjunto. Una
implementación futura tendrá que responder a ese archivo.
