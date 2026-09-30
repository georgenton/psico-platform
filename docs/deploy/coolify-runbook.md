# Runbook · despliegue de FeelVerse en Coolify

Autoridad: [ADR 0024](../adr/0024-migracion-a-coolify-syntavera.md).
Inventario y decisiones: [coolify-migration-as-is-to-be.md](coolify-migration-as-is-to-be.md).

**La fuente canónica de variables de staging es
[coolify-staging-env-inventory.md](coolify-staging-env-inventory.md).** Este runbook
describe el **proceso**; el inventario describe la **configuración**. Las tablas de
variables no se repiten aquí a propósito: contadas en dos sitios, divergen — y la que
se queda vieja es siempre la que alguien lee.

Mientras Vercel y Railway sigan encendidos, **son el respaldo**. Nada de lo que hay
aquí borra, apaga ni reconfigura nada suyo.

**Reglas que atraviesan todos los pasos.** No se publica al host PostgreSQL 5432,
Redis 6379, el worker ni ningún puerto de administración: los servicios privados se
hablan por la red Docker `coolify`. No se leen valores de secretos; se comprueba que
una clave está puesta, nunca qué dice. No se toca SSH, firewall, Fail2ban, el
Traefik base, el demonio de Docker, el plano de control de Coolify ni sus backups.

---

## 0 · PRE-DEPLOY

Todo esto se cumple **antes** de crear un solo recurso. Estado verificado el
2026-09-30.

| #   | qué                                                                       | cómo se comprueba                                                                         | estado                    |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| 1   | La App de GitHub tiene acceso a `georgenton/psico-platform`               | `list_github_repositories` lo devuelve, y `list_github_branches` lista `main`             | ✅ **READY**              |
| 2   | El proyecto y el entorno existen                                          | `get_project` sobre `FeelVerse` lista `staging`                                           | ✅ existen y están vacíos |
| 3   | El servidor está sano                                                     | `get_server` → `is_reachable`, `is_usable`, Traefik `running`                             | ✅                        |
| 4   | Credencial WRITE disponible                                               | `~/.config/syntavera/coolify-write.token`: existe, 52 bytes, `600`, en directorio `700`   | ✅ **READY**              |
| 5   | DNS de `staging.feelverse.app`                                            | tres resolvers públicos + el autoritativo → `148.113.254.26`, DNS only                    | ✅ **READY**              |
| 6   | DNS de `api-staging.feelverse.app`                                        | el móvil y el navegador llaman a la API directamente                                      | ⬜ **pendiente**          |
| 7   | Secretos de staging preparados fuera del repositorio                      | los nombres y su clasificación viven en [el inventario](coolify-staging-env-inventory.md) | ⬜                        |
| 8   | El repositorio pasa lint, typecheck, pruebas y build                      | CI del PR #758                                                                            | ✅ 17/17 en verde         |
| 9   | Almacenamiento S3 de Coolify apuntando a `syntavera-feelverse-db-backups` | lleva credenciales de R2, así que lo crea el propietario en la UI                         | ⬜                        |

Los prerrequisitos 6, 7 y 9 son los que faltan, y los tres son del propietario.

### Los helpers de escritura

Ya existen dos cosas bajo `~/.config/syntavera/`, y conviene no confundirlas:

- `coolify-application-patch.sh` — **sólo** `PATCH /applications/{uuid}`.
  Deliberadamente estrecho. **No se toca ni se amplía.**
- `coolify-write.sh` — cliente genérico con verbo y ruta libres, creado después.

Para crear los recursos de staging no hace falta ningún cliente nuevo: hacen falta
**invocaciones auditables**. La disciplina que ya establecieron esos dos scripts
—token por stdin y nunca como argumento, cuerpo por fichero con permisos `600`,
identificadores validados antes de construir la URL, `--fail-with-body` para no
perder el 422 que dice qué campo se rechazó— se conserva tal cual.

Endpoints documentados que se van a usar, y sólo estos:

