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

## Comprobación contra PostgreSQL real (2026-10-21)

Dos bases desechables: `psico_guias_qa`, levantada de cero con la semilla
canónica; y `psico_b1_qa`, clon de una base donde el par del piloto fue
ingerido antes de su retirada. Todo lo que sigue está medido, no deducido.

**El candado de linaje es real.** `ExperienceGuideReservation` tiene la clave
primaria `(contentUnitId, experienceKey)` y un índice único
`(contentUnitId, guideKey)` —la unicidad que el apartado B da por supuesta
existe como índice, no como constraint, y por eso no aparece en
`pg_constraint`—. Cuatro sondas, todas revertidas: otra `experienceKey`
pidiendo una guía ya reservada en la misma unidad → rechazada por el índice;
la misma `experienceKey` pidiendo otra guía → rechazada por la PK; borrar la
unidad bajo una reserva viva → rechazado (`RESTRICT`); borrar una reserva que
una versión referencia → rechazado por `ChapterExperienceVersion_reservation_fkey`,
que apunta al único de tres columnas con `ON DELETE RESTRICT`. Una unidad
distinta sí puede reservar la misma guía: el candado es por capítulo, como se
diseñó.

**El beneficio es real.** En la base de cero, con el piloto PUBLISHED,
`create-drafts --apply` responde `REFUSED` con
`EXPERIENCE_CODE_OWNED_UNRESOLVED`. Con el piloto `ARCHIVED` y nada más
cambiado: `APPLIED`, las cinco microguías de C01 creadas en DRAFT y sus cinco
reservas escritas. El piloto allí no tiene reserva ni sesiones — no hay nada
histórico que proteger, como decía el apartado B.

**La precondición del apartado B se cumple, y hacía falta comprobarla.** En el
entorno con historia el piloto tiene **dos sesiones y ninguna reserva**. La
protección que B invoca no existe hoy donde sí hay historia: hay que crearla.
Se puede: el `insert` de su reserva en la unidad que sus propias sesiones ya
fijan fue aceptado y no tocó ninguna sesión (revertido).

**Y aparece un coste que el apartado A no nombraba.** Archivar no sólo deja de
_ofrecer_ el recorrido: lo deja **inalcanzable**. `GET
/api/experiences/discovery/:bookSlug/:chapterOrder` es el único endpoint que
devuelve una definición, y las dos superficies del lector —la tarjeta del
capítulo y la ruta dedicada `/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente`—
la resuelven por ahí. Medido en el navegador, misma cuenta, misma sesión,
mismo build, cambiando sólo el estado del catálogo:

|                         | PUBLISHED                                               | ARCHIVED                                                              |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| descubrimiento          | 1 ítem, `startable:false`                               | **0 ítems**                                                           |
| `/guide/sessions/state` | COMPLETED 3/3 + resumen                                 | COMPLETED 3/3 + resumen                                               |
| `POST /guide/sessions`  | 410 `GUIDE_NOT_STARTABLE`                               | 410 `GUIDE_NOT_STARTABLE`                                             |
| página del piloto       | resumen, hechos y «Repetir» deshabilitado con su motivo | **«No pudimos preparar tu guía · Vuelve a intentarlo en un momento»** |

El registro sobrevive entero: `findExperienceState` resuelve contra
`productionGuideRegistry`, que no mira el estado de publicación. Lo que se
pierde es el camino. Y el mensaje que queda es falso en los dos sentidos:
invita a reintentar algo que no va a cambiar nunca, y mientras tanto
`/dashboard/exploraciones` sigue ofreciendo «Empezar guía» hacia ese callejón.

## Recomendación

**B no se recomienda todavía.** Su protección es correcta y su beneficio está
medido, pero aplicarla a un entorno con historia deja sin camino a quien ya
tiene un recorrido ahí. Antes hacen falta dos cosas, en este orden:

1. **Un camino para lo histórico que no dependa del descubrimiento.** Que el
   descubrimiento siga sirviendo una definición archivada al actor que tiene
   una sesión en ella, o una ruta propia para «mis recorridos», o cualquier
   tercera forma — pero alguna, y comprobada, antes de archivar nada.
2. **Separar «retirado» de «fallo transitorio» en el texto**, y dejar de
   ofrecer «Empezar guía» hacia una guía que ya no se puede montar.

Con esas dos, B es la opción; sin ellas, A y B tienen el mismo defecto y C
—estrechar el rechazo a la guía afectada— pasa a ser la única que desbloquea
la preparación sin tocar lo que un lector ya tiene. C sigue cambiando una
invariante documentada y merece su propia decisión.

Ninguna de las tres se aplica en este cambio.

## Invariantes que cualquier opción debe conservar

- Las sesiones existentes siguen resolviendo su versión y sus objetivos.
- No se admite una sesión nueva del piloto retirado.
- No se puede capturar una identidad ni un linaje histórico con un borrador
  nuevo.
- Una reclamación activa que no resuelve sigue fallando cerrada.
- La identidad no vuelve a derivarse de la posición del capítulo.
- No se borra ni se edita en silencio ninguna escena ni ningún progreso.

### La tercera invariante es sobre la IDENTIDAD, no sobre los datos (B5)

Dicho de otro modo, porque la primera versión del procedimiento previo lo leyó
mal: **una base sin sesiones no es una base donde esa identidad esté libre.**

`preArchiveCheck` respondía «nada que proteger» en cuanto la instalación no
tenía sesiones del piloto, y eso daba por decidido en silencio que su clave
quedaba disponible para otro linaje. No lo está. La clave la envía el build:
existe en cada despliegue, y puede tener sesiones en bases que esta
instalación no ve. Que ésta no las tenga dice algo de esta base, no de la
clave.

Así que la regla queda escrita:

- **Identidad que envía el build** —una definición del catálogo— se reserva
  antes de archivar, **haya o no sesiones aquí**. Crear la reserva es barato y
  reversible; descubrir que otro linaje tomó la clave, no.
- **Identidad sólo local** —una fila de base que nadie usó— sí puede leerse
  como «nada que proteger»: no sale de esta instalación.

Reutilizar una identidad histórica sigue necesitando una decisión expresa, y
este ADR no la concede.

## Cómo se comprueba

`experience-code-owned-lifecycle.spec.ts` fija hoy tres cosas sin cambiar
comportamiento: que una publicada sin ubicar rechaza la operación entera, que el
error nombra a la culpable, y que una archivada no entra en el conjunto. Una
implementación futura tendrá que responder a ese archivo.
