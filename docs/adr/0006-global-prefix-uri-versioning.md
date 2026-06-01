# ADR 0006 — Global API prefix + URI versioning + OpenAPI as source of truth

**Fecha:** 2026-05-25
**Estado:** Aceptado
**Autores:** Jorge Quizamanchuro
**Sprint:** 0.A

---

## Contexto

Antes de este ADR, el back de Psico Platform exponía cada controller en la raíz del servidor: `/auth/login`, `/content/books`, `/subscriptions/webhook`, etc. El diseño completo del producto (ver `docs/design/handoff/99-endpoints.md`) define **146 endpoints únicos** que viven todos bajo `/api/*`. Continuar sin esta normalización implica:

1. **Drift contractual.** El front (web y mobile) ya asume `/api/*` en algunos lugares y la raíz en otros — confusión garantizada.
2. **Sin espacio para versionar.** Cuando inevitablemente necesitemos una v2 de una ruta (cambio de shape de respuesta no compatible), no tenemos camino claro.
3. **Documentación inexistente.** Cada nuevo desarrollador tiene que leer el código fuente para conocer la API. No hay Swagger UI ni spec OpenAPI publicada.
4. **El front no puede regenerarse desde el back.** Hoy `@psico/api-client` se escribe a mano y se desalinea de la verdad.

Resolverlo requiere tres decisiones acopladas: dónde montar la API, cómo versionarla, y cómo documentarla.

---

## Decisiones

### A — Global prefix `/api`

Toda ruta del back vive bajo `/api/*`. Implementación:

```ts
// apps/api/src/main.ts
app.setGlobalPrefix("api", {
  exclude: [
    { path: "health", method: RequestMethod.ALL },
    { path: "subscriptions/webhook", method: RequestMethod.ALL },
  ],
});
```

**Exclusiones intencionales — solo dos:**

| Ruta                     | Por qué excluida                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                | Los monitores externos (Railway, UptimeRobot) ya apuntan a `/health`. Cambiarles la URL sin coordinar implica una ventana de "incident" falso. La exclusión es perpetua: `/health` es un detalle de operaciones, no parte del contrato público de la API. |
| `/subscriptions/webhook` | Stripe Dashboard tiene esa URL registrada. Moverla requiere coordinación con el equipo de billing y un período de doble-exposición. Sprint S11 hace la migración real a `/api/billing/webhook` con 30 días de overlap.                                    |

**Lo que NO se excluye:** todo lo demás. Los clientes front se actualizan en el mismo PR (ver Consecuencias).

### B — URI versioning con default neutral

```ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: undefined, // VERSION_NEUTRAL
});
```

**Sin defaultVersion:** una ruta sin `@Version()` aterriza en `/api/<path>`, no en `/api/v1/<path>`. Esto preserva la convención del diseño ("todos bajo `/api/*` sin segmento de versión") mientras nos deja la puerta abierta a versionar handlers individuales.

**Cuándo agregamos versión:** solo cuando un endpoint específico necesita un cambio incompatible. Patrón:

```ts
@Controller("eco")
export class EcoController {
  // Stays at /api/eco/messages (the design contract)
  @Post("messages")
  sendMessage(@Body() dto: SendMessageDto) { ... }

  // Future breaking change: stream shape change
  @Post("messages")
  @Version("2")  // → /api/v2/eco/messages
  sendMessageV2(@Body() dto: SendMessageV2Dto) { ... }
}
```

**Política de deprecación:** un endpoint reemplazado por una versión nueva sigue activo **mínimo 90 días**, con header `Deprecation: true` + `Sunset: <RFC 3339 date>`. Se retira en un sprint dedicado de cleanup.

**Alternativas descartadas:**

| Estrategia                                                      | Por qué descartada                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Header versioning (`Accept-Version: 1`)                         | Invisible en logs y curl. Difícil de cachear. CDNs no lo entienden out-of-the-box.  |
| Media type versioning (`Accept: application/vnd.psico.v1+json`) | Idem + verbose para el cliente humano.                                              |
| Default `"1"` con todos los paths como `/api/v1/...`            | Contradice el contrato del diseño y duplica trabajo del cliente sin valor agregado. |

### C — OpenAPI / Swagger como single source of truth

`@nestjs/swagger` genera la spec OpenAPI 3.0.0 desde los decoradores del código en cada arranque:

