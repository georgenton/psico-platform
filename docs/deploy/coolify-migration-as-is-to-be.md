# FeelVerse · despliegue AS-IS y TO-BE (Vercel/Railway → Coolify SyntaVera)

Auditoría del 2026-09-29 contra `main` en `d7e0f165`. Todo lo que aquí se afirma
sale del código, de la configuración o de la API de los proveedores; lo que no se
pudo verificar está marcado como tal.

La decisión y su razonamiento están en
[ADR 0024](../adr/0024-migracion-a-coolify-syntavera.md). Este documento es el
inventario y el mapa.

---

## 1 · AS-IS — qué corre hoy y dónde

### 1.1 Web

|                    |                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **COMPONENT**      | `@psico/web`                                                                                                                                                                                                                                                              |
| **PATH**           | `apps/web`                                                                                                                                                                                                                                                                |
| **RUNTIME**        | Next.js 14.2.35 (App Router), React 18                                                                                                                                                                                                                                    |
| **HOSTING**        | Vercel · proyecto `psico-platform-web` (`prj_LqB4M2ZPwkgMh96LDf0reanTrWJu`), root directory `apps/web`, Node **24.x**                                                                                                                                                     |
| **BUILD**          | `cd ../.. && pnpm turbo run build --filter=@psico/web` (desde `apps/web/vercel.json`)                                                                                                                                                                                     |
| **START**          | lo gestiona Vercel (no hay `start` propio en el despliegue)                                                                                                                                                                                                               |
| **PORT**           | n/a en Vercel                                                                                                                                                                                                                                                             |
| **PUBLIC URL**     | `https://psico-platform-web.vercel.app`                                                                                                                                                                                                                                   |
| **DATABASE**       | ninguna directa — habla con la API                                                                                                                                                                                                                                        |
| **STORAGE**        | ninguno directo                                                                                                                                                                                                                                                           |
| **QUEUE**          | ninguna                                                                                                                                                                                                                                                                   |
| **ENV VARS**       | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_DSN`, `SENTRY_RELEASE`, `CLIENT_ATTESTATION_SECRET`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_ENV` |
| **PERSISTENCE**    | ninguna                                                                                                                                                                                                                                                                   |
| **DEPLOY TRIGGER** | push a `main` + `ignoreCommand` de `scripts/vercel-ignore-web.sh` (#725)                                                                                                                                                                                                  |
| **HEALTHCHECK**    | ninguno propio; Vercel no lo requiere                                                                                                                                                                                                                                     |
| **DEPENDENCIES**   | `@psico/api-client`, `@psico/crypto`, `@psico/types`, `@psico/ui`                                                                                                                                                                                                         |

### 1.2 API

|                    |                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **COMPONENT**      | `@psico/api`                                                                                                                   |
| **PATH**           | `apps/api`                                                                                                                     |
| **RUNTIME**        | NestJS 11 sobre Node 20                                                                                                        |
| **HOSTING**        | Railway · proyecto `psico-platform` (`013d58d0…`), servicio `psico-platform` (`4131e16a…`), entorno `production` (`4df9c485…`) |
| **BUILD**          | `pnpm install --frozen-lockfile && pnpm turbo run build --filter=@psico/api` · builder `RAILPACK`                              |
| **START**          | `node apps/api/dist/main`                                                                                                      |
| **PRE-DEPLOY**     | `pnpm --filter @psico/api migrate:deploy`                                                                                      |
| **PORT**           | `process.env.PORT ?? 3001`. **El dominio de Railway apunta a `targetPort: 3000`**, así que Railway inyecta `PORT=3000`         |
| **PUBLIC URL**     | `https://psico-platform-production.up.railway.app` (sin dominio propio)                                                        |
| **DATABASE**       | Railway PostgreSQL con extensión `vector`                                                                                      |
| **STORAGE**        | Cloudflare R2 vía `@aws-sdk/client-s3`                                                                                         |
| **QUEUE**          | Railway Redis (BullMQ)                                                                                                         |
| **ENV VARS**       | 46 en Railway; 44 declaradas en `src/config/env.schema.ts`, de las cuales **12 obligatorias**                                  |
| **PERSISTENCE**    | ningún volumen; el estado vive en Postgres y R2                                                                                |
| **DEPLOY TRIGGER** | push a `main` con `watchPatterns` (`apps/api/**`, `packages/**`, `config/**`, lockfile, configs de workspace)                  |
| **HEALTHCHECK**    | `GET /health` (excluido del prefijo `/api`)                                                                                    |
| **DEPENDENCIES**   | Postgres, Redis, R2, Anthropic, Voyage, Stripe, Resend, Google, Daily, Cloudflare Stream, Sentry                               |

### 1.3 Worker

|                 |                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **COMPONENT**   | worker de `@psico/api` (mismo código, segundo proceso — [ADR 0010](../adr/0010-bullmq-worker-same-codebase-separate-service.md))                                                        |
| **HOSTING**     | Railway · servicio `psico-platform-worker` (`1d672199…`)                                                                                                                                |
| **BUILD**       | `pnpm install --frozen-lockfile && pnpm --filter @psico/api... build`                                                                                                                   |
| **START**       | `pnpm --filter @psico/api start:worker` → `node dist/worker`                                                                                                                            |
| **PORT**        | ninguno · **no escucha HTTP**                                                                                                                                                           |
| **PUBLIC URL**  | ninguna                                                                                                                                                                                 |
| **HEALTHCHECK** | `null` — declarado explícitamente como sin healthcheck                                                                                                                                  |
| **COLAS**       | email, data-export, account-deletion, daily-usage, weekly-digest, inactive-nudge, weekly-summary-generation, platform-snapshot, cohort-retention, emotional-map-snapshot, circles-sweep |

### 1.4 Entorno de pruebas actual

Vive en un **proyecto Railway aparte**: `psico-circulos-test` (`4283213c…`), con
`circulos-api-test`, `circulos-worker-test`, `postgres-test` y `redis-test`, y web
en `circulos-test-web.vercel.app`. Su `PSICO_ENV` es `staging`.

Es decir: hoy «staging» no es un entorno del mismo proyecto, es otro proyecto. Eso
es justamente lo que Coolify permite ordenar.

### 1.5 Móvil

`apps/mobile` (Expo / React Native). **No se despliega en Coolify.** Elige la API
con `EXPO_PUBLIC_API_URL`, sin valor por defecto (`?? ""`), en tres sitios:
`src/context/auth.tsx`, `src/lib/asset-url.ts`, `src/components/dashboard/eco/EcoChat.tsx`.
No existe `eas.json` en el repositorio, y `app.json` no lleva `extra`, así que la
selección de URL hoy depende del entorno de build, no de configuración versionada.

---

## 2 · Arquitectura real del repositorio

|                 |                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------ |
| monorepo        | Turborepo 2.9.6                                                                                  |
| package manager | pnpm 10.33.2 (`packageManager` en la raíz)                                                       |
| Node            | 20 en local y en la API; **Vercel construye la web con 24.x**; no hay `engines.node` ni `.nvmrc` |
| build system    | Turborepo + tsup (paquetes), `nest build` (API), `next build` (web)                              |
| frontend        | Next.js 14 App Router                                                                            |
| backend         | NestJS 11                                                                                        |
| ORM             | Prisma 7 · 69 migraciones                                                                        |
| móvil           | Expo / React Native                                                                              |
| workers         | un worker BullMQ, mismo código que la API                                                        |
| colas           | BullMQ sobre Redis · 11 colas                                                                    |
| scheduler       | `upsertJobScheduler` de BullMQ dentro del worker (no cron de plataforma)                         |
| websocket       | ninguno                                                                                          |
| AI              | Anthropic (Claude), Voyage (embeddings), OpenAI/Deepgram (voz)                                   |
| storage SDK     | `@aws-sdk/client-s3` + presigner contra R2                                                       |
| database        | PostgreSQL con `pgvector`                                                                        |
| contenedores    | **ningún Dockerfile versionado**                                                                 |

---

## 3 · Dependencias de plataforma, con evidencia

### 3.1 Vercel

| FILE                                                          | ÁREA                                          | PURPOSE                                       | COOLIFY IMPACT                                                                  | MIGRATION REQUIRED               |
| ------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `apps/web/src/app/prototipos/lectura-guiada/page.tsx`         | gate de ruta                                  | 404 cuando `VERCEL_ENV=production`            | **La variable no existe → la ruta de prototipos queda accesible en producción** | **sí — código**                  |
| `apps/web/sentry.client.config.ts:17`                         | `NEXT_PUBLIC_VERCEL_ENV`                      | etiqueta el entorno en Sentry                 | todo se reportaría como `development`                                           | **sí — código**                  |
| `apps/web/e2e/gr3-evidence-setup.mjs`, `gr3-release-gate.mjs` | guardas de QA                                 | se niegan a correr si `VERCEL_ENV=production` | la guarda deja de disparar                                                      | sí — pero es tooling, no runtime |
| `apps/web/vercel.json`                                        | build/install/ignore                          | contrato de despliegue en Vercel              | se conserva como fallback                                                       | no (se mantiene)                 |
| `apps/web/next.config.js`                                     | headers, CSP scope                            | viaja con la app                              | ninguno                                                                         | **no**                           |
| `apps/web/src/middleware.ts`                                  | nonce + CSP                                   | runtime Node                                  | ninguno                                                                         | **no**                           |
| —                                                             | `@vercel/*`                                   | —                                             | **no hay ninguno**                                                              | no                               |
| —                                                             | edge runtime                                  | —                                             | **no se usa**                                                                   | no                               |
| —                                                             | KV / Blob / Postgres / Cron / Analytics / ISR | —                                             | **no se usan**                                                                  | no                               |

### 3.2 Railway

| FILE                                                                            | PURPOSE                                                                             | COOLIFY EQUIVALENT                             | CODE CHANGE         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| `apps/api/src/emotional-map/cache-identity.ts` · `looksDeployed()`              | detectar «máquina desplegada» por `RAILWAY_ENVIRONMENT`/`_PROJECT_ID`/`_SERVICE_ID` | ninguna variable equivalente automática        | **sí — bloqueante** |
| `apps/api/src/main.ts:181,190`                                                  | `RAILWAY_GIT_COMMIT_SHA` y `RAILWAY_REPLICA_ID` en el log de arranque               | SHA por variable propia; réplica no expuesta   | sí — menor          |
| `apps/api/railway.api.json`                                                     | build, start, pre-deploy, healthcheck, restart                                      | Application de Coolify                         | no (se conserva)    |
| `apps/api/railway.worker.json`                                                  | ídem, sin healthcheck ni dominio                                                    | Application sin dominio                        | no (se conserva)    |
| `apps/api/src/ops/railway-config.schema.ts` + `railway-deploy-contract.spec.ts` | trinquete sobre los dos JSON                                                        | sigue siendo válido mientras Railway exista    | no                  |
| `DATABASE_URL`, `REDIS_URL`                                                     | conexión                                                                            | variables de Coolify apuntando a la red Docker | no                  |
| `PORT`                                                                          | Railway inyecta 3000                                                                | Coolify: fijar puerto interno explícitamente   | config              |
| `apps/web/e2e/circulos/*.mjs` · `CIRCULOS_E2E_RAILWAY_*`                        | QA contra el entorno de pruebas                                                     | sigue usando Railway mientras exista           | no                  |
| —                                                                               | volúmenes Railway                                                                   | **no se usa ninguno**                          | no                  |
| —                                                                               | cron de Railway                                                                     | **no se usa**: el scheduler vive en el worker  | no                  |

### 3.3 Residuo que la auditoría destapó

`nixpacks.toml` en la raíz contiene **marcadores de conflicto de merge
committeados** y es TOML inválido. Fue eliminado a propósito en `c4083174` y
reapareció en el merge de release `6fc93135`. Nadie lo lee: los dos servicios usan
`builder: RAILPACK` con comandos explícitos. No se toca en esta fase —no es un
bloqueante— pero queda anotado para no perder una hora buscando por qué «el
builder no coge la configuración».

---

## 4 · Base de datos

|                |                                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| ENGINE         | PostgreSQL                                                                      |
| VERSIÓN        | **18** — declarada por el servicio de producción y probada por CI (ver abajo)   |
| POSTGIS        | **no**                                                                          |
| EXTENSIONES    | `vector` (pgvector), creada por la migración `20260508154842_add_ai_rag_tables` |
| MIGRATION TOOL | Prisma Migrate · `prisma migrate deploy`                                        |
| `DATABASE_URL` | obligatoria; sin pooling explícito en el esquema                                |
| SEED           | `prisma/seed.ts`, idempotente y no destructivo desde el fix del 2026-07-13      |
| MIGRACIONES    | 69                                                                              |

**Regla que no se negocia:** la base de staging es distinta de la de producción, y
ninguna de las dos publica puerto al host. Se hablan por la red Docker.

Imagen requerida en Coolify: una con `pgvector` disponible. El Postgres por defecto
de Coolify **no** la trae, y sin la extensión la migración
`20260508154842_add_ai_rag_tables` falla en su `CREATE EXTENSION vector`.

**Corrección a una versión previa de este documento.** Decía «16 en local» y
construía sobre eso un argumento de paridad con producción. El argumento estaba al
revés, y la evidencia estaba en el repositorio todo el tiempo:

| evidencia                                                   | qué dice                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml:106-111`                          | el servicio de PostgreSQL del job es `pgvector/pgvector:pg18`, y el comentario dice literalmente **«postgres 18 (matches production)»**. Introducido en `2a805a6b`, 2026-07-15, en el sync de PR-2A a producción |
| `apps/api/src/mood/mood-normalization-migration.pg-spec.ts` | ejecuta `pnpm exec prisma migrate deploy` — la **historia completa** de migraciones — dentro de un esquema efímero `pr2a_migrate`, contra ese pg18                                                               |
| `apps/api/vitest.locks.config.ts`                           | lo incluye vía `src/**/*.pg-spec.ts`, así que esa cadena de migraciones se aplica contra 18 **en cada corrida de CI**, no una vez                                                                                |
| `apps/api/prisma/schema.prisma:8`                           | `extensions = [pgvector(map: "vector")]` con `previewFeatures = ["postgresqlExtensions"]`: la extensión no es opcional, y por eso la imagen tiene que traerla                                                    |
| `apps/api/package.json`                                     | Prisma 7.8, que es la que CI usa contra 18                                                                                                                                                                       |

Dónde aparece 16, y por qué no cuenta como prueba: `docker-compose.yml` para
desarrollo local, y contenedores desechables del runbook del piloto de Círculos.
Ninguno aplica la cadena de migraciones como parte de un gate.

Y confirmado de la única forma que no toca producción: leyendo la **configuración
declarada** del servicio por la API de Railway (`describe-service`, de sólo lectura),
sin conectarse a la base, sin consultarla y sin cambiar nada.

```
image: ghcr.io/railwayapp-templates/postgres-ssl:18
volumen: 500 MB · us-west2 · live
```

O sea que producción corre PostgreSQL **18**, el comentario de CI era exacto, y el
argumento de paridad apunta a 18 — no a 16, que era lo que este documento decía.

Así que el objetivo es **`pgvector/pgvector:pg18`**, fijado por digest. La imagen de
Railway es una plantilla propia con SSL; la de Coolify tiene que traer `pgvector`
porque la extensión no es opcional (§4, `schema.prisma:8`).

Dato útil para el dimensionamiento: el volumen de la base de producción es de **500
MB**. El de staging no necesita más, y eso acota el disco que hay que reservar.

---

## 5 · Redis y colas

Redis **sí** existe y se usa para tres cosas distintas, que conviene no confundir:

| uso                                   | clase             | ¿necesita persistencia?                                   |
| ------------------------------------- | ----------------- | --------------------------------------------------------- |
| BullMQ · 11 colas                     | **QUEUE**         | sí para trabajos en vuelo; se pierde poco si se cae vacío |
| cache del mapa emocional y de Pulso   | **CACHE**         | no — se regenera                                          |
| throttler (rate limit) y idempotencia | **CACHE** con TTL | no                                                        |

`REDIS_URL` es **opcional** en el esquema, y `superRefine` la exige cuando
`NODE_ENV=production`. Así que en un despliegue con `NODE_ENV=production` su ausencia
aborta la validación y el proceso no arranca — falla rápido.

El fallback a `ioredis-mock` de `createRedisClient` sólo entra donde el esquema tolera
Redis ausente: dev y test, donde es una comodidad deliberada (ADR 0008). El riesgo real
es olvidar `NODE_ENV=production` en una caja desplegada: entonces el esquema deja de
exigir Redis, el proceso arranca con un mock y las colas quedan mudas en silencio.

No se publica 6379.

---

## 6 · Almacenamiento

`apps/api/src/storage/storage.service.ts` usa `S3Client` + presigner contra R2.
Variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME` (las cuatro obligatorias) y `R2_PUBLIC_URL` (opcional).

Contenido que se guarda: portadas y arte de libros, audio de capítulos, vídeo,
subidas de autor y exportaciones de datos de usuario.

| clase       | qué                                                |
| ----------- | -------------------------------------------------- |
| USER DATA   | exportaciones de datos personales                  |
| PERSISTENT  | audio, vídeo y portadas de contenido licenciado    |
| REGENERABLE | derivados y miniaturas                             |
| SENSIBLE    | las exportaciones; el resto es contenido editorial |

Los buckets no se mezclan: `syntavera-coolify-backups` es del plano de control y no
se toca. Para la base de FeelVerse se propone —**sin crear nada todavía**—
`syntavera-feelverse-db-backups`.

---

## 7 · Datos sensibles y cómo los afecta el despliegue

El producto maneja reflexiones personales, conversaciones con un acompañante de IA
y actividad emocional. [ADR 0007](../adr/0007-e2e-encryption-diario-eco.md) ya
resuelve lo esencial: el diario y los mensajes de Eco se guardan **cifrados de
extremo a extremo**; el servidor recibe y devuelve `ciphertext + nonce` y no puede
leer el texto. La migración **no cambia ninguna política**, y hay trinquetes que lo
verifican (`privacy` en CI).

Lo que sí cambia con el despliegue, y hay que cuidar:

- **Logs.** Pasan de los paneles de Vercel/Railway a los logs de Docker en un VPS
  propio. El invariante de ADR 0007 —ningún `logger.*` toca un campo cifrado— sigue
  cobrado por CI, así que el riesgo no aumenta; sí cambia quién puede leerlos.
- **Backups.** Hoy dependen de lo que ofrezca Railway. Pasan a R2, bajo nuestra
  retención, en un bucket separado del plano de control.
- **Separación de entornos.** Mejora: staging deja de ser otro proyecto y pasa a
  ser un entorno del mismo, con base y Redis propios.
- **Residencia.** El VPS es OVH; R2 es Cloudflare. No es un cambio de jurisdicción
  respecto a hoy, pero queda dicho.
- **Integraciones de IA.** No cambian: mismas claves, mismos endpoints, y el mapa
  emocional sigue enviando sólo frecuencias categóricas (ADR 0014).

---

## 8 · TO-BE — mapa de red

Corregido tras auditar el camino de red real de los clientes (§9.6): la API es
pública porque el navegador y el móvil la llaman directamente.

```
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
   │  navegador   │   │  app móvil   │   │  Stripe / Daily  │
   │   (web SSR   │   │   (Expo)     │   │    webhooks      │
   │  + cliente)  │   │              │   │                  │
   └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘
          │                  │                    │
          │  PÚBLICO ────────┼────────────────────┘
          ▼                  ▼
   ══════════════════ Internet ══════════════════
                      │
             Cloudflare DNS (148.113.254.26, DNS only)
             staging.feelverse.app · api-staging.feelverse.app
                      │
             Traefik 3.6.25  ·  80 → 443  ·  ACME
                      │
      ┌───────────────┴────────────────┐
      ▼                                ▼
  ┌────────────────────┐      ┌────────────────────────┐
  │ web                │      │ api                    │   ← PÚBLICO
  │ interno 3000       │      │ interno 3001           │
  │ /api/health        │      │ /health                │
  └─────────┬──────────┘      └───────────┬────────────┘
            │  SSR → api                  │
            └──────────────┬──────────────┘
                           │
        ╔══════════ red Docker `coolify` ══════════╗
        ║             PRIVADO                      ║
        ║   ┌──────────────┐  ┌─────────────────┐  ║
        ║   │ postgres     │  │ redis           │  ║
        ║   │ pgvector:18  │  │ colas + caché   │  ║
        ║   │ 5432 NO pub. │  │ 6379 NO pub.    │  ║
        ║   └──────┬───────┘  └────────┬────────┘  ║
        ║          └────────┬──────────┘           ║
        ║                   ▼                      ║
        ║        ┌────────────────────────┐        ║
        ║        │ worker                 │        ║
        ║        │ sin puerto, sin dominio│        ║
        ║        └────────────────────────┘        ║
        ╚══════════════════════════════════════════╝
                           │
                  R2 (S3 API, saliente)
          media privada · exports · backups de la base
```

| superficie                      | expuesta                           | por qué                                               |
| ------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| web `staging.feelverse.app`     | **PÚBLICO** por Traefik            | es el producto                                        |
| api `api-staging.feelverse.app` | **PÚBLICO** por Traefik            | el navegador y el móvil la llaman directamente (§9.6) |
| postgres 5432                   | **PRIVADO**, sin puerto al host    | `is_public: false`, `public_port: null`               |
| redis 6379                      | **PRIVADO**, sin puerto al host    | idem                                                  |
| worker                          | **PRIVADO**, sin puerto ni dominio | no escucha nada                                       |
| R2                              | saliente desde api y worker        | almacenamiento, no entrada                            |

Sólo `web` y `api` cruzan Traefik. La comprobación de que eso es cierto no es esta
tabla, es `docker ps` en el paso VALIDATE del runbook: si aparece un `0.0.0.0:5432`
o un `0.0.0.0:6379`, el mapa está mintiendo y se corrige antes de seguir.

Detalle que conviene no perder: la web habla con la API **dos veces** por camino
distinto. En SSR sale del contenedor (puede ir por la red privada), y en el navegador
sale del cliente (va por el dominio público). Por eso `NEXT_PUBLIC_API_URL` tiene que
ser la URL pública: es la que termina en el bundle del navegador.

---

## 9 · Resource map · `staging`

Proyecto `FeelVerse` (`ol7ntjddsclgrfcpbsgcnxhh`) · entorno `staging`
(`xsj7d7obrtlqooqfw5x4sbta`) · servidor `localhost` (`tyaniecu7o8q7ml7212rxwff`).
Verificado por lectura: el entorno **ya existe** y está vacío.

### 9.1 `feelverse-staging-postgres`

|                |                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TYPE           | Database · PostgreSQL                                                                                                                                                                                                                                                                                                                                 |
| IMAGEN         | `pgvector/pgvector:pg18`, **fijada por digest**                                                                                                                                                                                                                                                                                                       |
| POR QUÉ 18     | es la única versión contra la que este repositorio **prueba** la cadena completa de migraciones, en cada corrida de CI, y el propio CI la declara igual a producción (§4). No se elige por lo que corra el producto vecino: su PostgreSQL 17 con bundle de PostGIS añade superficie que FeelVerse no usa y divergiría de lo que el repositorio valida |
| DOMAIN         | ninguno                                                                                                                                                                                                                                                                                                                                               |
| PUERTO AL HOST | **ninguno**                                                                                                                                                                                                                                                                                                                                           |
| PERSISTENCE    | volumen de datos gestionado por Coolify                                                                                                                                                                                                                                                                                                               |
| BACKUP         | patrón del vecino, ya en marcha en este host: cron `0 3 * * *`, retención local 0, `save_s3` a un destino S3 propio. Bucket `syntavera-feelverse-db-backups`, **sin crear hasta aprobar el naming**, y nunca el del plano de control                                                                                                                  |
| HEALTHCHECK    | activo, patrón del vecino: interval 15s · timeout 5s · retries 5 · start period 5s                                                                                                                                                                                                                                                                    |
| DEPENDENCIES   | ninguna                                                                                                                                                                                                                                                                                                                                               |

### 9.2 `feelverse-staging-redis`

|             |                                                          |
| ----------- | -------------------------------------------------------- |
| TYPE        | Database · Redis 7                                       |
| DOMAIN      | ninguno · PUERTO AL HOST **ninguno**                     |
| PERSISTENCE | volumen (las colas en vuelo lo agradecen; no es crítico) |
| BACKUP      | no requerido — cache y colas                             |

### 9.3 `feelverse-staging-api`

|                |                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TYPE           | Application                                                                                                                                                                                                                |
| SOURCE         | repositorio `georgenton/psico-platform`, rama `main`                                                                                                                                                                       |
| BUILD          | a decidir en la Fase de contenedorización: Nixpacks con comandos explícitos o Dockerfile propio                                                                                                                            |
| START          | `node apps/api/dist/main`                                                                                                                                                                                                  |
| PUERTO INTERNO | **3001**, fijado explícitamente (hoy Railway inyecta 3000 y el código cae a 3001 por defecto)                                                                                                                              |
| DOMAIN         | **`api-staging.feelverse.app`** · PÚBLICO. Corrección a la versión previa, que la dejaba privada: el navegador de la web y el móvil llaman a la API **directamente** (§9.6). Sin dominio no hay Eco, lector, voz ni Diario |
| CORS           | `ALLOWED_ORIGINS` debe incluir `https://staging.feelverse.app`. `main.ts` pasa la lista a `enableCors` con `credentials: true`; sin el origen, cada llamada del navegador falla en preflight                               |
| HEALTHCHECK    | `GET /health` · 200 · start period generoso: arranca Nest, valida env y conecta Prisma                                                                                                                                     |
| MIGRACIONES    | `pnpm --filter @psico/api migrate:deploy` como paso previo, **nunca** encadenado con seed                                                                                                                                  |
| DEPENDENCIES   | postgres, redis                                                                                                                                                                                                            |
| PERSISTENCE    | ninguna                                                                                                                                                                                                                    |

### 9.4 `feelverse-staging-worker`

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| TYPE         | Application                                                                                    |
| START        | `node apps/api/dist/worker`                                                                    |
| PUERTO       | ninguno · DOMAIN ninguno                                                                       |
| HEALTHCHECK  | **ninguno HTTP posible** — no escucha. Su salud se observa por logs y por profundidad de colas |
| DEPENDENCIES | postgres, redis                                                                                |

### 9.5 `feelverse-staging-web`

|                |                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TYPE           | Application                                                                                                                                                                                                                                                                                                                                                  |
| SOURCE         | mismo repositorio y rama                                                                                                                                                                                                                                                                                                                                     |
| BUILD          | `next build`. **Corrección a una versión previa de este documento:** `output: "standalone"` NO es un requisito. Sólo hace falta si se construye un Dockerfile delgado que copie `.next/standalone`; con Nixpacks, `next start` sirve el build tal cual. Añadirlo ahora sería configuración para un camino no elegido, que es exactamente el residuo del §3.3 |
| START          | `next start` (Nixpacks)                                                                                                                                                                                                                                                                                                                                      |
| PUERTO INTERNO | **3000**                                                                                                                                                                                                                                                                                                                                                     |
| DOMAIN         | `staging.feelverse.app`                                                                                                                                                                                                                                                                                                                                      |
| HEALTHCHECK    | `GET /api/health` · 200 · **implementado** en esta rama. Deliberadamente no comprueba API, base ni Redis: un healthcheck que depende de terceros convierte la caída de un tercero en el reinicio de este contenedor                                                                                                                                          |
| DEPENDENCIES   | api                                                                                                                                                                                                                                                                                                                                                          |

### 9.6 Por qué la API es pública · evidencia

Este punto cambia la topología, así que va con referencias de fichero y línea.

| cliente         | fichero                                                                                                                                                             | qué hace                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| navegador (web) | `apps/web/src/app/dashboard/_ApiClientBootstrap.tsx`                                                                                                                | Client Component que hace `apiClient.configure(apiBase, …)` con `NEXT_PUBLIC_API_URL`. Su comentario: «It wires the singleton so those typed wrappers actually reach the API on Railway» |
| navegador (web) | `apps/web/src/app/dashboard/layout.tsx:29,143`                                                                                                                      | inyecta `API_ROOT` como prop a ese bootstrap                                                                                                                                             |
| navegador (web) | Eco `ChatArea`/`EcoShell`, `LectorShell`, `AudioBar`, `VozRecorder`, `ActiveComposer`, `WebPushToggle`, `ChangePasswordCard`, medios del capítulo, panel de la guía | Client Components que reciben `apiBase` y hacen fetch desde el navegador                                                                                                                 |
| móvil           | `apps/mobile/src/context/auth.tsx:20,24,74`                                                                                                                         | `EXPO_PUBLIC_API_URL` → `API_BASE = ${API_URL}/api`, y `apiClient.configure(API_URL, …)`                                                                                                 |
| móvil           | `apps/mobile/src/lib/asset-url.ts`                                                                                                                                  | compone URLs de imagen contra el host de la API (las privadas las sirve la propia API)                                                                                                   |
| móvil           | `apps/mobile/app/(tabs)/voz.tsx:171-179`                                                                                                                            | sube audio multipart con `apiClient.postFormData`                                                                                                                                        |
| móvil           | `apps/mobile/src/components/dashboard/eco/EcoChat.tsx:28,190`                                                                                                       | abre el SSE de Eco contra ese host                                                                                                                                                       |

**Camino de red del móvil: B — directo a la API.** El único uso del origen web es
`EXPO_PUBLIC_WEB_ORIGIN` en la pantalla de reserva de terapia, y sólo para las URLs
de éxito y cancelación de Stripe, que son destinos de navegador.

**Sin WebSocket.** Cero coincidencias de `WebSocket`, `ws://`, `wss://` o
`socket.io` en el móvil. Eco transmite por SSE sobre HTTPS, mismo host y mismo
puerto: no hay que abrir nada más en Traefik ni crear un dominio de realtime.

`production` replicará la forma con recursos **separados**. Ningún recurso con
estado se comparte entre entornos.

---

## 10 · Dominios

| entorno    | dominio                     | recurso | notas                                                               |
| ---------- | --------------------------- | ------- | ------------------------------------------------------------------- |
| staging    | `staging.feelverse.app`     | web     | ✅ ya resuelve a `148.113.254.26`, DNS only                         |
| staging    | `api-staging.feelverse.app` | api     | **necesario** (§9.6). DNS pendiente                                 |
| production | `feelverse.app`             | web     | ⚠️ **ya resuelve al VPS** — ver el aviso                            |
| production | `www.feelverse.app`         | web     | CNAME a `feelverse.app`                                             |
| production | `api.feelverse.app`         | api     | necesario cuando llegue producción, por el mismo motivo que staging |

Sin wildcard.

### Aviso: el DNS de producción ya apunta aquí

Medido el 2026-09-30 en tres resolvers públicos y en el autoritativo de Cloudflare:

```
staging.feelverse.app → 148.113.254.26   (DNS only)
feelverse.app         → 148.113.254.26   (DNS only)
www.feelverse.app     → feelverse.app → 148.113.254.26
```

Y lo que contesta hoy en `feelverse.app` es el **certificado por defecto de
Traefik** (`issuer=CN=TRAEFIK DEFAULT CERT`), o sea: ninguna ruta configurada. El
único dominio registrado en este servidor es `test.syntavera.dev`.

Dos lecturas, y las dos importan:

1. **`feelverse.app` no está en uso.** Los usuarios llegan por
   `psico-platform-web.vercel.app`, que responde 200. Nada está roto; el dominio
   estaba preparado de antemano.
2. **Por eso mismo es peligroso.** El DNS ya está puesto, así que el momento en que
   un recurso de Coolify reclame `feelverse.app`, ese hostname queda **en vivo al
   instante**, con certificado y todo. Escribir `feelverse.app` en el campo de
   dominio de un recurso de _staging_ publicaría staging en el hostname de
   producción sin ningún paso intermedio que lo frene.

Regla operativa: **ningún recurso de staging lleva `feelverse.app` ni
`www.feelverse.app` en su campo de dominio.** Staging sólo usa los dos subdominios
`*-staging`. El paso de cutover del runbook deja de ser «apuntar el DNS» y pasa a
ser «reclamar el hostname», que es una operación de Coolify y no de Cloudflare.

## 11 · Inventario de secretos

**Movido.** La fuente canónica es
[coolify-staging-env-inventory.md](coolify-staging-env-inventory.md), derivada del
código y revisable en un PR.

Se movió porque este documento describe el AS-IS y el TO-BE —qué corre hoy, qué forma
tendrá— y una lista de variables es configuración viva: cambia con cada capacidad que
se enciende, y aquí se habría quedado vieja sin que nadie lo notara. Lo que el
inventario añade y esta sección no tenía:

- el **contrato de arranque** completo, 26 variables, con las doce barreras que no
  aparecen en el esquema de env y sin las cuales el contenedor no arranca;
- una clasificación que **no llama secreto a todo**: valores secretos, identificadores
  de credencial, configuración no secreta y configuración pública de build;
- la separación entre lo que el propietario aporta antes de crear recursos y lo que el
  ciclo de creación genera — `DATABASE_URL` no puede pedirse antes de que exista
  Postgres.

---

## 12 · Healthchecks

| proceso | puerto | endpoint                    | código | qué comprueba                                     | estado                                                          |
| ------- | ------ | --------------------------- | ------ | ------------------------------------------------- | --------------------------------------------------------------- |
| api     | 3001   | `GET /health`               | 200    | vivacidad del proceso (no toca DB)                | **ya existe**                                                   |
| api     | 3001   | `GET /health/integrations`  | 200    | qué integraciones están configuradas · **ADMIN**  | ya existe, no sirve como healthcheck                            |
| api     | 3001   | `GET /health/emotional-map` | 200    | identidad de runtime api/worker                   | ya existe                                                       |
| worker  | —      | ninguno                     | —      | —                                                 | **imposible por HTTP**: no escucha. Logs + profundidad de colas |
| web     | 3000   | `GET /api/health`           | 200    | vivacidad del proceso; NO toca api, base ni Redis | **implementado en esta rama**                                   |

El middleware corre en todas las rutas salvo las internas de Next, así que se
verificó que `/api/health` no cae en ningún prefijo protegido: no redirige, no pide
identidad. Devuelve `{ status, timestamp, environment }` y `cache-control: no-store`,
y se declara `force-dynamic` para que Next no la resuelva en build y sirva una hora
congelada — un 200 estático contestaría por un proceso atascado.

---

## 13 · Contenedorización

No hay ningún Dockerfile versionado, y el repositorio está construido alrededor de
Turborepo + pnpm con comandos explícitos por workspace. Eso encaja mejor con
**Nixpacks/Railpack con comandos declarados** —que es lo que Railway ya hace y
funciona— que con escribir tres Dockerfiles nuevos.

Recomendación por recurso:

| recurso  | estrategia                            | por qué                                                                                                                               |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| api      | Nixpacks con build/start explícitos   | replica lo que ya funciona en Railway                                                                                                 |
| worker   | Nixpacks, mismo build, start distinto | ADR 0010: mismo código, segundo proceso                                                                                               |
| web      | Nixpacks + `next start`               | `output: "standalone"` sólo hace falta con un Dockerfile propio; con Nixpacks no aporta y sería configuración de un camino no elegido |
| postgres | imagen con pgvector                   | la extensión no es opcional                                                                                                           |
| redis    | `redis:7-alpine`                      | igual que el compose local                                                                                                            |

Se descarta convertir todo a Docker Compose: el repositorio no lo necesita y
añadiría una capa de configuración que hoy no existe.

Tres cosas que la lectura del servidor añade al plan:

- **`nixpacks.toml` se elimina en esta rama.** Era inerte en Railway (los dos
  servicios usan `RAILPACK` con comandos explícitos), pero Nixpacks **sí** lee ese
  fichero: con marcadores de conflicto dentro, el build habría fallado al parsear, y
  además fijaba la API en la raíz del repositorio, así que habría secuestrado también
  el build de Web. Pasó de residuo a carga estructural rota por cambiar de
  constructor. Ya se había eliminado a propósito en `c4083174`.
- **`concurrent_builds: 2`** en este servidor. Tres aplicaciones se encolan; conviene
  no esperar tres builds simultáneos ni interpretar la espera como un fallo.
- **`is_build_server: false`**: se construye en la misma máquina que sirve. Un
  `next build` y un `nest build` compiten con lo que esté en producción. Es un
  argumento para medir antes de abrir producción, no un impedimento para staging.

**Versión de Node.** No había `.nvmrc` ni `engines.node`, así que un constructor
elegía por su cuenta. Esta rama añade `.nvmrc` con `20`, que es la única versión que
el CI de este repositorio valida. Deliberadamente **no** se añade `engines.node`:
Vercel la lee y cambiar la versión del respaldo mientras es el respaldo es
precisamente lo que no toca hacer. Consecuencia declarada: Web se construirá en
Node 20 en Coolify y sigue construyéndose en 24 en Vercel. Las dos están validadas
—24 en producción hoy, 20 en CI— así que la divergencia es conocida y no ciega.

---

## 14 · CI/CD

Hoy: cinco workflows (`ci.yml`, `openapi-diff.yml`, `pr-title.yml`, `release.yml`,
`secret-scan.yml`). **Ninguno despliega.** El despliegue lo disparan los propios
proveedores por push a `main`. La única mención a las plataformas es un comentario
en `openapi-diff.yml`.

Eso es una buena noticia para la migración: no hay CI que reescribir. El objetivo a
evaluar —PR valida, merge construye artefacto inmutable, staging despliega,
producción con gate manual— se puede montar después. Para staging basta con que
Coolify construya desde Git, que es la forma que mejor refleja el repositorio
actual. **No se impone GHCR** sin necesidad demostrada.

Para producción sí conviene versionado inmutable: commit SHA o tag de release, no
`latest`. Queda como requisito del gate de producción, no de staging.

---

## 15 · Migraciones

`prisma migrate deploy`, como paso previo al arranque, **sin encadenar nada**. El
esquema de política de Railway ya prohíbe el encadenamiento por una razón
documentada: el pre-deploy fue una vez `migrate:deploy && prisma db seed`, y ese
`&&` es exactamente cómo una migración de esquema y una reescritura de contenido
curado llegaron a producción como un solo paso.

Ninguna migración destructiva se ejecuta automáticamente. Cuando una lo requiera:
**expand → deploy → contract**, en despliegues separados.

---

## 16 · Límites de recursos

**Corrección a una versión previa de este documento.** Proponía `2g / 512m / 2 CPU`
para Postgres citando que «el vecino los usa en este host y está sano». Eso no es
evidencia sobre FeelVerse: es evidencia de que **otro** workload cabe en esos
números. Los dos productos no tienen ni el mismo esquema, ni el mismo volumen, ni
las mismas consultas, ni pgvector.

Lo que sí hay, y lo que no:

| recurso  | evidencia local disponible                                                                                                                    | propuesta                                        | clase                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| postgres | el esquema tiene 69 migraciones y una extensión `vector`; el índice vectorial vive en RAM cuando se consulta. Ningún dato de uso real         | `1g` mem / `1` CPU **como arranque conservador** | MEDIR EN STAGING                                             |
| redis    | tres usos —colas BullMQ, caché del mapa y de Pulso, throttler e idempotencia—, todos con TTL o volumen pequeño; ninguna estructura grande     | `256m` / `0.5` CPU                               | MEDIR EN STAGING                                             |
| api      | arranca Nest con todos los módulos, valida el entorno con Zod y conecta Prisma; es el proceso más gordo del conjunto. Ningún dato de uso real | `1g` / `1` CPU                                   | MEDIR EN STAGING                                             |
| worker   | mismo build, sin servidor HTTP; procesa colas, y una de ellas llama al LLM                                                                    | `768m` / `0.5` CPU                               | MEDIR EN STAGING                                             |
| web      | Next 14 en SSR; el build es el pico, no el servicio, y aquí se construye en la misma máquina que sirve (`is_build_server: false`)             | `1g` / `1` CPU en servicio                       | MEDIR EN STAGING · el **build** necesita más que el servicio |

Todos los números de arriba son **límites iniciales de contención**, no
dimensionamiento. Su único propósito es que un proceso que se descontrole no se lleve
el host por delante, y que staging arranque con algo declarado en vez de con nada.
Ninguno se traslada a producción sin medición.

Suma de los arranques: 4 GB de memoria y 4 CPU en límites, para un host cuya
capacidad **no se puede leer** desde la API de Coolify (`is_metrics_enabled: false`,
`is_sentinel_enabled: true` con 7 días de historia). Antes de crear los recursos hay
que comprobar que el host tiene ese margen por encima de lo que ya corre —Coolify,
Traefik, dos Postgres y dos servicios del producto vecino—, y eso se mira en el host
o habilitando métricas. Es una decisión de infraestructura y no entra en esta tarea.

Qué medir en staging, para que «medir» signifique algo: RSS en reposo y en el
recorrido funcional del paso VALIDATE, memoria y CPU durante un build, tamaño de la
base tras el seed, y profundidad de colas con el worker trabajando.

## 17 · Observabilidad

**Staging, mínimo:** logs por recurso, healthcheck de api y web, estado de
deployment, conectividad a la base, arranque del worker visible en logs, errores
críticos a Sentry.

**Producción, además:** CPU/RAM/disco del host, métricas de Postgres, profundidad
de colas, latencia, fallos de backup y fallos de deployment con aviso.

---

## 18 · Pendientes

### Cerrado en esta rama

- Healthcheck de la web: `GET /api/health`.
- `looksDeployed()` conoce Coolify y sigue conociendo Railway; y ahora acepta
  `PSICO_DEPLOYED`, que es el único marcador que no depende de que un proveedor
  mantenga sus nombres.
- El gate de prototipos usa un resolutor propio, y **ya no eran una ruta sino dos**:
  `lectura-guiada` y `book-experience`. La versión previa de este documento sólo
  contó la primera.
- Sentry etiqueta el entorno igual en cliente, servidor y edge.
- `nixpacks.toml` eliminado.
- `.nvmrc` con `20`.
- El SHA de build y el id de réplica del arranque de la API son neutrales: los gates
  C.0B2 y C.3A leen `BUILD_SHA` de los logs para demostrar que ninguna réplica vieja
  sigue sirviendo, y en Coolify habría sido `unknown` en todas.

### Lo que la auditoría NO vio y apareció construyendo

- **`/prototipos/book-experience` era estática** (`○` en la salida del build). Una
  página sin parámetros se prerenderiza, así que su gate se resolvía con las
  variables del **build**, no de la petición. En Vercel funcionaba de casualidad
  —el build corre con `VERCEL_ENV=production`—; en Coolify, con el entorno sólo en
  runtime, el prerender habría publicado el prototipo como HTML estático que ninguna
  variable en caliente podría cerrar. Ahora es `force-dynamic`, y hay ratchet.
- **`COOLIFY_URL` no sirve como marcador de despliegue.** Es cómo se configura un
  CLIENTE para hablar con un Coolify, así que cualquier portátil con el CLI o el MCP
  la lleva puesta. La primera versión la incluyó y rompió 36 pruebas en la primera
  corrida: la suite funcionó como control negativo. Sólo se usan variables que
  existen DENTRO del contenedor.
- **`identityLogLine()` no tenía prueba.** Sacar `releaseSha` del módulo del mapa
  dejó el identificador fuera de ámbito y la suite siguió verde; lo cazó `tsc`. Una
  línea que los dos servicios imprimen al arrancar merecía cobertura, y ahora la
  tiene.

### Abierto

- **La App de GitHub `synta-vera-coolify` no tiene acceso a `georgenton/psico-platform`**
  — sólo a `eia-studio`. Prerrequisito humano en GitHub antes de cualquier deploy
  desde el repositorio. No se toca por API.
- El dominio comodín del servidor es `syntavera.dev`; `feelverse.app` necesita sus
  propios registros DNS.
- Los previews por PR de Vercel no tienen equivalente todavía.
- El móvil no tiene `eas.json` versionado ni estrategia de URL por entorno.
- La versión de PostgreSQL de producción sigue sin consultarse (ver §4).
- Traefik 3.6.25 tiene disponible una actualización menor a 3.7. **No se toca**: es
  infraestructura base del host.
