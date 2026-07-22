# Guide V1 — experiencia web

```
GUIDE_WEB_STATUS=IMPLEMENTED_PENDING_MERGE
GUIDE_WEB_ROUTE_COUNT=1
GUIDE_WEB_PRESENTATION_COUNT=1
GUIDE_WEB_STEP_COUNT=3

GUIDE_WEB_RECOVERY=START_RECEIPT_REPLAY
GUIDE_WEB_PENDING_COMMAND_RECOVERY=true
GUIDE_WEB_CLIENT_PROGRESS_AUTHORITY=false
GUIDE_WEB_CORRECT_OPTION_EXPOSED=false

GUIDE_WEB_EMOTIONAL_INFERENCE=false
GUIDE_WEB_MAP_WRITE=false
```

Consume la superficie HTTP de [guide-v1-http-surface.md](guide-v1-http-surface.md)
(mergeada en `6ea42eab`). Esta ronda **no** toca backend, OpenAPI, cliente,
tipos, schema ni mobile.

## 1. Dónde vive

Bajo **Exploraciones**, como producto propio:

```
/dashboard/exploraciones                                   ← tarjeta de entrada
/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente     ← el reproductor
```

La ruta es **estática**, no `[guideKey]`: V1 publica una sola guía y la API no
tiene discovery, así que un segmento dinámico prometería un catálogo que no
existe y aceptaría claves que nada puede resolver.

### Guía ≠ Journey

Son dos productos en la misma pantalla:

|               | Guía breve                       | Recorrido (Journey)         |
| ------------- | -------------------------------- | --------------------------- |
| Datos         | catálogo de presentación local   | `JourneyListResponse`       |
| Componentes   | `GuideEntryCard` · `GuidePlayer` | `ExFeaturedCard` · `ExCard` |
| Ruta          | estática, una                    | por slug                    |
| Ciclo de vida | cinco comandos + ledger servidor | navegación a libros         |

La guía **nunca** entra en `JourneyListResponse` ni se renderiza con un
componente de Journey. El ratchet `guide-web-surface.spec.ts` lo fija.

La tarjeta se renderiza siempre, así que un `/journeys` vacío o caído no la
esconde. El subtítulo de la pantalla ya no afirma que toda experiencia
alimenta el Mapa Emocional, porque esta no lo hace.

## 2. Inicio explícito

ADR 0019 exige que la persona inicie la guía. Abrir la página **no** envía
nada: se ve la portada y un botón `Empezar guía`.

Al pulsarlo:

1. `crypto.randomUUID()` genera la idempotency key;
2. la key se **persiste antes** de la red;
3. se invoca `createGuideSession({ idempotencyKey, guideKey, guideVersion: 1 })`;
4. la respuesta del servidor es el único estado que se usa.

El CTA queda deshabilitado mientras la petición está en vuelo, así que un
doble click no abre una segunda sesión.

## 3. Recuperación sin GET

No hay endpoint de lectura, y esta ronda no inventa uno. Lo que el navegador
recuerda no es el ESTADO sino la **key del START**:

```
psico.guide.eec-c1-cuerpo-antes-que-mente.v1
```

Reproducir ese START exacto devuelve la sesión original con su proyección
actual (`replayed: true`), así que el servidor sigue siendo la única fuente de
verdad tras un reload, un cierre del navegador o una segunda pestaña.

El registro se lee con un parser puro que trata `localStorage` como entrada
hostil: objeto plano, claves exactas, `schemaVersion` correcto, guía y versión
exactas, UUID canónico, reconstrucción campo a campo, y **nunca lanza**. Un
registro inválido se borra y la pantalla vuelve a la portada — sin auto-start.

Si el replay responde `GUIDE_SESSION_NOT_FOUND`, se borra la recuperación y se
ofrece `Empezar de nuevo` como acción explícita.

Nada de esto identifica a una persona: no hay `userId` en storage ni en
ninguna petición.

## 4. Comandos pendientes

Cada transición persiste su key **antes** de salir a la red, dentro de una
unión cerrada:

```
STEP_COMPLETE · STEP_RECALL · CANCEL · SESSION_COMPLETE
```

- éxito ⇒ el snapshot se reemplaza por la respuesta y el pendiente se borra;
- fallo de red ⇒ el pendiente se conserva y aparece `Reintentar`;
- el reintento usa la **misma** key: o la original ya se aplicó (replay) o no
  se aplicó nunca (created), jamás dos veces;
- al montar con un pendiente, primero se recupera la sesión con el START y
  después se reintenta ese comando exacto.

