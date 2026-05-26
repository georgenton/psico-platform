# ADR 0010 — BullMQ workers: mismo codebase, servicio Railway separado

**Fecha:** 2026-05-26
**Estado:** Aceptado
**Autores:** Jorge Quizamanchuro
**Sprint:** S3

---

## Contexto

A partir de S3 necesitamos ejecutar trabajo asíncrono que no es seguro hacer in-process del API:

| Job                                  | Por qué necesita worker                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Email (transactional)                | Resend latency ~500ms; retries en transient failures; jobs persisten cross-deploy                         |
| Data export                          | Genera JSON, sube a R2, ~10-30s. No queremos bloquear el response del POST.                               |
| Account deletion                     | Delayed 30 días desde el request. Imposible "fire-and-forget" — el proceso muere mil veces en ese tiempo. |
| (Futuro S10) Weekly Patrones summary | Anthropic call, ~30s; programado                                                                          |
| (Futuro S24) Pulso snapshots         | Nightly aggregation jobs                                                                                  |
| (Futuro S8) Voz transcribe           | Whisper API; CPU-bound                                                                                    |

Cada job comparte tres necesidades:

- Persistencia (sobrevivir a un crash del proceso).
- Retries con backoff exponencial.
- Aislamiento de la pipeline HTTP del API.

**BullMQ** sobre Redis cumple las tres. La decisión arquitectónica restante es **cómo organizar el código** del worker.

---

## Decisión

**Mismo codebase, dos entry points, dos servicios Railway.**

```
apps/api/
├── src/
│   ├── main.ts          ← HTTP server (NestFactory.create)
│   ├── worker.ts        ← Worker process (NestFactory.createApplicationContext)
│   ├── app.module.ts    ← API: controllers + interceptors + throttler
│   ├── jobs/
│   │   ├── worker.module.ts        ← Worker: NO controllers, sí procesadores
│   │   ├── jobs.service.ts         ← Producer (enqueue) — usado por el API
│   │   ├── queue-names.ts          ← Constantes compartidas
│   │   └── processors/             ← Consumers — usados por el worker
│   │       ├── email.processor.ts
│   │       ├── data-export.processor.ts
│   │       └── account-deletion.processor.ts
│   └── ...
├── package.json
│   "scripts": {
│     "start": "node dist/main",          ← API service en Railway
│     "start:worker": "node dist/worker"  ← Worker service en Railway
│   }
```

Railway despliega **dos servicios desde el mismo repo**:

| Servicio       | Start command      | Recursos típicos  | Replica strategy              |
| -------------- | ------------------ | ----------------- | ----------------------------- |
| `psico-api`    | `node dist/main`   | 1 instance, 512MB | Scale on CPU                  |
| `psico-worker` | `node dist/worker` | 1 instance, 256MB | Scale on queue depth (manual) |

Ambos comparten env vars (`DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`, etc.) y se conectan a la misma Postgres + el mismo Redis.

---

## Por qué este shape y no las alternativas

### Alternativa 1 (descartada): worker en mismo Railway service (mismo proceso)

```
apps/api/src/main.ts  ← arranca BOTH HTTP server AND BullMQ workers
```

| Pro                           | Contra                                               |
| ----------------------------- | ---------------------------------------------------- |
| ✅ Una sola cosa que deployar | ❌ Un OOM en data-export tumba el API                |
| ✅ Más simple para empezar    | ❌ Worker leak de memoria afecta latency de requests |
|                               | ❌ No puedes escalar worker independientemente       |
|                               | ❌ Restart por deploy del API mata jobs en flight    |

Rechazada por el usuario en explícito ("separado como tú recomiendas").

### Alternativa 2 (descartada): worker en workspace Turborepo separado

```
apps/api/
apps/worker/    ← package.json, tsconfig, deps propios
packages/...
```

| Pro                              | Contra                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| ✅ Aislamiento total             | ❌ Deps duplicadas (Prisma, Resend, NestJS) — 2× node_modules     |
| ✅ "Servicio" en sentido literal | ❌ Tipos Prisma se regeneran 2 veces; drift posible               |
|                                  | ❌ Cambios cross-cutting (e.g. nuevo tipo Job) tocan 2 workspaces |
|                                  | ❌ CI más lento (build 2 workspaces)                              |

