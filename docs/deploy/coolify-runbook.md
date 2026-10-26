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

`prisma migrate deploy` se ejecuta como **`post_deployment_command` del recurso api**,
y en ningún otro sitio:

```
pnpm --filter @psico/api migrate:deploy
```

**Cómo comprobar que sigue configurado, y la trampa de hacerlo mal.** El
`get_application` del MCP devuelve `post_deployment_command_container` pero
**no** `post_deployment_command`. Son columnas distintas: la primera dice _en
qué_ contenedor correr el comando —`null` significa «el principal»— y la
segunda es el comando. Leer la primera y concluir que no hay ninguno es un
error fácil: lo cometí el 2026-10-25 y abrí una investigación entera sobre un
mecanismo que llevaba tres días funcionando. El valor real se lee de la base
de Coolify:

```bash
ssh syntavera-vps 'sudo -n docker exec -i coolify-db psql -U coolify -d coolify -tAF"|"' <<'SQL'
SELECT name, COALESCE(pre_deployment_command,'(vacío)'), COALESCE(post_deployment_command,'(vacío)')
FROM applications WHERE name LIKE 'feelverse-staging-%' ORDER BY name;
SQL
```

El 2026-10-25 devolvía el comando sólo en `feelverse-staging-api`, y vacío en
Web y en el **worker** — que es lo correcto: dos procesos migrando a la vez es
peor que ninguno, y la propia descripción del worker dice que no migra.

**Y para comprobar que de verdad corrió**, el log del despliegue lo dice. En
`txapvqx0dksszqb5vps1u0or` (API, 2026-10-25) los eventos van
`Rolling update completed` → `Executing post-deployment command` →
`docker exec <contenedor-nuevo>` → `71 migrations found` →
`No pending migrations to apply`. Ese orden es la ventana descrita abajo,
observada y no supuesta. Cómo sacar el log, en §1.

> **Corrección del 2026-10-22 — estaba en `pre_deployment_command` y no migraba.**
> Lo que sigue más abajo describía cuatro propiedades del hook _pre_. Una de ellas
> —«antes de que arranque código que dependa del esquema nuevo»— **nunca fue cierta**,
> y se descubrió promoviendo el lector: el despliegue terminó en verde con la migración
> 70 sin aplicar.
>
> La causa está en el código de Coolify 4.4.7, no en la configuración.
> `ApplicationDeploymentJob::run_pre_deployment_command()` resuelve
> `getCurrentApplicationContainerStatus()` —los contenedores **en ejecución**— y hace
> `docker exec` sobre uno de ellos. El hook _pre_ alcanza por tanto **siempre la imagen
> saliente**, cuyo `prisma/migrations` es el del commit anterior: `migrate deploy`
> encontró «69 migrations», todas aplicadas, y reportó éxito. `pre_deployment_command_container`
> no lo arregla: sólo elige _entre los que ya corren_.
>
> El comando pasó a `post_deployment_command`, que se invoca desde `post_deployment()`
> cuando esa misma consulta ya devuelve el contenedor **nuevo**. Comprobado en el
> despliegue `4upcnk3j9ccb6zchwprfrjoo`: el log dice `docker exec <app>-20261022T202442`
> y **«70 migrations found»** en vez de 69.
>
> Dos propiedades se ganan y una se pierde, y conviene tener las tres presentes:
>
> - se gana que el comando lee las migraciones **de la imagen que se está desplegando**;
> - se gana que el primer despliegue de un recurso nuevo ya no es un caso especial por
>   falta de contenedor previo —aunque sigue habiendo uno: si no hay ningún contenedor
>   en ejecución, el post también se omite en silencio;
> - **se pierde el orden**: el post corre _después_ de que el contenedor nuevo empiece a
>   servir, así que existe una ventana de segundos de código nuevo contra esquema viejo.
>
>   Esto decía «inocua para una migración aditiva; no para una destructiva», y esa
>   regla es cómoda pero falsa. Que la migración **añada** no dice nada sobre si el
>   código aguanta: una columna nueva es aditiva, y si el código que ya está sirviendo
>   la lee o la escribe, falla durante toda la ventana. La forma del DDL no es la
>   condición.
>
>   **La condición es que el código nuevo pueda funcionar contra el esquema anterior
>   hasta que la migración termine.**
>
>   Y aquí había un segundo error, más fino, en el remedio que esto proponía. Decía
>   «hacerlo tolerante: leer el campo nuevo como opcional». Eso suena bien y no
>   sirve: **durante la ventana la columna no existe**, y una consulta que la
>   nombra falla entera. No hay lectura opcional de una columna inexistente —
>   `SELECT "campoNuevo"` es `column … does not exist`, no `NULL`—, y con Prisma
>   basta con que el modelo la declare para que el cliente la incluya en el
>   `SELECT` de cualquier consulta sobre esa tabla. Un campo «opcional» en el
>   esquema de Prisma describe si acepta `NULL`, no si la base ya la tiene.
>
>   La condición, dicha en términos de lo que el proceso hace: **el código que
>   sirve durante la ventana no puede emitir ninguna consulta ni escritura que
>   dependa de la columna todavía inexistente** — ni leyéndola, ni filtrando por
>   ella, ni ordenando por ella, ni nombrándola en un `select` explícito. Lo que
>   se consigue es no referirla en absoluto hasta que la migración termine, y eso
>   normalmente obliga a partir el cambio en dos despliegues: primero el código que
>   funciona sin la columna, después el que ya depende de ella. Una migración
>   destructiva casi nunca lo cumple, y por eso la regla vieja acertaba por ese
>   lado; lo que erraba era el otro.
>
>   Este corte no añade migraciones, así que la ventana no se ejerció. La regla
>   queda escrita para el siguiente cambio de esquema, que es cuando engaña.
>
> Y se pierde algo más, dicho aparte porque es lo que más engaña: la llamada a
> `run_post_deployment_command()` está envuelta en `try/catch` que sólo deja un
> `Log::warning`, de modo que **una migración fallida deja el despliegue en verde**.
> Eso invalida el párrafo «Si la migración falla» de más abajo, corregido ahí mismo.
> Por eso existe `GET /api/health/ready` (§ al final de esta sección): la comprobación que
> no depende de que el despliegue se ponga rojo.
>
> **Regla, entonces: un despliegue de la API no se da por cerrado con el verde de
> Coolify.** Ese verde puede convivir con una migración que falló. Lo que lo cierra es
> `ready=true` **con `pending` y `failed` vacíos** — los tres, no sólo el primero: un
> `ready` sin mirar las listas es la misma confianza que se acaba de retirar, un escalón
> más abajo. Comprobado así el 2026-10-25 sobre `a31ddaa4`: `ready=true`, `reason=ok`,
> 71/71, las dos listas vacías.
>
> **Y el criterio se aplica por servicio, porque no hay un «commit servido».** Son
> tres cajas y pueden ir a tres alturas a la vez; comprobar una y hablar de «el
> despliegue» es cómo se da por cerrado lo que no se miró. Lo que cierra a cada una
> es distinto, y conviene no pedirle a una la prueba de otra:
>
> | Servicio            | Qué lo cierra                                                                                                                                              | Observado el 2026-10-26                                                                  |
> | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
> | API (`aft7nt3p…`)   | `ready=true` con `pending` **y** `failed` vacíos. Es la única que ejecuta migraciones                                                                      | `a31ddaa4` · `ready=true`, `reason=ok`, 71/71, listas vacías                             |
> | Web (`wwsluxas…`)   | Healthcheck HTTP en verde **más** una comprobación de contenido del artefacto: el verde sólo dice que el proceso responde, no qué sirve                    | `5dacedbd` · healthy, y las cinco cadenas del arreglo presentes en `/app/apps/web/.next` |
> | worker (`hwxntao…`) | Proceso vivo. **No tiene healthcheck y no debe tenerlo**: no escucha en ningún puerto, así que `running/unknown` es su estado correcto y no una incidencia | `5f209d79` · vivo; `running/sin-healthcheck`                                             |
>
> La versión de cada uno se lee de la **etiqueta de su imagen**, no por HTTP:
> `/api/health` es 404 por diseño y `/health` no trae SHA. Y una diferencia entre
> repositorio y servicio se justifica comparando archivos, no commits: al worker le
> faltaban tres services de la API cuya ausencia es inocua porque **ninguno está en
> su grafo de módulos**, y eso se comprueba leyendo qué importa `jobs/worker.module.ts`.
>
> El cambio se hizo por SQL sobre `coolify-db` porque no hay token de la API de Coolify
> a mano, así que **no generó el evento de auditoría** de la interfaz. Preimagen en
> `/root/coolify-preimage/api-hooks-20261022T202409Z.csv`.

