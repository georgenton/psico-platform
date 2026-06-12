# Sprint DTO JSDoc Seeding — field-level descriptions en 5 DTOs críticos

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-dto-jsdoc-seeding`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Tercer sprint de la serie OpenAPI improvement (después del POC `ErrorEnvelopeDto` en #281 + propagación a 3 controllers en #283 + alignment spec en #285).

Hasta hoy: el Swagger CLI plugin ya estaba activo con `introspectComments: true` y `classValidatorShim: true`. Los DTOs tenían descripciones a nivel **clase** (cubriendo el endpoint completo) pero ningún field tenía descripción individual. Resultado: `swagger UI` mostraba `RegisterDto.email: string` sin contexto, el cliente generado producía tipos sin tooltips para los devs que lo consumen.

S3/3 siembra **field-level JSDoc** en 5 DTOs de alta visibilidad. El plugin los refleja como `description` en cada property del schema OpenAPI, y `openapi-typescript` los emite como `@description` en cada field del cliente generado — lo que los IDEs renderizan como hover tooltips.

### DTOs sembrados

| DTO                      | Endpoint                   | Fields con JSDoc                                                                                                           | Notas                                                                           |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `RegisterDto`            | `POST /api/auth/register`  | 3/3 (email, password, name)                                                                                                | Bcrypt 72-byte limit explicado                                                  |
| `LoginDto`               | `POST /api/auth/login`     | 2/2 (email, password)                                                                                                      | Mención del constant-time bcrypt                                                |
| `AuthResponseDto`        | 4 endpoints auth           | 3/3 (accessToken, refreshToken, user)                                                                                      | Token lifetimes + handling                                                      |
| `AuthUserDto` (extraído) | nested en AuthResponseDto  | 6/6 (id, email, name, role, plan, cryptoSalt)                                                                              | Refactor del literal type a class para que el plugin lo refleje como sub-schema |
| `CreateDiaryEntryDto`    | `POST /api/diario/entries` | 10/10 (mood, kind, promptId, textCiphertext, textNonce, excerptCiphertext, excerptNonce, tags, audioUrl, audioDurationSec) | Explicación del modelo cripto E2E ADR 0007                                      |
| `UpdateMoodDto`          | `PATCH /api/user/mood`     | 1/1 (mood)                                                                                                                 | Vocabulario WELLNESS_MOODS vs DIARY_MOODS                                       |

**Total: 25 fields documentados** en `openapi.json` y propagados al cliente generado.

### Refactor notable: `AuthResponseDto.user`

El field `user` era un **type literal inline**:

```ts
export class AuthResponseDto {
  user!: { id: string; email: string; ... };
}
```

El plugin **no refleja JSDoc en type literals** — solo en classes. Para que los 6 fields del user (incluido `cryptoSalt`, crítico para E2E) salieran en OpenAPI con descripciones, extraje el shape a `AuthUserDto` class. Resultado: `AuthResponseDto.user` ahora es `$ref` a `AuthUserDto` en el schema, cada field tiene description, y el cliente generado produce tooltips.

Zero impact en runtime — la wire shape JSON sigue idéntica. Solo cambia cómo se describe en el contrato.

### Tamaño del cliente generado

`packages/api-client/src/generated.ts`: **206.3 KB → 207.2 KB → 212.3 KB** (~3% growth tras incluir todas las descriptions).

Sample del impacto en el cliente:

```ts
RegisterDto: {
    /**
     * Format: email
     * @description The user's email address. Must be a valid RFC 5321 address. Used as
     *     the unique login identifier and as the destination for verification
     *     + password-reset emails.
     */
    email: string;
    /**
     * @description Password (8–72 characters). Bcrypt silently truncates anything past
     *     72 bytes, so the upper bound is enforced explicitly...
     */
    password: string;
    ...
};
```

VS Code hover sobre `RegisterDto.password` ahora muestra ese párrafo entero en el tooltip — sin abrir el OpenAPI viewer ni el código backend.

---

## Decisiones

1. **5 DTOs (no 10, no 30)** — escogí los más visibles para los devs que toquen el cliente (auth = todos, diario = E2E crypto = casos sutiles). Resto queda como deuda incremental.
2. **`AuthUserDto` extraído del literal** — el costo (1 nueva class) es bajo y desbloquea documentation rica para `cryptoSalt`, que es el campo más sutil del producto (no-secret pero crítico).
3. **JSDoc en español/inglés mezclado** — mantengo el inglés del codebase (CLAUDE.md lo exige) pero conservé los nombres en español de los catalogs (`DIARY_MOODS`, `WELLNESS_MOODS`). Coherente con el código existente.
4. **Sin `@example` tags** — el plugin no los procesa para campos primitivos sin schema-level config. Sufre la complejidad sin valor agregado a los tooltips. Diferir.
5. **Sin `@ApiProperty` decorators** — el plugin con `introspectComments: true` los hace innecesarios. Siempre que el JSDoc esté presente, el plugin la usa como description.
6. **`AuthResponseDto.user` shape sin breaking change wire-side** — el JSON producido por register/login/refresh/oauth es idéntico antes y después.

---

## Smoke verification

```
API tests        653/654 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API + types + crypto)
Lint             0 errors, 4 warnings preexistentes
OpenAPI check    OK — generated.ts up to date

Verificación de descriptions en openapi.json:
  RegisterDto         ✓ 3/3 fields con description
  LoginDto            ✓ 2/2 fields con description
  AuthResponseDto     ✓ 3/3 fields con description
  AuthUserDto         ✓ 6/6 fields con description (nuevo schema)
  CreateDiaryEntryDto ✓ 10/10 fields con description
  UpdateMoodDto       ✓ 1/1 field con description

Sample propagation al cliente:
  RegisterDto.email → "@description The user's email address. Must be a valid RFC 5321..."
  CreateDiaryEntryDto.textCiphertext → "@description The XChaCha20-Poly1305 ciphertext..."
```

---

## Deuda técnica abierta

- **DTOs sin JSDoc seeding** — TODO el resto del API. Books, Chapters, Eco, Voz, Lector, Patrones, Onboarding, Notifications, Pulso, Subscription/Billing, Users (resto). Patrón documentado, aplicación incremental cuando algún consumer reporte un campo confuso.
- **`UpdateDiaryEntryDto` sin sembrar** — por simetría con `CreateDiaryEntryDto` debería tener JSDoc paralelo. Diferido.
- **Sin tests UI dedicados** — verificar visualmente que Swagger UI muestra los tooltips no es un assertion; lo dejamos confiando en el `generate:check`.
- **`@example` no usados** — sería valioso para fields no-obvios (e.g. `cryptoSalt` con un base64url example real). Plugin requiere setup adicional.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Sprint 3/3 completo. Cierra la serie de 3 sprints en OpenAPI improvement.
4. Próximos sprints candidatos:
   - Aplicar `ErrorEnvelopeDto` al resto de controllers (8 pendientes).
   - JSDoc seeding incremental a más DTOs.
   - Observability (Sentry).
   - 409/410/422 per-method response shapes.