Para 3 jobs (S3), 1 workspace es overengineering. Si crecemos a 20+ jobs con dependencias muy específicas (e.g. ffmpeg para audio), reconsiderar.

### Alternativa elegida: mismo codebase, dos entry points

| Pro                                                                                | Contra                                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ✅ Cero duplicación de deps / tipos                                                | ⚠️ Worker importa de la misma carpeta src/ — si un cambio en API rompe la build del worker, descubres en CI |
| ✅ Procesadores reusan `PrismaService`, `StorageService`, `ResendService` tal cual | ⚠️ Devs nuevos confundidos por la doble naturaleza del paquete (ver mitigación abajo)                       |
| ✅ Restart de worker no toca el API y viceversa                                    |                                                                                                             |
| ✅ Escalan independientemente en Railway                                           |                                                                                                             |
| ✅ Estándar de la industria (Vercel, Plaid, Linear con NestJS + BullMQ)            |                                                                                                             |

**Mitigación de la confusión:**

- `worker.ts` tiene un docstring al inicio que explica el dual nature.
- `worker.module.ts` documenta qué módulos importa y por qué (sin controllers).
- README del módulo `jobs/` (futuro) describe producer + consumer separations.

---

## Diagrama de la pila completa

```mermaid
flowchart TB
    subgraph railway["Railway"]
        subgraph api["psico-api · node dist/main"]
            APIBoot[main.ts<br/>AppModule]
            APIBoot --> AC[AuthController]
            APIBoot --> UC[UsersController]
            APIBoot --> JS_p[JobsService<br/>producer side]
            JS_p -.->|enqueue| QueueE[(Redis queue:<br/>email)]
            JS_p -.->|enqueue| QueueD[(Redis queue:<br/>data-export)]
            JS_p -.->|enqueue +30d delay| QueueA[(Redis queue:<br/>account-deletion)]
        end

        subgraph worker["psico-worker · node dist/worker"]
            WorkerBoot[worker.ts<br/>WorkerAppModule]
            WorkerBoot --> EP[EmailProcessor]
            WorkerBoot --> DEP[DataExportProcessor]
            WorkerBoot --> ADP[AccountDeletionProcessor]
            QueueE -->|pull| EP
            QueueD -->|pull| DEP
            QueueA -->|pull when delay elapsed| ADP
        end

        EP --> Resend1[(Resend)]
        DEP --> Prisma1[(Postgres)]
        DEP --> R2[(R2 storage)]
        DEP --> Resend2[(Resend)]
        ADP --> Prisma2[(Postgres)]
    end

    User[Usuario] -->|POST /api/user/data-export| api
    api -->|200 expectedAt| User
    Note over worker: 30s-30min<br/>later

    style api fill:#e3f2fd
    style worker fill:#e8f5e9
    style QueueE fill:#fff3e0
    style QueueD fill:#fff3e0
    style QueueA fill:#fff3e0
```

---

## Configuración por queue

| Queue              | Attempts | Backoff                   | Special                                                                   |
| ------------------ | -------- | ------------------------- | ------------------------------------------------------------------------- |
| `email`            | 3        | exponential 1s/5s/25s     | `removeOnComplete: 1d`; `removeOnFail: 7d`                                |
| `data-export`      | 2        | exponential 30s/15min     | `removeOnFail: false` (keep failures indefinitely for debugging)          |
| `account-deletion` | 5        | exponential 1m/5m/25m/... | **`delay: 30 days`**; re-checks `User.deleteRequestedAt` before executing |

Backoff exponencial es la **regla** (no fija) por una razón: si Redis o la DB están down, una pausa fija de 30s perpetúa el load. Backoff exponencial se auto-regula.

---

## Defensive design en account-deletion

Es la operación más peligrosa del sistema. **Si misfire → borramos datos de un usuario que no debió ser borrado**. Tres líneas de defensa:

1. **`delay: 30 días`** en BullMQ. El job no es elegible para ejecutar hasta 30 días después de su enqueue.
2. **Re-check de `User.deleteRequestedAt`** en el processor. Si está null (usuario canceló), no-op.
3. **Re-check del cooldown** usando la timestamp **de la DB**, no la del payload del job. Si el usuario re-pidió deletion 5 días atrás (después de cancelar el original), honramos la nueva fecha — todavía no es 30 días, no-op.