| operación        | método y ruta                                                        | nota                                                                                              |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| crear Postgres   | `POST /api/v1/databases/postgresql`                                  | `instant_deploy: false`                                                                           |
| crear Redis      | `POST /api/v1/databases/redis`                                       | `instant_deploy: false`                                                                           |
| crear aplicación | `POST /api/v1/applications/private-github-app`                       | requiere `github_app_uuid`, `git_repository`, `git_branch`, `build_pack`; `instant_deploy: false` |
| variables        | `POST /api/v1/applications/{uuid}/envs` · `PATCH .../envs` para lote | ver el aviso de build-time                                                                        |
| ajustes finos    | `PATCH /api/v1/applications/{uuid}`                                  | el helper estrecho que ya existe                                                                  |
| respaldo         | `POST /api/v1/databases/{uuid}/backups`                              | `frequency`, `save_s3`, `s3_storage_uuid`, retención                                              |
| desplegar        | **no por REST**                                                      | el despliegue va por el MCP de deploy, y sólo tras la confirmación                                |

**Aviso sobre variables de build.** `is_build_time` aparece en la **respuesta**
documentada de los endpoints de variables, pero **no** en el cuerpo de la petición
—ni al crear ni al actualizar—. O sea que por API documentada no se puede marcar una
variable como de build. Afecta a las `NEXT_PUBLIC_*` de la web, que Next inlinea en
el bundle del navegador al construir. Se crean por API y el propietario marca la
casilla «Build Variable» en la UI para esas tres. Las rutas de prototipos ya no
dependen de esto: son `force-dynamic`, así que su gate se resuelve por petición.

## 1 · DEPLOY STAGING

Orden no negociable: los datos primero, el worker al final. Cada recurso se
comprueba sano antes de crear el siguiente.

### 1.1 `feelverse-staging-postgres`

Y su respaldo, que se configura **antes** de meter nada que importe:

| campo                                      | valor                                                                                                                 | por qué                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| endpoint                                   | `POST /api/v1/databases/{uuid}/backups`                                                                               | documentado; Coolify lo soporta de pleno                                                                                                                        |
| `frequency`                                | `0 3 * * *` (diario, 03:00)                                                                                           | fuera de la ventana de actividad, y separado del `docker cleanup` de las 00:00 del host                                                                         |
| `save_s3`                                  | `true`                                                                                                                | el respaldo no vale si vive en el mismo disco que la base                                                                                                       |
| `s3_storage_uuid`                          | el del almacenamiento que apunta a **`syntavera-feelverse-db-backups`**                                               | bucket exclusivo de FeelVerse. **Nunca** `syntavera-coolify-backups`, que es del plano de control: mezclarlos haría que restaurar uno pusiera en riesgo el otro |
| `database_backup_retention_amount_locally` | `0`                                                                                                                   | nada en local; el disco del host no es una copia                                                                                                                |
| `database_backup_retention_days_s3`        | `30` para staging                                                                                                     | suficiente para un ensayo de restauración; producción se decide con su propio criterio                                                                          |
| `timeout`                                  | por defecto (3600s)                                                                                                   | el volcado de staging no se acerca                                                                                                                              |
| `missing_backup_notification_days`         | `2`                                                                                                                   | esto es lo que convierte «hay respaldo» en «sabemos si dejó de haberlo». Un respaldo que se rompe en silencio es el modo de fallo real                          |
| tipo                                       | volcado lógico (`pg_dump`) que hace Coolify                                                                           | consistente y restaurable con `pg_restore`; no es un snapshot de volumen                                                                                        |
| restauración futura                        | traer el objeto de R2, `pg_restore` sobre una base **nueva y vacía**, y comparar contra el original antes de conmutar | el ensayo se documenta: un respaldo que no se ha restaurado nunca no se sabe si restaura                                                                        |

El almacenamiento S3 lo crea el propietario en la UI de Coolify, porque lleva
credenciales de R2 y yo no las manejo.

