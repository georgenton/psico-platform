# FeelVerse Círculos — runbook operativo del piloto

> **Estado honesto de este documento.** Describe lo que existe y está
> verificado hoy, y nombra explícitamente lo que falta. Las secciones marcadas
> `PENDIENTE` no están implementadas: no las ejecutes esperando que funcionen.
>
> El catálogo de producción lleva **una** plantilla aprobada
> (`duo-lo-que-me-ayuda@1`) y su único mapping. Que esté publicada no la
> enciende: quién ve Círculos lo decide `CIRCLES_ROLLOUT_MODE` y, bajo `pilot`,
> la lista de ids admitidos. Publicar y encender son cosas distintas, y este
> documento las mantiene separadas.

---

## 1 · Qué observa cada modo de rollout

`CIRCLES_ROLLOUT_MODE` lo resuelve `apps/api/src/circles/circles-rollout.ts`.
El resolutor **nunca lanza**: una variable ausente, vacía o mal escrita
produce `off`, que es el estado cerrado.

| Modo            | Superficie autenticada        | Superficie invitada                    | Notas                                                                  |
| --------------- | ----------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| ausente / `off` | 503 `CIRCLES_UNAVAILABLE`     | 503 `CIRCLES_UNAVAILABLE`              | El estado por defecto.                                                 |
| `pilot`         | sólo `CIRCLES_PILOT_USER_IDS` | según el **invitador**, no el invitado | Una allowlist vacía vuelve a cerrar (`CIRCLES_PILOT_ALLOWLIST_EMPTY`). |
| `on`            | todos                         | sí                                     | Disponibilidad general de la _función_, no de contenido.               |

Dos matices que importan en operación:

- Una **membresía desvinculada** (cuenta borrada) no está disponible en ningún
  modo, ni siquiera en `on`: `isAvailable(null)` devuelve `false`.
- El cifrado AEAD (`CIRCLES_CIPHER`) se resuelve al arranque. Bajo `off` es
  `null` y la API arranca sin clave; bajo `pilot`/`on` una clave ausente o
  malformada **falla el arranque**, a propósito.

### Apagar el acceso, y qué pasa con lo ya emitido

Poner `CIRCLES_ROLLOUT_MODE=off` (o quitar la variable) y reiniciar cierra las
rutas: nuevas inspecciones, canjes y comandos responden 503.

**Apagar el rollout no borra datos y no recupera contenido que alguien ya
vio.** Las sesiones de invitado ya emitidas siguen existiendo en la base con su
`expiresAt`; lo que hace `off` es que el guard las rechace antes de resolverlas.
Si necesitas revocar de verdad, eso es un `UPDATE` de `revokedAt` sobre
`CircleGuestSession` / `CircleInvitation`, no un cambio de flag.

---

## 2 · Borrado de cuenta con Círculos — **implementado; política aprobada**

El bloqueo técnico (`ACCOUNT_DELETION_WITH_CIRCLE_EVENTS`) está resuelto: la
cuenta se puede borrar, la participación viva termina, el contenido propio se
destruye —incluido el de actividades ya cerradas— y la autoridad derivada se
revoca.

**La política de artefactos está aprobada y aplicada**
(`ARTIFACT_RETENTION_POLICY_STATUS=approved`): al borrar una cuenta se elimina el
contenido de los artefactos `PROPOSED` y `SUPERSEDED` **cuya autoría es suya**,
se conservan los `AGREED` y no se toca nada de la contraparte. Sin retención de
90 días y sin barrido nuevo. Ver la matriz más abajo.

### Cómo funciona

El job existente `AccountDeletionProcessor` ejecuta, **en este orden**:

1. `CirclesAccountDeletionService.detachUser(userId)` — por cada asiento vivo:
   purga el sobre, revoca invitaciones y sesiones de invitado de esa actividad,
   y lleva la actividad al estado terminal que implica su etapa
   (`INVITING`/`PREPARING` → `CANCELLED`; `REVEALED`/`FOLLOW_UP` → `CLOSED`).
   Después retira el contenido de los artefactos que esa cuenta escribió y que
   nadie acordó. Y sólo entonces marca las membresías `LEFT`.
2. `prisma.user.delete()` — las tres referencias de Círculos se **desvinculan**
   (`Circle.createdByUserId`, `CircleMember.userId`, `CircleEvent.actorUserId`).

El orden es la garantía, dos veces. Borrar primero y limpiar después deja una
ventana con la cuenta ya eliminada y la actividad todavía viva, en la que la
contraparte podría confirmar y disparar una revelación. Y revocar la membresía
antes de clasificar los artefactos dejaría sin resolver la única pregunta que
decide cuáles se limpian: **quién escribió cada versión**.

### La autoría, y de dónde NO se deduce

De `CircleArtifact.createdByParticipantId` — el asiento que creó esa versión — y
de ahí a `CircleActivityParticipant.memberId`, y de ahí a la membresía de la
cuenta. No del creador del círculo, no de quien invitó, no del dueño de la
actividad: en un Dúo esas tres cosas suelen ser la misma persona, y confundirlas
haría que borrar la cuenta del organizador se llevara por delante las propuestas
del invitado. Hay un control negativo que lo comprueba mutando precisamente ese
selector a «todo lo de la actividad».

### Qué significa «se elimina el contenido»

La fila no se borra: `CircleEvent.artifactId → CircleArtifact` es `ON DELETE
RESTRICT` y el ledger tiene que conservar el registro de que hubo una propuesta.
Lo que se vacía son las cuatro columnas que juntas son el contenido —
`ciphertext`, `nonce`, `keyVersion`, `payloadHash` — y se fecha `purgedAt`.
Quedan `id`, `activityId`, `version`, `kind`, `status`,
`createdByParticipantId`, `createdAt`, `updatedAt`, `agreedAt` y `purgedAt`.

Dos restricciones lo sostienen en el motor, no sólo en el servicio:

- `CircleArtifact_purged_has_no_content` — o el cuerpo está entero y no hay
  purga, o no queda nada y la purga está fechada. No existe media purga.
- `CircleArtifact_agreed_is_never_purged` — un `AGREED` purgado es rechazado
  aunque lo intente un script o una consulta a mano.

**No es anonimización** y no debe llamarse así: la fila sigue apuntando al
asiento que la escribió. **Y no alcanza a las copias de seguridad**: una
instantánea anterior conserva la fila completa.

### La excepción del ledger, y por qué es estrecha

`CircleEvent` sigue siendo append-only. El trigger admite **una** forma de
UPDATE: `actorUserId` de valor a `NULL`, con todas las demás columnas
idénticas, **y la cuenta ya inexistente**. Esa última cláusula es la
autorización — `ON DELETE SET NULL` corre después de borrar la fila de `User`,
mientras que un `UPDATE` ordinario del servicio corre con el usuario vivo y se
rechaza igual que cualquier otra escritura.

No hay `session_replication_role`, no hay GUC, no hay `SECURITY DEFINER`, no
hay rol privilegiado y no hay SQL dinámico. `search_path` está fijado.

### Qué se conserva y qué se elimina respecto a la contraparte

