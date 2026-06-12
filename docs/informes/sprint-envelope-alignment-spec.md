# Sprint Envelope Alignment Spec — drift detection envelope ↔ filter

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-envelope-alignment-spec`
**Tests:** 653/654 API (646 → 653, +7 nuevos · 1 sentinel skipped) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra la deuda más sutil del par de sprints anteriores (#281 + #283): **el contrato del error envelope vivía en dos archivos** —

- `apps/api/src/shared/dto/error-envelope.dto.ts` (lo que el cliente generado ve)
- `apps/api/src/shared/filters/http-exception.filter.ts` (lo que la red envía)

Si alguien añadía un field a uno sin tocar el otro, el OpenAPI doc mentía y los clientes generados rompían en silencio. Hoy ese drift es **imposible** sin un test rojo claro.

### Spec nuevo: `error-envelope.alignment.spec.ts`

Vive junto al DTO (no junto al filter) porque es la wire-shape contract — el DTO es la fuente de verdad pública. 7 tests organizados en 2 grupos:

**Grupo 1 — Runtime alignment (4 tests):**

- HttpException string → captura el body, valida que todos los required fields están y ningún field stray.
- HttpException con array de class-validator → valida `details` presente, subset.
- HttpException con custom code + details object → valida propagación.
- Raw Error → valida 500 envelope, sin leak.

Cada test usa harness `makeHost()` que captura lo que el filter escribe vía `Response.json(body)` y verifica:

1. **Required fields presentes** (`statusCode/code/message/timestamp/path`).
2. **`details` opcional respetado** (presente solo cuando viene en payload).
3. **Sin stray fields** (cada key del body debe estar en `ALLOWED_FIELDS`).

**Grupo 2 — Source-level drift (3 tests):**

- Parsea `error-envelope.dto.ts` y enforce que cada required field se declara con `!:`.
- Enforce que `details` se declara con `?:`.
- Enforce que **no hay declaraciones stray** en el DTO outside del documented set.

Para evitar falsos positivos por comentarios JSDoc que contengan `details?: unknown`, el spec strip block comments antes del scan.

### Verificación que detecta drift

Inyecté un `STRAY_FIELD!: number;` al DTO temporalmente. Resultado:

```
FAIL  src/shared/dto/error-envelope.alignment.spec.ts
  > ErrorEnvelopeDto — source declaration drift
  > declares no fields outside the documented envelope

AssertionError: stray declaration "STRAY_FIELD" on ErrorEnvelopeDto —
  either remove it from the DTO or add it to REQUIRED/OPTIONAL_ENVELOPE_FIELDS
```

Mensaje claro + accionable. Reverted, suite verde.

### Constante pinned como single source of truth

```ts
const REQUIRED_ENVELOPE_FIELDS = [
  "statusCode",
  "code",
  "message",
  "timestamp",
  "path",
] as const;

const OPTIONAL_ENVELOPE_FIELDS = ["details"] as const;
```

Para evolucionar el envelope, el dev edita esta constante + el DTO + el filter. Si edita solo uno, dos tests rojos lo detienen.

---

## Decisiones

1. **Ubicación del spec** — junto al DTO (`apps/api/src/shared/dto/`), no junto al filter. Porque el DTO es el contrato público; el filter es la implementación que lo respeta.
2. **No tocar el spec existente** del filter (`http-exception.filter.spec.ts`) — cubre el filter en isolación. El nuevo spec cubre la relación entre filter y DTO. Concerns separados.
3. **Runtime + source en el mismo file** — el runtime test garantiza que el filter emite lo que se documenta; el source test garantiza que el DTO documenta lo que el filter emite. Juntos cierran el loop.
4. **Source parse con regex (no AST)** — un AST parser (TS Compiler API) sería más robusto pero overkill. El DTO es un file de 30 líneas con shape estable; regex con strip de block comments es suficiente.
5. **Sin runtime type assertion sobre el DTO** — los `!` declarations no se reflejan vía `Object.keys(new ErrorEnvelopeDto())` (la class no asigna). Por eso el source parse.
6. **`as const` en las constantes** — evita que sean readonly[] string genéricos; permite que `expect(ALLOWED_FIELDS).toContain(key)` produzca mensajes útiles.

---

## Smoke verification

```
API tests        653/654 (646 → 653, +7 nuevos · 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API)
Lint             0 errors, 4 warnings preexistentes
OpenAPI check    OK — generated.ts up to date (sin cambios de shape)

Drift detection probado:
  ✓ añadir STRAY_FIELD al DTO → spec rojo, mensaje accionable
  ✓ revert → suite verde otra vez
```

---

## Deuda técnica abierta

- **Sin enforcement del cliente generado** — si `openapi-typescript` cambia su shape de generación, el DTO podría seguir alineado con el filter pero el cliente generado verse distinto. Aceptable: `generate:check` en CI ya cubre esa dimensión.
- **`details` shape no testeado** — `details?: unknown` es deliberadamente loose. Si quisiéramos garantizar que `details` siempre es array o object (nunca null/undefined), agregar un test. Lo dejamos open porque el contrato actual lo permite.
- **No covers nested envelopes** — si en el futuro algún endpoint devuelve `{ error: ErrorEnvelopeDto }` nested, este spec no lo cubre. No es un caso real hoy.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor de testing-only.
3. Sprint 3/3 de la serie: **Field-level JSDoc sembrado en DTOs críticos** — añadir descriptions field-by-field a 3-5 DTOs de alta visibilidad para que Swagger UI las muestre, aprovechando el plugin CLI con `introspectComments: true`.