Database · PostgreSQL. Imagen **`pgvector/pgvector:pg18`** fijada por digest — es la
única versión contra la que este repositorio prueba la cadena completa de migraciones
(§4 del inventario). Sin dominio y **sin puerto al host**. Healthcheck activo
(interval 15s, timeout 5s, retries 5). Límites iniciales de contención `1g` / `1` CPU,
que **no** son dimensionamiento: se miden en staging (§16 del inventario).

Plan de creación, exacto y sin ejecutar:

| campo                           | valor                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `name`                          | `feelverse-staging-postgres`                                                                                |
| `server_uuid`                   | `tyaniecu7o8q7ml7212rxwff`                                                                                  |
| `project_uuid`                  | `ol7ntjddsclgrfcpbsgcnxhh`                                                                                  |
| `environment_uuid`              | `xsj7d7obrtlqooqfw5x4sbta`                                                                                  |
| `image`                         | `pgvector/pgvector:pg18@sha256:…` (digest resuelto al crear, y anotado)                                     |
| `postgres_db`                   | `feelverse_staging`                                                                                         |
| `postgres_user`                 | `feelverse_migrator` — rol propio, nada compartido con el vecino ni con producción                          |
| `postgres_password`             | generada en el momento, **nunca** impresa ni escrita en un fichero de configuración                         |
| `is_public`                     | `false`                                                                                                     |
| `public_port`                   | ausente                                                                                                     |
| `instant_deploy`                | `false` — el despliegue es un paso aparte, tras la confirmación                                             |
| `limits_memory` / `limits_cpus` | `1g` / `1`                                                                                                  |
| volumen                         | el que Coolify gestiona para el recurso; el estado vive aquí y en R2                                        |
| red                             | `coolify`, la del destino. Se habla por nombre de servicio, no por IP                                       |
| `DATABASE_URL` destino          | se construye a partir de este recurso y se pone como variable en **api** y **worker**, en ningún otro sitio |

Verificar antes de seguir: estado `running:healthy`, `is_public: false`,
`public_port: null`, `ports_mappings: null`.

Y una comprobación que no es opcional, porque el RAG depende de ella:

```sql
-- dentro del contenedor, no desde el host
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

Si no devuelve fila, la extensión la crea la migración `20260508154842_add_ai_rag_tables`;
si devuelve error de que no existe la extensión disponible, la imagen es la
equivocada y se para aquí.

### 1.2 `feelverse-staging-redis`

Database · Redis 7. Sin dominio, **sin puerto al host**, con volumen.

`REDIS_URL` es opcional en el esquema, pero `superRefine` la exige cuando
`NODE_ENV=production` — que es el perfil de staging. Así que su ausencia **aborta la
validación y el arranque** de api y worker: falla rápido, que es lo que uno quiere.

La trampa está un paso antes, y de ahí que este runbook la nombre: si alguien no pone
`NODE_ENV=production`, el default es `development`, el esquema deja de exigir Redis,
`createRedisClient` cae a `ioredis-mock` y las colas quedan mudas en silencio. Se
comprueba que las dos variables están puestas en api y worker antes de darlos por
buenos. Detalle completo en
[§1.2 del inventario](coolify-staging-env-inventory.md).

### 1.3 `feelverse-staging-api`

Application desde `georgenton/psico-platform`, rama `main`, `build_pack: railpack`
(el mismo constructor que Railway ya usa, con comandos explícitos). Puerto interno
**3001** declarado. Healthcheck `GET /health` con start period generoso: arranca Nest,
valida el entorno y conecta Prisma antes de contestar.

**Con dominio público: `api-staging.feelverse.app`.** Esto corrige la versión previa
del plan. El navegador de la web y el móvil llaman a la API directamente (§9.6 del
inventario), así que una API privada dejaría sin funcionar Eco, el lector, la voz y el
Diario en las dos plataformas. No es un dominio de conveniencia.

`ALLOWED_ORIGINS` debe incluir `https://staging.feelverse.app`: `main.ts` pasa la
lista a `enableCors` con `credentials: true`, y sin el origen cada llamada del
navegador muere en el preflight.