- **UI interactiva:** `GET /api/docs` (Swagger UI, deshabilitada en `NODE_ENV=production`).
- **Spec JSON:** `GET /api/docs-json` (siempre disponible).
- **Persistencia a disco:** `apps/api/openapi.json` se escribe en cada boot de dev.
- **Auth integrado:** `addBearerAuth` permite a un desarrollador pegar su JWT en Swagger UI y probar endpoints autenticados sin abrir Postman.

**Pipeline futuro (Sprint 0.B):**

```
apps/api/openapi.json  →  openapi-typescript  →  packages/api-client/src/generated.ts
                                                       ↑
                                       Web + Mobile consumen tipos generados
```

Esto elimina la posibilidad de drift entre back y front: si cambias un DTO en el back, el `tsc` del web/mobile falla en CI hasta que actualicen.

### D — Error envelope uniforme (`HttpExceptionFilter` global)

Toda respuesta de error sale con la misma forma:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "email must be an email; password must be a string",
  "details": ["email must be an email", "password must be a string"],
  "timestamp": "2026-05-25T20:51:07.328Z",
  "path": "/api/auth/login"
}
```

**Por qué:** el cliente front tenía 3 paths de manejo de error según qué NestJS le devolviera (string payload de NotFoundException, array de class-validator, error genérico). Ahora hay uno solo.

**Mapeo statusCode → code:** se mantiene determinístico (`400 → VALIDATION_ERROR`, `429 → RATE_LIMIT_EXCEEDED`, `402 → PAYMENT_REQUIRED`, etc.). Handlers pueden sobrescribir el `code` lanzando `new HttpException({ code: "QUOTA_EXCEEDED", message: "..." }, 429)`.

**Sin leakage de stack:** errores 500 retornan `{ message: "Algo salió mal. Inténtalo de nuevo." }` al cliente y loggean el stack completo internamente.

### E — Shared kernel (`apps/api/src/shared/`)

Decoradores y guards transversales viven en `src/shared/` en lugar de en `src/content/guards/`:

```
shared/
  decorators/
    current-user.decorator.ts
    required-plan.decorator.ts
    required-role.decorator.ts
  guards/
    plan.guard.ts
    roles.guard.ts
  filters/
    http-exception.filter.ts
  index.ts
```

**Anti-pattern que combate:** módulos de features importándose entre sí (ej. `UsersModule` haciendo `import { CurrentUser } from "../content/guards/..."` solo porque ahí "estaba primero"). El shared kernel es **hoja en el grafo de dependencias** — no depende de ningún feature module.

**Migración gradual:** los archivos viejos en `content/guards/` se conservan como re-exports con `@deprecated`. Sprint S30 los borra. Esto evita un mega-PR que toque 7 controllers a la vez.

---

## Diagrama de dependencias

```
┌─────────────────────────────────────────────────────────────────┐
│                          main.ts                                │
│                                                                 │
│  setGlobalPrefix("api", { exclude: [health, stripe-webhook] })  │
│  enableVersioning(URI, defaultVersion: neutral)                 │
│  useGlobalFilters(HttpExceptionFilter)                          │
│  SwaggerModule.setup("api/docs", AppModule)                     │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                       AppModule                                  │
│                                                                  │
│  imports: Prisma · Storage · Auth · Content · Subscription       │
│           · Health · AI · Users                                  │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   src/shared/  (kernel)                          │
│                                                                  │
│  • CurrentUser decorator                                         │
│  • RequiredPlan / RequiredRole decorators                        │
│  • PlanGuard / RolesGuard                                        │
│  • HttpExceptionFilter                                           │
│                                                                  │
│  Dependencies: solo @nestjs/common + auth (AuthenticatedUser)    │
└────────────┬───────────────┬──────────────┬──────────────────────┘
             ▲               ▲              ▲
             │               │              │
   ┌─────────┴───┐  ┌────────┴────┐  ┌──────┴────────┐
   │ AuthModule  │  │ UsersModule │  │ AIModule etc. │
   └─────────────┘  └─────────────┘  └───────────────┘
   (consumen los decorators/guards desde shared/)