Un comando cuyo paso u opción no estén en el catálogo de este build se
descarta: reintentar una key que no podemos describir sería adivinar la
respuesta de alguien.

## 5. El progreso es del servidor

La UI decide qué pantalla mostrar únicamente con `status`, `currentStepKey`,
`stepsCompleted` y `totalSteps`. No suma uno a un contador, no camina un índice
local y no deriva completitud del número de clicks. El porcentaje visual sale
de `stepsCompleted / totalSteps` y **nunca** decide una transición; el texto
dice «N de M pasos registrados», que es literalmente lo que el servidor envió.

Un `currentStepKey` desconocido produce un estado **fail-closed**:

> No pudimos mostrar el paso actual.

Desde ahí no sale ningún comando.

## 6. Los tres pasos

| Paso                              | Superficie | Comando                    |
| --------------------------------- | ---------- | -------------------------- |
| `explorar-cuerpo-antes-que-mente` | confirmar  | `completeGuideSessionStep` |
| `practicar-escucharte-por-dentro` | confirmar  | `completeGuideSessionStep` |
| `recordar-cuerpo-antes-que-mente` | recall     | `submitGuideStepRecall`    |

El botón del concepto no dice «comprendido» y el de la práctica aclara, de
forma neutral, que registra una confirmación personal: la app no verifica que
la práctica ocurriera.

### Recall sin veredicto

El `radiogroup` envía **solo** `selectedOptionKey`. No viajan `itemKey`,
`result`, `evaluationSource` ni la respuesta correcta — el servidor califica.
Y no se muestra «Correcto», «Incorrecto», puntuación ni respuesta correcta,
porque la respuesta HTTP no trae ese veredicto y el catálogo correcto no está
en este bundle. No es que lo ocultemos: no lo tenemos.

### Cierre y cancelación

Cuando el servidor reporta `ACTIVE` con `currentStepKey: null` y todos los
pasos registrados, aparece `Finalizar guía`. **No** se completa automáticamente.

`Salir de la guía` pide confirmación y envía `cancelGuideSession`. Cerrar no se
presenta como un fracaso, y no se emite analítica emocional ni inferencia de
abandono.

## 7. Errores

Un mapper cerrado convierte `(status, código)` en una de un conjunto fijo de
frases. Nunca se renderiza `error.message`, el body, un id, un `stepKey`, un
`sessionId`, un stack ni una URL:

| Situación                                              | Copy                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| 401                                                    | Tu sesión caducó. Recarga la página para continuar.                     |
| `GUIDE_FORBIDDEN`                                      | Esta guía no está disponible con tu acceso actual.                      |
| `GUIDE_SESSION_NOT_FOUND`                              | No pudimos recuperar esta sesión.                                       |
| `GUIDE_SESSION_INVALID_TRANSITION` · `..._NOT_CURRENT` | El estado cambió. Estamos recuperando tu progreso.                      |
| `..._COMMAND_MISMATCH` · `CONTEXT_*`                   | Esta guía no está disponible temporalmente.                             |
| `GUIDE_STORAGE_FAILURE` · 500 · red                    | No pudimos guardar este paso. Puedes reintentarlo sin perder tu avance. |

Un 409 de estado dispara un **resync**: se reproduce el START con su key y se
reemplaza el snapshot. Nunca se genera automáticamente un comando distinto.

## 8. Accesibilidad

- objetivos táctiles ≥ 44 px y foco visible;
- `radiogroup` navegable por teclado con `fieldset` + `legend`;
- región `aria-live` para los cambios de estado;
- el encabezado recibe el foco tras cada transición;
- estado de carga explícito y botones deshabilitados durante la petición;
- el progreso se lee como texto, no solo por color, y expone `progressbar`
  con `aria-valuenow`/`aria-valuemax`.

## 9. Privacidad

Copy permanente, visible en todas las pantallas del reproductor:

> Esta guía registra avance educativo. No interpreta cómo te sientes ni
> modifica automáticamente tu Mapa Emocional.

Nada de esta superficie escribe en el Mapa, lee el Diario o Eco, ni infiere una
emoción. El firewall que lo garantiza vive en el backend
(`guide-firewall.e2e-spec.ts`, delta cero sobre la proyección canónica).

## 10. Qué NO incluye

Sin backend, sin OpenAPI, sin cliente, sin tipos, sin schema, sin migraciones,
sin mobile y **sin deploy**. Sin GET de guía, sin discovery, sin polling, sin
WebSocket, sin analítica de permanencia ni de clicks, y sin dependencias nuevas.
