# Sprint JSDoc Introspection — Comments surfacean en OpenAPI

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-jsdoc-introspection`
**Tests:** 646/647 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — config flag)

---

## Lo que se construyó

Cierra deuda del sprint Swagger CLI plugin (#269). Hasta hoy el plugin tenía `introspectComments: false` y los DTOs/controllers con docstrings ricos producían `description: ""` en el OpenAPI. Hoy ese contenido aparece en el spec + cliente generado.

### Cambio (`apps/api/nest-cli.json`)

```diff
-          "introspectComments": false,
+          "introspectComments": true,
```

Una sola línea. El plugin ahora extrae:

- **Class-level JSDoc** de cada DTO → `description` del schema.
- **Method-level JSDoc** de cada controller endpoint → `description` del operation.
- **Parameter JSDoc** (`@param`) → `description` de cada query/path param.
- **Tag descriptions** (`@ApiTags` con doc bloque) → tag summaries.

### Métrica concreta

**Non-empty `description` fields en openapi.json:**

| Estado                               | Count  |
| ------------------------------------ | ------ |
| Baseline (introspectComments: false) | **14** |
| Después (introspectComments: true)   | **44** |

**3.1× más descripciones** sin escribir una línea nueva — todo viene de los JSDoc que ya existían en los sprints S1-S55.

### Cliente generado

`packages/api-client/src/generated.ts`: **168.8 KB → 175.3 KB** (~4% growth, descriptions añadidas como TS comments).

Ejemplos surfaceados:

- `POST /api/auth/refresh`: "The presented refresh token is invalidated; a new pair is issued."
- `GET /health`: "Returns 200 with a timestamp. Exposed at /health (not /api/health) so external uptime monitors can keep a stable URL."
- `OnboardingController.step3`: "Writes firstName to User and voicePreference to UserPreferences. OnboardingState captures an immutable audit of the original picks."
- `AdminUsersController.list q param`: "Substring match on email or name (case-insensitive)."

---

## Decisiones

1. **Flag toggle directo, no escribir JSDoc nuevo** — la mayoría de DTOs/controllers tienen comentarios ricos heredados de los sprints S1-S55. Mejor cosechar lo existente que sembrar nuevo.
2. **No tests adicionales** — config flag puro, sin runtime side-effects.
3. **Class-level JSDoc lifted al description** sin necesidad de `@summary`/`@description` tags. El plugin es smart con docs naturales en español.
4. **No curar JSDoc preexistente** — algunos comentarios incluyen referencias a sprints (`Sprint S6`) o a archivos (`docs/design/handoff/01-onboarding.md`). Surface as-is — útiles para developers internos consumiendo el cliente, ruido aceptable para externos.

---

## Smoke verification

- API tests **646/647** (sin cambios — config-only).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK.
- Verificación numérica: 14 → 44 descriptions con introspectComments toggled.

---

## Deuda técnica abierta

- **Descriptions cubren controllers + DTOs class-level** — fields individuales siguen sin descriptions porque casi ningún DTO tiene field-level JSDoc. Pattern para futuro:
  ```ts
  export class ExampleDto {
    /** What this field represents. */
    @IsString()
    field!: string;
  }
  ```
- **Responses siguen narrow-deuda** — el plugin enriquece bodies + descriptions, pero responses sin `@ApiResponse` siguen como `Record<string, never>` o `200 ""`. Sprint propio.
- **Algunas descriptions tienen referencias internas** (sprints, ADRs) — útiles ahora, candidatas a sanitization si el cliente se expone a partners externos.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints: **Observability (Sentry)**, **Response types narrowing**, **Field-level JSDoc sembrado en DTOs críticos**.
