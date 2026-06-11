# Sprint DTO Mood Narrowing — Type + runtime enforcement de mood IDs

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-dto-mood-narrowing`
**Tests:** 635/636 API (+9) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra el invariant del Diario: hasta hoy los DTOs aceptaban cualquier string como `mood`. Si el cliente mandaba `"made-up"`, el server escribía sin chequeo. Hoy CI lo enforce **dos veces**:

1. **Compile-time** — el tipo `mood: DiaryMoodId` rompe TS en clientes que importen los DTO types directamente.
2. **Runtime** — `@IsIn(DIARY_MOOD_IDS)` rechaza payloads con mood desconocida (400 VALIDATION_ERROR).

### `@psico/types`

- `DIARY_MOOD_IDS: readonly string[]` derivado de `DIARY_MOODS.map(m => m.id)` — runtime array para class-validator's `@IsIn`.

### Backend — 3 DTOs Diario

- `CreateDiaryEntryDto.mood: DiaryMoodId` con `@IsIn(DIARY_MOOD_IDS)`.
- `UpdateDiaryEntryDto.mood?: DiaryMoodId` con `@IsIn` + `@IsOptional`.
- `ListDiaryEntriesQueryDto.mood?: DiaryMoodId` ídem.

Removed `@IsString` + `@Length(1, 32)` — redundantes ahora que el enum cerrado los cubre.

### Test (`apps/api/src/diario/dto/mood-narrowing.spec.ts`)

9 tests del invariant:

- **CreateDiaryEntryDto** (3): acepta todos los moods del catalog, rechaza unknown, rechaza empty string.
- **UpdateDiaryEntryDto** (3): acepta valid + undefined (optional), rechaza unknown.
- **ListDiaryEntriesQueryDto** (3): acepta valid filter + empty query, rechaza unknown.

Requiere `import "reflect-metadata"` al top — vitest no auto-injecta esto y class-validator lo necesita.

---

## Decisiones

1. **NO tocar `User.mood` DTO** — vocabulario diferente (`great/good/sad/...` english 8 entries), historicamente separado del Diary mood. Refactorearlo es semantic change, no narrowing.
2. **NO tocar `Onboarding.step2.moodId` ni `Home.updateMood.moodId`** — esos referencian rows de `OnboardingMood` table; la validación es service-level (prisma findUnique). Closed set correcto pero por DB, no por const.
3. **Compile-time type + runtime decorator** — defense in depth. TS atrapa el cliente típico (que importa types); el decorator atrapa el resto (curl, third-party, type assertions).
4. **`DIARY_MOOD_IDS` no como const enum** — necesita ser referenciable en runtime para `@IsIn`. Plain `readonly string[]` derivado de `DIARY_MOODS`.
5. **Removed `@IsString + @Length`** — redundantes; `@IsIn` ya rechaza non-string + empty.
6. **Test con `reflect-metadata` import** — class-validator depende del shim. Single import al top del spec resuelve todo el file.
7. **OpenAPI sin cambios visible** — el schema generado sigue describiendo `mood: string`. NestJS/Swagger no traduce `@IsIn` a `enum` automáticamente. Pequeña pérdida de fidelity en el cliente generado; aceptable v1.

---

## Privacy

- Sin cambios. `mood` es categorical metadata desde S6.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **635/636** (+9 nuevos).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK (wire shape unchanged — `@IsIn` no surface en schema).

---

## Deuda técnica abierta

- **OpenAPI no refleja `@IsIn` como enum** — Swagger-NestJS necesita `@ApiProperty({ enum: DIARY_MOOD_IDS })` para exponerlo. Si querés que el cliente generado tenga el narrowing, agregar decorator. Aceptable v1 — el cliente TS ya tiene `DiaryMoodId` separado.
- **`User.mood` aún free-form contra ALLOWED_MOODS hardcoded** — semantic refactor pendiente.
- **`SessionPrep.checkInMood` no narrowed** — el DTO `update-prep.dto.ts` acepta string libre. Pareciera análogo pero el catalog Terapia es diferente.
- **`@IsIn` error message** — class-validator default es algo verboso (`mood must be one of the following values: ...`). Custom message útil cuando crezca el list.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — backward-compat porque los clientes existentes ya envían moods válidos del catalog.
3. Próximos sprints: **Observability (Sentry)**, **`SessionPrep.checkInMood` narrowing**, **`@ApiProperty({ enum })` para OpenAPI fidelity**, **Enforcement análogo de book categories**.
