# Sprint User Mood Shared — `WELLNESS_MOOD_IDS` en @psico/types

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-user-mood-shared`
**Tests:** 646/647 API (+6) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Tercer y último mood vocabulary que estaba hardcoded local. `ALLOWED_MOODS` vivía dentro del DTO (`apps/api/src/users/dto/update-mood.dto.ts`) sin exposure al cliente. Hoy completa el patrón aplicado a Diary (sprint #265) y Therapy (sprint #273).

### `@psico/types`

- `WELLNESS_MOOD_IDS = ["great", "good", "calm", "neutral", "tired", "anxious", "sad", "angry"] as const` — readonly runtime tuple.
- `WellnessMoodId` type alias.

### Backend (`apps/api/src/users/dto/update-mood.dto.ts`)

- Removed local `ALLOWED_MOODS` + `AllowedMood`.
- Importa `WELLNESS_MOOD_IDS` + `WellnessMoodId` desde `@psico/types`.
- `mood!: WellnessMoodId` con `@IsIn(WELLNESS_MOOD_IDS)`.

### Test (`apps/api/src/users/dto/wellness-mood-narrowing.spec.ts`)

6 tests del invariant:

1. Acepta todos los moods del catalog.
2. Rechaza unknown mood.
3. Rechaza Diary-vocabulary mood (`calma`).
4. Rechaza Therapy-vocabulary mood (`calmo`).
5. Rechaza empty string.
6. Rechaza missing (required field).

### Cliente generado

OpenAPI surfacea el enum automáticamente vía plugin CLI:

```json
"UpdateMoodDto": {
  "properties": {
    "mood": {
      "type": "string",
      "enum": ["great", "good", "calm", "neutral", "tired", "anxious", "sad", "angry"]
    }
  },
  "required": ["mood"]
}
```

`generated.ts` 168.7 KB → 168.8 KB (TS enum `UpdateMoodDtoMood` añadido).

---

## Defense in depth completo (paridad con Diary + Therapy)

| Mood catalog | Catalog en @psico/types         | DTO validator                   | Cliente TS enum                   |
| ------------ | ------------------------------- | ------------------------------- | --------------------------------- |
| Diary        | `DIARY_MOOD_IDS`                | `@IsIn` en 3 DTOs               | `CreateDiaryEntryDtoMood`, etc    |
| Therapy      | `THERAPY_MOOD_IDS`              | `@IsIn` en UpdateSessionPrepDto | `UpdateSessionPrepDtoCheckInMood` |
| Wellness     | **`WELLNESS_MOOD_IDS`** (nuevo) | `@IsIn` en UpdateMoodDto        | `UpdateMoodDtoMood`               |

Las 3 enforcement chains completas.

---

## Decisiones

1. **Tuple `as const` directo** — no se usa el shape `{ id, emoji, label }` como Diary/Therapy porque Wellness no tiene UI catalog tabla (los emojis se ponen del lado cliente si quieren rendear picker). Plain string array suficiente para el server.
2. **`as unknown as string[]` cast retained** — class-validator's `@IsIn` quiere mutable array, nuestro `readonly` lo requiere. Patrón existente del proyecto (heredado del código pre-refactor).
3. **Vocabulary inglés intencional** — Wellness moods se mantienen separados de Diary/Therapy (spanish). Distintos contextos UX. Documentado en el comment de la constante.
4. **No tocar UI** — no hay UI actual que consuma `/api/user/mood`. Cuando alguien lo necesite, importa de `@psico/types`.

---

## Privacy

- Sin cambios. `User.mood` ya plaintext metadata.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **646/647** (+6 nuevos).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK.
- Verified manually: `UpdateMoodDto.properties.mood.enum` con 8 valores en openapi.json.

---

## Deuda técnica abierta

- **3 mood catalogs separados** — Diary (7 spanish), Therapy (5 spanish), Wellness (8 english). Trío intencional pero potencialmente confuso. Documentado en `@psico/types` con comments.
- **UI Wellness picker** — no existe todavía. Cuando aterrice, será UI consumer del primer `import { WELLNESS_MOOD_IDS } from "@psico/types"` desde el frontend.
- **`OnboardingMood`** sigue siendo DB-driven — diferente del catalog `WELLNESS_MOOD_IDS`. Coexisten porque el primero es seeded (con swatch/order para Inicio mood picker) y el segundo es wire-shape validation.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — backward-compat con clientes existentes.
3. Próximos sprints: **Observability (Sentry)**, **Response types narrowing**, **JSDoc introspection**.
