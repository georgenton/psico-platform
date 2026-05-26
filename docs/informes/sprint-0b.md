# Bitácora · Sprint 0.B — Rate limiting + Idempotency + OpenAPI codegen

**Fecha:** 2026-05-25
**Sprint:** 0.B (segundo y último de Fundamentos)
**Rama:** `feature/sprint-0b-rate-limit-idempotency`
**Estado:** ✅ Completado — tests 140/140 · build verde · smoke test ratificó dos bugs reales del setup inicial · pipeline OpenAPI→cliente operativo
**ADR producido:** [0008 — Rate limiting + Idempotency + OpenAPI codegen](../adr/0008-rate-limiting-idempotency-openapi-codegen.md)

---

## 1. Por qué este sprint existe

Sprint 0.A dejó la API con su esqueleto contractual completo (`/api/*`, OpenAPI, error envelope). Pero un esqueleto sin defensas no es producción:

| Sin Sprint 0.B      | Consecuencia real                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sin rate limiting   | Un atacante puede correr `hydra` contra `/api/auth/login` sin frenos. Una racha de 10k requests por minuto se sirve completa.                    |
| Sin idempotency     | Un retry en `/billing/checkout-session` por glitch de red crea **dos** Stripe sessions. La huérfana queda colgando en el dashboard de Stripe.    |
| Cliente HTTP a mano | El día que el back cambia `RegisterDto.name` → `RegisterDto.firstName`, el front compila feliz porque su tipo está hardcoded. Bug en producción. |

Las tres se resuelven aprovechando que **ya teníamos OpenAPI** (de 0.A) y **agregando Redis como única dependencia operacional nueva**. El mismo Redis sirve a throttler, idempotency cache, y cualquier necesidad futura (SSE, locks, sessions).

### Concepto pedagógico: "infraestructura compartida vs accidental complexity"

Hay una tentación al diseñar APIs de añadir una solución por problema:

- Rate limit → en Nginx
- Idempotency → en cada handler con lógica casera
- Codegen → un script ad-hoc por feature

Cada elección es localmente razonable. Globalmente terminas con **8 piezas de infra** que requieren mantenimiento independiente.

La alternativa madura: identifica el **denominador común** (en este caso: necesito un store distribuido con TTL) y consolida. Redis sirve a los tres casos de Sprint 0.B y a varios futuros (Sprint S6 lo usa para SSE pub/sub, S15 para slot locking, S24 para snapshots cache). Una sola infra, ownership compartido, observabilidad unificada.

---

## 2. Arquitectura final

### 2.1 Pipeline de procesamiento de un request post-Sprint 0.B

```mermaid
flowchart TB
    A[HTTP Request] --> B[ThrottlerGuard<br/>APP_GUARD]
    B -->|hits 60/min| C{Skip?<br/>@SkipThrottle}
    C -->|yes - /health| H[Handler]
    C -->|no| D[RedisThrottlerStorage]
    D -->|EVAL lua: INCR + PEXPIRE| R1[(Redis<br/>throttle:user-1:default)]
    D -->|over limit| Z429[429 RATE_LIMIT_EXCEEDED]
    D -->|ok| E[ValidationPipe<br/>class-validator]
    E -->|invalid| Z400[400 VALIDATION_ERROR]
    E -->|ok| F[JwtAuthGuard]
    F -->|invalid| Z401[401 UNAUTHORIZED]
    F -->|ok| G[IdempotencyInterceptor<br/>APP_INTERCEPTOR]
    G -->|handler not @Idempotent| H
    G -->|@Idempotent + no key| Z400b[400 MISSING_IDEMPOTENCY_KEY]
    G -->|@Idempotent + key present| K{Cache?}
    K -->|GET idemp:userId:route:key| R2[(Redis<br/>idemp:user-1:POST:/api/diario/entries:UUID)]
    K -->|HIT| RP[Return cached body<br/>+ Idempotency-Replay header]
    K -->|MISS| H
    H -->|throws| F2[HttpExceptionFilter]
    H -->|2xx + @Idempotent| W[SETEX cacheKey 86400 body]
    W --> RR[Response]
    F2 --> RR
    RP --> RR

    style Z429 fill:#ffcdd2
    style Z400 fill:#ffcdd2
    style Z401 fill:#ffcdd2
    style Z400b fill:#ffcdd2
    style R1 fill:#fff3e0
    style R2 fill:#fff3e0
    style H fill:#c8e6c9
    style RP fill:#e1bee7
```