| Dato                                            | Qué pasa                                  | Por qué                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sobre privado del borrado                       | **Eliminado** siempre                     | No se conserva nada suyo.                                                                                                                                                                                                                                                                            |
| Sobre de la contraparte, **antes** de revelar   | **Eliminado**                             | Lo confirmó para una conversación que no va a ocurrir — es la regla del retiro, no una nueva.                                                                                                                                                                                                        |
| Sobre de la contraparte, **después** de revelar | **Se conserva**                           | Ya lo leyó la otra persona. Borrarlo no des-revelaría nada y sí destruiría contenido ajeno.                                                                                                                                                                                                          |
| Artefacto `AGREED`                              | **Se conserva**                           | Ambos lo confirmaron; borrarlo destruiría el registro de la contraparte.                                                                                                                                                                                                                             |
| Artefacto `PROPOSED` escrito por el borrado     | **Contenido eliminado**                   | Nadie lo aceptó, así que no entró en nada compartido. La fila se queda vacía porque el ledger apunta a ella.                                                                                                                                                                                         |
| Artefacto `SUPERSEDED` escrito por el borrado   | **Contenido eliminado**                   | Ya fue sustituido por otra redacción. Mismo caso.                                                                                                                                                                                                                                                    |
| Cualquier artefacto de la contraparte           | **Intacto**                               | Es suyo. Un borrado ajeno no toca lo que ella escribió, en ningún estado.                                                                                                                                                                                                                            |
| Círculo creado por el borrado                   | **Se conserva**, `createdByUserId = NULL` | Un Dúo es compartido; reasignar el autor mentiría.                                                                                                                                                                                                                                                   |
| Filas de `CircleEvent`                          | **Se conservan**, `actorUserId = NULL`    | La fila no lleva contenido: `metadata` es una gramática cerrada de dos valores y las columnas restantes son ids y un timestamp. Quitar la FK **no** es por sí solo una anonimización — lo que sostiene la afirmación es que no hay nada que anonimizar en esa tabla, verificado columna por columna. |

### Ejecutar y verificar un borrado

El flujo real es el de producto (`requestDelete` → cooldown 30 días → job). Para
verificar en una base **efímera**:

```bash
docker run -d --name circles-verify-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=psico_locks \
  -p 55440:5432 pgvector/pgvector:pg16

cd apps/api && TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55440/psico_locks" \
  pnpm exec vitest run --config vitest.locks.config.ts \
  src/circles/circles-account-deletion.pg-spec.ts
```

Cubre: usuario sin Círculos · invitación pendiente · contenido confirmado antes
de revelar · actividad revelada con artefacto · reintento · concurrencia con una
confirmación · usuario ajeno intacto · `UPDATE`/`DELETE`/`TRUNCATE` ordinarios
del ledger siguen rechazados · fallo provocado sin autoridad parcial · y la ruta
de actualización (las 64 de `main` **rechazan** el borrado; esta migración es lo
que lo cambia).

Limpieza: `docker rm -f circles-verify-pg`. Las bases `circles_deletion_db` y
`circles_deletion_base` se crean desde `template0` y se destruyen en `afterAll`.

---

## 3 · Cookie de invitado — **revisada**

`apps/web/src/lib/circulos/guest-cookie.ts`.

- `HttpOnly` ✓ · `SameSite=Lax` ✓ (la persona llega por un enlace: `Strict`
  ocultaría la cookie justo en esa navegación) · `Secure` en todo entorno
  desplegado ✓ · **host-only** (sin `Domain`) ✓ · la cookie nunca sobrevive al
  `expiresAt` que devolvió la API ✓.
- `Path=/` es una **concesión explícita y aceptada**, no un alcance estrecho, y
  el módulo lo dice con esas palabras: es el único prefijo común de `/i`,
  `/compartir` y `/api/circulos`. **`Path` no es una frontera de autorización**
  — la autoridad por actividad la comprueba el servidor en cada petición — así
  que estrecharlo **no** es un bloqueo del piloto y se retira de esa lista
  (`COOKIE_PATH_NARROWING_REQUIRED=false`).
- Retirarse revoca **antes** de borrar la cookie; un fallo conserva el estado
  para reintentar.
- Salir como invitado **no** cierra la sesión autenticada del miembro.

---

## 4 · Cómo repetir las pruebas sin contaminar la base de desarrollo

Todas las pruebas de PostgreSQL real crean sus propias bases desde `template0`
y las destruyen al terminar. **Nunca** apuntes `TEST_DATABASE_URL` a tu base de
desarrollo: el arnés hace `DROP DATABASE ... WITH (FORCE)`.

```bash
# Contenedor desechable, puerto propio para no chocar con nada local.
docker run -d --name circles-verify-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=psico_locks \
  -p 55440:5432 pgvector/pgvector:pg16

cd apps/api && TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55440/psico_locks" \
  pnpm exec vitest run --config vitest.locks.config.ts

docker rm -f circles-verify-pg          # limpieza exacta
```

`pgvector/pgvector:pg16` y no `postgres:16-alpine`: el schema declara la
extensión `vector` y las migraciones fallan sin ella.

---

## 5 · Qué configurar para un piloto

| Variable                     | API | Worker | Web | Nota                                                                  |
| ---------------------------- | :-: | :----: | :-: | --------------------------------------------------------------------- |
| `CIRCLES_ROLLOUT_MODE=pilot` | ✅  |   ✅   |  —  | `on` es disponibilidad general: no es esto.                           |
| `CIRCLES_PILOT_USER_IDS`     | ✅  |   ✅   |  —  | Quién ORGANIZA. Vacía ⇒ vuelve a cerrar.                              |
| `CIRCLES_SHARED_DATA_KEY_V1` | ✅  |   ✅   |  —  | Bajo `pilot`/`on` una clave ausente **falla el arranque**.            |
| `CLIENT_ATTESTATION_SECRET`  | ✅  |   —    | ✅  | El MISMO valor. Si divergen, la superficie de invitado falla cerrada. |

**Los secretos son por entorno.** Reutilizar los de pruebas en producción ataría
los dos por su criptografía: quien tuviera la clave de pruebas podría leer sobres
productivos. Se generan aparte y no se imprimen en ningún sitio.

**La lista es de organizadores, no de participantes.** La contraparte entra por
una invitación válida, como invitada, sin cuenta y sin estar en la lista. Para un
primer recorrido basta con un id.

El catálogo **ya no está vacío**: `PRODUCTION_CIRCLE_TEMPLATES` lleva
`duo-lo-que-me-ayuda@1` y `PRODUCTION_DUO_ELIGIBILITY` su única entrada, ambas
aprobadas. Publicar una SEGUNDA sigue siendo un acto editorial con su propia
aprobación, no una tarea de despliegue.

---

## 6 · Detener el piloto ante una regresión

Son **dos servicios y dos efectos distintos**, y hacen falta los dos. Cerrar sólo
la API deja el motor moviendo actividades por dentro.

1. **API — cierra el acceso.** `CIRCLES_ROLLOUT_MODE=off` y reiniciar. Las
   superficies responden 503 en cuanto arranca, también para quien esté en la
   allowlist.
2. **Worker — detiene las tareas temporales.** El mismo cambio y el mismo
   reinicio en el servicio del worker. El barrido de Círculos (§8) cancela
   invitaciones encalladas y abre seguimientos por reloj, sin que nadie pulse
   nada; bajo `off` se vuelve inerte, pero el modo se resuelve **una sola vez al
   arrancar**, así que un worker no reiniciado sigue actuando sobre actividades
   que ya nadie puede abrir.
3. Comprobar: `POST /api/circles/invitations/inspect` y
   `GET /api/circles/guest/session` deben dar 503 `CIRCLES_UNAVAILABLE`
   mientras `/health` sigue en 200 — eso distingue "apagado" de "caído". Para el
   worker, la señal es `skippedRolloutOff: true` en el resumen del barrido.
4. Si además hay que revocar lo ya emitido, es un `UPDATE` de `revokedAt`, no un
   flag (ver §1).
5. Apagar el rollout **no** borra datos ni recupera contenido ya visto.

**El borrado de cuenta no se detiene con esto** y no debe detenerse: es una
obligación con la persona, no una función del producto. Su job corre igual con
el rollout apagado, y con él la política de artefactos de §2.

---

## 7 · Límite de abuso por cliente de red — **implementado**