Las variables, su clasificación y el contrato de arranque están en
[el inventario](coolify-staging-env-inventory.md). Lo que este paso añade es el
**orden**: el contrato de arranque son **26 variables**, y doce de ellas son barreras
que no aparecen en el esquema de env (§1.3 del inventario). Si faltan, el contenedor
no arranca y el despliegue entra en bucle de reinicio — así que se cargan **antes** de
desplegar, no después de ver el primer fallo.

#### El gate de migración

`prisma migrate deploy` se ejecuta como **`pre_deployment_command` del recurso api**,
y en ningún otro sitio:

```
pnpm --filter @psico/api migrate:deploy
```

Cuatro propiedades, y ninguna es accidental:

1. **Exactamente una vez por despliegue.** Coolify corre el pre-deployment command una
   vez, antes de arrancar el contenedor nuevo. Si estuviera en el `start` de la
   aplicación, N réplicas lo lanzarían N veces en paralelo. Prisma toma un advisory
   lock, así que no corromperían el esquema, pero sí se serializarían esperándose y
   una migración lenta se convertiría en un arranque fallido por timeout.
2. **Antes de que arranque código que dependa del esquema nuevo.** Es lo que
   «pre-deployment» significa; por eso no va en el `start`.
3. **Sólo en api, nunca en worker.** Los dos comparten build y base. Si los dos lo
   ejecutaran, dos despliegues simultáneos competirían por el mismo lock sin que nadie
   lo necesite. El worker declara `pre_deployment_command` vacío, igual que hoy en
   `railway.worker.json`.
4. **Nunca encadenado.** Ese `&&` es exactamente cómo una migración de esquema y una
   reescritura de contenido curado llegaron juntas a producción una vez. Sin seed, sin
   backfill, sin ingesta: un comando.

**Si la migración falla.** Coolify aborta el despliegue y **no arranca el contenedor
nuevo**; el anterior sigue sirviendo, que en el primer despliegue de staging significa
que no hay nada sirviendo. Entonces:

- se lee el error en el log del despliegue, no se reintenta a ciegas: una migración
  que falla dos veces falla por la misma razón;
- si dejó el registro `_prisma_migrations` a medias, la fila queda marcada como
  fallida y `migrate deploy` se niega a seguir hasta resolverla — con
  `prisma migrate resolve --rolled-back <nombre>` **tras** entender por qué falló.
  Ese es el mismo procedimiento del incidente del 2026-06-01, donde ficheros de
  migración corruptos pararon el despliegue;
- ninguna migración destructiva se ejecuta automáticamente. Cuando una lo requiera:
  **expand → deploy → contract**, en despliegues separados, y el paso _contract_ nunca
  en el mismo despliegue que introduce el código que deja de usar la columna.

### 1.4 `feelverse-staging-web`

Application, mismo repositorio y rama. Puerto interno **3000**. Dominio
`staging.feelverse.app` — y **sólo** ése: `feelverse.app` ya resuelve a este VPS, así
que escribirlo aquí publicaría staging en el hostname de producción al instante (§10
del inventario). Healthcheck `GET /api/health`.

Las `NEXT_PUBLIC_*` se inlinean en el bundle al construir, así que tienen que estar
disponibles **en build**, no sólo en runtime — y la API documentada de Coolify no puede
marcarlas. La lista exacta y el gate están en
[§12 del inventario](coolify-staging-env-inventory.md): **Web no se despliega** hasta
que esas casillas estén marcadas en la UI.

Y sólo `staging.feelverse.app` en el campo de dominio. Nunca `feelverse.app`: su DNS ya
resuelve a este VPS, así que escribirlo aquí publicaría staging en el hostname de
producción al instante.

### 1.5 `feelverse-staging-worker`