### 2.2 Pipeline de codegen OpenAPI → cliente front

```mermaid
flowchart LR
    subgraph back["apps/api/"]
        C1[auth.controller.ts<br/>@ApiTags @ApiOperation]
        C2[users.controller.ts]
        C3[content/books.controller.ts]
        SW[SwaggerModule.createDocument]
        OJ[openapi.json<br/>persisted on boot]

        C1 --> SW
        C2 --> SW
        C3 --> SW
        SW --> OJ
    end

    subgraph client["packages/api-client/"]
        SC[scripts/generate.mjs]
        GN[src/generated.ts<br/>auto-generated, committed]
        IX[src/index.ts<br/>re-exports paths, components]

        OJ --> SC
        SC -->|openapi-typescript| GN
        GN --> IX
    end

    subgraph fronts["apps/web + apps/mobile"]
        WC[lib/api.ts]
        MC[context/auth.tsx]
        IX --> WC
        IX --> MC
    end

    subgraph ci["CI"]
        DC[openapi-diff.yml]
        OJ -.->|boot API in CI| DC
        DC -->|generate:check| GN
        DC -->|fail if drift| ERR[❌ PR blocked]
    end

    style OJ fill:#fff3e0
    style GN fill:#c8e6c9
    style ERR fill:#ffcdd2
```

### 2.3 Storage abstracto, infra concreta

```mermaid
flowchart TB
    AC[Application code:<br/>Services, Interceptors, Guards]
    AC -->|@Inject REDIS_CLIENT| IF[IoRedis interface]

    subgraph prod["NODE_ENV=production"]
        IF -.->|REDIS_URL set| IORedis[ioredis client]
        IORedis -->|TLS rediss://| UP[(Upstash Redis<br/>on Railway)]
    end

    subgraph dev["NODE_ENV=dev/test, REDIS_URL unset"]
        IF -.->|fallback| MK[ioredis-mock]
        MK -->|in-memory Map| MM[(JS Map)]
    end

    EV[envSchema.superRefine<br/>blocks prod boot if REDIS_URL missing] -.->|enforces| prod

    style UP fill:#d1c4e9
    style MM fill:#fff3e0
    style EV fill:#ffe0b2
```

---

## 3. Lo que se construyó · paso a paso

### 3.1 Dependencias

| Paquete                   | Versión      | Workspace           | Para                              |
| ------------------------- | ------------ | ------------------- | --------------------------------- |
| `@nestjs-modules/ioredis` | 2.2.1        | `@psico/api`        | Wrapper Nest del cliente Redis    |
| `ioredis`                 | 5.10.1       | `@psico/api`        | Cliente Redis principal           |
| `ioredis-mock`            | 8.13.1 (dev) | `@psico/api`        | Mock para tests y dev sin Redis   |
| `openapi-typescript`      | 7.13.0 (dev) | `@psico/api-client` | Codegen del cliente desde OpenAPI |

### 3.2 Nuevos directorios

```
apps/api/src/
├── redis/                                  ← NUEVO
│   ├── redis.module.ts                     ← factory + RedisModule global
│   ├── redis.module.spec.ts                ← 3 tests
│   └── index.ts
└── shared/
    ├── decorators/
    │   └── idempotent.decorator.ts         ← NUEVO @Idempotent()
    ├── interceptors/                       ← NUEVO subdir
    │   ├── idempotency.interceptor.ts      ← APP_INTERCEPTOR
    │   └── idempotency.interceptor.spec.ts ← 7 tests
    └── throttler/                          ← NUEVO subdir
        ├── redis-throttler.storage.ts      ← Lua script atómico
        ├── redis-throttler.storage.spec.ts ← 5 tests
        └── throttler.module.ts             ← AppThrottlerModule global

packages/api-client/
├── scripts/
│   └── generate.mjs                        ← NUEVO codegen
└── src/
    └── generated.ts                        ← AUTO-generado (30.8 KB)

.github/workflows/
└── openapi-diff.yml                        ← NUEVO CI workflow

docs/
├── adr/
│   └── 0008-rate-limiting-idempotency-openapi-codegen.md  ← ADR
└── informes/
    └── sprint-0b.md                        ← este archivo
```