El job es **idempotente y self-correcting**: ejecutar el job dos veces, o ejecutar uno desactualizado, nunca causa daño.

Adicionalmente: Prisma `onDelete: Cascade` está configurado en todas las relaciones que hereda `User`. Una sola llamada `prisma.user.delete()` propaga a todo lo que el usuario poseía. `AuthEvent` usa `onDelete: SetNull` — los eventos históricos sobreviven con `userId=null` para compliance.

---

## Mocking y testing

Producer (API → queue):

- Tests del `JobsService` con mocks de `Queue`.
- Tests de cada feature service (`UsersService`) inyectan un `JobsService` mock.

Consumer (queue → processor):

- Cada `*.processor.spec.ts` instancia el processor con dependencias mockeadas.
- Test fuerza `attemptsMade` y `opts.attempts` en el `Job` fake para validar branching de "final vs non-final".

**No probamos el ida-y-vuelta real por Redis** en unit tests. BullMQ con `ioredis-mock` no soporta delayed jobs correctamente (la cola se reemplaza por una Map in-memory). Aceptamos: el test unit cubre la lógica; el smoke test manual con Redis real cubre la wiring de BullMQ.

---

## Consequences

### Positivas

- **Cero duplicación.** Una sola Prisma, una sola Resend, un solo set de tipos. El día que upgrademos `@prisma/client`, ambos servicios actualizan en el mismo PR.
- **Operacional limpio.** Worker crash → API sigue. Memory leak en data-export → recyclas solo el worker.
- **Cost-effective.** Worker es 256MB típico. Antes de pagar por un servicio Railway dedicado, ya tenemos el patrón listo cuando lo necesitemos.
- **Industry standard.** Cualquier dev senior con experiencia NestJS reconoce el pattern (`createApplicationContext` + `WorkerHost` decoradores).
- **Extensible.** Cuando llegue S10 (Patrones weekly summary) o S24 (Pulso snapshots), agregamos `WeeklySummaryProcessor` al `WorkerAppModule` y el producer side llama `JobsService.enqueueWeeklySummary(...)`. Cero cambios al runtime.

### Negativas / trade-offs

- **El bundle del worker incluye código del API que no usa.** TypeScript compila todo, Node carga solo lo que `worker.ts` toca, pero `dist/worker.js` referencia más archivos de los necesarios. Aceptado: tamaño del bundle es secundario en contexto server-side.
- **Dev local con worker requiere Redis real.** `ioredis-mock` es per-proceso → API y worker no comparten state. Para correr ambos juntos en dev, `docker run -p 6379:6379 redis` (documentado en bitácora S3).
- **`PrismaService.onModuleInit` conecta a la DB en BOTH procesos.** Si Postgres tiene un connection limit bajo, podríamos saturarlo con 2 pools. Configurable con `connectionLimit` en el adapter cuando llegue ese problema.
- **Migraciones se hacen una sola vez** pero ambos servicios necesitan el schema actualizado. Deploy debe coordinar: aplicar migración → deploy api → deploy worker. Railway lo hace OK por defecto si el migrate command corre antes del start del worker, pero documentar.

---

## Cuando reconsiderar

| Trigger                                                        | Migrar a                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| >20 tipos de jobs muy diferentes                               | Workspace separado (Alternativa 2)                                                                     |
| Worker necesita binarios nativos (ffmpeg, sharp) que el API no | Workspace + Docker image separado                                                                      |
| Tasa de jobs > 1000/s                                          | Múltiples worker replicas en Railway (esta arquitectura ya lo soporta — solo `Replicas: N` en Railway) |
| Cliente externo necesita enqueue (sin pasar por nuestro API)   | Exponer una HTTP API en el worker o usar Inngest / Trigger.dev                                         |

---

## Referencias

- [BullMQ docs](https://docs.bullmq.io/)
- [@nestjs/bullmq](https://docs.nestjs.com/techniques/queues#bullmq)
- [NestJS · standalone applications (`createApplicationContext`)](https://docs.nestjs.com/standalone-applications)
- [Railway · multiple services from same repo](https://docs.railway.app/guides/services)
- IMPLEMENTATION_PLAN_v2.md §2 (ADR 0010 placeholder) y §6.S3
- Bitácora S3: [`docs/informes/sprint-s3.md`](../informes/sprint-s3.md)