El problema: la superficie de invitado es navegador → Web → API, y la API
confía en un solo salto de proxy, así que veía la IP de salida del BFF. Todos
los invitados compartían un cupo.

El BFF ahora **firma** su afirmación sobre qué cliente está reenviando
(`x-client-attestation`: HMAC sobre identidad + vencimiento, clave sólo de
servidor, un minuto de vigencia). El navegador nunca la ve, una llamada directa
no puede falsificarla, y sin atestación válida la API vuelve a `req.ip`
exactamente como antes.

Se llama límite **por cliente de red**, nunca «por persona»: varias personas
tras un NAT comparten cupo y una sola cambia de cupo al moverse.

Caída del almacén: 503 `RATE_LIMIT_UNAVAILABLE`, sin nada del almacén en el
cuerpo. El rechazo propio del limitador (429) pasa intacto.

**Configurar antes del piloto:** `CLIENT_ATTESTATION_SECRET`, el mismo valor en
la API y en el servidor Web. Aplicado **solo** en el entorno de pruebas (§12).
Si las dos copias no coinciden, la atestación se rechaza y todos los invitados
vuelven a compartir un cupo — en silencio, sin error visible.

### Qué se garantiza exactamente, medido sobre lo alojado

`hosted-limits.mjs` (§12) recorre la matriz completa contra las URLs alojadas.
Lo que encontró, y lo que se hizo con ello:

**El cupo se podía ampliar cambiando de camino.** Diez llamadas a través de la
Web y después entre diez y veinte más yendo directo a la misma ruta, porque los
dos caminos son cubos distintos por construcción. Ninguno es falsificable — se
probaron seis cabeceras de cliente contra ambos y no se honró ninguna — pero las
sumas se suman: el presupuesto efectivo era dos o tres veces el número escrito
en la ruta.

**La corrección:** `CirclesBffOnlyGuard` sobre `invitations/inspect` y
`invitations/accept`, y sólo sobre esas dos. Su único consumidor es
`apps/web/src/lib/circulos/bff.ts` — no hay cliente móvil y nada más las llama —
así que quien no puede presentar la firma de la Web recibe `403 CIRCLE_FORBIDDEN`
en vez de un segundo presupuesto. Ausente, malformada, caducada y falsificada
reciben **la misma** respuesta: decir cuál falló es la mitad de una falsificación.

**Lo que queda garantizado:** diez llamadas por quince minutos **por identidad
de cliente atestada**, y ningún otro camino a esa ruta. La identidad la deriva
la Web de la dirección que reporta la plataforma; no es elegible por el
llamante.

**Las excepciones que permanecen, dichas como son:**

- El resto de la API sigue con el comportamiento de siempre: sin atestación
  válida, el cubo es `req.ip`. Esta condición **no** se impuso fuera de las dos
  rutas de invitación.
- **Una dirección no es un llamante, y la plataforma no es consistente.** Doce
  llamadas idénticas sin atestar se repartieron en **dos** cubos en unas
  mediciones (contadores 6 y 6, 6 y 7) y en **uno** en otra. No se puede afirmar
  «como máximo el doble»: lo honesto es que el cupo por dirección vale diez por
  cada dirección que la plataforma atribuya a ese llamante, y eso no se acota
  desde dentro. Por eso la ruta de invitación ya no depende de ello.
- Sigue siendo un límite **por cliente de red**, nunca por persona: varias
  personas tras un NAT comparten cupo.

> **El precio, que hay que conocer antes de un piloto.** Si la copia del secreto
> en la Web y la de la API se separan, la superficie de invitado deja de
> funcionar **entera** (403 a todo el mundo) en vez de degradarse a compartir
> cubo. Es el coste de que la ruta signifique lo que dice. Síntoma: la pantalla
> de invitación dice «este enlace ya no sirve» para todos, incluidos enlaces
> recién creados. Comprobación: `CLIENT_ATTESTATION_SECRET` idéntico en el
> servicio de API y en el proyecto de Vercel.
>
> Una API **sin** el secreto configurado no exige nada — no se puede exigir lo
> que no se puede verificar — así que producción, que no lo tiene, no cambia.

---

## 8 · Barrido temporal — **implementado**

Cron horario (`circles-sweep-hourly`) en el worker existente. Hace dos
transiciones y **ninguna más**:

- actividad `INVITING` sin ninguna invitación canjeable → `CANCELLED`;
- actividad `REVEALED` con `followUpDueAt` vencido → `FOLLOW_UP`.

Lo que **no** hace, y está fijado por tests: no cierra un `FOLLOW_UP` (esa es
una decisión que la etapa existe para recoger), no fabrica confirmaciones ni
revelaciones, y **no toca una sesión de invitado ya emitida** — vencimiento del
enlace y vencimiento de la sesión son cosas distintas, y escribir sobre la
segunda acortaría en silencio un TTL prometido.

Inerte bajo rollout `off`. El borrado de cuenta **sí** funciona con `off`: es
una obligación independiente del flag.

---

## 9 · Recorrido del Dúo en dos navegadores — **implementado**

Un solo comando levanta la pila entera y camina el Dúo con dos navegadores
reales:

```bash
node apps/web/e2e/circulos/stack.mjs
```

Levanta, desde una **copia temporal aislada del commit**: build de producción de
la Web, API NestJS real, worker real, una segunda API con el rollout en `off`, y
PostgreSQL + Redis en contenedores propios de esa corrida, publicados **sólo en
loopback**. Al terminar destruye todo lo que creó.

```bash
node apps/web/e2e/circulos/stack.mjs --keep            # dejarla arriba
node apps/web/e2e/circulos/stack.mjs --down <runId>    # detenerla desde otro proceso
node apps/web/e2e/circulos/stack.mjs --run-id <10 hex> # nombrarla de antemano (CI)
node apps/web/e2e/circulos/stack.mjs --worktree        # construir ediciones locales
```

### Un solo árbol

La fixture, el recorrido y el código bajo prueba salen **todos** del commit
archivado, y el SHA se imprime al empezar. Una versión anterior copiaba la
fixture del árbol de trabajo y ejecutaba el recorrido desde el repositorio
mientras construía el archivo — una mezcla en la que una edición local cambia el
resultado sin cambiar el commit supuestamente probado. Con el directorio del
harness sucio el script **se niega a correr** salvo que se lo diga
(`--dirty-ok`, que entonces superpone la copia de trabajo, o `--worktree`, que
construye el árbol de trabajo entero); en ambos casos la corrida deja de ser
evidencia sobre un commit y lo dice.

### Por qué una copia, y no un interruptor

El CTA necesita **una plantilla publicada y su mapping de elegibilidad**, y
ambos son constantes de compilación vacías a propósito. Las salidas fáciles son
todas peores que el problema:

- una variable de entorno que habilite plantillas sintéticas es un interruptor
  que **existe en producción**, a una mala configuración de publicar un fixture;
- un endpoint que inyecte catálogo es lo mismo, con URL;
- condicionar el fixture a `NODE_ENV !== "production"` significa que el
  recorrido ya no prueba un build de producción, que es justo lo que tiene que
  funcionar.

El build con catálogo sintético vive **sólo** en el árbol temporal, que se
borra: no se publica, no se sube a ningún registro y no se reutiliza como
artefacto. El catálogo del repositorio sigue vacío y sus ratchets lo afirman.

### Los diez escenarios

Cada uno con **sus propias cuentas y su propia actividad**, y envuelto para que
un fallo quede registrado y los demás igual corran — una única secuencia dejaría
que la primera rotura escondiera todo lo que viene detrás.