### 3.3 Cambios en archivos existentes

| Archivo                                    | Cambio                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `apps/api/src/config/env.schema.ts`        | `REDIS_URL` opcional + `superRefine` que lo exige en `production`                                  |
| `apps/api/src/app.module.ts`               | Imports `RedisModule`, `AppThrottlerModule`, `IdempotencyInterceptor` global                       |
| `apps/api/src/health/health.controller.ts` | `@SkipThrottle()` clase-level                                                                      |
| `apps/api/src/shared/index.ts`             | Re-export de `Idempotent`, `IdempotencyInterceptor`, `AppThrottlerModule`, `RedisThrottlerStorage` |
| `apps/api/package.json`                    | +3 deps                                                                                            |
| `packages/api-client/package.json`         | +script `generate` + `generate:check`                                                              |
| `packages/api-client/src/index.ts`         | Re-export de `paths`, `components`, `operations` desde `generated.ts`                              |

---

## 4. Verificación · qué probamos y cómo

### 4.1 Suite de tests

```
src/shared/throttler/redis-throttler.storage.spec.ts        5 tests   ✅
src/shared/interceptors/idempotency.interceptor.spec.ts     7 tests   ✅
src/redis/redis.module.spec.ts                              3 tests   ✅
... (resto sin cambios)                                   125 tests   ✅
─────────────────────────────────────────────────────────────────────
TOTAL                                                     140 tests   ✅
```

Delta vs Sprint 0.A: **+15 tests** (5 throttler + 7 idempotency + 3 redis).

### 4.2 Smoke test del bootstrap real

```bash
# Boot del API con env stubs (sin REDIS_URL → cae a mock)
node dist/main &

# /health × 5 → todos 200 (SkipThrottle aplicado)
for i in 1..5; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3099/health
# 200 200 200 200 200

# /api/auth/register × 65 → primer 429 en request #61 (limite default 60/min)
# (la #61 supera y el storage devuelve isBlocked=true)

# Envelope del 429:
# {"statusCode":429,"code":"RATE_LIMIT_EXCEEDED","message":"ThrottlerException: Too Many Requests","timestamp":"...","path":"/api/auth/register"}
```

### 4.3 Pipeline codegen verificado

```bash
ls -la apps/api/openapi.json
# -rw-r--r-- 20923 bytes  (33 endpoints documentados)

pnpm --filter @psico/api-client generate
# [generate] Wrote .../generated.ts (30.8 KB)

pnpm --filter @psico/api-client generate:check
# [generate:check] OK — generated.ts is up to date.
```

---

## 5. Bugs encontrados y corregidos durante el sprint

### 5.1 Bug crítico de Throttler — named throttlers aplican globalmente

**Síntoma:** primer 429 disparaba en request **#2** de `/api/auth/register`. Esperaba que disparara en #61 (default 60/min).

**Causa raíz:** declaré 7 throttlers nombrados al inicio (`default`, `auth-login`, `eco-free`, `voz-transcribe`, `patrones-regenerate`, etc.). `@nestjs/throttler` v6 **aplica TODOS los throttlers nombrados a TODOS los handlers** salvo que cada handler use `@SkipThrottle({ name: true })` para opt-out. El throttler `patrones-regenerate: 1/día` bloqueaba todo después de la primera request por 24 horas.

**Fix:** UN throttler global (`default`). Los límites específicos se aplican per-handler con `@Throttle({ default: { limit, ttl } })` cuando el sprint correspondiente lo declare. ADR 0008 lo documenta y los handlers futuros tienen la tabla de referencia.

