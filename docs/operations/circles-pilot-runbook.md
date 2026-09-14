# FeelVerse Círculos — runbook operativo del piloto

> **Estado honesto de este documento.** Describe lo que existe y está
> verificado hoy, y nombra explícitamente lo que falta. Las secciones marcadas
> `PENDIENTE` no están implementadas: no las ejecutes esperando que funcionen.
>
> Círculos está **apagado en producción** (`CIRCLES_ROLLOUT_MODE` ausente ⇒
> `off`), el catálogo de plantillas publicadas está **vacío** y la elegibilidad
> de Dúo está **vacía**. Nada de lo que sigue enciende el producto.

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

## 2 · Borrado de cuenta con Círculos — **implementado; una decisión pendiente**

El bloqueo técnico (`ACCOUNT_DELETION_WITH_CIRCLE_EVENTS`) está resuelto: la
cuenta se puede borrar, la participación viva termina, el contenido propio se
destruye —incluido el de actividades ya cerradas— y la autoridad derivada se
revoca.

**No está cerrado el borrado "integral".** Los artefactos se dejan como están, y
eso es la ausencia de una política, no una política. Ver la matriz más abajo:
`ARTIFACT_RETENTION_POLICY_STATUS=pending_decision`.

### Cómo funciona

El job existente `AccountDeletionProcessor` ejecuta, **en este orden**:

1. `CirclesAccountDeletionService.detachUser(userId)` — por cada asiento vivo:
   purga el sobre, revoca invitaciones y sesiones de invitado de esa actividad,
   y lleva la actividad al estado terminal que implica su etapa
   (`INVITING`/`PREPARING` → `CANCELLED`; `REVEALED`/`FOLLOW_UP` → `CLOSED`).
   Luego marca las membresías `LEFT`.
2. `prisma.user.delete()` — las tres referencias de Círculos se **desvinculan**
   (`Circle.createdByUserId`, `CircleMember.userId`, `CircleEvent.actorUserId`).

El orden es la garantía: borrar primero y limpiar después deja una ventana con
la cuenta ya eliminada y la actividad todavía viva, en la que la contraparte
podría confirmar y disparar una revelación.

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
| Artefacto `PROPOSED` del borrado                | **Se conserva HOY** — decisión pendiente  | Nadie lo aceptó. Llamarlo «compartido y ya visto» sería falso. Requiere decisión editorial.                                                                                                                                                                                                          |
| Artefacto `SUPERSEDED`                          | **Se conserva HOY** — decisión pendiente  | Histórico. Mismo caso.                                                                                                                                                                                                                                                                               |
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

## 5 · Qué configurar antes de un piloto

Nada de esto está aplicado y **no debe aplicarse todavía**.

| Variable                     | Servicio | Nota                                                       |
| ---------------------------- | -------- | ---------------------------------------------------------- |
| `CIRCLES_ROLLOUT_MODE=pilot` | API      | `on` es disponibilidad general.                            |
| `CIRCLES_PILOT_USER_IDS`     | API      | Vacía ⇒ vuelve a cerrar.                                   |
| `CIRCLES_CIPHER_KEY`         | API      | Bajo `pilot`/`on` una clave ausente **falla el arranque**. |

Además, y antes de invitar a nadie: publicar al menos una plantilla
(`PRODUCTION_CIRCLE_TEMPLATES` está vacío) y su mapping de elegibilidad
(`PRODUCTION_DUO_ELIGIBILITY` está vacío). Ambas cosas son **actos
editoriales** con su propia aprobación, no tareas de despliegue.

---

## 6 · Detener el piloto ante una regresión

1. `CIRCLES_ROLLOUT_MODE=off` en el servicio de API y reiniciar. Las superficies
   responden 503 en cuanto arranca.
2. Comprobar: `POST /api/circles/invitations/inspect` y
   `GET /api/circles/guest/session` deben dar 503 `CIRCLES_UNAVAILABLE`
   mientras `/health` sigue en 200 — eso distingue "apagado" de "caído".
3. Si además hay que revocar lo ya emitido, es un `UPDATE` de `revokedAt`, no un
   flag (ver §1).
4. Apagar el rollout **no** borra datos ni recupera contenido ya visto.

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
la API y en el servidor Web. No aplicado en ningún sitio.

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
| `BROWSER_REVEAL_BARRIER`                      | con una sola confirmación la otra persona **no ve** lo ajeno y `revealedAt` sigue nulo; con las dos, ambos ven                                                                         |
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
  antes de borrar sus archivos.
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

## 12 · PENDIENTE — no implementado en este corte

- **Aprobación editorial y de seguridad de plantillas.** Ninguna candidata tiene
  copy aprobado verificable en el repositorio. El catálogo de producción sigue
  vacío y los ratchets lo afirman. **Requisito previo del piloto con personas.**
- **Política de retención/purga de artefactos.** No se ha inventado ninguna;
  queda como decisión pendiente. **Requisito previo del piloto con personas.**
- **Eco Facilitador.** Fuera de alcance por decisión explícita: el piloto es Dúo
  sin IA. `ECO_ENABLED=false`.
- **Un fallo local del hook `pre-push`** se observó una vez y no se reprodujo:
  `pnpm test` volvió a salir 0 inmediatamente después, y CI quedó verde sobre el
  mismo árbol. Queda **sin explicar**, no cerrado.