**Para comprobar que está guardado**, hay que preguntárselo al API crudo, no al MCP: el
envoltorio del MCP recorta los campos de configuración y por eso parece que no existen.

```bash
coolify-api.sh applications/<uuid> | jq '{pre_deployment_command, post_deployment_command, build_command, start_command}'
```

`is_auto_deploy_enabled` e `is_preview_deployments_enabled`, en cambio, no los proyecta
**ninguna** de las dos vías: se escriben por `PATCH` y se comprueban por conducta —
`list_deployments` y mirar si algún despliegue trae `is_webhook: true` después de haberlos
apagado.

> **HISTÓRICO — describe el hook `pre`, retirado el 2026-10-22.** Se conserva porque
> explica por qué la migración no va en el `start`, que sigue vigente (propiedades 1, 3
> y 4). La **propiedad 2 nunca fue cierta** y es la que obligó al cambio: el comando
> alcanzaba el contenedor saliente. El procedimiento vigente es el de
> `post_deployment_command`, descrito en la corrección de arriba.

Cuatro propiedades, y ninguna es accidental:

1. **Exactamente una vez por despliegue.** Coolify corre el pre-deployment command una
   vez, **dentro del contenedor actual de la aplicación**, antes de sustituirlo por el
   nuevo. Si estuviera en el `start` de la aplicación, N réplicas lo lanzarían N veces
   en paralelo. Prisma toma un advisory lock, así que no corromperían el esquema, pero
   sí se serializarían esperándose y una migración lenta se convertiría en un arranque
   fallido por timeout.
2. **Antes de que arranque código que dependa del esquema nuevo.** Es lo que
   «pre-deployment» significa; por eso no va en el `start`.
3. **Sólo en api, nunca en worker.** Los dos comparten build y base. Si los dos lo
   ejecutaran, dos despliegues simultáneos competirían por el mismo lock sin que nadie
   lo necesite. El worker declara `pre_deployment_command` vacío, igual que hoy en
   `railway.worker.json`.
4. **Nunca encadenado.** Ese `&&` es exactamente cómo una migración de esquema y una
   reescritura de contenido curado llegaron juntas a producción una vez. Sin seed, sin
   backfill, sin ingesta: un comando.

#### ⚠️ El primer despliegue NO migra

> **HISTÓRICO respecto a su causa, y probablemente resuelto.** Con el hook en `post`,
> `getCurrentApplicationContainerStatus()` se consulta cuando el contenedor NUEVO ya
> está arriba, así que en un primer despliegue sí hay dónde ejecutar el comando y
> debería migrar. Se deduce del código, **no se ha comprobado en un primer despliegue
> real**, de modo que el procedimiento de dos pasos de más abajo sigue siendo el
> conservador hasta que alguien lo mida. Lo que NO cambia es el final de esta sección:
> un despliegue puede terminar en `finished` sin que nadie avise de nada, y con el hook
> en `post` eso ahora incluye el caso en que la migración **falla**.