**Lección pedagógica:** **librerías populares de NestJS tienen footguns no documentados.** El comportamiento "todos aplican a todos" es razonable como default pero contraintuitivo cuando declaras N throttlers pensando que solo el más laxo aplicaría a un endpoint dado. Smoke test salva.

### 5.2 Bug crítico de Health — incluido en el throttler global

**Síntoma:** después del bug 5.1, las 5 requests a `/health` que se hacían antes consumían el budget global (que ya estaba bajísimo). Resultado: external monitors recibían 429 después del segundo ping.

**Causa raíz:** `@SkipThrottle()` se necesita aplicar explícitamente. El `setGlobalPrefix({ exclude })` solo afecta el PREFIJO de URL, no la pipeline de guards.

**Fix:** `@SkipThrottle()` clase-level en `HealthController`. Externals pueden pingear sin frenos.

**Lección pedagógica:** **exclusión de prefix ≠ exclusión de middleware/guards.** Son orthogonal en NestJS. Cada concern transversal (prefix, throttle, validation, auth) tiene su propio mecanismo de skip.

### 5.3 Bug menor de DI — RedisThrottlerStorage construido sin DI

**Síntoma:** primera versión de `AppThrottlerModule` creaba `new RedisThrottlerStorage(undefined as never)` inline en el factory. El cliente Redis nunca se inyectaba.

**Fix:** factory recibe el `REDIS_CLIENT` por `inject`, construye `RedisThrottlerStorage` con el cliente real. Limpieza adicional: storage class ya no usa `@Inject` decorator — constructor toma el cliente directamente, lo que la hace **testeable en isolation** con `ioredis-mock`.

**Lección pedagógica:** **DI vs construcción directa son patrones legítimos según contexto.** Para clases que vives instanciando vía Nest factories (módulos que reciben deps por `inject`), la construcción manual es más limpia que mezclar @Inject con factory params.

### 5.4 Test failing por ConfigService no resoluble

**Síntoma:** `redis.module.spec.ts` usando `Test.createTestingModule` con `overrideProvider(ConfigService)` fallaba con "Cannot resolve dependency ConfigService".

**Causa raíz:** `RedisModule` no importa `ConfigModule`. En producción funciona porque `ConfigModule.forRoot({isGlobal: true})` en `AppModule` lo expone globalmente. En el test aislado, ese global no existe.

**Fix:** extraje el factory como función pura `createRedisClient(config)` exportada desde el módulo. Tests llaman la función directamente con un mock — sin Nest involucrado. **Patrón aplicable a cualquier factory:** si lo extraes, test = `factory(mockDeps)`. Una línea.

**Lección pedagógica:** **prefiere funciones puras testables a magia de DI cuando el dep es simple.** El `createRedisClient` es ahora más fácil de testear, más fácil de entender, y se puede compartir si algún día tenemos otro RedisModule (worker process, por ejemplo).

---

## 6. Conceptos clave aprendidos en este sprint

### 6.1 `APP_GUARD` y `APP_INTERCEPTOR` — providers especiales de NestJS

NestJS expone dos tokens mágicos en `@nestjs/core`:

- `APP_GUARD` — registra un `CanActivate` que se aplica a **todos los handlers** automáticamente.
- `APP_INTERCEPTOR` — idem para `NestInterceptor`.

Ventaja vs `app.useGlobalGuards()`: los providers globales **respetan DI** (pueden inyectar otros providers). `app.useGlobalGuards(new MyGuard())` recibe una instancia ya construida sin acceso a DI.

Ejemplo en este sprint:

```ts
@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },           // ThrottlerGuard inyecta ThrottlerStorage
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }, // inyecta REDIS_CLIENT + Reflector
  ],
})
```

Esto es **la única forma** de tener un interceptor global que use DI sin instanciarlo manualmente en `main.ts`.

### 6.2 Scripts Lua atómicos en Redis

Redis es single-threaded por command, pero ejecutar **dos commands seguidos no es atómico** desde el cliente. Tres conexiones pueden interleavear sus INCR y EXPIRE de forma impredecible.