| Escenario                                     | Qué establece                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BROWSER_ENTRY_FLOW`                          | CTA, previsualización que **no crea nada**, una confirmación → **una** actividad, token borrado de la URL, mirar no consume, aceptar sí, ambos en la misma sala con dos asientos       |
| `BROWSER_PRIVATE_PREPARATION`                 | nada de lo tecleado sale del navegador antes de confirmar (observado sobre lo que el navegador **realmente envía**); el borrador sobrevive a volver del preview y a un envío rechazado |
| `BROWSER_REVEAL_BARRIER`                      | con una sola confirmación `revealedAt` sigue nulo — comprobado en el servidor **antes** de mirar ninguna pantalla — y la otra persona **no ve** lo ajeno; con las dos, ambos ven       |
| `BROWSER_ARTIFACT_CONFIRMATION`               | propuesta v1, edición → v2 con v1 **SUPERSEDED**, ambas confirmaciones atadas a la versión exacta, ninguna sobre la superseded                                                         |
| `BROWSER_WITHDRAWAL_BEFORE_AND_AFTER`         | retiro antes y después de revelar, en **actividades independientes**; asiento WITHDRAWN, sobre borrado, y la confirmación de la contraparte sobrevive                                  |
| `BROWSER_RETRY_AFTER_COMMITTED_RESPONSE_LOSS` | respuesta interceptada **después** de que el servidor comprometió; el commit se verifica en la base y el reintento no duplica actividad ni invitación                                  |
| `BROWSER_FOREIGN_SESSION_REJECTED`            | tercera sesión sin acceso; cookie de **otra** actividad no abre esta, y sigue abriendo la suya                                                                                         |
| `REAL_WORKER_TEMPORAL_SCENARIOS`              | el **worker real** consume jobs encolados en su cola: cancela lo atascado, abre el seguimiento vencido, no lo cierra, y no duplica en una segunda pasada                               |
| `REAL_ACCOUNT_DELETION_SCENARIO`              | el **processor real** borra la cuenta: actividad terminada, sesiones revocadas, sobres eliminados, y el navegador del invitado deja de funcionar                                       |
| `OFF_GATE_SCENARIO`                           | con el rollout en `off`, superficies cerradas                                                                                                                                          |

**Fechas sintéticas, plazos intactos.** Los vencimientos se preparan moviendo
**los datos** al pasado (una invitación emitida hace 40 días, un seguimiento
vencido hace una hora, una solicitud de borrado de hace 31 días). El plazo
productivo de 30 días **no se reduce**: el processor aplica su propia
comprobación contra el reloj real y pasa por sus propios términos.

**El `off` se observa en un proceso que arrancó con él.** `CirclesRolloutService`
resuelve el modo una vez al boot y no lo relee — deliberadamente, para que un
cambio de entorno a media vuelo no pueda medio abrir una superficie. Así que la
pila levanta una **segunda API** con `CIRCLES_ROLLOUT_MODE=off` y el recorrido
le pregunta a ese servicio real. No hay interruptor de runtime que apagar, y
añadir uno para facilitar la prueba quitaría justo la propiedad que se prueba.

### Lo que encontró

Tres defectos que ninguna prueba unitaria podía ver, porque cada lado era
correcto por separado y sólo discrepaban en la petición que los une:

1. **El BFF no enviaba `accept: true`.** Ningún invitado podía aceptar: veía
   «Este enlace ya no sirve».
2. **El secreto de invitado viajaba como `Authorization: Bearer`**, y el guard
   sólo lee `x-circle-guest-session` — 401 con una sesión válida en la cookie.
3. **Nadie podía retirarse.** `JSON.stringify` omite `payload: undefined`, así
   que el cuerpo de un retiro lleva dos claves; el envoltorio exigía exactamente
   tres. «Retirarme de la actividad» respondía `CIRCLE_INVALID_PAYLOAD` — un
   consejo imposible de seguir, sobre un campo que no existe, para un acto que
   no debe explicaciones.

## 10 · Propiedad y limpieza de la pila

Una corrida escribe un archivo de estado con los servicios que arrancó: pid,
grupo de procesos y **hora de arranque**. Un pid por sí solo no es una
identidad — el sistema los recicla, y `--down` corre en otro proceso minutos u
horas después. El par (pid, hora de arranque) sí lo es: si no coincide, el
proceso es de otro y se deja en paz (se registra `pid reused — not ours`).

- Los servicios se detienen **por grupo de procesos** y se **espera** su salida
  antes de borrar sus archivos. Un proceso en estado `Z` cuenta como **muerto**: son hijos de la corrida y nadie hace `wait` sobre ellos, así que tras matarlos quedan en la tabla hasta que el padre sale y `ps -p` los sigue listando. Leerlos como vivos hacía esperar la ventana completa por cada servicio y luego anunciar "STILL RUNNING" sobre cuatro procesos ya muertos.
- Sólo se eliminan los contenedores y directorios que el estado nombra. Nunca
  por patrón: `circulos-e2e-*` también alcanzaría a una corrida concurrente.
- La limpieza es idempotente: un segundo `--down` no rompe nada.
- Salida normal, fallo, SIGINT y SIGTERM limpian igual. `--keep` es lo único que
  deja una pila en pie, y sólo cuando llegó a levantarse.

La decisión vive en `apps/web/e2e/circulos/ownership.mjs` como función pura y
tiene pruebas propias, así que «un pid reciclado se respeta» dejó de ser el
recuerdo de una corrida manual.

## 11 · Controles negativos

```bash
node apps/api/src/circles/negative-controls.mjs
node apps/api/src/circles/negative-controls.mjs --only=RATE
```

Cada control rompe el código de producción donde vive la garantía, exige que la
prueba **nombrada** se ponga en rojo por eso, restaura el archivo byte a byte y
exige verde otra vez. Un error de compilación, un timeout o un filtro que no
seleccionó nada cuentan como control **fallido**, nunca como detección: `-t` de
vitest es una expresión regular, y un paréntesis sin escapar selecciona cero
pruebas y sale 0.

Los controles de PostgreSQL usan `TEST_DATABASE_URL` (por defecto la base local
de pruebas, nunca producción). El control de la barrera de revelación construye
la pila completa con `--worktree` — sin eso construiría el commit, es decir el
código **sin** mutar, y un no-op se anotaría como detección.

Cada fase deja su salida en `apps/api/.negative-controls/<PROPIEDAD>.<fase>.log`
(ignorado por git). No es un adorno: el control de la barrera falló dos veces en
su fase de restauración y no había nada que leer, porque el runner descartaba la
salida. Con los logs, el archivo dijo la causa en una línea — `git stash create`,
que tiene un camino de "nada que guardar" y la fase restaurada trabaja, por
definición, sobre un árbol limpio. El harness ya no usa `stash create` sino un
índice temporal.

**Una lección que quedó en el código.** El control de la barrera detectaba la
mutación haciendo _reventar_ el escenario, no disparando su aserción: el
recorrido esperaba un encabezado que la mutación hacía desaparecer, se agotaba
el tiempo y no llegaba a comprobar nada. La barrera es un hecho sobre la
actividad — con un asiento READY, `revealedAt` sigue nulo — y ahora se comprueba
como tal **antes** de mirar ninguna pantalla.

## 12 · Entorno de pruebas alojado (Railway + Vercel) — **en pie**

Un recorrido completo del Dúo corriendo sobre servicios alojados, con cuentas y
contenido sintéticos. Existe para responder lo que ningún arnés local puede:
qué hace el producto cuando el navegador, la Web y la API están realmente
separados por una red.

### Por qué un PROYECTO aparte y no un entorno

El proyecto de producción tiene un solo entorno, `production`. Un entorno nuevo
dentro de él habría quedado a un clic de las variables, los dominios y los
volúmenes de producción, y varias de las operaciones que estas pruebas
necesitan — reiniciar, cambiar el modo de rollout, borrar cuentas — se parecen
demasiado a las que nunca deben tocar producción. Un proyecto separado hace que
esa confusión sea imposible: no comparte nada, ni siquiera por accidente.

| Recurso                | Id                                     | Qué es                                                        |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `psico-circulos-test`  | `4283213c-9369-4c5c-928e-b2a1d58f3a44` | El proyecto Railway. Entorno único: `production`.             |
| `circulos-api-test`    | `276735cb-cb54-42bf-9236-dde0fb6375c5` | La API. `https://circulos-api-test-production.up.railway.app` |
| `circulos-worker-test` | `1c0a4370-aca7-454a-b5c2-c11077084db2` | El worker (barrido y borrado de cuenta).                      |
| `postgres-test`        | `a5617589-8e2e-400e-b82d-31407fa9d0a2` | PostgreSQL, base `circulos_test`, volumen de 5 GB.            |
| `redis-test`           | `ecd025d6-7847-4b79-a60d-5bd39aeb2142` | Redis (colas y límite de abuso).                              |
| `circulos-test-web`    | `prj_BzAwUoTMQYdCNMlAApovOpZjKgIS`     | El proyecto Vercel. `https://circulos-test-web.vercel.app`    |