Como el comando corre **dentro del contenedor actual**, cuando no hay contenedor actual
no hay dónde correrlo: Coolify **lo omite**, y el despliegue termina en `finished` sin
avisar de nada. El primer despliegue de un recurso nuevo es exactamente ese caso.

Esto se midió, no se supone. En staging, el 2026-10-01:

| Despliegue                       | Contenedor previo | Pre-deployment | Resultado en la base                                  |
| -------------------------------- | ----------------- | -------------- | ----------------------------------------------------- |
| `cwqwogpx3dipdsyou4ksdy2q` (1.º) | no existía        | **omitido**    | 0 tablas · sin `_prisma_migrations` · sin pgvector    |
| `xrcgdgjce1etwhury6l3zs3f` (2.º) | corriendo         | **ejecutado**  | 69 migraciones en 1,2 s · 101 tablas · pgvector 0.8.6 |

La API del primero arrancó sana y respondió `/health` 200 **con la base vacía**: los
endpoints que no tocan Postgres funcionaban y los que sí devolvían 500. Un `/health`
verde no dice nada sobre el esquema.

El recorrido de §2.6 lo habría detectado, pero exige crear una cuenta. Para saber sólo si
el esquema existe basta una lectura pública, sin cuenta y sin escribir nada:

```bash
# 200 con catálogo (aunque esté vacío) = esquema aplicado. 500 = sin migrar.
curl -s -o /dev/null -w '%{http_code}\n' https://api-staging.feelverse.app/api/books
```

**Desde el 2026-10-22 hay una respuesta directa**, y es la que conviene usar: el catálogo
sólo dice «alguna tabla existe», mientras que esto compara las migraciones **que la
imagen trae** contra las que la base tiene aplicadas.

```bash
# 200 = el esquema está al día para ESTA imagen.
# 503 = no lo está, y `details.pending` nombra las que faltan.
curl -s -w '\n%{http_code}\n' https://api-staging.feelverse.app/api/health/ready
```

Es **pública** porque lo que necesita preguntarlo —un gate de despliegue, un smoke
posterior a la promoción— no puede autenticarse, y los nombres de migración ya están en
un repositorio público. A diferencia de `/health`, **sí tiene límite**: 60 por minuto y
un veredicto cacheado 5 s, porque toca Postgres y el disco y una petición pública no
puede significar una consulta sin cota. Un sondeo autorizado cada 5 s pide 12 por
minuto, así que el límite no le estorba. **Falla cerrada**: un inventario de migraciones
inválido —inexistente, vacío, o con un directorio al que le falta su `migration.sql`— y
un ledger ilegible responden 503, nunca 200. Eso es exactamente el fallo del 2026-10-01,
cuando `/health` respondió 200 contra una base vacía.

**Qué significa un 200, y qué no.** Compara un INVENTARIO DE NOMBRES contra el ledger de
Prisma: «cada migración que esta imagen trae está registrada como aplicada aquí». No es
una comprobación de drift del esquema ni de integridad de los datos — una columna
borrada a mano, el SQL de una migración editado después de aplicarse o una restricción
desactivada en psql dejan el ledger de acuerdo con la carpeta y esta sonda en verde.
Conviene mantener la promesa estrecha.

**Lo que NO es:** el gate del despliegue. Coolify sondea `health_check_path` desde
`rolling_update()`, y sólo _después_ llega a `post_deployment()`, que es donde corre la
migración. Apuntar el gate a `/api/health/ready` haría que **todo despliegue con migración
pendiente se quedara colgado**: la puerta esperaría un esquema que sólo el paso de
después puede aplicar. Pasa a ser correcto —y es un cambio de una línea en
`health_check_path`— el día que la migración corra antes del healthcheck: un recurso
_migration job_ aparte, o aplicarla antes de que el servidor escuche. Esa decisión sigue
abierta; `/health` se mantiene como liveness y no consulta el esquema, con una prueba que
falla si alguien se lo añade.

**Para un entorno nuevo**, entonces, no se confía en que el primer despliegue migre:

1. desplegar una vez — crea el contenedor, la base queda sin esquema;
2. **redesplegar** — ahora sí corre `migrate deploy` contra la base vacía;
3. verificar `_prisma_migrations` antes de dar el entorno por listo.

Un _migration job_ explícito (recurso aparte que corra sólo el comando) evitaría el doble
paso, al coste de un recurso más que mantener sincronizado con el build. Sin decidir.

**El contenedor tiene que poder ejecutar el comando.** `prisma` es `devDependency`, así
que si el runtime se construyera con dependencias de producción podadas, el comando
fallaría con `command not found` en vez de migrar. Con Railpack hoy no se poda: node,
pnpm y la CLI de Prisma resuelven dentro del contenedor por `/mise/shims`. Un detalle
con filo: `/etc/profile` sobrescribe el `PATH` y tira `/mise/shims`, así que el comando
funciona bajo `sh -c` y `bash -c` y **falla** bajo `sh -lc` o `bash -lc`. Coolify usa la
primera forma. Si una versión futura cambiara a un shell de login, el síntoma sería
`pnpm: command not found` y el arreglo, fijar el `PATH` en el propio comando.

