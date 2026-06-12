# Sprint Response Types Narrow — Auth POC con `@ApiOkResponse`

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-response-types-narrow`
**Tests:** 646/647 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — metadata)

---

## Lo que se construyó

Cierra otra deuda del sprint Swagger CLI plugin (#269): los responses seguían como `Record<string, never>` aunque los DTOs ya estaban tipados. Hoy demuestra el pattern en `AuthController` y establece la convención para el resto.

Hasta hoy en el cliente generado:

```ts
// Login response — no shape, just response code
operations: {
  AuthController_login: {
    responses: {
      200: { content: { /* no schema */ } };
    };
  };
};
```

Después:

```ts
// Now narrowed
AuthResponseDto: {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    plan: string;
    cryptoSalt: string | null;
  }
}
```

### Cambios (`apps/api/src/auth/auth.controller.ts`)

- Import `ApiOkResponse` + `AuthResponseDto`.
- `@ApiOkResponse({ type: AuthResponseDto })` decorator añadido a 4 endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/oauth/google`

Los 4 endpoints comparten el mismo response shape — un único `AuthResponseDto` cubre todos.

### Cliente generado

`packages/api-client/src/generated.ts`: 175.3 KB → **175.5 KB**.

Cambio clave: `AuthResponseDto` now appears as a fully typed schema reference en los 4 endpoints. Pre-este sprint el operation responses solo tenía status code sin schema; ahora retorna el DTO completo.

---

## Decisiones

1. **Scope tight: solo Auth** — POC del pattern. Establece la convención sin tratar de hacer todos los controllers (sería sprint-mega). El resto se documenta como deuda.
2. **`@ApiOkResponse` no `@ApiResponse`** — más conciso para el caso 200 OK. `@ApiResponse({ status: 200, type: ... })` es equivalente pero verboso.
3. **No tocar `logout`/`forgotPassword`/`resetPassword`/`verifyEmail`** — esos returns son `{ ok: true }` ad-hoc o void (204). Sin DTO compartido, no vale el work de crear DTOs ad-hoc por endpoint. Diferido.
4. **`AuthResponseDto` ya existía** desde S1 — solo necesitaba ser referenciado en los decorators. Cero schema work.
5. **Sin tests adicionales** — refactor metadata-only.

---

## Pattern documentado

Para futuros sprints que narrowen responses:

```ts
import { ApiOkResponse } from "@nestjs/swagger";
import { SomeResponseDto } from "./dto/some-response.dto";

@Controller("foo")
export class FooController {
  @Get(":id")
  @ApiOperation({ summary: "Get foo" })
  @ApiOkResponse({ type: SomeResponseDto }) // ← single line, surfaces shape
  getFoo(@Param("id") id: string) {
    return this.fooService.findById(id);
  }
}
```

Requisitos:

1. La response shape vive como una **class** (no `interface`/`type`) — class-validator/Swagger refleja solo classes.
2. Si no hay DTO existente, crear uno en `apps/api/src/<module>/dto/<name>-response.dto.ts` con el patrón actual (class con `!` declarations).

---

## Smoke verification

- API tests **646/647** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK.
- Spot-check: `AuthResponseDto` ahora referenciada en 4 endpoints de auth en openapi.json.

---

## Deuda técnica abierta

- **Mayoría de endpoints siguen con responses vacíos** — 200+ controllers methods sin `@ApiOkResponse`. Patrón documentado, aplicación incremental sprint por sprint.
- **Algunas responses son ad-hoc** (`{ ok: true }`) — necesitan DTO formal antes de poder decorarlas. Cuando se justifique, crear `OkResponseDto` o similar shared.
- **No `@ApiResponse({ status: 4xx })`** sembrado — los error status codes no se documentan. Útil cuando el cliente consume el error envelope (`{ statusCode, code, message }`).

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints: **Aplicar pattern a UsersController + BooksController**, **Error envelope schema**, **Observability (Sentry)**, **Field-level JSDoc sembrado**.