```

---

## Consecuencias

### Positivas

- **Contrato unificado.** Todos los nuevos sprints nacen con su ruta correcta en `/api/*`. Ya no hay decisión que tomar al crear cada controller.
- **Versionado pre-cableado.** El primer breaking change (probablemente en S9 cuando Eco migre a SSE cifrado) usa `@Version("2")` y se acabó la discusión.
- **Swagger funcional desde día uno.** Cualquier persona del equipo abre `localhost:3001/api/docs` y ve la API entera con campos para probar autenticación. Reduce a cero el "¿cuál era el shape de ese endpoint?".
- **Cliente regenerable.** Sprint 0.B activa el pipeline `openapi.json → openapi-typescript → @psico/api-client`. El front deja de escribirse a mano.
- **Errores predecibles para el front.** Una sola clase `ApiError` en el web/mobile maneja todos los errores. Sprint 0.B agrega Throttler y los errores 429 ya entrarán con `code: "RATE_LIMIT_EXCEEDED"` sin código adicional.
- **Stack traces no leakean.** El equipo de seguridad respira.
- **Shared kernel limpio.** Cuando llegue Terapia (S13) con su `@RequireRole("THERAPIST")`, el guard ya está donde debe.

### Negativas / trade-offs

- **Front roto durante la transición.** Web (`apps/web/src/lib/api.ts`) y mobile (`packages/api-client/src/client.ts` + `apps/mobile/src/context/auth.tsx`) tuvieron que actualizarse en el mismo PR. La estrategia adoptada: anteponer `/api` en el `baseUrl` del cliente, no tocar las 30 llamadas individuales. Riesgo de regresión bajo — un cambio en un solo lugar.
- **Stripe webhook sigue en path legacy.** El precio de no coordinar un cambio en Stripe Dashboard es mantener la exclusión hasta Sprint S11. Aceptable — está documentado.
- **Health en `/health` permanente.** Pequeña inconsistencia con el contrato. Aceptable — los monitores externos no son parte del producto.
- **Cache de incremental build (`tsconfig.tsbuildinfo`) descubrió un bug.** El `UsersService` importaba `@psico/types` sin declararlo como dependencia en `package.json`. Funcionaba en `pnpm test` (Vitest resuelve agresivamente) pero fallaba en `tsc`. **Lección aprendida:** agregar deps explícitas y correr `pnpm typecheck` antes de commitear.
- **`@nestjs/swagger` 8.x se queja de peer dep con `class-validator@0.15`.** Es solo un warning — `class-validator` 0.15 es forward-compatible con 0.14. Monitor en NestJS 11 cuando salga.

---

## Alternativas descartadas

| Alternativa                                                     | Por qué descartada                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reverse proxy en Railway que reescribe `/api/*` → `/*`          | Acopla la URL del back a la config del proxy. Tests E2E locales no la heredan.                                                                                           |
| Mantener doble path indefinidamente (`/auth/*` y `/api/auth/*`) | Duplica métricas, duplica posibilidades de drift, duplica superficie de ataque. La estrategia "rip the band-aid" en un solo PR (con el front actualizado) es más limpia. |
| OpenAPI Spec escrita a mano en YAML                             | Garantiza drift con el código real. Industria entera abandonó este patrón hace años.                                                                                     |
| Error envelope sin `code`, solo `message`                       | El front necesita matchear errores específicos (ej. `QUOTA_EXCEEDED` muestra paywall, `VALIDATION_ERROR` muestra inline). String matching es frágil.                     |

---

## Verificación

```bash
# Build + typecheck
pnpm --filter @psico/api build
pnpm --filter @psico/api typecheck

# Tests (125 deben pasar — baseline 87 + 38 nuevos)
pnpm --filter @psico/api test

# Smoke test del bootstrap
NODE_ENV=development node dist/main &
curl -s http://localhost:3001/health                              # → 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/health  # → 404
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" -d '{}'                     # → envelope 400
curl -s http://localhost:3001/api/docs-json | jq '.openapi'       # → "3.0.0"
```

---

## Referencias

- [NestJS · setGlobalPrefix](https://docs.nestjs.com/faq/global-prefix)
- [NestJS · Versioning](https://docs.nestjs.com/techniques/versioning)
- [NestJS · OpenAPI introduction](https://docs.nestjs.com/openapi/introduction)
- [RFC 7234 — Sunset HTTP header](https://www.rfc-editor.org/rfc/rfc8594.html)
- IMPLEMENTATION_PLAN_v2.md §2 (decisiones transversales) y §3 (versionado y documentación)
- Bitácora del sprint: `docs/informes/sprint-0a.md`