**Si la migración falla.** ⚠️ **Corregido el 2026-10-22.** Esto era cierto con el hook
_pre_. Con el comando en `post_deployment_command` ya **no** lo es: el contenedor nuevo
está sirviendo antes de que el comando corra, y su fallo sólo deja un `Log::warning`, así
que **el despliegue queda en verde y el esquema viejo sigue en pie**. No hay señal
automática: hay que ir a buscarla con `GET /api/health/ready` o mirando el log del
despliegue. Entonces:

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

#### Migrar no siembra: tres cosas distintas

Tras migrar, el catálogo queda **vacío**, y eso es correcto. Son tres mecanismos
separados y ninguno de los dos últimos corre en un despliegue:

| concepto      | fichero                         | lo invoca                   | toca                                                  | ¿en despliegue? |
| ------------- | ------------------------------- | --------------------------- | ----------------------------------------------------- | --------------- |
| **migración** | `prisma/migrations/*`           | `prisma migrate deploy`     | esquema (DDL), registrado en `_prisma_migrations`     | **sí**          |
| **seed**      | `prisma/seed.ts`                | `seed:staging:catalog`      | catálogo: libros, autores, capítulos, prompts         | no              |
| **fixture**   | `prisma/seed-test.ts`           | `seed:staging:qa-users`     | sólo `User` — tres cuentas `.test`                    | no              |
| **demo**      | `scripts/seed-demo-users.mjs`   | `seed:staging:demo-users`   | cuentas demo + actividad sintética                    | no              |
| **ánimo**     | `scripts/seed-mood-history.mjs` | `seed:staging:mood-history` | `MoodLog` retrodatado de **una** cuenta `@psico.test` | no              |

**Migrar no es sembrar, y nunca se vuelven a encadenar.** `migrate deploy` es un
paso de despliegue; sembrar es una operación administrativa que reescribe
catálogo curado. Encadenarlas (`migrate deploy && seed`) es exactamente lo que
C.0A1 quitó del pre-deploy, así que no se escribe esa línea ni «sólo esta vez».

#### Sembrar staging

Un comando por objetivo, y **no existe un «sembrar todo»**: refrescar catálogo no
puede significar además acuñar logins. El wrapper comprueba que la caja es
staging y aplica la autorización **sólo al proceso hijo** — nunca se exporta a tu
shell, nunca se escribe en un fichero y **nunca** se añade a las variables de
Coolify, que es cómo una autorización efímera se convierte en un bypass
permanente.

```bash
# catálogo (libros, capítulos, prompts, terapeutas)
pnpm --filter @psico/api seed:staging:catalog

# cuentas QA — acuña logins, uno con rol ADMIN
QA_USER_PASSWORD='…' pnpm --filter @psico/api seed:staging:qa-users

# cuentas demo con actividad sintética
DEMO_USER_PASSWORD='…' pnpm --filter @psico/api seed:staging:demo-users

# historial de ánimo retrodatado para UNA cuenta sintética
pnpm --filter @psico/api seed:staging:mood-history -- --email=demo-recuperando@psico.test
```

`seed:staging:mood-history` lleva una **segunda** barrera que los demás no
necesitan: escribe emociones sintéticas marcadas `moodEligibleForDynamics`, así
que cambia lo que el Mapa Emocional dice de esa persona. En una caja desplegada
sólo acepta direcciones `@psico.test`, **aunque la autorización esté puesta** —
autorizar el host no es autorizar cada cuenta guardada en él. En producción es
negación dura, incluso para `@psico.test`. En local no se impone el namespace:
apuntarlo a tu propia cuenta de desarrollo es el uso normal.

`--reset` pasa por exactamente las mismas barreras; no hay un camino aparte.

Si la caja no es staging, el wrapper se niega y dice por qué: producción tiene su
propia decisión (y los fixtures de cuentas la rechazan de plano, sin variable que
lo levante), una caja desplegada que no declara `PSICO_ENV` se niega sin remedio
por línea de comandos —se arregla declarando el recurso—, y una caja local no
necesita autorización ninguna.

Los **fixtures de cuentas acuñan credenciales vivas**, una con rol `ADMIN` que
abre el back-office de Pulso, y una caja desplegada responde a internet: staging
también. Desde [ADR 0025](../adr/0025-qa-user-fixture-credential-posture.md) la
contraseña **no tiene default** — la generas tú, la guardas en tu propio gestor
de secretos y no la commiteas. Al cerrar la ventana de pruebas,
`seed:test:wipe` (mismo interruptor, sin contraseña — borrar no puede ser más
difícil que haber creado).

Para correr el seed a mano sin el wrapper, la autorización va **delante del
comando**, para esa única invocación:

```bash
ALLOW_STAGING_BOOTSTRAP_SEED=1 pnpm --filter @psico/api seed:catalog
```

**En Prisma 7 nada encadena el seed.** La documentación lo dice sin ambigüedad: «In
Prisma ORM v7, seeding is only triggered explicitly by running `npx prisma db seed`.
Automatic seeding during `prisma migrate dev` or `prisma migrate reset` has been
removed.» Y `migrate deploy` nunca sembró, ni antes ni ahora.

> **Corrección.** La bitácora del 2026-07-13 afirma que `prisma migrate deploy` (Prisma 7)
> encadena el seed vía `migrations.seed`. Eso es falso: es precisamente lo que v7 eliminó.
> Verificado en staging el 2026-10-01 — `ts-node` y `prisma/seed.ts` **están** en la imagen,
> así que el seed podría haber corrido, y tras un `migrate deploy` limpio el catálogo tenía
> cero filas. El P2002 que esa sesión observó era real, pero su mecanismo no era éste; sin
> el log de aquel despliegue no se puede cerrar el porqué. El arreglo que hizo —volver
> `seed.ts` idempotente y no destructivo— sigue siendo correcto por sus propios motivos.

