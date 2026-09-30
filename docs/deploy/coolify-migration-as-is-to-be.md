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

|                |                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------- |
| ENGINE         | PostgreSQL                                                                                    |
| VERSIÓN        | 16 en local (`pgvector/pgvector:pg16`); la de Railway no se consultó para no tocar producción |
| POSTGIS        | **no**                                                                                        |
| EXTENSIONES    | `vector` (pgvector), creada por la migración `20260508154842_add_ai_rag_tables`               |
| MIGRATION TOOL | Prisma Migrate · `prisma migrate deploy`                                                      |
| `DATABASE_URL` | obligatoria; sin pooling explícito en el esquema                                              |
| SEED           | `prisma/seed.ts`, idempotente y no destructivo desde el fix del 2026-07-13                    |
| MIGRACIONES    | 69                                                                                            |

**Regla que no se negocia:** la base de staging es distinta de la de producción, y
ninguna de las dos publica puerto al host. Se hablan por la red Docker.

Imagen requerida en Coolify: una con `pgvector` disponible. El Postgres por defecto
de Coolify **no** la trae; el entorno de pruebas actual usa `pgvector/pgvector:pg16`
y eso es lo que hay que replicar.

**Pendiente antes de producción, no antes de staging:** la versión exacta de
PostgreSQL en Railway no se consultó, para no tocar producción. Staging se monta en
16 por paridad con lo que el repositorio usa. Antes de migrar datos reales hay que
leer la versión de producción y decidir si el salto de major va en la migración (no
recomendado: dos cambios a la vez) o después.

---

## 5 · Redis y colas

Redis **sí** existe y se usa para tres cosas distintas, que conviene no confundir:

| uso                                   | clase             | ¿necesita persistencia?                                   |
| ------------------------------------- | ----------------- | --------------------------------------------------------- |
| BullMQ · 11 colas                     | **QUEUE**         | sí para trabajos en vuelo; se pierde poco si se cae vacío |
| cache del mapa emocional y de Pulso   | **CACHE**         | no — se regenera                                          |
| throttler (rate limit) y idempotencia | **CACHE** con TTL | no                                                        |

`REDIS_URL` es **opcional** en el esquema: sin ella, `createRedisClient` cae a
`ioredis-mock`. Eso está bien para tests y es peligroso en un despliegue, porque un
Redis ausente no rompería el arranque: las colas simplemente no harían nada. El
`superRefine` del esquema exige `REDIS_URL` en producción, así que el riesgo real
está en staging si se olvida.

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

## 8 · TO-BE — arquitectura en Coolify

```
                        Internet
                            │
                   Cloudflare DNS
                   feelverse.app
                   staging.feelverse.app
                            │
                    Traefik (80/443, UDP 443)
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
   web  (interno 3000)                    api  (interno 3001)
        │                                       │
        └───────────────┬───────────────────────┘
                        │
              red privada de Docker
                        │
        ┌───────────────┼───────────────┬───────────────┐
        │               │               │               │
   postgres        redis            worker         (sin puerto
   (pgvector)      (colas+cache)   (sin HTTP)       publicado)
```

Nada más que `web` y `api` cruza Traefik. Postgres, Redis y el worker no publican
puerto al host: la política `DOCKER-USER` del VPS los bloquearía de todos modos, y
no hacen falta.

---

## 9 · Resource map · `staging`

Proyecto `FeelVerse` (`ol7ntjddsclgrfcpbsgcnxhh`) · entorno `staging`
(`xsj7d7obrtlqooqfw5x4sbta`) · servidor `localhost` (`tyaniecu7o8q7ml7212rxwff`).
Verificado por lectura: el entorno **ya existe** y está vacío.

### 9.1 `feelverse-staging-postgres`

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TYPE               | Database · PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                                             |
| IMAGEN             | `pgvector/pgvector:pg16`, **fijada por digest**                                                                                                                                                                                                                                                                                                                                                                                   |
| POR QUÉ 16 Y NO 17 | el vecino en este mismo Coolify corre PostgreSQL 17 con pgvector 0.8.0 (`imresamu/postgis:17-3.5-bundle0@sha256:…`) y es tentador reutilizarlo: está probado en este host. Pero staging existe para validar la migración, y una staging en 17 contra una producción en 16 valida otra cosa. La paridad de versión con producción pesa más que reutilizar una imagen, y el bundle de PostGIS añade superficie que FeelVerse no usa |
| DOMAIN             | ninguno                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PUERTO AL HOST     | **ninguno**                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PERSISTENCE        | volumen de datos gestionado por Coolify                                                                                                                                                                                                                                                                                                                                                                                           |
| BACKUP             | patrón del vecino, ya en marcha en este host: cron `0 3 * * *`, retención local 0, `save_s3` a un destino S3 propio. Bucket `syntavera-feelverse-db-backups`, **sin crear hasta aprobar el naming**, y nunca el del plano de control                                                                                                                                                                                              |
| HEALTHCHECK        | activo, patrón del vecino: interval 15s · timeout 5s · retries 5 · start period 5s                                                                                                                                                                                                                                                                                                                                                |
| DEPENDENCIES       | ninguna                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 9.2 `feelverse-staging-redis`

