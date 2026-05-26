# OnboardingModule

4-step welcome flow with optional UI tour. Implements `docs/design/handoff/01-onboarding.md` — 11 endpoints under `/api/onboarding/*`.

## Endpoints

All require `Authorization: Bearer <jwt>`. Errors return the standard envelope via `HttpExceptionFilter`.

| Method | Path                             | What it does                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/onboarding/intro`          | Marina's intro copy (constant, served from `constants.ts`)         |
| POST   | `/api/onboarding/skip`           | Mark `onboardingSkippedAt`. After this, step writes fail with 400. |
| GET    | `/api/onboarding/motivos`        | Active motivos catalog (8 entries seeded)                          |
| POST   | `/api/onboarding/step1`          | Save chosen `motivosIds`                                           |
| GET    | `/api/onboarding/moods`          | Active moods catalog (7 entries seeded)                            |
| POST   | `/api/onboarding/step2`          | Save initial mood (also writes `User.mood` for immediate UX)       |
| POST   | `/api/onboarding/step3`          | Save `firstName` → `User`, `voicePreference` → `UserPreferences`   |
| GET    | `/api/onboarding/recommendation` | Book recommendation derived from chosen motivos                    |
| POST   | `/api/onboarding/complete`       | Mark complete; record `chosenBookId`; return `redirectTo`          |
| GET    | `/api/onboarding/tour`           | Constant list of UI tour steps                                     |
| POST   | `/api/onboarding/tour/complete`  | Mark tour completed                                                |

## Data model

```
OnboardingMotivo / OnboardingMood          ← seeded catalogs (id, label, icon/swatch, order, isActive)

OnboardingState  ← 1:1 with User; lazy-created on first write
  motivosIds              String[]
  initialMoodId           String?
  initialVoicePreference  String?
  recommendedBookId       String?         ← what we proposed
  chosenBookId            String?         ← what they picked
  step{1,2,3}CompletedAt  DateTime?
  onboardingCompletedAt   DateTime?
  onboardingSkippedAt     DateTime?
  tourCompletedAt         DateTime?
  tourStepsCompleted      Int
```

### Where the long-term state lives

`OnboardingState` is the **audit trail** of the original picks. The **live state** the rest of the app uses lives in canonical places:

| Picked in onboarding | Persisted in                                 |
| -------------------- | -------------------------------------------- |
| firstName            | `User.firstName` (already from Sesión 9)     |
| voicePreference      | `UserPreferences.voicePreference` (Sesión 9) |
| mood (initial)       | `User.mood` + `User.moodUpdatedAt`           |

This split means: changing your mood from Inicio doesn't rewrite `OnboardingState.initialMoodId`. The original pick stays.

## Recommendation algorithm

Hard-coded mapping in `constants.ts`:

```ts
RECOMMENDATION_BY_MOTIVO = {
  ansiedad:   "emociones-en-construccion",
  tristeza:   "emociones-en-construccion",
  relaciones: "familias-ensambladas",
  ...
};
```

First matching motivo wins; otherwise fall back to `emociones-en-construccion` (anchor book).

The `why` string is keyed by `motivoId:bookSlug` so the same book gets a different explanation per motivo. Falls back to generic copy.

When Sprint S25 (Pulso) gives us conversion data, this gets replaced by a real algorithm. Until then, hard-coded is honest.

## Lifecycle invariants

- Once `onboardingSkippedAt` or `onboardingCompletedAt` is set, **all step POSTs return 400**. Use `assertNotAlreadyClosed()` helper.
- Idempotent step posts: re-POSTing step1 overwrites `motivosIds`. The `step1CompletedAt` updates too.
- `complete` validates `chosenBookId` exists and is `isPublished=true`. `null` is valid → user finished without committing.

## Catalogs · how to edit

Add a new motivo:

```bash
# Edit prisma/seed.ts → add to `motivos` array
pnpm --filter @psico/api prisma db seed
```

Disable an old motivo (so it stops showing up in `/motivos`):

```sql
UPDATE "OnboardingMotivo" SET "isActive" = false WHERE id = 'old-motivo';
```

Old user picks referencing the disabled motivo remain in `OnboardingState.motivosIds` — that's fine, the API just doesn't list it as a fresh option.

## Tests

- **Unit** (`onboarding.service.spec.ts`) — 20 tests covering every endpoint + edge cases (unknown motivos, inactive mood, fallback recommendation, completed-already, skipped-already, `chosenBookId=null`).
- **Controller** (`onboarding.controller.spec.ts`) — 3 tests at the metadata layer (JwtAuthGuard applied, 11 handlers, `/onboarding` path).

Run: `pnpm --filter @psico/api test -- onboarding`

## Future work

- **Real chapter-1 preview** in `recommendation` (`book.description` stand-in today) — Sprint S5 (ContentModule expansion).
- **`book.author`** field — Sprint S5 (BookAuthor model).
- **A/B testing the intro copy** — DB-backed `OnboardingIntro` table with `isActive` + targeting. Post-v1.
- **`recommendation` based on actual behavior** instead of motivo mapping — Sprint S25 (Pulso analytics + ML signal).