Consecuencia operativa: un entorno recién migrado necesita `prisma db seed` **explícito**
para tener catálogo, y `seed:test` para tener cuentas. Ninguno de los dos debe colgarse del
pipeline de despliegue sin decidirlo a propósito.

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

**Cuidado con el dominio autogenerado.** Si se crea la aplicación **sin** enviar el campo
`domains`, Coolify le asigna uno del comodín del servidor (`<uuid>.syntavera.dev`) —
medido. Se envía vacío a propósito y se verifica que `fqdn` queda `null`.
Sin puerto, sin dominio, **sin healthcheck HTTP posible** — no escucha. Su salud se
observa por logs y por profundidad de colas.

Mismas variables que la API, **sin** `PORT`.

### Los tres se despliegan de uno en uno

**No en paralelo.** Medido el 2026-10-25: lanzados los tres a la vez, **los
tres** fallaron a los ~3m45s, en el mismo segundo, con

```
ERROR: failed to build: failed to receive status:
rpc error: code = Unavailable desc = error reading from server: EOF
```

Eso es el demonio de buildkit cayéndose, no un fallo del código: aparece justo
al arrancar `nest build`, después de que tsup compile `@psico/types` (275 KB de
DTS) y `@psico/crypto`. Son tres compilaciones de TypeScript a la vez sobre un
VPS de 11 GiB con ~5 GiB ya ocupados por los servicios en marcha. De uno en
uno —API, esperar, worker, esperar, Web— los tres terminan sin tocar nada más.

Mientras falla, Coolify **conserva la versión anterior sirviendo** («Removing
the new version of your application»), así que un fallo de build no deja el
entorno roto: lo deja como estaba.

**Y para leer por qué falló:** `get_deployment` del MCP pide `read:sensitive`,
que los tokens de este proyecto no tienen, y el contenedor del build se borra
al acabar. El log está en la base de Coolify:

```
sudo -n docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT logs FROM application_deployment_queues WHERE deployment_uuid='<uuid>'"
```

La misma tabla da el `status` (`in_progress` · `finished` · `failed`), que es
la forma barata de vigilar un despliegue en curso.

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

**Es ADMIN-only**, así que en un entorno recién creado — sin cuentas todavía — no se puede
usar. Y «configurada» no es «funciona»: la bandera sólo dice que la variable no está
vacía. En staging el 2026-10-01, las cuatro variables de R2 estaban presentes y la subida
fallaba igual, porque una llevaba el valor de otra.

Para R2 concretamente, el smoke que sí lo demuestra se ejecuta **dentro del contenedor**,
de modo que las credenciales nunca salen de él ni aparecen en una terminal:

```js
// PUT → GET → DELETE sobre staging-smoke/<id>, con dos salvaguardas que no son opcionales:
//  1. se niega si R2_BUCKET_NAME no es exactamente el bucket de staging;
//  2. tras el DELETE hace un GET y espera un 404 — borrar sin comprobar no es borrar.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
const EXPECTED = "syntavera-feelverse-staging-media";
if (process.env.R2_BUCKET_NAME !== EXPECTED) process.exit(3);
```

El fichero va a `/app/apps/api/` y no a `/tmp`: Node resuelve `node_modules` desde el
directorio del script hacia arriba, y desde `/tmp` no encuentra `@aws-sdk/client-s3`.

### 2.6 Recorrido funcional mínimo

Registro, inicio de sesión, desbloqueo del Diario (cripto E2E real), una entrada, una
conversación con Eco, y el Mapa Emocional. Es el recorrido que ya se usó para validar
el despliegue de 2026-06-01, y sirve porque atraviesa base, Redis, LLM y cripto.

### 2.7 Que el worker trabaje

Encolar un trabajo y ver el procesamiento en logs. El worker no tiene healthcheck: si
no se mira, no se sabe.

### 2.8 El gate de datos reales

**`REAL_DATA_GATE` es un gate operativo, no una variable de entorno.** No existe en
`apps/`, ni en `packages/`, ni en Coolify, y no debe crearse: nada en el código lo lee, así
que una variable con ese nombre daría una falsa sensación de que algo la respeta.

Mientras el gate esté **CERRADO**, staging se prueba con cuentas sintéticas y se asume que
su base puede perderse entera sin consecuencias.

Para abrirlo hacen falta las tres cosas, en este orden y verificadas:

1. el bucket `syntavera-feelverse-db-backups` existe;
2. un backup de `feelverse_staging` se ha completado **y se ha mirado** (tamaño y fecha);
3. un **restore drill** ha reconstruido esa base en un destino desechable.

El punto 3 no es ceremonia. Un backup cuya restauración nunca se ejecutó es una copia de
la que no se sabe nada, y el día que se necesite no es el día de descubrirlo.

Cómo se comprueba que sigue cerrado, sin cuentas ni escrituras:

```bash
# Cero filas = nada que proteger todavía.
psql -d feelverse_staging -tAc 'SELECT count(*) FROM "User"'
```

### 2.9 Backup y restore drill

Política vigente en staging, registrada el 2026-10-01 sobre
`feelverse-staging-postgres`:

| campo                              | valor               | por qué                                                                                                                                         |
| ---------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `frequency`                        | `0 0 * * *` (UTC)   | 00:00 UTC = 19:00 del día anterior en America/Guayaquil. Es la única hora libre: los crons de la app ocupan 02:00, 02:30, 03:00 lun y 23:00 dom |
| `dump_all` / `databases_to_backup` | `false` / una base  | `pg_dump` custom se restaura selectivamente con `pg_restore`; `pg_dumpall` gzip es todo-o-nada                                                  |
| retención local                    | 3 · 3 días · 1 GB   | local es área de paso para reintentar la subida, no archivo                                                                                     |
| retención S3                       | 14 · 14 días · 1 GB | 14 diarios de ~330 KB son unos pocos MB. El tope en GB es guardia anti-desbordamiento, no estimación                                            |
| `timeout`                          | 3600                | el dump tarda ~1 s; un techo ajustado convierte una noche lenta en un backup fallido                                                            |
| `missing_backup_notification_days` | 2                   | lo único que detecta un cron que dejó de correr, que es el modo de fallo recurrente de este proyecto                                            |