|             |                                                          |
| ----------- | -------------------------------------------------------- |
| TYPE        | Database · Redis 7                                       |
| DOMAIN      | ninguno · PUERTO AL HOST **ninguno**                     |
| PERSISTENCE | volumen (las colas en vuelo lo agradecen; no es crítico) |
| BACKUP      | no requerido — cache y colas                             |

### 9.3 `feelverse-staging-api`

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TYPE           | Application                                                                                                                        |
| SOURCE         | repositorio `georgenton/psico-platform`, rama `main`                                                                               |
| BUILD          | a decidir en la Fase de contenedorización: Nixpacks con comandos explícitos o Dockerfile propio                                    |
| START          | `node apps/api/dist/main`                                                                                                          |
| PUERTO INTERNO | **3001**, fijado explícitamente (hoy Railway inyecta 3000 y el código cae a 3001 por defecto)                                      |
| DOMAIN         | ninguno inicialmente — la web habla con la API por la red privada. Sólo si se demuestra que hace falta API pública se crea dominio |
| HEALTHCHECK    | `GET /health` · 200 · start period generoso: arranca Nest, valida env y conecta Prisma                                             |
| MIGRACIONES    | `pnpm --filter @psico/api migrate:deploy` como paso previo, **nunca** encadenado con seed                                          |
| DEPENDENCIES   | postgres, redis                                                                                                                    |
| PERSISTENCE    | ninguna                                                                                                                            |

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

`production` replicará la forma con recursos **separados**. Ningún recurso con
estado se comparte entre entornos.

---

## 10 · Dominios

| entorno    | dominio                 | notas                                                                                                                                                          |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| production | `feelverse.app`         | canónico                                                                                                                                                       |
| production | `www.feelverse.app`     | redirección al canónico                                                                                                                                        |
| staging    | `staging.feelverse.app` |                                                                                                                                                                |
| —          | `api.feelverse.app`     | **no se crea**: la web habla con la API por la red privada. Se creará sólo si el móvil u otro cliente externo lo exige, y entonces con su propia justificación |

Sin wildcard.

---

## 11 · Inventario de secretos (sólo nombres)

Scope propuesto: el más estrecho que funcione. `PROJECT` para lo que comparten los
dos entornos y no cambia entre ellos; `ENVIRONMENT` para todo lo que difiere;
`RESOURCE` cuando sólo un recurso lo necesita.

### API y worker

