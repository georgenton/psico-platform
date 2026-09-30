# Runbook · despliegue de FeelVerse en Coolify

Autoridad: [ADR 0024](../adr/0024-migracion-a-coolify-syntavera.md).
Inventario y decisiones: [coolify-migration-as-is-to-be.md](coolify-migration-as-is-to-be.md).

Mientras Vercel y Railway sigan encendidos, **son el respaldo**. Nada de lo que hay
aquí borra, apaga ni reconfigura nada suyo.

**Reglas que atraviesan todos los pasos.** No se publica al host PostgreSQL 5432,
Redis 6379, el worker ni ningún puerto de administración: los servicios privados se
hablan por la red Docker `coolify`. No se leen valores de secretos; se comprueba que
una clave está puesta, nunca qué dice. No se toca SSH, firewall, Fail2ban, el
Traefik base, el demonio de Docker, el plano de control de Coolify ni sus backups.

---

## 0 · PRE-DEPLOY

Todo esto se cumple **antes** de crear un solo recurso. Es una lista de
prerrequisitos, no de aspiraciones.

| #   | qué                                                         | cómo se comprueba                                                                             | estado hoy                                                                                                             |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | La App de GitHub tiene acceso a `georgenton/psico-platform` | `list_github_repositories` sobre `synta-vera-coolify` devuelve el repositorio                 | ❌ **sólo devuelve `eia-studio`**. Hay que concederlo en GitHub → Settings → Applications → la App → Repository access |
| 2   | El proyecto y el entorno existen                            | `get_project` sobre `FeelVerse` lista `staging`                                               | ✅ existen y están vacíos                                                                                              |
| 3   | El servidor está sano y alcanzable                          | `get_server` → `is_reachable`, `is_usable`, proxy Traefik `running`                           | ✅                                                                                                                     |
| 4   | Credencial WRITE de Coolify disponible                      | una credencial propia con permiso de escritura, **no** el token root, **no** `read:sensitive` | ❌ sin ella no se pueden crear recursos                                                                                |
| 5   | Registros DNS de `staging.feelverse.app` apuntando al host  | resolución pública                                                                            | ⬜ pendiente                                                                                                           |
| 6   | Secretos de staging preparados fuera del repositorio        | la lista de nombres del §11 del inventario                                                    | ⬜                                                                                                                     |
| 7   | El repositorio pasa lint, typecheck, pruebas y build        | `pnpm turbo run lint typecheck test build --filter='!@psico/mobile'`                          | ✅ en esta rama                                                                                                        |
| 8   | Bucket de backups con naming aprobado                       | `syntavera-feelverse-db-backups`, separado del plano de control                               | ⬜ **no crear hasta aprobar el nombre**                                                                                |

Si el 1 o el 4 no están, el paso siguiente no se intenta: se pide y se espera.

---

## 1 · DEPLOY STAGING

Orden no negociable: los datos primero, el worker al final. Cada recurso se
comprueba sano antes de crear el siguiente.

### 1.1 `feelverse-staging-postgres`

Database · PostgreSQL. Imagen `pgvector/pgvector:pg16` fijada por digest. Sin
dominio y **sin puerto al host**. Healthcheck activo (interval 15s, timeout 5s,
retries 5). Límites de partida `2g` / reserva `512m` / `2` CPU, que es lo que el
Postgres de staging del vecino usa en este mismo host estando sano.

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

Que `REDIS_URL` sea opcional en el esquema de la API es la trampa de este paso: sin
ella el arranque **no falla**, `createRedisClient` cae a `ioredis-mock` y las colas
quedan sin hacer nada, en silencio. Así que se comprueba explícitamente que la
variable está puesta en la API y en el worker antes de darlos por buenos.

### 1.3 `feelverse-staging-api`

Application desde `georgenton/psico-platform`, rama `main`. Puerto interno **3001**,
declarado explícitamente. Healthcheck `GET /health` con un start period generoso:
arranca Nest, valida el entorno y conecta Prisma antes de contestar.

Sin dominio público de entrada. La web le habla por la red privada; sólo se le crea
dominio si se demuestra que un cliente externo lo necesita.

Variables que no pueden faltar, y por qué exactamente estas:

| variable            | por qué                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `PSICO_ENV=staging` | sin ella la API **se niega a arrancar** en una caja desplegada. Es la barrera, no un adorno |
| `PSICO_DEPLOYED=1`  | marcador propio, el único que no depende de que un proveedor mantenga sus nombres           |
| `DATABASE_URL`      | apuntando al Postgres de staging por su nombre de red interno                               |
| `REDIS_URL`         | ver 1.2                                                                                     |
| resto               | inventario §11                                                                              |

Migraciones como paso previo al arranque:

```
pnpm --filter @psico/api migrate:deploy
```

**Nunca** encadenado con nada. Ese `&&` es exactamente cómo una migración de esquema
y una reescritura de contenido curado llegaron juntas a producción una vez.

### 1.4 `feelverse-staging-web`

Application, mismo repositorio y rama. Puerto interno **3000**. Dominio
`staging.feelverse.app`. Healthcheck `GET /api/health`.

Dos variables tienen que estar disponibles **en build**, no sólo en runtime, porque
Next las inlinea o las evalúa al construir: `NEXT_PUBLIC_*` (van al bundle del
navegador) y `PSICO_ENV`. Marcar la casilla de variable de build en Coolify.

| variable                        | por qué                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `PSICO_ENV=staging`             | cierra el gate de `/prototipos/*` y etiqueta Sentry del servidor |
| `NEXT_PUBLIC_PSICO_ENV=staging` | etiqueta Sentry del navegador                                    |
| `NEXT_PUBLIC_API_URL`           | la API por su nombre de red interno                              |
| resto                           | inventario §11                                                   |

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
curl -s https://staging.feelverse.app/api/health
# environment debe decir exactamente "staging"
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

1. Bajar el TTL del registro con antelación, para que volver atrás sea rápido.
2. Apuntar `feelverse.app` al host.
3. Confirmar el certificado por Traefik.
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
