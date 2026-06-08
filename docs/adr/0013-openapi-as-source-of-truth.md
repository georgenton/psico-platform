# ADR 0013 — OpenAPI como source of truth del cliente HTTP

**Status:** Accepted (retroactivo)
**Fecha:** 2026-06-08 (formalizado en S52 audit cleanup; en código desde S12)
**Sprints involucrados:** S12 (Sprint 0.B — implementación) · S5 (rebrand types) · S38 (LLM types) · S48–S51 (Pulso v2 series)

---

## Contexto

El monorepo expone el back NestJS a tres consumidores:

- **`apps/web`** — Server Components (Next.js) y Client Components.
- **`apps/mobile`** — Expo + React Native.
- **`packages/api-client`** — wrapper TS compartido entre web y mobile.

Cuando un endpoint cambia (signature de params, shape del response, agrega un campo opcional), tradicionalmente hay que:

1. Modificar el controller NestJS.
2. Modificar el DTO.
3. Modificar `@psico/types` para reflejar el wire.
4. Modificar `@psico/api-client` para que el método del cliente coincida.
5. Esperar que `web` y `mobile` recompilen y digan "no match".

El problema: pasos **2, 3, 4** son trabajo manual repetitivo, y un sólo olvido produce drift entre lo que el back devuelve y lo que el cliente espera.

---

## Decisión

**Adoptamos OpenAPI como la fuente de verdad** para la signature pública del back. El pipeline funciona así:

1. **NestJS + `@nestjs/swagger`** genera `apps/api/openapi.json` automáticamente cuando el server boota en dev.
2. **`openapi-typescript`** transforma ese JSON en `packages/api-client/src/generated.ts` — un archivo TypeScript con `paths`, `components`, `operations` tipados.
3. **Los métodos del `pulsoApi`/`booksApi`/etc.** consumen esos tipos generados como su contrato. La signature del método del cliente NO se escribe a mano — se infiere o re-exporta de `generated.ts`.
4. **CI (`/.github/workflows/openapi-diff.yml`)** corre `pnpm --filter @psico/api-client generate:check` que regenera `generated.ts` y falla el PR si hay drift entre lo committed y lo que el back actual emitiría.

### Lo que SÍ está en source

- `apps/api/src/**/*.controller.ts` + `apps/api/src/**/*.dto.ts` — la **única** fuente del shape del wire.
- `packages/api-client/src/generated.ts` — derivado, committed para que web/mobile compilen sin instalar el back.
- `packages/types/src/index.ts` — wraps de los tipos OpenAPI cuando se quieren nombrar mejor o componer.

### Lo que NO está en source

- Tipos del API client escritos a mano que dupliquen los del back. Cuando ves `apiClient.get<Foo>("/x")`, el `Foo` viene de `@psico/types` (que a su vez viene del back).

### Lo que CI exige

- `pnpm --filter @psico/api-client generate:check` debe pasar — el committed `generated.ts` debe ser idéntico al que se produciría regenerándolo desde el back actual.
- Si alguien cambia un controller/DTO en un PR y olvida regenerar el cliente, CI falla con el mensaje "OPENAPI_DRIFT".

---

## Consecuencias

### Positivas

- **Imposible que el cliente pida un endpoint que el back no expone.** TypeScript lo cazaría en build.
- **Imposible que el back agregue un campo y el cliente no lo reciba.** Regen + recompile cazaría el mismatch.
- **`web` y `mobile` no necesitan installar el back** — el cliente generado es portable.
- **Reduce la sobrecarga cognitiva**: el dev sabe que el back es la verdad. No hay 4 sitios donde mantener la misma signature.

### Negativas / aceptadas

- **`generated.ts` es un archivo grande** (~96 KB) committed al repo. Aceptamos: el costo es chico, el beneficio (deterministic builds, no install-time codegen) es grande.
- **Breaking changes en el back se propagan instantáneamente al cliente.** Si web/mobile no se actualizan al mismo tiempo, romperán build. Mitigación: el monorepo está en un solo commit; PRs incluyen los tres workspaces.
- **`@nestjs/swagger` exige `@ApiOperation`, `@ApiTags`, etc.** en cada controller. Aceptamos: el tooling lo facilita, y la documentación de Swagger es valor agregado.
- **Tipos OpenAPI son verbosos** (`paths["/x"]["post"]["responses"][200]["content"]["application/json"]`). Mitigamos con wraps en `@psico/types` cuando el tipo se usa mucho.

---

## Alternativas consideradas

### tRPC

Atractivo en monorepo TS. Descartado porque:

- Mobile RN tendría que importar el back para inferir tipos, lo cual rompe el aislamiento de workspace.
- OpenAPI tiene más adopción (Stripe, Whisper, Anthropic) — sus SDKs se generan igual, podemos integrar fácil.
- Swagger UI gratis (`/api/docs`) es valioso para ops/testing.

### Manual TypeScript types in `@psico/types`

Lo que teníamos antes de S12. Descartado porque:

- Drift garantizado a mediano plazo.
- Cada cambio requiere 3-4 ediciones sincronizadas que se olvidan.

### Protocol Buffers / gRPC

Descartado por:

- Web Browser no habla gRPC nativo sin grpc-web proxy.
- Overhead de configurar el toolchain para 116 endpoints REST que ya funcionan.

---

## Cómo está hoy (Sesión 52 — audit cleanup)

| Componente                                                         | Estado                                              |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `apps/api/openapi.json`                                            | ✅ Generado al boot en dev                          |
| `packages/api-client/src/generated.ts`                             | ✅ 96 KB committed, sincronizado                    |
| `pnpm --filter @psico/api-client generate:check`                   | ✅ Verde                                            |
| `apps/api/src/**/*.controller.ts` con `@ApiTags` + `@ApiOperation` | ✅ Todos los controllers nuevos lo tienen desde S11 |
| CI workflow `.github/workflows/openapi-diff.yml`                   | ✅ Activo                                           |

---

## Referencias

- `packages/api-client/scripts/generate.mjs` — el script que regenera.
- `packages/api-client/src/generated.ts` — el archivo committed.
- `.github/workflows/openapi-diff.yml` — el CI gate.
- ADR 0006 — Global prefix `/api/*` (precondición — todos los paths viven bajo `/api/v1` si quisiéramos versionar).
- ADR 0008 — Rate limiting + Idempotency + OpenAPI codegen (esta ADR formaliza la parte de OpenAPI).
- Sprint **S12** (Sprint 0.B) — implementación inicial.
- Sprint **S48** (Pulso Overview) — primer uso intensivo de tipos OpenAPI extendidos.