La cadencia diaria no es por valor del dato — staging todavía no guarda nada
irremplazable. Es para que la ruta de recuperación siga **ejercitada y observable**.

#### La API de 4.3.23 no es la de la documentación

La documentación pública describe una versión posterior. En 4.3.23, medido:

| documentación                              | 4.3.23                                  |
| ------------------------------------------ | --------------------------------------- |
| `POST /databases/{uuid}/backups/create`    | **404** — usar `POST .../backups`       |
| `GET /databases/{uuid}/backups/executions` | **404** — existe sólo `GET .../backups` |
| `PATCH /databases/{uuid}/backups`          | **404**                                 |
| `POST /databases/import` y `/import/*`     | **404** — no hay API de importación     |

El cuerpo de `POST .../backups` sí es el documentado, incluido `backup_now: true`,
que configura y ejecuta en una sola llamada. Las ejecuciones se leen por MCP
(`list_backup_executions`, que exige `database_uuid` **y** `scheduled_backup_uuid`).

Sin API de importación, el restore es `pg_restore` controlado.

#### El drill, con sus dos trampas

```bash
# 1. Base desechable con el MISMO digest que staging, privada y sin puerto:
#    POST /databases/postgresql  { image: "pgvector/pgvector:pg18@sha256:...", is_public: false }
#    Omitir postgres_password: Coolify la genera y nadie tiene que manejarla.

# 2. TRAMPA: dentro del contenedor, PGDATABASE apunta al usuario de la imagen, que
#    no es una base existente. Todo psql necesita -d explícito o falla con
#    «database "<usuario>" does not exist».
docker exec -u postgres <drill> psql -d postgres -tAc 'select 1'

# 3. TRAMPA: el dump trae ALTER ... OWNER TO feelverse_migrator. Si el rol no existe,
#    pg_restore --exit-on-error muere en el primer objeto. Crearlo NOLOGIN preserva la
#    propiedad real, que es más fiel que aplanarla con --no-owner.
docker exec -u postgres <drill> psql -d postgres -tAc \
  "create role feelverse_migrator nologin"

docker exec -u postgres <drill> \
  pg_restore --dbname=feelverse_staging --no-privileges --exit-on-error /tmp/restore.dmp
```

**La validación compara, no cuenta.** Contar 101 tablas en los dos lados no demuestra
que sean las mismas tablas. Lo que sí: una huella del esquema completo.

```sql
SELECT md5(string_agg(t||'.'||c||':'||d,'|' ORDER BY t,c)) FROM (
  SELECT table_name t, column_name c, data_type d
  FROM information_schema.columns WHERE table_schema='public') x;
```

En el drill del 2026-10-01 las dos bases dieron `690ee762056309e8fe17ce143a9af85e`,
y la huella de nombres de migración coincidió igual. Correr lo mismo contra el origen
antes y después del drill es además la prueba de que no se tocó.

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

### 3.1 Volver atrás cuando hay reclamaciones pendientes

Un redeploy de la versión anterior no siempre es gratis, y hay un caso
concreto en el que no lo es. Conviene tenerlo escrito antes de necesitarlo.

La migración `20261023120000_dord_stripe_event_claim` hizo opcional
`StripeEvent.processedAt`. Nulo significa «reclamado y sin terminar»: la fila
se escribe antes de aplicar el efecto y se sella después, para que un intento
que muere a mitad no quede marcado como hecho.

Las **escrituras** de la imagen anterior siguen siendo compatibles —siempre
ponen un valor—. La **recuperación** no: esa imagen da por procesado cualquier
evento cuya fila exista, porque su comprobación es `findUnique(...) != null`.
Una reclamación pendiente la saltaría, y su efecto se perdería sin que nada lo
dijera.

#### Lo que esta sección decía y era falso — corregido el 2026-10-24

Las dos versiones anteriores se apoyaban en dos supuestos que la documentación
de Stripe contradice. Se retiran, y se dice cuáles eran, porque un
procedimiento de recuperación que reposa sobre una creencia equivocada es peor
que no tenerlo: da confianza sin darla.

**Supuesto retirado nº 1 — «deshabilitar el endpoint no pierde entregas».**
Falso. La documentación es explícita: _«If your destination has been disabled
or deleted when we attempt a retry, we prevent future retries of that
event»_. Deshabilitar no pone las entregas en una cola que se vacía al
reabrir: si un reintento cae mientras el endpoint está deshabilitado, Stripe
**deja de reintentar ese evento**. Sólo si se reabre _antes_ de que toque un
reintento sobreviven los futuros. Es decir, el paso que la versión anterior
presentaba como «cortar la entrada sin perder nada» era, exactamente, la forma
de perderlas.

**Supuesto retirado nº 2 — «una pendiente de más de cuatro días ya no se
reenviará».** Falso también. Existe el reenvío **manual**, y su ventana es
mucho más larga que la del reintento automático: _«Resend»_ en el panel
funciona **hasta 15 días** desde la creación del evento, y
`stripe events resend` desde la CLI **hasta 30 días**. Una pendiente antigua
sigue siendo reentregable, así que excluirla del recuento por su edad vuelve a
abrir el agujero que el recuento existe para cerrar. La antigüedad **no**
clasifica nada.