Lua scripts se ejecutan **atómicamente**: Redis bloquea su event loop por la duración del script. Otros clients esperan. El throttler Lua script:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl, ... }
```

…ejecuta INCR + PEXPIRE + PTTL como una sola operación indivisible. Es **el patrón canónico** para counters con TTL en Redis. Compárenlo con el equivalente naive client-side:

```ts
const total = await redis.incr(key);
if (total === 1) await redis.expire(key, ttl); // ← race window aquí
const ttl = await redis.ttl(key); // ← y aquí
```

3 round-trips + race conditions. Lua: 1 round-trip + atómico.

### 6.3 OpenAPI-driven development

El patrón que cerramos en este sprint:

```
DTOs en código → @ApiOperation decorators → OpenAPI spec → openapi-typescript → tipos del cliente → typecheck del web/mobile
```

Es una versión local del patrón gRPC / Protocol Buffers, pero adaptado a REST + TypeScript. La propiedad clave: **el contrato se compila**. Si cambias un DTO en el back y olvidas regenerar el cliente, el CI te detiene.

Compárenlo con el flujo manual:

1. Dev del back cambia `RegisterDto.name` → `firstName`
2. Mergea
3. Dev del web sigue usando `{ name: "..." }`
4. Compila OK (typescript no sabe)
5. Tests pasan (mocks usan el shape viejo)
6. Producción rompe silenciosamente porque el back ignora el `name` y guarda `firstName: undefined`

Con codegen forzado por CI: el paso 2 (mergear) **no ocurre** hasta regenerar y arreglar el web.

### 6.4 Interceptor pattern con RxJS

NestJS interceptors envuelven la ejecución del handler con un `Observable`. El patrón estándar:

```ts
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  // 1. Pre-handler logic (read headers, check cache, etc.)
  return next.handle().pipe(
    // 2. Transformar / inspeccionar el body antes de enviarlo
    tap(body => cacheIt(body)),
    map(body => transformIt(body)),
    catchError(err => handleIt(err)),
  );
}
```

En este sprint usamos `from(...).pipe(switchMap(...))` para encadenar la operación async de Redis (cache lookup) **antes** de decidir si invocar `next.handle()`. Si hay HIT, `of(cachedBody)` reemplaza al handler entero — el flujo nunca ejecuta el método del controller. Si hay MISS, `next.handle().pipe(tap(...))` ejecuta el handler y aprovecha el body que produzca para cachearlo.

Esta composabilidad es por qué NestJS abraza RxJS para interceptors. Promesas no tienen `tap`, `catchError`, `switchMap` con la misma semántica.

### 6.5 Decorator opt-in vs opt-out

Dos estrategias para guards/interceptors globales:

| Opt-out                                                                | Opt-in                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Aplica a TODO por defecto. Handlers que NO lo quieran usan `@SkipX()`. | NO aplica a nada por defecto. Handlers que SÍ lo quieran usan `@X()`. |
| Throttler global.                                                      | Idempotency interceptor.                                              |

**Cuándo opt-out:** la regla es **mayoritariamente** la correcta. Throttler debe aplicar a todo — `/api/auth/login` SÍ necesita rate limit; `/health` es la excepción.

**Cuándo opt-in:** la regla es **minoritariamente** la correcta. Idempotency solo tiene sentido en ~5-10 endpoints (POSTs con side effects). Forzarla en todos generaría confusión sin valor.

Esta decisión la tomas **al definir el decorator**, no al usarlo. Los devs después solo siguen el patrón.

---

## 7. Métricas del sprint

| Métrica                             | Antes (post-0.A) | Después                                     | Delta |
| ----------------------------------- | ---------------- | ------------------------------------------- | ----- |
| Tests pasando                       | 125              | 140                                         | +15   |
| Archivos creados                    | —                | 13                                          | +13   |
| Archivos modificados                | —                | 7                                           | +7    |
| Dependencias agregadas              | —                | 4                                           | —     |
| ADRs nuevos                         | 6                | 7                                           | +1    |
| Endpoints protegidos con rate limit | 0                | 33 (default global)                         | +33   |
| Workflows CI nuevos                 | 4                | 5                                           | +1    |
| Líneas de OpenAPI spec generado     | 0                | ~750 (apps/api/openapi.json)                | —     |
| Líneas de cliente TS generado       | 0                | ~900 (packages/api-client/src/generated.ts) | —     |
| Bugs encontrados durante smoke test | —                | 4 (cf. §5)                                  | +4    |
| Tiempo total del sprint             | —                | ~3 horas de trabajo asistido                | —     |

---

## 8. Riesgos abiertos al cerrar el sprint

| Riesgo                                                      | Severidad | Mitigación                                                                                                                                                 |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstash no provisionado en Railway                          | Media     | Deploy a prod requiere `REDIS_URL`. El `superRefine` falla rápido si falta. Documentado como blocker para deploy.                                          |
| `generated.ts` se va a re-generar mil veces                 | Baja      | Aceptado. Los diffs son revisables. CI lo enforça.                                                                                                         |
| `Idempotency-Key` rompe clientes que no lo envían           | Baja      | Aún no aplicamos @Idempotent a ningún endpoint. Cuando lo apliquemos en S7/S11/S15, los clientes ya estarán actualizados en lockstep.                      |
| Smoke test del throttler corre solo localmente              | Media     | E2E test real en CI lo cerramos en Sprint S1 cuando agreguemos supertest.                                                                                  |
| `ioredis-mock` no implementa 100% de Redis                  | Baja      | Su soporte de scripts Lua es completo. Si en algún sprint usamos un comando exótico (CLUSTER, MEMORY), el test fallará y migraremos a un Redis real en CI. |
| Throttler usa IP como tracker — proxies pueden compartir IP | Media     | Sprint S1 agrega `X-Forwarded-For` parsing al throttler para identificar al cliente real detrás de Railway's load balancer.                                |

---

## 9. Qué sigue · Sprint S1

**Objetivo:** endurecer el AuthModule existente. **Sin endpoints nuevos** — preparar el terreno para los flujos de email del Sprint S2.

**Lo que entregará:**

- `@Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })` en `/api/auth/login`
- Tabla nueva `AuthEvent` (userId nullable, type, ip, userAgent, createdAt) para auditoría
- Audit logging en register/login/refresh/logout
- E2E test inicial con `supertest` (la base que faltó en 0.A/0.B)
- README del módulo Auth
- CHANGELOG Auth `1.1.0`
- ADR 0007 — E2E encryption (lo escribimos ahora porque S7 ya lo va a necesitar)
- Bitácora S1

**Decisión bloqueante:** ninguna. Sprint S1 es 100% mecánico.

---

## 10. Resumen para Notion

**Sprint 0.B · Rate limiting + Idempotency + OpenAPI codegen** ✅

- Redis como infra única para 3 features: throttler counters, idempotency cache, codegen (futuro: SSE, locks, sessions).
- Storage agnóstico al proveedor: `ioredis` en prod (Upstash via Railway), `ioredis-mock` en dev/test. `envSchema.superRefine` exige `REDIS_URL` en prod.
- Throttler: UN solo throttler global (`default: 60/min`) con storage Redis y script Lua atómico (INCR + PEXPIRE en 1 round-trip). Per-handler overrides con `@Throttle({...})`. `@SkipThrottle()` en `/health`.
- Idempotency: `@Idempotent()` decorator opt-in + `IdempotencyInterceptor` global. Cache key `idemp:<userId>:<route>:<key>` con TTL 24h. Fire-and-forget en el SET.
- OpenAPI codegen: `apps/api/openapi.json` → `openapi-typescript` → `packages/api-client/src/generated.ts` (committed). CI `openapi-diff.yml` bloquea PRs con drift.
- Tests 140/140 ✅ (baseline 125 + 15 nuevos).
- Smoke test del bootstrap encontró y corrigió **4 bugs reales** (footguns de @nestjs/throttler v6, exclusión de prefix ≠ skip throttle, DI inline mal armado, ConfigService no resoluble en tests aislados).
- ADR 0008 documentado. Bitácora con diagramas Mermaid en `docs/informes/sprint-0b.md`.

**Próximo:** Sprint S1 — AuthModule audit + throttle + E2E test inicial.