**El aislamiento, verificado y no supuesto.** `DATABASE_URL` apunta a
`postgres-test.railway.internal/circulos_test` y `REDIS_URL` a
`redis-test.railway.internal` — ambos hosts privados de ESTE proyecto, sin
proxy TCP público. `APP_URL` y `ALLOWED_ORIGINS` son la URL de prueba de
Vercel. Y lo que NO está configurado importa tanto como lo que sí:
`RESEND_API_KEY`, `VAPID_*`, `GOOGLE_CLIENT_ID` y `SENTRY_DSN` están **vacías**,
que es el mecanismo real de apagado de cada una — no una clave falsa. Ningún
correo, ninguna notificación y ninguna traza puede salir de aquí hacia una
persona real.

> **Cuidado con el `railway link` de tu máquina.** Suele apuntar al proyecto de
> PRODUCCIÓN (`psico-platform`), así que un comando sin `--project` va allí. Cada
> comando de esta sección lleva `--project`, `--environment` y `--service`
> explícitos, y los scripts los toman de `hosted.json`. No confíes en el enlace
> por defecto para nada de esto.

### Qué corre ahí, y desde dónde

El código llega como **fuente subida** (`railway up`, `vercel deploy`), nunca
empujando una rama: un push habría disparado Previews y despliegues en los
proyectos de producción, que es exactamente lo que esta ronda no puede hacer.

El árbol desplegado es un ARTEFACTO preparado por el mismo orquestador que usa
la prueba local (`stack.mjs --prepare-only <dir>`), y escribe su propia
procedencia en `circulos-test-artifact.json`: el sha de origen, el sha256 del
fixture y el de cada archivo parcheado. Los parches son **cuatro** y son los
mismos del arnés local: copiar el fixture sintético y añadirlo a
`PRODUCTION_CIRCLE_TEMPLATES`, publicar `duo-lo-que-me-ayuda@2`, **archivar
`@1`** y mover —no añadir— su entrada en `PRODUCTION_DUO_ELIGIBILITY`.

El archivado de `@1` no es cosmético. Publicar una versión es una **sucesión**:
el enlace lleva una clave y ninguna versión, así que sólo puede haber **una**
versión `PUBLISHED` por clave a la vez. Con dos, la ruta del organizador
responde 404 y el CTA desaparece. `ARCHIVED` retira `@1` de todo lo que
**ofrece** mientras `getExact` la sigue resolviendo por pin, que es lo que
mantiene vivas las actividades ya fijadas a ella.

Esto es deliberado y vale la pena decirlo con todas sus letras: **el catálogo de
prueba llega en el artefacto desplegado, no en tiempo de ejecución.** No hay un
interruptor para publicar fixtures, ni un endpoint que inyecte catálogo, ni una
autenticación especial para pruebas, ni una excepción a los guards. El catálogo
de producción sigue vacío y los ratchets lo siguen afirmando.

### Variables por servicio (nombres, nunca valores)

Las tres que gobiernan Círculos, en API **y** worker:

| Variable                     | Para qué                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| `CIRCLES_ROLLOUT_MODE`       | `pilot` en este entorno. `off` lo cierra (ver abajo).             |
| `CIRCLES_PILOT_USER_IDS`     | La lista de admitidos. Vacía ⇒ nadie, aunque el modo sea `pilot`. |
| `CIRCLES_SHARED_DATA_KEY_V1` | Bajo `pilot`/`on` su ausencia **falla el arranque**.              |

Y una que viaja en pareja: `CLIENT_ATTESTATION_SECRET` está en la API y en el
proyecto de Vercel, porque es lo que la Web firma y la API verifica. Si las dos
copias no coinciden, la atestación se rechaza y cada visitante de la superficie
de invitado vuelve a compartir un solo cupo — sin ruido y sin error visible.

La Web necesita exactamente dos: `NEXT_PUBLIC_API_URL` y
`CLIENT_ATTESTATION_SECRET`.

### Cómo correr la prueba alojada

```bash
# 1 · Preparar el artefacto desde el commit que quieres probar.
node apps/web/e2e/circulos/stack.mjs --prepare-only /ruta/al/artefacto

# 2 · Subirlo a los tres servicios (desde /ruta/al/artefacto).
railway up --project <proyecto> --environment <entorno> --service <api>    --detach
railway up --project <proyecto> --environment <entorno> --service <worker> --detach
vercel deploy --prod --yes

# 3 · El recorrido completo: registra el grupo de cuentas, escribe la lista de
#     admitidos, espera a que la API arranque CON esa lista, comprueba que una
#     cuenta fuera de la lista es rechazada, y corre los mismos escenarios del
#     arnés local contra las URLs alojadas.
node apps/web/e2e/circulos/hosted.mjs --config /ruta/hosted.json

# 4 · El límite de abuso, sobre la API alojada.
node apps/web/e2e/circulos/hosted-limits.mjs --config /ruta/hosted.json

# 5 · Cookie, CSP y forma de los rechazos, sobre la Web alojada.
node apps/web/e2e/circulos/hosted-surface.mjs \
  --config /ruta/hosted.json --accounts "$TMPDIR"/circulos-hosted-accounts-<run>.json

# 6 · Al terminar: limpiar lo que esa corrida creó (ver más abajo).
node apps/web/e2e/circulos/hosted-cleanup.mjs --config /ruta/hosted.json --run <run>
node apps/web/e2e/circulos/hosted-cleanup.mjs --config /ruta/hosted.json --run <run> --apply
```

> **El paso 4 gasta cupo de verdad.** Agota la ruta de invitación y borra los
> contadores `throttle:` del Redis de pruebas al empezar y al terminar. Córrelo
> **antes** de dejar el entorno para una prueba manual, nunca por debajo de la
> sesión de otra persona.

`hosted.json` describe el destino y **no vive en el repositorio**: tenerlo
versionado sería tener un archivo cuyo único propósito es apuntar a una
infraestructura. No contiene ningún secreto, así que se reconstruye a mano con
los ids de la tabla de arriba:

```jsonc
{
  "repoRoot": "/ruta/al/repo",
  "apiUrl": "https://circulos-api-test-production.up.railway.app",
  "webUrl": "https://circulos-test-web.vercel.app",
  "projectId": "…", // psico-circulos-test
  "environmentId": "…", // su entorno `production`
  "apiServiceId": "…",
  "workerServiceId": "…",
  "templateKey": "e2e-duo-sintetica",
  "templateVersion": 1,
  "sourceSha": "…", // el commit del artefacto desplegado
  "startPath": "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
  "extraAllowlistIds": ["…"], // cuentas que sobreviven a cada corrida
}
```

Dos cosas que la corrida hace y conviene entender antes de leerla:

