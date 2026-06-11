# Sprint OpenAPI Mood Enum — `@ApiProperty({ enum })` para cliente narrow

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-openapi-mood-enum`
**Tests:** 635/636 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — refactor)

---

## Lo que se construyó

Cierra la deuda explícita del sprint anterior (DTO Mood Narrowing). El cliente generado venía con `mood: string` aunque el backend ya rechazaba unknown moods. Hoy el `openapi.json` declara el enum + el cliente lo genera como union literal.

### Backend — 3 DTOs Diario

- `CreateDiaryEntryDto.mood` ahora con `@ApiProperty({ enum: DIARY_MOOD_IDS, example: "calma" })`.
- `UpdateDiaryEntryDto.mood` ídem + `required: false`.
- `ListDiaryEntriesQueryDto.mood` ídem.

### Cliente generado

- `packages/api-client/src/generated.ts` 103.8 KB → **147.6 KB** (NestJS Swagger ahora describe los 3 DTOs completos, no solo el field mood).
- Nuevos enums TypeScript:
  ```ts
  export enum CreateDiaryEntryDtoMood {
    calma = "calma",
    foco = "foco",
    energia = "energia",
    reflexion = "reflexion",
    alegria = "alegria",
    ansiedad = "ansiedad",
    tristeza = "tristeza",
  }
  // y UpdateDiaryEntryDtoMood / ListDiaryEntriesQueryDtoMood análogos
  ```

Cliente narrow ahora rechaza unknown moods en **compile-time**. Defense-in-depth completo:

1. **Cliente compile-time** (este sprint): `mood: CreateDiaryEntryDtoMood` literal union.
2. **Cliente runtime** (sprint anterior): `DiaryMoodId` type alias en `@psico/types`.
3. **Server compile-time** (sprint anterior): `mood: DiaryMoodId` en los DTOs.
4. **Server runtime** (sprint anterior): `@IsIn(DIARY_MOOD_IDS)` rechaza 400.

---

## Decisiones

1. **Approach explícito vs CLI plugin** — `nest-cli.json` no tenía el Swagger plugin habilitado (por eso los DTO schemas venían como `Record<string, never>`). Optar por enable plugin habría regenerado el cliente entero (15+ DTOs con `properties: {}` saltarían a tener fields completos), cambio masivo riesgo regresión. El approach explícito (3 `@ApiProperty` decorators) es scope quirúrgico.
2. **Bonus inesperado**: NestJS Swagger procesa class-validator decorators de fields adyacentes cuando ve un `@ApiProperty` en el DTO. Por eso `textCiphertext`, `tags`, etc. también aparecen en el schema generado ahora. Resultado: cliente más fiel sin trabajo extra.
3. **`example: "calma"`** — primer mood del catalog, útil para Swagger UI playground.
4. **No tocar otros DTOs** — User.mood (vocabulario distinto), Onboarding.moodId (DB-driven), Home.updateMood (DB-driven). Mantener scope cerrado.
5. **OpenAPI delta significativa** (43.8 KB más) — el cliente nunca había visto los body schemas Diario; ahora sí. Aceptable.

---

## Privacy

- Sin cambios. Los IDs ya estaban en `@psico/types` desde S6.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **635/636** (sin cambios — refactor).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK (cliente regenerated y commited junto).
- Verified manually: `CreateDiaryEntryDto.properties.mood.enum = ["calma", "foco", ...]` en openapi.json.

---

## Deuda técnica abierta

- **Otros DTOs siguen como `Record<string, never>`** — para cerrarlos hay que: (a) enable Swagger plugin en nest-cli.json (cambio grande, futuro sprint), o (b) sembrar `@ApiProperty` en cada field manualmente. Diferido — el patrón está documentado, se aplica when needed.
- **`User.mood`, `OnboardingMoodId`, `SessionPrep.checkInMood`** siguen como `string` en cliente — distintos vocabularios o validation paths.
- **Sin tests del enum en cliente** — los tests del DTO siguen siendo backend-side (sprint anterior). Tests del consumer (web/mobile) sería excesivo.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — sólo metadata OpenAPI cambió; runtime backend idéntico.
3. Próximos sprints: **Observability (Sentry)**, **NestJS Swagger CLI plugin** (full DTO coverage), **`SessionPrep.checkInMood` narrowing**, **Enforcement análogo de book categories**.
