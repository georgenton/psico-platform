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

## 9 · PENDIENTE — no implementado en este corte

Estos puntos siguen abiertos y bloquean el piloto con personas:

- **Prueba completa en dos navegadores.** Sigue sin entregarse. El framework
  existe (`apps/web/e2e/` ya maneja Chrome con Playwright). Lo que falta, y es
  la razón concreta por la que no se entregó en esta ronda:

  > Para que un recorrido real muestre el CTA hace falta **una plantilla
  > publicada y su mapping de elegibilidad**. Hoy ambos son constantes de
  > compilación (`PRODUCTION_CIRCLE_TEMPLATES`,
  > `PRODUCTION_DUO_ELIGIBILITY`), vacías a propósito. Inyectar una plantilla
  > de prueba exige un mecanismo que **no pueda existir en producción** — y la
  > instrucción es explícita en que no se añada una puerta para publicar
  > fixtures allí. Diseñar esa inyección de forma segura (build separado, o un
  > proveedor que sólo lea el override fuera de producción, con su propio
  > ratchet) es la siguiente unidad de trabajo, no un paso menor.

  Mientras tanto, el resto del recorrido está cubierto por pruebas de
  integración con el Route Handler real y por las pruebas de PostgreSQL real.

- **Aprobación editorial y de seguridad de plantillas.** Ninguna candidata tiene
  copy aprobado verificable en el repositorio.
- **Eco Facilitador.** Fuera de alcance de este corte, por decisión explícita:
  el piloto es Dúo sin IA. `ECO_ENABLED=false`.
- **Política de retención/purga.** No se ha inventado ninguna. Si el piloto la
  necesita, es una aprobación previa, no un default.