Application, mismo build, arranque distinto (ADR 0010): `node apps/api/dist/worker`.
Sin puerto, sin dominio, **sin healthcheck HTTP posible** — no escucha. Su salud se
observa por logs y por profundidad de colas.

Mismas variables que la API, **sin** `PORT`.

---

## 2 · VALIDATE

Hasta aquí sólo se ha comprobado que los contenedores arrancan. Esto comprueba que
el despliegue es el que creemos.

### 2.1 Que ningún servicio privado esté publicado

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Ni 5432, ni 6379, ni el worker, ni nada que no sea Traefik. Si aparece un puerto
publicado, se corrige antes de continuar.

### 2.2 Que el entorno sea el que se cree que es

Esto es lo que convierte «se puso la variable» en evidencia observable:

```bash
curl -s https://staging.feelverse.app/api/health      # web
curl -s https://api-staging.feelverse.app/health      # api
# environment debe decir exactamente "staging" en la primera
```

Y que el navegador pueda hablar con la API, que es de lo que dependen Eco, el lector,
la voz y el Diario:

```bash
curl -si -X OPTIONS https://api-staging.feelverse.app/api/home \
  -H 'Origin: https://staging.feelverse.app' \
  -H 'Access-Control-Request-Method: GET' | head -12
# access-control-allow-origin debe reflejar el origen de la web
```

Y para la API y el worker a la vez, que es donde un despliegue a medias se ve:

```
GET /api/health/emotional-map     (ADMIN)
```

`api.environment` y `worker.environment` deben decir `staging` los dos, con `match:
true`. Un heartbeat viejo cuenta como desacuerdo, no como acuerdo: ausencia de
evidencia no es evidencia de acuerdo.

Si `environment` dijera `development` o `production`, se para. Ese es el fallo que
toda la barrera de `PSICO_ENV` existe para impedir.

### 2.3 Que los dos procesos corran el mismo commit

En los logs de arranque de la API:

```
GUIDE_START_LOCK_PROTOCOL=lineage-v2 BUILD_SHA=<12 hex> REPLICA=<id>
EXPERIENCE_BINDING_PROTOCOL=… BUILD_SHA=<12 hex> REPLICA=<id>
```

`BUILD_SHA` no puede decir `unknown`. Si lo dice, Coolify no está inyectando
`SOURCE_COMMIT` y hay que poner `RELEASE_SHA` explícitamente en el build: los gates
C.0B2 y C.3A leen ese valor para demostrar que ninguna réplica vieja sigue sirviendo,
y con `unknown` en todas no distinguen el binario nuevo del viejo.

### 2.4 Que los prototipos no estén publicados

```bash
curl -so /dev/null -w '%{http_code}\n' https://staging.feelverse.app/prototipos/lectura-guiada
curl -so /dev/null -w '%{http_code}\n' https://staging.feelverse.app/prototipos/book-experience
```

En staging deben responder 200 —es la superficie de revisión de diseño, igual que un
preview de Vercel—. En **producción** las dos deben dar 404, y eso se comprueba en
el paso 5, no aquí.

### 2.5 Que las integraciones estén donde se cree

```
GET /api/health/integrations      (ADMIN)
```

Devuelve booleanos, nunca valores. Se revisa la bandera `stub`: marca una clave que
parece de prueba, que es cómo una caja mal configurada pasa por buena.

### 2.6 Recorrido funcional mínimo

Registro, inicio de sesión, desbloqueo del Diario (cripto E2E real), una entrada, una
conversación con Eco, y el Mapa Emocional. Es el recorrido que ya se usó para validar
el despliegue de 2026-06-01, y sirve porque atraviesa base, Redis, LLM y cripto.

### 2.7 Que el worker trabaje

Encolar un trabajo y ver el procesamiento en logs. El worker no tiene healthcheck: si
no se mira, no se sabe.

---

## 3 · ROLLBACK

Tres niveles, del más barato al más caro. **Ensayar el nivel 3 una vez es requisito
de apagado** de Vercel y Railway, no una idea bonita.