| VARIABLE                                                                                               | COMPONENT   | PLATAFORMA HOY        | BUILD/RUNTIME | SECRET        | STAGING | PROD | SCOPE                                     |
| ------------------------------------------------------------------------------------------------------ | ----------- | --------------------- | ------------- | ------------- | ------- | ---- | ----------------------------------------- |
| `DATABASE_URL`                                                                                         | api, worker | Railway               | runtime       | sí            | sí      | sí   | ENVIRONMENT                               |
| `REDIS_URL`                                                                                            | api, worker | Railway               | runtime       | sí            | sí      | sí   | ENVIRONMENT                               |
| `JWT_SECRET`                                                                                           | api         | Railway               | runtime       | sí            | sí      | sí   | ENVIRONMENT                               |
| `PSICO_ENV`                                                                                            | api, worker | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `APP_URL`                                                                                              | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `ALLOWED_ORIGINS`                                                                                      | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `PORT`                                                                                                 | api         | inyectada por Railway | runtime       | no            | sí      | sí   | RESOURCE                                  |
| `NODE_ENV`                                                                                             | api, worker | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`                          | api         | Railway               | runtime       | sí (3 de 4)   | sí      | sí   | ENVIRONMENT (bucket distinto por entorno) |
| `R2_PUBLIC_URL`                                                                                        | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`                                                                  | api, worker | Railway               | runtime       | sí            | sí      | sí   | PROJECT                                   |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                           | api         | Railway               | runtime       | sí            | sí      | sí   | ENVIRONMENT (claves de test en staging)   |
| `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`, `STRIPE_B2B_PRICE_ID`                     | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                         | api, worker | Railway               | runtime       | sí / no       | sí      | sí   | ENVIRONMENT                               |
| `GOOGLE_CLIENT_ID`                                                                                     | api         | Railway               | runtime       | no            | sí      | sí   | PROJECT                                   |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                               | api, worker | Railway               | runtime       | sí (privada)  | sí      | sí   | ENVIRONMENT                               |
| `VOICE_PROVIDER`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`                                                 | api         | Railway               | runtime       | sí (claves)   | sí      | sí   | PROJECT                                   |
| `VIDEO_PROVIDER`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`                              | api         | Railway               | runtime       | sí (2)        | sí      | sí   | ENVIRONMENT                               |
| `CLOUDFLARE_STREAM_*` (4)                                                                              | api         | Railway               | runtime       | sí (token)    | sí      | sí   | ENVIRONMENT                               |
| `SENTRY_DSN`, `SENTRY_RELEASE`                                                                         | api, worker | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `CLIENT_ATTESTATION_SECRET`                                                                            | api, web    | Railway + Vercel      | runtime       | sí            | sí      | sí   | ENVIRONMENT                               |
| `CIRCLES_ROLLOUT_MODE`, `CIRCLES_GROUPS`, `CIRCLES_PILOT_USER_IDS`, `CIRCLES_SHARED_DATA_KEY_V1`       | api         | Railway               | runtime       | sí (la clave) | sí      | sí   | ENVIRONMENT                               |
| `GUIDE_ROLLOUT_MODE`, `GUIDE_PILOT_USER_IDS`                                                           | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `EMOTIONAL_MAP_*` (9 flags)                                                                            | api, worker | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `CONTENT_RESONANCE`                                                                                    | api         | Railway               | runtime       | no            | sí      | sí   | ENVIRONMENT                               |
| `DEFAULT_PAYMENT_PROVIDER`, `AI_MAX_CONTEXT_CHUNKS`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | api         | Railway               | runtime       | no            | sí      | sí   | PROJECT                                   |

### Web

| VARIABLE                                               | BUILD/RUNTIME | SECRET | SCOPE       | nota                                            |
| ------------------------------------------------------ | ------------- | ------ | ----------- | ----------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                                  | **build**     | no     | ENVIRONMENT | se hornea en el bundle: cambiarla exige rebuild |
| `NEXT_PUBLIC_APP_URL`                                  | **build**     | no     | ENVIRONMENT | ídem                                            |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`                         | **build**     | no     | PROJECT     | ídem                                            |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`                         | **build**     | no     | ENVIRONMENT | ídem                                            |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_RELEASE` | **build**     | no     | ENVIRONMENT | ídem                                            |
| `SENTRY_DSN`, `SENTRY_RELEASE`                         | runtime       | no     | ENVIRONMENT | lado servidor                                   |
| `CLIENT_ATTESTATION_SECRET`                            | runtime       | **sí** | ENVIRONMENT | route handlers de Círculos                      |

**Advertencia operativa:** las siete `NEXT_PUBLIC_*` son de **build**, no de
runtime. En Vercel eso se resolvía solo porque cada deploy reconstruye. En Coolify,
cambiar una de ellas sin reconstruir no tiene efecto, y ese es un error fácil de
cometer y difícil de ver.

Nunca se imprimen valores.

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

No se ponen números inventados.

| recurso  | estado                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api      | **MEASURE** — arranca Nest completo con 11 módulos; hay que medir                                                                                                                              |
| worker   | **MEASURE**                                                                                                                                                                                    |
| web      | **MEASURE** — Next 14 SSR                                                                                                                                                                      |
| postgres | **KNOWN** como punto de partida: el Postgres de staging del vecino en este mismo host corre con `2g` de memoria, `512m` de reserva y `2` CPU, y está sano. Se replica y se ajusta con medición |
| redis    | **KNOWN**: cache y colas pequeñas; conservador basta                                                                                                                                           |

Un aviso sobre la medición: `is_metrics_enabled: false` y `is_sentinel_enabled: true`
con 7 días de historia. O sea que hoy no se puede leer CPU/RAM del host por la API de
Coolify. Tomar los números de producción exigirá habilitar métricas o mirar el host,
y eso es una decisión de infraestructura que no entra en esta tarea.

Staging puede empezar sin límites estrictos y medirse; producción no se abre sin
números tomados de staging.

---

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
