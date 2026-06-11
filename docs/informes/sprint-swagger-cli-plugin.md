# Sprint Swagger CLI Plugin — Full DTO coverage en OpenAPI

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-swagger-cli-plugin`
**Tests:** 635/636 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — infra)

---

## Lo que se construyó

Cierra deuda heredada desde el día 1 del API. Hasta hoy `openapi.json` describía solo los DTOs con `@ApiProperty` explícito; el resto venía como `Record<string, never>` (que generaba en el cliente `properties: {}` — inútil para typing). Resultado: el cliente generado tenía 15+ DTOs vacíos, y los consumidores debían cobrar tipo desde `@psico/types` paralelo.

Hoy el plugin CLI de `@nestjs/swagger` introspecta los DTOs en build time y emite metadata completa basada en los class-validator decorators existentes.

### Backend (`apps/api/nest-cli.json`)

Plugin añadido al `compilerOptions`:

```json
"plugins": [
  {
    "name": "@nestjs/swagger",
    "options": {
      "classValidatorShim": true,
      "introspectComments": false,
      "dtoFileNameSuffix": [".dto.ts"],
      "controllerFileNameSuffix": [".controller.ts"]
    }
  }
]
```

- `classValidatorShim: true` — el plugin lee `@IsString`/`@IsInt`/`@Min`/`@Max`/etc y los traduce a properties del schema.
- `introspectComments: false` — no parsea JSDoc todavía (futuro).
- `dtoFileNameSuffix`/`controllerFileNameSuffix` — restringen el scope para no procesar archivos irrelevantes.

### Resultado: cliente generado

`packages/api-client/src/generated.ts`: **147.6 KB → 168.7 KB** (~14% growth).

Ejemplos de DTOs que pasaron de vacío a fully-typed:

```ts
// Antes
ShareDiaryEntryDto: Record<string, never>;
CancelSubscriptionDto: Record<string, never>;
CreateBookReviewDto: Record<string, never>;
// ... 15+ DTOs en el mismo estado

// Después
ShareDiaryEntryDto: {
  therapistId: string; // minLength: 1, maxLength: 64
  ciphertextForTherapist: string;
  wrappedKey: string;
  // ...
}
CancelSubscriptionDto: {
  reason: string;
} // maxLength: 480
CreateBookReviewDto: {
  rating: number; // 1-5
  text: string; // 1-4000 chars
}
```

---

## Decisiones

1. **Plugin con opciones explícitas, no defaults** — `dtoFileNameSuffix` + `controllerFileNameSuffix` limitan qué procesa el plugin, evitando que toque archivos randoms tipo `.processor.ts`. Defaults serían demasiado amplios.
2. **`classValidatorShim: true` (obvio)** — sin esto el plugin solo introspecta `@ApiProperty` (lo que ya teníamos). El shim es lo que permite cero-config para fields validation-driven.
3. **`introspectComments: false`** — JSDoc parsing añade descriptions del schema pero requiere comments bien estructurados. Diferido hasta tener un standard.
4. **Sin breaking changes en cliente generado** — `openapi-typescript` regeneró todo sin warnings; web + mobile typecheck pasaron sin cambios. Los `Record<string, never>` previos eran efectivamente unused (los consumidores construían los body manualmente desde `@psico/types`).
5. **Sin tests adicionales** — el plugin es metadata-only; el comportamiento runtime del backend no cambia, los tests existentes (635 API + 122 web + 20 mobile + 34 crypto) cubren lo que ya cubrían.
6. **El plugin requiere `nest build`** — NO se ejecuta en tests (vitest con SWC) ni en dev directo via `node dist/main.js` sin build previo. Confirmado: `pnpm test` corre normal sin plugin sintáctico, y el `openapi.json` se emite correctamente solo en boot post-build.

---

## Smoke verification

- API tests **635/636** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK (cliente regenerated + commited).
- Spot-checked DTOs: `ShareDiaryEntryDto`, `CancelSubscriptionDto`, `CreateBookReviewDto` — todos los fields y constraints visibles.

---

## Deuda técnica abierta

- **JSDoc descriptions no surfaceadas** — para tener summaries y descriptions completas en Swagger UI, habilitar `introspectComments: true` cuando los DTOs tengan docstrings consistentes.
- **`@ApiProperty` decorators explícitos** (3) en los Diario DTOs ahora son **redundantes** — el plugin lo deduce solo. Limpieza opcional; sin daño functional.
- **Responses no narrowed** — el plugin enriquece los body schemas; las responses siguen como `Record<string, never>` excepto donde hay `@ApiResponse` explícito o type del return. Próximo sprint puede cerrar eso.
- **`@psico/types` tiene tipos paralelos** a los del cliente generado — patrón histórico. Cuando el cliente sea fuente de verdad, deprecar `@psico/types` para shapes wire-format. Big refactor, fuera de scope.
- **Verify CI pipeline post-merge** — el openapi-diff workflow corre en cada PR. Si el plugin no se aplicó (e.g. CI no instaló deps correctamente), el check rompe. Acción del próximo PR si pasa: confirm.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints: **Observability (Sentry)**, **Limpiar `@ApiProperty` redundante**, **Response types narrowing**, **JSDoc introspection**.