**Y el modo del entorno importa.** La ventana de reintento automático no es la
misma en todas partes: hasta **tres días** con retroceso exponencial en modo
live, pero **tres intentos en unas pocas horas** para eventos creados en un
sandbox. La clave de Stripe de FeelVerse staging es de **modo test**
(comprobado el 2026-10-24 leyendo el prefijo de la clave dentro del
contenedor, sin imprimirla), así que ahí la ventana automática es la corta.
Cualquier número que se escriba aquí tiene que decir de qué modo habla.

#### Por qué contar cero tampoco basta, por una razón distinta

Aunque el recuento fuera correcto, sigue habiendo una ventana entre comprobar
y cambiar la imagen: un webhook que llegue en ese hueco crea una reclamación
nueva, y la imagen vieja arranca con una pendiente que no sabe recuperar. Eso
no se arregla con un recuento más fino. **No existe una maniobra sobre el
endpoint que lleve ese riesgo a cero**, y esta sección ya no pretende lo
contrario: lo acota y declara el residuo.

#### El procedimiento

La idea que lo ordena: **las pendientes no se descartan por edad, se
clasifican por evidencia**; y lo que se separa no es «entrada abierta» de
«entrada cerrada» —que no está en nuestra mano— sino **operaciones en curso**
de **admisiones nuevas**.

1. **Inventariar TODAS las pendientes**, sin filtro temporal, y sacarlas de la
   base a un archivo privado antes de tocar nada — porque después del cambio
   de imagen ese listado es la única forma de saber qué reconciliar:

   ```sql
   SELECT "stripeEventId", type, "createdAt"
     FROM "StripeEvent"
    WHERE "processedAt" IS NULL
    ORDER BY "createdAt";
   ```

2. **Clasificar cada una con evidencia**, no con supuestos. Para cada evento
   se lee el objeto **autoritativo** en Stripe —la propia documentación lo
   recomienda: _«You can also use the API to retrieve any missing objects»_—
   y se compara con la fila local:

   | Clase             | Criterio                                                                                        | Qué se hace                                                                                                         |
   | ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
   | **CONVERGIDA**    | el estado local YA es el que aplicar el evento produciría                                       | se sella **registrando esa evidencia**. No es sellar a mano: es constatar que el efecto está                        |
   | **REENTREGABLE**  | el efecto falta y el evento está dentro de la ventana de reenvío manual (15 d panel / 30 d CLI) | se reentrega **con la imagen nueva**, que es la única que sabe reaplicar una reclamación sin sellar                 |
   | **IRRECUPERABLE** | el efecto falta y la ventana de reenvío pasó                                                    | **bloquea el rollback** hasta que alguien reconcilie esa suscripción a mano contra Stripe. No se sella, no se borra |

3. **Separar admisiones nuevas de operaciones en curso.** Deshabilitar el
   endpoint queda descartado por el supuesto nº 1. Lo que sí se puede es
   elegir una **ventana de tráfico bajo** y dejar que las operaciones activas
   terminen solas: el candado por persona vive en su transacción y la
   relectura tiene plazo, así que bastan unos segundos sin peticiones nuevas
   en el registro de la aplicación. Esto **acota** la ventana; no la elimina.

4. **Reverificar inmediatamente antes de cambiar la imagen** — el inventario
   completo del paso 1, sin filtro de edad, tiene que estar vacío de
   REENTREGABLE e IRRECUPERABLE.

5. **Cambiar la imagen.**

6. **Reinventariar inmediatamente después.** Toda fila `processedAt IS NULL`
   creada en la ventana es un ítem conocido, y su vía de recuperación **ya no
   es el reenvío**: con la imagen vieja sirviendo, reenviar el evento lo
   saltaría por existir la fila. Se reconcilia **a mano** contra el estado
   real en Stripe, usando el listado del paso 1 más lo nuevo. Esta obligación
   es parte del rollback, no una tarea posterior opcional.

**Si una pendiente queda IRRECUPERABLE, o no hay forma de reconciliar lo que
aparezca después del cambio**, el rollback queda **bloqueado**: se conserva la
versión nueva sirviendo y se resuelve con el estado real de cada suscripción
antes de volver a intentarlo.

**No se borran las filas pendientes ni se les pone fecha a mano.** Las dos
cosas convierten un efecto no aplicado en uno dado por hecho, que es
exactamente lo que esta columna existe para evitar. Sellar tras comprobar la
convergencia es otra cosa: ahí el efecto **está**, y lo que se registra es esa
comprobación.

> **La migración no se reescribe.** `20261023120000_dord_stripe_event_claim`
> ya está aplicada en staging y su archivo SQL es inmutable. Su comentario
> contiene la regla del intervalo de cuatro días que esta sección acaba de
> retirar: **manda este runbook**, no aquel comentario. Editar el SQL de una
> migración aplicada cambiaría su suma de verificación y rompería el ledger,
> que es un daño mayor que un comentario desactualizado con su corrección
> escrita aquí.

#### Qué está comprobado — ensayo operativo del 2026-10-24

Hasta esta fecha había dos cosas distintas y sólo una hecha: la regla del
código antiguo estaba **reproducida en una prueba**
(`billing-events.pg-spec.ts`), que acredita el MOTIVO de la precondición,
pero **el ensayo operativo con el artefacto anterior real faltaba**. Ya no.