| nivel | cuándo                                      | qué se hace                                                                                     | cuánto tarda   |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- |
| 1     | el deploy nuevo está peor que el anterior   | redeploy de la versión anterior en Coolify                                                      | minutos        |
| 2     | staging está roto y no se sabe por qué      | parar los recursos de staging. **Producción no se ha tocado**, así que no hay nada que revertir | minutos        |
| 3     | producción en Coolify falla tras el cutover | DNS de vuelta a Vercel/Railway, que siguen encendidos y sirviendo                               | objetivo < 1 h |

Lo que hace posible el nivel 3 es precisamente no haber borrado nada. Por eso no se
borra nada hasta que se cumplan los criterios de apagado del ADR.

Un rollback de **datos** es otra cosa y no se improvisa: exige el restore drill
documentado desde el backup de R2. Una migración `expand → deploy → contract` se
revierte deshaciendo el paso _contract_ primero, y sólo si ese paso aún no corrió.

---

## 4 · DEPLOY PRODUCTION

**No se ejecuta en esta tarea.** Requiere su propio gate y, antes:

1. Staging validado y estable.
2. Números de límites tomados de staging, no inventados.
3. Versión de PostgreSQL de producción consultada y decidida (§4 del inventario).
4. Backup con restore drill **ejecutado**, no sólo configurado.
5. Artefacto versionado por commit SHA o tag, nunca `latest`.
6. Rollback de nivel 3 ensayado.

Forma idéntica a staging con recursos **separados**. Ningún recurso con estado se
comparte entre entornos, y `PSICO_ENV=production`.

---

## 5 · CUTOVER DNS

No antes de que producción en Coolify esté validada con su propio recorrido.

**El DNS ya apunta aquí.** Medido el 2026-09-30: `feelverse.app` y
`www.feelverse.app` resuelven a `148.113.254.26` y lo que contesta es el certificado
por defecto de Traefik, o sea ninguna ruta. Así que este paso **no es tocar
Cloudflare**: es reclamar el hostname en Coolify, y ocurre en el instante en que se
escribe en el campo de dominio de un recurso.

Consecuencia: el rollback de nivel 3 **no** se hace por DNS —el DNS ya está aquí—, se
hace quitando el dominio del recurso de Coolify y devolviéndolo a Vercel, que exige
tener el registro anterior anotado ANTES de reclamarlo.

1. Anotar a dónde apuntaba `feelverse.app` en Vercel, para poder deshacerlo.
2. Reclamar `feelverse.app` en el recurso **web de producción** de Coolify. Nunca en
   uno de staging.
3. Confirmar el certificado por Traefik: `issuer` ya no puede decir
   `TRAEFIK DEFAULT CERT`.
4. `www` redirige al canónico.
5. Comprobar que los prototipos dan **404** en producción.
6. Reapuntar y verificar con un evento real los webhooks de Stripe y Daily.
7. Vercel y Railway **siguen encendidos**.

---

## 6 · POST-DEPLOY

Durante siete días: salud de los recursos, errores en Sentry separados por entorno
—que es justamente lo que las etiquetas arregladas permiten—, profundidad de colas,
que los crons corran (el snapshot de plataforma a las 02:30 UTC, el rollup de
facturación, el resumen semanal del domingo), y que los backups se ejecuten.

Un backup que existe no es un backup que restaura: el drill se ejecuta y se
documenta.

---

## 7 · DECOMMISSION LEGACY

Los seis criterios del ADR 0024, **todos**. Mientras falte uno, los dos proveedores
se quedan encendidos: la factura de un mes es más barata que un cutover sin vuelta
atrás.

Cuando se cumplan, y sólo entonces, en este orden: quitar el marcador de Railway del
detector de despliegue, retirar `railway.api.json` y `railway.worker.json`, retirar
`apps/web/vercel.json` y la política de despliegue de Web, y archivar —no borrar— la
documentación de despliegue anterior.