- **Espera preguntando lo que importa.** La sonda de arranque no pregunta "¿está
  en modo piloto?" — eso es cierto con CUALQUIER lista, incluida la de la
  corrida anterior, y el recorrido arrancaría contra una API que no conoce a
  ninguna de sus cuentas. Pregunta "¿puede crear una cuenta de ESTE grupo?".
- **Limpia el contador del límite antes de preguntar.** Registrar doce cuentas
  no cabe bajo un tope de diez por hora, y la sonda de arranque gastaría en
  preguntar el mismo cupo que necesita. Se borran las claves `throttle:` del
  Redis **de pruebas**; el tope no se toca, porque el tope es parte de lo que se
  está probando.

### Un recorrido entre dos personas

Dos personas, dos navegadores distintos (o dos dispositivos), unos quince
minutos. Una organiza y necesita cuenta; la otra acompaña y entra con un
enlace, sin registrarse.

> **Esto es una prueba técnica: usa respuestas ficticias. No introduzcas
> información íntima o clínica.** La plantilla pide dos textos breves; escribe
> cualquier cosa inventada. Nada de lo que se escriba aquí está pensado para
> guardar material personal, y el entorno de pruebas se borra sin aviso.

**Quien organiza (persona A)**

1. Abre `https://circulos-test-web.vercel.app/login` e inicia sesión con la
   cuenta del piloto.
2. Abre
   `https://circulos-test-web.vercel.app/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente`.
   **Un Dúo se ofrece desde el material del que nace, no desde un menú**: la
   invitación aparece al final de esa lectura, como "Hacer esto con alguien".
3. Pulsa **Hacer esto con alguien** y después **Crear el Dúo**.
4. La pantalla muestra **un enlace de invitación**. Cópialo **completo** — lleva
   un `#` y lo que va después es el secreto; un enlace cortado no sirve — antes
   de salir o recargar: no se guarda en ningún lado y no se puede volver a
   mostrar. Mándaselo a la persona B por donde ustedes hablen normalmente.
   **Abrirlo no lo gasta**: B puede abrirlo, mirarlo y cerrarlo; lo que lo gasta
   es aceptar. Y dura catorce días.
5. Pulsa **Entrar a la sala**. Verás "Antes de empezar" — es la pantalla de
   consentimiento; el botón se habilita en cuanto la página termina de cargar.

**Quien acompaña (persona B)**

1. Abre el enlace que te mandaron. Verás quién te invita y qué es, antes de
   aceptar nada.
2. Acepta. Entras a la misma sala, sin cuenta y sin contraseña.

**Las dos, cada una por su lado**

1. Lean "Antes de empezar" y pulsen **Entiendo, empezar**.
2. Escriban sus dos respuestas. **Nada de lo que escriben sale de su pantalla
   todavía**: no se guarda, no se envía, no hay autoguardado.
3. Pulsen **Ver qué se compartirá**. Esa vista es exacta: es literalmente lo
   que la otra persona va a leer, y pueden volver a editar.
4. Pulsen **Confirmar y enviar**.
5. **Aquí está lo que vale la pena mirar**: quien confirme primero NO ve nada
   de la otra persona. La sala dice que falta la otra parte y no muestra ni un
   fragmento. Solo cuando las dos han confirmado aparece lo de ambas, a la vez.
6. Después del intercambio hay un cierre con turnos y un artefacto compartido.

**Si el enlace no funciona.** La pantalla dice lo mismo en todos los casos —
«este enlace ya no sirve»— y eso es deliberado: distinguirlos en voz alta le
contaría a un desconocido si una invitación existió. Para quien organiza, las
situaciones sí son distintas y se resuelven distinto:

| Qué pasó                                   | Qué hacer                                                           |
| ------------------------------------------ | ------------------------------------------------------------------- |
| B perdió el enlace o nunca le llegó        | Crear otra invitación. La anterior sigue viva pero sin dueño.       |
| Alguien ya la aceptó                       | Crear otra. Una invitación entra a una sola persona.                |
| Pasaron catorce días                       | Crear otra; caducó.                                                 |
| Falló la red al abrir, o se cortó a medias | **No crear otra**: reintentar el mismo enlace. Abrir no gasta nada. |

El reflejo caro es crear una invitación nueva ante cualquier tropiezo: quien
organiza acaba con varias vivas y sin saber cuál mandó.

**Salir en cualquier momento.** El botón para retirarse está siempre en
pantalla. Si una de las dos se retira antes del intercambio, lo que escribió se
descarta y la otra persona deja de esperar en vez de quedarse colgada.

**Para probar el retiro sin gastar la actividad buena.** Retirarse cierra la
sala para las dos, así que hazlo en una aparte: A repite los pasos 2 a 4 —
experiencia → **Hacer esto con alguien** → **Crear el Dúo**— y sale una
invitación nueva e independiente. Cuantas quieras; cada una es su propia sala.
Merece la pena probarlo en los dos momentos, porque el producto se comporta
distinto: **antes** del intercambio lo escrito se descarta y la actividad queda
cancelada; **después**, lo que la otra persona ya leyó se queda, porque borrarlo
no des-revelaría nada y sí destruiría contenido ajeno.

**Un detalle que conviene saber antes de que lo descubran ellos.**
`/dashboard/circulos` lista lo publicado, pero su enlace "Ver de qué se trata"
lleva a una página de presentación que **no ofrece ningún botón para empezar**.
No es un error del entorno alojado: el punto de entrada vive en la superficie de
lectura a propósito — leer sobre algo y decidir hacerlo con alguien son actos
distintos — pero quien llegue por el listado se queda sin camino. Mándales el
paso 2 de arriba, no el listado. Cerrar ese hueco es una decisión de producto,
no un arreglo de despliegue.

**Si prefieren no crear nada**, hay una actividad ya hecha esperando: el archivo
local trae `CIRCULOS_PILOT_ROOM_URL` (por donde entra A) y
`CIRCULOS_PILOT_INVITATION_URL` (lo que abre B). Sirve una sola vez y caduca a
los catorce días; pasado eso, o si alguien la gasta, A crea otra con los pasos
de arriba.

Las credenciales de la cuenta del piloto y el enlace de invitación **no están en
este documento ni en el repositorio**: viven en un archivo local fuera del
árbol, `~/.psico-ops/circulos-hosted-pilot.env`, con permisos `0600`.
Compártelos tú por el canal que elijas.

### Datos sintéticos: qué se crea y cómo se limpia

Cada corrida crea doce cuentas `circulos-<etiqueta>-<run>@example.test` con
contraseñas aleatorias, y sus actividades. Las credenciales se escriben en
`$TMPDIR/circulos-hosted-accounts-<run>.json` con permisos `0600`, **fuera del
repositorio**. El contenido es una plantilla sintética con dos campos de texto;
no hay material editorial ni información personal en ninguna parte.

#### Cómo se limpia — y por qué NO con un `DELETE`

> **Corrección.** Este runbook decía antes: `DELETE FROM "User" WHERE email LIKE
'…'`, y que la cascada hacía el resto. **Es falso, y falla en silencio.** Las
> claves foráneas del dominio hacia `User` son `ON DELETE SET NULL`, no cascade:
>
> ```
> CircleMember -> User : SET NULL
> Circle       -> User : SET NULL
> CircleEvent  -> User : SET NULL
> ```
>
> Verificado contra `pg_constraint` en la base de pruebas, no contra el schema.
> Así que la fila desaparece y **todo lo que tenía se queda**: un asiento con
> `userId` nulo, una actividad esperando a alguien que ya no existe, una sesión
> de invitado todavía válida y un sobre intacto. No es «la limpieza menos el
> processor» — es exactamente el estado colgante que el borrado de cuenta
> existe para evitar, fabricado a mano. Y como el usuario ya no está, no queda
> ni por dónde encontrarlo.

