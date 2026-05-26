# ADR 0008 — Rate limiting + Idempotency + OpenAPI-driven client codegen

**Fecha:** 2026-05-25
**Estado:** Aceptado
**Autores:** Jorge Quizamanchuro
**Sprint:** 0.B

---

## Contexto

Sprint 0.A dejó la API con su contrato unificado (global prefix, OpenAPI spec, error envelope) y la Swagger UI funcionando. Sin embargo, la plataforma todavía era **insegura por defecto** y **propensa a drift** entre back y front:

1. **Sin rate limiting.** Cualquier IP podía martillar `/auth/login` con dictionary attacks. Eco (cuando exista) podía quemar la cuota de Anthropic por usuario malicioso.
2. **Sin idempotency.** Un retry de cliente en `/billing/checkout-session` por network glitch creaba **dos** Stripe sessions, una dejada huérfana. En `/diario/entries` creaba dos entradas duplicadas.
3. **OpenAPI spec se generaba pero nadie la consumía.** El cliente HTTP del front se escribía a mano (`apiFetch<AuthResponse>("/auth/login", ...)`), con riesgo de drift contra los DTOs reales.

Sprint 0.B resuelve los tres en una sola pieza coherente que comparte la infraestructura Redis.

---

## Decisiones

### A — Storage Redis para counters y cache transversal

Necesitamos un mismo store distribuido para:

- Counters del throttler (60 req/min/user).
- Cache de respuestas idempotentes (24h TTL).
- (Sprints futuros) sesiones de SSE, locks de booking, cache de queries pesadas.

Una sola dependencia operacional: **Redis** (Upstash en Railway prod).

**Estrategia "agnóstico al proveedor":** el `RedisModule` provee un cliente `ioredis` vía DI token `REDIS_CLIENT`. En producción se conecta a la URL real. En dev/test, si `REDIS_URL` no está seteada, **cae a `ioredis-mock`** — implementa la misma API in-memory. El código de aplicación no distingue.

**Validación cruzada:** `envSchema.superRefine` exige `REDIS_URL` cuando `NODE_ENV === "production"`. Boot en prod sin Redis falla rápido en lugar de degradar silenciosamente.

```ts
// En cualquier service que necesite Redis:
constructor(@Inject(REDIS_CLIENT) private readonly redis: IoRedis) {}
```

### B — Rate limiting con `@nestjs/throttler` + storage Redis custom

Implementamos `RedisThrottlerStorage` que cumple la interfaz `ThrottlerStorage` con un **script Lua atómico**:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = current > limit and 1 or 0
return { current, ttl, blocked, blockTtl }
```

**Por qué Lua:** garantiza que `INCR + EXPIRE` ocurran sin race window. Sin Lua, dos requests concurrentes en la primera entrada de la ventana podrían cada uno hacer INCR (resultando 2) y luego cada uno EXPIRE (reseteando el TTL). El script lo resuelve en un round-trip atómico.

**Estrategia de declaración:** UN throttler global (`default: 60/min`) + overrides per-handler con `@Throttle({ default: { limit, ttl } })`.

```ts
@Post("login")
@Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
login(...) { ... }
```

**Por qué NO declarar múltiples throttlers nombrados globalmente:** `@nestjs/throttler` v6 aplica **todos** los throttlers a **todos** los handlers por defecto. Si declarábamos `eco-free: 10/día`, hubiera bloqueado también `/auth/login` después de 10 logins por 24 horas. El bug salió en el smoke test del sprint (request #2 disparaba 429 porque `patrones-regenerate: 1/día` aplicaba a todo).

**Excepciones:** `@SkipThrottle()` opta out completamente. Aplicado al `HealthController` para no banear a Railway/UptimeRobot que pingean cada 30s.

**Reglas objetivo (declaradas en handlers en sprints futuros):**

| Endpoint                                       | Sprint | Throttle        |
| ---------------------------------------------- | ------ | --------------- |
| POST `/api/auth/login`                         | S1     | 5 / 15 min / IP |
| POST `/api/auth/forgot-password`               | S2     | 3 / hora / IP   |
| POST `/api/eco/messages` (free)                | S9     | 10 / día / user |
| POST `/api/eco/messages` (pro)                 | S9     | 30 / min / user |
| POST `/api/voz/transcribe`                     | S8     | 5 / min / user  |
| POST `/api/patrones/weekly-summary/regenerate` | S10    | 1 / día / user  |

### C — Idempotency global con decorator opt-in

Interceptor global `IdempotencyInterceptor` se aplica a todos los handlers, pero **solo actúa** si el handler está marcado con `@Idempotent()`.

**Algoritmo:**

```
request POST /api/diario/entries
    Idempotency-Key: 01234567-89ab-...

    │
    ├─ handler tiene @Idempotent()? ─── no ──► passthrough
    │
    ├─ header ausente? ─── sí ──► 400 MISSING_IDEMPOTENCY_KEY
    │
    ├─ formato inválido (regex)? ─── sí ──► 400 INVALID_IDEMPOTENCY_KEY
    │
    ├─ Redis GET `idemp:<userId>:<route>:<key>`
    │     │
    │     ├─ hit ──► response.setHeader("Idempotency-Replay","true")
    │     │         return cached body con el status original
    │     │
    │     └─ miss ──► next.handle() pipe(tap(body → SETEX cacheKey ttl payload))
    │                              return body