**Cómo se ensayó, para que se pueda repetir.** Base desechable
`dord_rehearsal_test` en un contenedor propio sobre una red de Docker sin
otros miembros, restaurada del respaldo diario de staging de ese día
(`pg-dump-feelverse_staging-1792818005-…`, 1 213 966 bytes,
`sha256:8af937d4e7a9…`). Antes de arrancar nada se registró el destino:
`current_database() = dord_rehearsal_test` —no la activa—, 101 tablas, 71
migraciones aplicadas, **la migración `20261023120000_dord_stripe_event_claim`
presente** y `processedAt` con `is_nullable = YES`. La clave de Stripe del
entorno es de **modo test**, comprobado por su prefijo dentro del contenedor
y sin imprimirla.

Se condujo el `handleWebhook` **compilado de cada imagen** —el
`PrismaService` de la propia imagen, con su adaptador y su esquema— y se
sustituyó **sólo Stripe** por un doble sin red: si algo hubiera intentado
salir, el doble lo habría hecho fallar. Las dos imágenes son las que Coolify
tiene en el servidor: `6cb27281` (anterior, sin la columna reclamable) y
`725df576` (actual).

**Las reclamaciones pendientes las escribió el código real**, no una mano: la
imagen nueva reclama y el doble hace fallar la relectura, así que la fila
queda con `processedAt` nulo y el efecto sin aplicar, que es exactamente cómo
se produce en la vida real. Una de ellas se **envejeció** a 10 días con un
`UPDATE` sobre `createdAt`; envejecer una fila no finge un efecto, el efecto
sigue sin aplicar.

| Escenario                                                 | Observado                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pendiente reciente, imagen **anterior**                   | `Skipping already-processed Stripe event` · **0** llamadas a Stripe · efecto **sin aplicar** · fila sigue pendiente → **el efecto se pierde**                  |
| Pendiente de **10 días**, imagen anterior                 | idéntico — **la edad no cambia nada**                                                                                                                          |
| Las dos, imagen **actual**                                | `Reapplying … a previous attempt did not finish` · 1 relectura · `Synced subscription … plan=PRO` · fila **sellada** · inventario → **0**                      |
| Pendiente **ya convergida** (efecto aplicado, sin sellar) | la reentrega converge y **sella por código**, sin duplicar el efecto y **sin escribir `processedAt` a mano**                                                   |
| La **ventana** inventario → cambio de imagen              | inventario **0**; llega un webhook; deja una pendiente que **no estaba en el inventario**; la imagen anterior la salta → **el residuo declarado, reproducido** |

Dos cifras que cierran el supuesto retirado nº 2: con las dos pendientes en la
base, el recuento correcto veía **2** y el recuento antiguo —el del filtro de
cuatro días— veía **1**. Esa diferencia era exactamente la pendiente que el
filtro excluía, con su efecto sin aplicar.

**Qué queda acreditado:** el rollback a la imagen anterior **ya no está
condicionado a este ensayo**. Sigue condicionado a su precondición de
contenido —cero pendientes irrecuperables y el procedimiento de los pasos
1–4 ejecutado— y el residuo de la ventana sigue existiendo, porque ninguna
maniobra sobre el endpoint lo lleva a cero. Lo que ya no hace falta es
averiguar si la imagen anterior pierde una pendiente: pierde, y está medido.

Los contenedores y la red del ensayo se retiraron al terminar; el respaldo
original no se tocó.

#### El residuo: qué falta exactamente, dicho sin rodeos

Conviene separar dos cosas que el ensayo dejó en estados distintos.

**Está medido** que la imagen anterior pierde una pendiente, y **está escrito**
qué hacer con ella: reconciliarla a mano contra el estado real en Stripe
(pasos 1–4, más el listado del inventario). Eso es un procedimiento.

**No está demostrado** que ese procedimiento funcione. Nadie lo ha ejecutado
—ni en el ensayo, ni antes—, así que no hay un mecanismo de reconciliación
_comprobado_ para el residuo: hay instrucciones sin estrenar. La diferencia
importa porque el residuo aparece precisamente cuando ya se volvió atrás, es
decir cuando el código que sabe reclamar ya no está sirviendo.

Lo honesto, entonces: **el rollback deja un hueco cuyo cierre depende de un
procedimiento manual que no se ha probado nunca.** Probarlo pide su propio
ensayo —una pendiente de la ventana, reconciliada a mano de principio a fin
contra Stripe en modo test— y ese ensayo **no se hizo aquí**.

#### Candidatos de reversión, por servicio (2026-10-24)

Los tres servicios sirven hoy el mismo commit, `725df576`. Las imágenes
anteriores **siguen en el servidor y no se borran**: son el candidato de
reversión.

| Servicio                   | Sirviendo ahora (`725df576`) | Anterior disponible                                     |
| -------------------------- | ---------------------------- | ------------------------------------------------------- |
| `feelverse-staging-api`    | `sha256:6a617e7580ed…`       | `6cb27281` · `sha256:03bb9cb5052b…` · 2 días            |
| `feelverse-staging-web`    | `sha256:fe5533b9e739…`       | `6cb27281` · `sha256:0d549b59ccb5…` · 2 días            |
| `feelverse-staging-worker` | `sha256:46b80c12b899…`       | **`c0234ba5`** · `sha256:25b3f4f9e757…` · **2 semanas** |

**«La versión anterior» no es una versión.** El worker no tiene build de
`6cb27281`: su anterior es de dos semanas antes. Una reversión coordinada
movería API y Web dos días hacia atrás y el worker **dos semanas**, saltándose
todo lo intermedio —y el worker es quien corre los crons de facturación, el
digest y el resumen semanal—. Si hace falta volver atrás de verdad, el worker
se reconstruye desde `6cb27281` antes de conmutar, o se acepta por escrito que
su salto es mucho mayor.

Aparte: **`6cb27281` es anterior a la migración del reclamo** y por eso queda
fuera del rollback normal — volver ahí es el escenario cuyo residuo acaba de
describirse, no una reversión rutinaria.

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