La limpieza del dominio vive en `CirclesAccountDeletionService`, y lo único que
la invoca es `finalize-account-deletion` en la cola `account-deletion`. El
comando de limpieza reutiliza eso:

```bash
# Primero enseña lo que haría, sin tocar nada.
node apps/web/e2e/circulos/hosted-cleanup.mjs --config /ruta/hosted.json --run <run>

# Y sólo entonces, con --apply, lo hace.
node apps/web/e2e/circulos/hosted-cleanup.mjs --config /ruta/hosted.json --run <run> --apply
```

Lo que hace, en este orden: comprueba que está hablando con `circulos_test` y se
niega si no; lee **los correos exactos que esa corrida registró** en su archivo
de cuentas, no un patrón; deja fuera las cuentas protegidas por id —la cuenta
manual y cualquier otra que `extraAllowlistIds` fije—; deja fuera también
cualquier cuenta sintética que **comparta actividad** con una protegida, porque
cerrarla sería meter mano en los datos de quien está probando; imprime seats,
actividades, invitados vivos y sobres de cada una; y con `--apply` fecha la
petición de borrado hacia atrás **en esas cuentas y sólo ésas**, encola el job
real, espera a que termine y verifica.

El plazo de 30 días **no se acorta**: el processor vuelve a leer
`deleteRequestedAt` bajo `FOR UPDATE` y lo compara con el reloj real. Lo que se
ajusta es la fecha de la petición, sobre cuentas sintéticas identificadas.

Sin `TRUNCATE`, sin desactivar triggers y sin una puerta de scrub general: lo
que existe es este comando sobre una corrida nombrada, y nada más. Correrlo dos
veces es seguro — la segunda no encuentra nada que hacer.

**Si el archivo de una corrida se perdió** (`$TMPDIR` se vacía solo), el comando
no puede adivinarla — y no debe: su seguridad viene de trabajar sobre una lista
enumerada, no sobre un patrón. Reconstruye el archivo con las direcciones de esa
corrida y vuelve a correrlo:

```sql
-- sobre la base de PRUEBAS, sólo para leer las direcciones
SELECT email FROM "User" WHERE email LIKE 'circulos-%-<run>@example.test';
```

Escribe `{"<etiqueta>": {"email": "<dirección>"}, …}` en
`$TMPDIR/circulos-hosted-accounts-<run>.json` y sigue igual: el comando vuelve a
comprobar el patrón, vuelve a excluir lo protegido y vuelve a enseñar el plan.

**Qué permanece, conforme al comportamiento actual** (no es una política nueva,
es lo que hoy hace el borrado): el asiento se conserva con `userId` nulo, el
Círculo con `createdByUserId` nulo y las filas de `CircleEvent` con
`actorUserId` nulo — por la regla del ledger de §2. Los artefactos `PROPOSED` y
`SUPERSEDED` que escribió esa cuenta **se quedan sin contenido**, con `purgedAt`
fechado, conforme a la política aprobada de §2; los `AGREED` y todo lo de la
contraparte quedan intactos. Este comando no decide nada de eso: lo hace el
borrado real, y aquí sólo se describe lo que se verá después.

### Cuando termines de probar

En orden, y ninguno de los pasos depende de los otros:

1. **Limpia lo que creaste.** Si probaste con las cuentas del piloto, sus
   actividades se quedan; no hace falta borrarlas. Si corriste un recorrido
   automatizado, límpialo con `hosted-cleanup.mjs --run <run>` (primero sin
   `--apply` para ver qué hará).
2. **Cierra Círculos** si nadie más va a entrar: `CIRCLES_ROLLOUT_MODE=off` +
   redeploy. Comprueba el 503 y que `/health` sigue en 200.
3. **Para los servicios** desde Railway si quieres dejar de gastar. El volumen
   de PostgreSQL sobrevive y todo vuelve a arrancar igual.

Nada de esto borra el proyecto. **No lo elimines** mientras el piloto siga
vivo: el volumen se va con él y no hay vuelta atrás.

### Cerrar Círculos en el entorno de pruebas

Es el procedimiento de §6, sobre este proyecto:

```bash
railway variables --project <p> --environment <e> --service <api> \
  --set CIRCLES_ROLLOUT_MODE=off
railway redeploy --project <p> --environment <e> --service <api> --yes
```

Y se comprueba, no se supone: `GET /api/circles/guest/session` debe responder
`503 CIRCLES_UNAVAILABLE` mientras `/health` sigue en `200` — esa diferencia es
la que distingue "apagado" de "caído". Para volver a abrir, `pilot` otra vez con
la misma lista, y otro redeploy: el modo se resuelve **una sola vez al arrancar**
y no se relee, así que sin reinicio no cambia nada.

### Detener o eliminar el entorno

Los cuatro servicios pueden pararse desde Railway sin perder datos: el volumen
de PostgreSQL sobrevive. Eliminar el proyecto borra el volumen y con él todas
las cuentas sintéticas — es irreversible y **no debe hacerse mientras el piloto
esté en uso**.

### Lo que este entorno NO demuestra todavía

- **Plantilla real.** Lo que corre es un fixture sintético. Una plantilla con
  copy aprobado es un acto editorial con su propia revisión (§13).
- **Contenido personal.** Todo lo probado es texto inventado. El salto a
  material íntimo real necesita la política de retención que todavía no existe.
- **Correo, notificaciones y OAuth.** Deliberadamente sin configurar aquí.
- **Carga.** Un Dúo a la vez, no cien.

### Fecha propuesta de revisión

**2026-10-14.** Si para entonces el piloto no avanzó, lo barato es parar los
cuatro servicios; el proyecto puede quedar en pie para no tener que rehacerlo.

---

## 11B · Analítica de Círculos — qué se guarda, qué no, y cuánto dura

> Definiciones completas y versionadas en
> [`circles-metric-dictionary.md`](circles-metric-dictionary.md). Esta sección
> es la operativa.

### Tres tablas, y ninguna con contenido

| Tabla              | Qué guarda                                                            | Vive         |
| ------------------ | --------------------------------------------------------------------- | ------------ |
| `CircleFeedback`   | Hasta dos temas cerrados + una de tres respuestas + versión del aviso | **30 días**  |
| `CircleHelpOpen`   | Cuántas veces se abrió cada ayuda, por asiento                        | **30 días**  |
| `CircleWeeklyFact` | El agregado semanal, sin asientos                                     | **12 meses** |

Ninguna tiene una columna donde quepa una respuesta de la actividad. No es una
promesa de no escribirla: es que no existe el sitio.

**Todo lo demás lo da el dominio.** Invitaciones, actividades, hitos y tiempos
salen de columnas que escribió una transacción confirmada (`acceptedAt`,
`revealedAt`, `closedAt`, `readyAt`, `agreedAt`). No se copian a ninguna tabla
de analítica: una segunda fuente de verdad es una fuente que puede discrepar de
la primera, y la primera es sobre la que actúa el producto.

### El barrido, y por qué no está detrás del rollout

Corre dentro del job `circles-sweep` que ya existe, **antes** de la comprobación
de modo. Cancelar una invitación encallada es una conducta de producto y un
producto apagado no debería ejecutarla; borrar datos cuyo plazo venció es una
obligación con las personas de quienes vinieron, y apagar una función no es
motivo para conservarlos más.

Es idempotente: pliega lo que ya venció, escribe el agregado y borra las filas.
Correrlo dos veces escribe lo mismo.

### Retirar el permiso

Borrar la cuenta elimina las contribuciones de sus asientos, dentro de la misma
transacción que el resto del desvinculado. **Lo que ya se plegó en un agregado
no se puede restar** — el agregado no tiene asiento dentro. Ese límite se dice
donde se hace la promesa; no se promete un borrado que el código no hace.