```

**Decisiones de diseño explícitas:**

1. **Clave compuesta:** `idemp:<userId>:<route>:<key>`. Por qué:
   - userId aísla usuarios (mismo UUID de dos clientes ≠ colisión).
   - route aísla endpoints (un cliente podría reusar la misma key en distintos POSTs sin pretender que sean lo mismo).
2. **Solo 2xx se cachean.** Errores no — un 500 transitorio no debe trampar al cliente en un loop.
3. **Cache fire-and-forget en el `SET`.** No bloqueamos la respuesta esperando confirmación del cache. Worst case: retry dentro de 1ms re-ejecuta el handler. Aceptable.
4. **Header obligatorio en `@Idempotent` handlers.** Fallar 400 explícito en lugar de degradar a "no idempotente silencioso" — el contrato es claro.
5. **Validación de formato del key.** Regex `/^[a-zA-Z0-9_-]{16,128}$/` — acepta UUID v4/v7 y variantes URL-safe.

**Dónde aplicar `@Idempotent` (sprints futuros):**

| Endpoint                             | Sprint | Por qué                                     |
| ------------------------------------ | ------ | ------------------------------------------- |
| POST `/api/billing/checkout-session` | S11    | Evita dos Stripe sessions huérfanas         |
| POST `/api/terapia/bookings`         | S15    | Evita doble cobro + lock duplicado de slot  |
| POST `/api/diario/entries`           | S7     | Evita entradas duplicadas en autosave flaky |
| POST `/api/eco/messages`             | S9     | Evita duplicar consumo de cuota Anthropic   |

**Dónde NO aplicar:**

- `POST /api/auth/login` — cada llamada debe emitir tokens frescos.
- Métodos `PUT/PATCH/DELETE` — semánticamente idempotentes ya (HTTP spec).
- `GET` — no tienen side effects.

### D — OpenAPI como source of truth para el cliente del front

Pipeline en 3 pasos:

```
   apps/api/src/**/*.controller.ts
       │
       │ (Swagger introspecta @ApiTags, @ApiOperation, DTOs)
       ▼
   apps/api/openapi.json        ← emitido en cada boot dev
       │
       │ (openapi-typescript)
       ▼
   packages/api-client/src/generated.ts
       │
       │ (re-export desde packages/api-client/src/index.ts)
       ▼
   apps/web + apps/mobile  ← consumen tipos generados
```

**Script:** `packages/api-client/scripts/generate.mjs` con dos modos:

- default (`pnpm --filter @psico/api-client generate`) — sobrescribe `generated.ts`.
- `--check` (`generate:check`) — falla si el output diferiría del archivo actual. Lo usa CI.

**CI workflow `.github/workflows/openapi-diff.yml`:**

1. Boota la API con env stubs → emite `openapi.json`.
2. Corre `generate:check`.
3. Si el archivo committeado no coincide, falla la PR con el mensaje:
   > DRIFT detected. Run `pnpm --filter @psico/api-client generate` and commit the result.

**Por qué esto importa:** sin este CI, un cambio en `RegisterDto` que añade un campo se mergea, el back lo expone, el front sigue con el shape viejo, y un dev se rompe el día buscando por qué `client.register({...})` falla silenciosamente. Con el CI, **la PR no se mergea** hasta que el cliente esté regenerado.

---

## Diagrama de la pila completa

```
┌─────────────────────────────────────────────────────────────────────┐
│ HTTP request                                                        │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ThrottlerGuard (APP_GUARD)                                          │
│   ├── lee IP + userId del request                                   │
│   ├── llama RedisThrottlerStorage.increment()                       │
│   │   └─→ EVAL lua atómico en Redis: INCR + PEXPIRE                 │
│   └── si totalHits > limit → 429 RATE_LIMIT_EXCEEDED                │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ValidationPipe                                                      │
│   ├── class-validator sobre el DTO                                  │
│   └── si inválido → 400 VALIDATION_ERROR                            │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ JwtAuthGuard (handler-level)                                        │
│   └── si token inválido → 401 UNAUTHORIZED                          │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IdempotencyInterceptor (APP_INTERCEPTOR)                            │
│   ├── handler tiene @Idempotent()?                                  │
│   ├── lee header Idempotency-Key                                    │
│   ├── GET Redis idemp:<userId>:<route>:<key>                        │
│   ├── HIT → return cached body con header Idempotency-Replay        │
│   └── MISS → next.handle().tap(body → SETEX cacheKey ttl payload)   │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Controller handler (business logic)                                 │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼ throws → HttpExceptionFilter envuelve a JSON envelope
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HTTP response                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Consecuencias

