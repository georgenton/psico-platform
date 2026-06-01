# HomeModule

Sprint S5 dashboard aggregator. One request returns everything the home
screen needs.

## Endpoints

| Method | Path                              | Auth     | Purpose                       |
| ------ | --------------------------------- | -------- | ----------------------------- |
| GET    | `/home`                           | required | Dashboard bundle (8 concerns) |
| PATCH  | `/user/mood`                      | required | Update current mood           |
| POST   | `/reflection-prompts/:id/dismiss` | required | Hide a prompt for 7 days      |

## Design source

`docs/design/handoff/02-inicio.md`

## What `/home` returns

```ts
{
  user:        { firstName, city, tier, streakDays, mood }
  greeting:    { text, subtitle }              // hour + mood aware
  continueBook: { ... } | null                  // last touched book
  ecoMoment:   { prompt, lastActiveAt, pendingMessages } | null
  recos:       [ /* max 3 books */ ]
  stats:       { minutesThisWeek, entriesThisWeek, streakDays, weeklyGoalPct }
  reflectionPrompt: { id, text } | null
  shortcuts:   [ /* diario, eco, biblioteca, terapia */ ]
}
```

## How it's wired

The service runs every concern in parallel via `Promise.all` so total
latency stays bounded as we add more concerns:

```
fetchUser            ┐
fetchContinueBook    │
fetchEcoMoment       ├─► Promise.all
fetchRecos           │
fetchStats           │
fetchReflectionPrompt┘
```

Adding a new concern = adding one private method + one entry in the
`Promise.all` array. Don't sequence calls unless one truly depends on
another's output.

## Greeting selection

Two-axis decision: hour of the day × mood.

1. Compute time bucket (`morning|afternoon|evening|night`) from the
   server's current hour.
2. If the user has a mood set AND we have a mood-specific override
   (`calma`, `foco`, `energia`, `reflexion`), use that.
3. Otherwise, use the bucket's default greeting.

Time buckets and copy live in `home.service.ts`. Edit there to tweak.

## Reflection prompts

Prompts are seeded from `apps/api/prisma/seed.ts` (7 default prompts).
Each user can dismiss a prompt; the dismissal hides it from that user's
Home for 7 days but keeps the prompt active for everyone else. The Home
service excludes dismissed prompts in `fetchReflectionPrompt`.

## Mood updates

`PATCH /user/mood` validates the mood id against `OnboardingMood` (the
catalog already seeded for the onboarding flow). This guarantees a closed
vocabulary. Adding a new mood = adding it to the seed + re-running.

## TODOs

- `entriesThisWeek` is stubbed to `0` until DiaryModule lands (Sprint S6).
- `minutesThisWeek` approximates 12 min/chapter when
  `chapter.durationMinutes` is missing. Tightens when chapter authoring
  matures.
- `ecoMoment.pendingMessages` is stubbed to `0` until the unread/badge
  model lands with AIModule's conversational layer (Sprint S10).
- `fetchRecos` reimplements the books-listing algorithm; it should
  delegate to PatternsModule once that exists (Sprint S11).