### El panel

`GET /api/pulso/circulos` y `/api/pulso/circulos.csv`, ADMIN, con la misma
supresión: la celda se forma suprimida, así que la pantalla y el CSV no pueden
discrepar. Una sola vista fija con un parámetro de días — combinar filtros haría
recuperable por resta cualquier celda suprimida.

Por debajo de **10 contribuyentes distintos** la respuesta es «muestra
insuficiente», nunca cero. El umbral reduce exposición; **no** garantiza
anonimato: un invitado puede aparecer en varias actividades con asientos
distintos.

### Lo que deliberadamente no se captura

Pulsaciones, valores, longitudes, focos de campo, decisiones de la compuerta de
seguridad, beacons, heartbeats, `flush` al salir, session replay, grabaciones,
fingerprinting o SDK de marketing. El polling existente **no** se aumentó para
medir actividad.

Los contadores de ayuda viven en la memoria del navegador durante la
preparación privada y se envían **sólo** si la persona acepta contribuir al
final. Quien se va antes no aparece: la cobertura es parcial a propósito, y el
panel lo dice en su propio texto.

---

## 12B · El piloto PRODUCTIVO — encender, comprobar, apagar

> Distinto del §12. Ese es el entorno de pruebas, con cuentas sintéticas y un
> recorrido automatizado que crea y destruye. **Nada de eso se ejecuta aquí.**

### Destinos, por id

| Qué              | Id                                                        |
| ---------------- | --------------------------------------------------------- |
| Proyecto Railway | `013d58d0-3886-4e9a-8fc2-7c50df9dc38e` (`psico-platform`) |
| Entorno          | `4df9c485-52b7-44a9-881c-97791753682f` (`production`)     |
| API              | `4131e16a-9576-4268-a933-624f26e259f8`                    |
| Worker           | `1d672199-6d56-4f71-b82e-93c3597be322`                    |
| Web (Vercel)     | `prj_LqB4M2ZPwkgMh96LDf0reanTrWJu` (`psico-platform-web`) |

Nunca por vínculo heredado. Un `vercel deploy --prod --yes` desde un directorio
sin vincular **crea un proyecto nuevo** con el nombre del directorio; desde uno
vinculado al proyecto equivocado, despliega ahí sin preguntar. Antes de
desplegar:

```bash
node apps/web/e2e/circulos/vercel-target.mjs \
  --dir <directorio> --project <prj_…> --org <team_…>
```

### Encender

1. `CIRCLES_ROLLOUT_MODE=pilot` en **API y worker**.
2. `CIRCLES_PILOT_USER_IDS` con los ids de quienes ORGANIZAN, en ambos.
3. `CIRCLES_SHARED_DATA_KEY_V1` en ambos — 32 bytes, base64, **exclusiva de
   producción**.
4. `CLIENT_ATTESTATION_SECRET` en la API y en la Web, **el mismo valor**.
5. Esperar los estados terminales de los tres despliegues. El modo se resuelve
   una sola vez al arrancar.

### Comprobar

```bash
node apps/web/e2e/circulos/production-ready.mjs \
  --api https://psico-platform-production.up.railway.app \
  --web https://psico-platform-web.vercel.app
```

Lee y no escribe: no registra cuentas, no encola trabajos y no toca fechas.
Comprueba que Círculos está **abierto** (401 sobre una sesión inventada, no
503), que un anónimo no crea nada, que una llamada directa a las rutas del BFF
se rechaza, que la atestación de la Web sí se acepta —es decir, que los dos
secretos coinciden—, y que la CSP lleva un nonce distinto por petición.

Lo que **no** puede comprobar: que un organizador autorizado entre y cree. Eso
necesita su contraseña, y esa comprobación es de una persona.

### Apagar

Lo de §6, con los dos servicios de producción. El barrido se detiene sólo al
reiniciar el worker; el borrado de cuentas sigue corriendo, como debe.

---

## 13 · Círculos de más de dos personas — qué hay y qué falta

**Disponible hoy:** el motor de Círculos y **una** modalidad, el Dúo de dos
personas adultas. El motor no es específico del Dúo — actividades,
participantes, invitaciones, sobres, revelado, artefacto, seguimiento y barrido
temporal no saben cuántos asientos hay — pero todo lo que decide CUÁNDO pasa
algo está escrito para dos.

**No disponible:** cualquier actividad de más de dos, y sus reglas. No es una
constante que subir. `requiredParticipants` y los `CHECK` de Dúo en la base
están puestos a propósito: **no se amplían ni se retiran aquí**, porque son lo
que impide que una plantilla mal editada abra una conversación de cinco personas
sobre material pensado para dos.

### El bloque futuro, si se hace

Uno solo, reutilizando el motor. Antes de escribir una línea hay cinco
decisiones, y ninguna es técnica:

1. **Tamaño.** Cuántas personas, y si el máximo es del producto o de la
   plantilla.
2. **Quién invita.** Sólo quien creó la actividad, o cualquier participante.
3. **Si deben confirmar todos.** Hoy el revelado es `ALL_CONFIRMED` y con dos
   eso es inequívoco. Con cinco hay que elegir entre esperar a todos —una
   persona bloquea al grupo— o abrir con un quórum, que es una regla nueva sobre
   contenido íntimo y no una variante de configuración.
4. **Qué pasa cuando alguien se retira.** Con dos, retirarse termina la
   actividad porque no queda con quién. Con más, ¿sigue sin esa persona? ¿Se
   borra lo que ya compartió, o se queda porque los demás ya lo leyeron?
5. **Quién puede ver lo compartido.** Todos, o sólo quien también compartió.

Hasta que esas cinco tengan respuesta, ampliar el motor es adivinar. Y no se
diseñan a la vez modalidades clínicas, familiares, empresariales y educativas:
son públicos distintos con riesgos distintos, y mezclarlas produce una que no
sirve para ninguno.

**Nada de esto se construye en #714.**

---

## 14 · PENDIENTE — no implementado en este corte

> La política de artefactos y la primera plantilla **están aprobadas e
> implementadas** (§2 y §5). Lo que sigue pendiente es una plantilla SEGUNDA, y
> con ella la regla que no cambia: una aprobación no se hereda. Un texto
> pendiente **no equivale a una aprobación tácita** — que nadie haya dicho que
> no, que el plazo se alargue o que el código ya esté listo no convierte una
> propuesta en algo publicable.
> El paquete aprobado está en
> [`circles-pilot-activation-decision.md`](circles-pilot-activation-decision.md).

- **Aprobación editorial y de seguridad de plantillas ADICIONALES.** Ninguna otra
  candidata tiene copy aprobado verificable en el repositorio, y los ratchets
  afirman que el catálogo lleva exactamente la aprobada. **Requisito previo de
  cualquier segunda actividad.**
- **El listado `/dashboard/circulos` no lleva a ninguna parte.** Enumera lo
  publicado y su enlace "Ver de qué se trata" abre una página de presentación
  **sin ningún botón para empezar**. El punto de entrada vive en la superficie
  de lectura a propósito — leer sobre algo y decidir hacerlo con alguien son
  actos distintos —, así que esto no es un despiste de implementación sino una
  pregunta de producto sin responder: o el listado ofrece el camino, o lleva de
  vuelta al material del que nace la actividad, o no existe. **Decisión
  pendiente**, y visible para cualquiera que entre por el menú.

- **Eco Facilitador.** Fuera de alcance por decisión explícita: el piloto es Dúo
  sin IA. `ECO_ENABLED=false`.
- **Un fallo local del hook `pre-push`** se observó una vez y no se reprodujo:
  `pnpm test` volvió a salir 0 inmediatamente después, y CI quedó verde sobre el
  mismo árbol. Queda **sin explicar**, no cerrado.