### Positivas

- **Seguridad por defecto.** Cualquier endpoint nuevo nace con 60/min. El dev solo se ocupa de overrides cuando el caso lo amerita.
- **Idempotency lista para producción.** Stripe y Daily.co aceptan que los reintentos sean seguros. El interceptor es transparente — solo agregar `@Idempotent()` al handler.
- **Storage compartido.** Si mañana agregamos pub/sub (SSE notifications), session cache, distributed locks — todo va al mismo Redis.
- **Cero drift back↔front garantizado por CI.** El día que olvidemos regenerar el cliente, la PR falla.
- **Tests sin Redis real.** `ioredis-mock` permite correr 140 tests en ~3s sin levantar contenedores.
- **Deploy a Railway gradual.** El código está agnóstico al proveedor. Cuando provisiones Upstash, basta con setear `REDIS_URL=rediss://...` en Railway → el `if (url)` en `createRedisClient` toma el path real.

### Negativas / trade-offs

- **Latency added per request.** Throttler hace 1 round-trip a Redis siempre. En Upstash (mismo región Railway) son ~2-5ms. Aceptable para un API que ya tiene latencia de Postgres.
- **Dev sin Redis pierde counters al restart.** En mock in-memory, reiniciar el proceso resetea el throttler. Aceptable en dev — y el warning de boot lo dice explícitamente.
- **Idempotency-Key obligatorio rompe clientes viejos.** Si publicamos un endpoint @Idempotent y un cliente legacy no envía el header, recibe 400. Mitigación: marcar el endpoint como @Idempotent solo cuando todos los clientes ya envían el header (web + mobile actualizados en lockstep con el sprint).
- **`generate:check` en CI requiere boot del API.** Eso añade ~30s al pipeline. Aceptable.
- **`generated.ts` se commitea.** ~30 KB hoy, crecerá. Esto es deliberado: queremos diff revisables en PRs y queremos que el typecheck no dependa de un build step previo. Trade-off típico de monorepos.
- **`@nestjs/throttler` v6 named throttlers son footgun.** Nuestra ADR los rechaza globalmente; un dev nuevo podría intentar declararlos. Documentado en el comentario del módulo.

---

## Alternativas descartadas

| Alternativa                                                 | Por qué descartada                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Rate limiting en Nginx/Cloudflare                           | Funciona para IP-based DDoS pero no para per-user quotas (Eco free vs pro). Necesitamos lógica de aplicación.          |
| `@nestjs/throttler` con storage in-memory                   | Reset al restart. Per-proceso si Railway escala. Documentado como "no es producción" en el propio README de Throttler. |
| `nestjs-throttler-storage-redis` (paquete community)        | Mantenimiento incierto. La interface storage es trivial (1 método). Mejor ownership directo.                           |
| BullMQ rate limiter                                         | Excelente para rate limit de jobs, no de HTTP handlers.                                                                |
| Idempotency a nivel de aplicación (no interceptor)          | Cada handler implementaría el mismo patrón. Drift garantizado. Interceptor centraliza.                                 |
| Idempotency con DB Postgres en lugar de Redis               | TTL nativo de Redis es lo correcto. Postgres requeriría un job de cleanup.                                             |
| Cliente HTTP a mano                                         | Lo descartamos en Sprint 0.A. Sprint 0.B cierra el ciclo agregando codegen.                                            |
| `openapi-generator` (Java) en lugar de `openapi-typescript` | Bloquea CI por la JVM. `openapi-typescript` es ~30 lines de output predecible, suficiente.                             |

---

## Verificación

```bash
# Tests (140 — baseline 125 + 15 nuevos)
pnpm --filter @psico/api test

# Typecheck
pnpm --filter @psico/api typecheck

# Smoke test del throttler
cd apps/api && node dist/main &
sleep 4
# /health × N → 200 (excluido)
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health; done
# /api/auth/register × 65 → primer 429 en request #61
for i in $(seq 1 65); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/auth/register -d '{}' -H "Content-Type: application/json")
  [ "$STATUS" = "429" ] && echo "First 429 at #$i" && break
done

# Pipeline OpenAPI → cliente
pnpm --filter @psico/api-client generate         # escribe generated.ts
pnpm --filter @psico/api-client generate:check   # OK si está sync
```

---

## Referencias

- [@nestjs/throttler v6 docs](https://docs.nestjs.com/security/rate-limiting)
- [Stripe Idempotency Keys](https://stripe.com/docs/api/idempotent_requests)
- [openapi-typescript](https://openapi-ts.dev/)
- [Redis EVAL — atomic Lua scripts](https://redis.io/docs/latest/develop/interact/programmability/eval-intro/)
- [Upstash Redis on Railway](https://upstash.com/docs/redis/integrations/railway)
- [IMPLEMENTATION_PLAN_v2.md §2 — decisiones transversales](../../IMPLEMENTATION_PLAN_v2.md)
- Bitácora del sprint: [`docs/informes/sprint-0b.md`](../informes/sprint-0b.md)
