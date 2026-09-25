# QA visual fixture

The minimum a QA environment needs before anyone can look at the product.

## Why it exists

The QA database has accounts but no catalogue: zero books, zero chapters, zero
achievements, zero onboarding options, zero prompts. A visual audit run there
reviews empty states and error screens — `/dashboard/evolucion` even returns a
500, because the achievements table it reads is empty. That is not the product.

This writes a small, entirely synthetic catalogue so the real screens have
something to draw.

## What it writes

| Rows                                        | Source                                    |
| ------------------------------------------- | ----------------------------------------- |
| 1 `BookCategory` (`qa-visual`)              | this fixture                              |
| 1 `BookAuthor` (`qa-visual-autoria`)        | created by `bootstrapBook`                |
| 2 books × 2 chapters, legacy + Content Core | `visual-fixture-content.ts`               |
| `Achievement`                               | `src/evolucion/achievement-catalog.ts`    |
| `OnboardingMotivo`, `OnboardingMood`        | `src/onboarding/constants.ts`             |
| `ReflectionPrompt`                          | `src/home/reflection-prompt-catalog.ts`   |
| `DiaryPrompt`                               | `src/reflexiones/diary-prompt-catalog.ts` |

One book is free, the other reserved (`Book.plan` / `Edition.accessPlan` set to
`PRO` after the bootstrap, which always writes `FREE`), so the access notice has
a real surface to appear on.

Every slug is namespaced `qa-visual-*`, so a fixture row is recognisable on
sight.

## What it will not do

- **It never runs in production.** Three barriers, below.
- It never deletes, truncates or resets anything.
- It never copies production data and contains no personal content: no diary
  entries, no Eco threads, no reflections, no map or pattern data, no
  invitations, no Dúo/Círculos activity. Catalogue rows only.
- It never creates accounts and never touches an existing one, so it cannot
  grant anybody a plan, a role or an entitlement. The reading material is
  written for the fixture and says nothing about anyone.

## The three barriers

1. **Posture.** `resolveEnvironment()` — the canonical resolver, not a second
   detection scheme — must not answer `production`. On a deployed box it accepts
   only `PSICO_ENV=production|staging` and throws when the variable is missing,
   so a service that forgot to declare itself fails closed instead of passing
   for a development machine.
2. **Explicit opt-in.** On a deployed box, `ALLOW_QA_VISUAL_FIXTURE=on`.
   Reaching staging by accident is not enough to write to it. The book bootstrap
   keeps its own opt-in (`ALLOW_CONTENT_CORE_BOOK_INGEST=on`), which this
   fixture passes through rather than forging.
3. **The database itself.** Posture describes the _process_, not the
   _connection_: a laptop pointed at the production `DATABASE_URL` resolves as
   `development` and would sail past the first two. So the fixture reads the
   accounts and refuses if any of them lives at a routable domain. RFC 2606 and
   RFC 6761 reserve `.test`, `.example`, `.invalid` and `.localhost` for exactly
   this; no real person receives mail there. An empty database passes.
   `QA_FIXTURE_EXTRA_EMAIL_DOMAINS` widens the allow-list, deliberately.

## Idempotence

Catalogue rows are upserted by stable id. Books are created only when the slug
is absent: `bootstrapBook` fails closed on an existing slug, and re-creating one
would orphan the reader marks hanging off its block ids. A second run reports
`already-present`, calls no bootstrap, and changes nothing.

## Running it

```bash
# dry-run — the default, writes nothing, reports what a real run would do
pnpm --filter @psico/api qa:fixture

# real write
pnpm --filter @psico/api qa:fixture -- --apply
```

On a deployed QA box, from the built image:

```bash
ALLOW_QA_VISUAL_FIXTURE=on ALLOW_CONTENT_CORE_BOOK_INGEST=on \
  node dist/qa/visual-fixture-cli.js --apply
```

stdout carries counts and machine codes only — never row contents, never an
email address, never a password. A refusal prints one of:

`QA_FIXTURE_FORBIDDEN_IN_PRODUCTION` · `QA_FIXTURE_NOT_AUTHORIZED` ·
`QA_FIXTURE_DATABASE_LOOKS_REAL`
