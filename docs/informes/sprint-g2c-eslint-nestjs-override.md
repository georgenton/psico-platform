# Sprint G2c — ESLint override `consistent-type-imports` para NestJS injectables

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g2c-eslint-nestjs-override`
**Tests:** 725/726 API (sin cambios)

## Contexto

Bug pattern recurrente: lint-staged + prettier convertían imports de servicios NestJS a `import type`, lo cual stripeaba la metadata runtime que `@Injectable()` necesita para resolver DI. El bug salió en S5-front (DTOs), G2 (BullMQ processor) y G2b (HomeService).

El config compartido `@psico/eslint-config` ya tenía un override que apagaba `consistent-type-imports` para `*.service.ts`/`*.controller.ts`/`*.guard.ts`/`*.module.ts`/`*.strategy.ts`. Pero faltaban los demás patterns de NestJS:

- `*.processor.ts` (BullMQ workers)
- `*.interceptor.ts`
- `*.filter.ts`
- `*.pipe.ts`
- `*.subscriber.ts`
- `*.gateway.ts` (WebSockets, futuro)
- `*.resolver.ts` (GraphQL, futuro)

## Lo que se construyó

- `config/eslint-config/index.js` — override extendido con 7 patterns nuevos.
- JSDoc explica el bug pattern y por qué cada suffix necesita el override (referencia explícita a los 3 sprints donde el bug salió).
- `apps/api/src/jobs/processors/emotional-map-snapshot.processor.ts` — removed 2 inline `eslint-disable-next-line` comments ahora innecesarios. Comment-only refactor que verifica que el override realmente funciona.

## Decisiones

1. **Solo extender override existente** — no cambiar la regla global. El team mantiene `prefer: "type-imports"` como default, lo cual es correcto para todo lo demás.
2. **Pattern matching por nombre, no por decorator content** — más simple, más rápido, no requiere parsing AST. False positives son benignos (extra value imports en archivos no-injectable no rompen nada).
3. **No cleanup masivo de los 84 inline `eslint-disable` legacy** — son redundantes pero no-op. Limpiar todos es ~80 file diffs sin valor. Pueden eliminarse oportunisticamente cuando alguien edite cada archivo.
4. **Verification real** — removí inline disables de un processor y lint pasó: confirma que el override toma efecto.

## Verificación

- `pnpm --filter @psico/api lint` → 0 errors (4 warnings preexistentes de `any` en specs).
- `pnpm --filter @psico/api typecheck` ✅
- `pnpm --filter @psico/api test` → 725/726 (sin cambios)

## Deuda técnica abierta

- **84 inline disables legacy** — limpiar opportunistically. Mejor: un sprint mecánico que use `sed`/codemod para eliminarlos cuando volumen lo amerite.
- **Web/mobile no necesitan override** — no usan DI metadata. Vitest + Jest no tienen este problema.
- **Pattern coverage** — si NestJS introduce un nuevo tipo de injectable con un suffix distinto (ej. `*.middleware.ts`), agregarlo aquí.

## Privacy invariant

Cambio config-only. ADR 0007 intacto.
