# CC-7 — Production readiness (inventory + local rehearsal)

```
CC7_R2_STATUS=IN_REVIEW
PRODUCTION_READINESS=READY
PRODUCTION_BLOCKERS=0

MAIN_SHA=c4a4b5bf59a82c31aef60d9d4e2c6ff58620fd7e
DEVELOP_SHA=52d7764063ccdea650fb049edeed7592782be4c5
MERGE_BASE_SHA=ff926c7ba4a87630f207b6f85580095f6d7e8d7f

DEVELOP_AHEAD_BY=148
DEVELOP_BEHIND_BY=11

MAIN_TREE_EQUIVALENT_DEVELOP_SHA=d04fb11bddd7ff8b3e53add8b85de7d55aa91d2e
MAIN_TREE_HISTORY_RECONCILED=true
MAIN_ONLY_SEMANTIC_CHANGES=0

PRODUCTION_NET_CHANGED_FILES=143
PRODUCTION_NET_MIGRATIONS=2
DESTRUCTIVE_MIGRATIONS_WITHOUT_PLAN=0

LOCAL_MAIN_MIGRATIONS_PASS=true
LOCAL_DEVELOP_UPGRADE_PASS=true
LOCAL_SECOND_MIGRATE_DEPLOY_NOOP=true

LOCAL_CONTENT_BACKFILL_PASS=true
LOCAL_EXERCISE_INGESTION_PASS=true
LOCAL_SECOND_INGESTION_NOOP=true
LOCAL_GUIDE_TARGET_RESOLUTION_PASS=true

ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true
DB_DOWN_MIGRATION_REQUIRED_FOR_CODE_ROLLBACK=false

API_DEPLOY_REQUIRED=true
WORKER_DEPLOY_REQUIRED=true
WEB_DEPLOY_REQUIRED=true
MOBILE_RELEASE_REQUIRED=false

GUIDE_INITIAL_PRODUCTION_MODE_RECOMMENDED=off
GUIDE_PILOT_USERS_CONFIGURED=false
GUIDE_PRODUCTION_DEPLOYED=false
ENVIRONMENT_CHANGED=false
DEPLOY_EXECUTED=false
```

This document is the evidence behind the verdict. Nothing here was executed against production: every rehearsal ran on throwaway local PostgreSQL databases.

---

## 1. Git topology — the divergence is historical, not semantic

`main` is 11 commits "behind" only in the _commit-graph_ sense. Those 11 commits are
squash/sync artefacts, not code that production has and `develop` lacks.

**Proof (not assumption):** `origin/main`'s tree hash
`cea6c1d788df21935509c48595178347f3a4aa06` is byte-identical to the tree of
`d04fb11` — a commit that **is an ancestor of `origin/develop`**, with 14 commits
layered on top of it.

| Check                                             | Result                                     |
| ------------------------------------------------- | ------------------------------------------ |
| `git rev-parse origin/main^{tree}`                | `cea6c1d7…`                                |
| Identical tree found in develop history           | `d04fb11bddd7ff8b3e53add8b85de7d55aa91d2e` |
| `git diff d04fb11 origin/main`                    | empty                                      |
| `merge-base --is-ancestor d04fb11 origin/develop` | true                                       |
| Commits from `d04fb11` → `develop` head           | 14                                         |

Consequently the two-dot tree delta `origin/main..origin/develop` is **exactly**
the delta of those 14 commits — verified by diffing
`git diff --name-status origin/main..origin/develop` against
`git diff --name-status d04fb11..origin/develop`: identical.

The 11 main-only commits include the security hotfix `#555` and report `#556`;
both were reconciled back into develop by `2a8dc6f`
(`chore(sync): reconcile main→develop — security hotfix #555 + report #556 (#558)`),
which is why no semantic change is exclusive to `main`.

> **`MAIN_ONLY_SEMANTIC_CHANGES=0`** — no production hotfix would be lost by
> promoting `develop`'s tree.

**Do not use GitHub's three-dot comparison as the deploy inventory.** It reports
11/148 and would mislead. The deploy inventory is the two-dot tree delta below.

---

## 2. Net production delta — 143 files, zero deletions

`git diff --name-status origin/main..origin/develop` → 143 files,
41 869 insertions, 218 deletions, **0 files deleted**.

| Category                            | Files |   A |   M | Requires migration | Requires prod data                  | Rollback risk                | Smoke                         |
| ----------------------------------- | ----: | --: | --: | ------------------ | ----------------------------------- | ---------------------------- | ----------------------------- |
| GUIDE (`apps/api/src/guide/`)       |    35 |  35 |   0 | yes (see §3)       | guide definition + ingested targets | low — gated off              | off + pilot matrices          |
| WEB (`apps/web/src/`)               |    34 |  29 |   5 | no                 | no                                  | low                          | dashboard + guide card hidden |
| LEARNING (`apps/api/src/learning/`) |    23 |  23 |   0 | yes (see §3)       | no                                  | low — no reads from old code | learning endpoints            |
| API_RUNTIME                         |    15 |   5 |  10 | no                 | no                                  | low                          | health, auth, content         |
| DOCS                                |    10 |  10 |   0 | no                 | no                                  | none                         | —                             |
| CONTENT_CORE                        |     8 |   3 |   5 | no                 | manifest/revision already live      | medium — read paths          | manifest + lector             |
| API_CLIENT                          |     6 |   3 |   3 | no                 | no                                  | low                          | —                             |
| SHARED_TYPES                        |     3 |   2 |   1 | no                 | no                                  | low                          | —                             |
| EMOTIONAL_MAP                       |     2 |   2 |   0 | no                 | no                                  | low                          | mapa unchanged                |
| DATABASE_MIGRATIONS                 |     2 |   2 |   0 | —                  | —                                   | see §3                       | migration check               |
| OPENAPI (`openapi.json`)            |     1 |   0 |   1 | no                 | no                                  | none                         | —                             |
| DATABASE_SCHEMA (`schema.prisma`)   |     1 |   0 |   1 | yes                | no                                  | low                          | —                             |
| CI_SECURITY (`.github/`)            |     1 |   0 |   1 | no                 | no                                  | none                         | —                             |
| OTHER (lockfile, changeset)         |     2 |   1 |   1 | no                 | no                                  | none                         | —                             |

**MOBILE = 0 files.** The net delta contains no mobile change, so no store
release is entangled with this rollout (`MOBILE_RELEASE_REQUIRED=false`).
Guide on mobile is CC-7.6 and is not started.

Deploy surfaces: **API + worker + web** (shared monorepo build; the worker runs
from the same image and imports the changed modules).

---

## 3. Migrations — 2 net, both strictly additive

Computed by comparing the migration trees of both worktrees (not by counting from
the merge-base): main has 47, develop has 49.

### `20260720120000_cc7_2_learning_event_v1`

|                     |                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Objective           | LearningEvent V1 storage (ADR 0017 / 0018)                                                                                               |
| Tables touched      | `LearningEvent` only                                                                                                                     |
| Classification      | **additive**                                                                                                                             |
| Statements          | 3 × `ALTER TYPE … ADD VALUE`, 4 × `ADD COLUMN` (all nullable, no default), 1 × `CREATE UNIQUE INDEX`                                     |
| Locks               | brief `ACCESS EXCLUSIVE` on `LearningEvent` for the ADD COLUMNs; index build on a small table                                            |
| Existing data       | preserved — no backfill, no rewrite; NULL `idempotencyKey` rows are exempt from the unique index by PostgreSQL's distinct-NULL semantics |
| Old-code compatible | yes (see §5)                                                                                                                             |
| DB rollback         | not required                                                                                                                             |

The destructive scan matched `RENAME` **once**, in the prose comment
"Existing values are neither removed nor renamed". Actual
`ALTER … RENAME` statements: **0**.

### `20260721000000_cc7_4b_guide_catalog_ledger`

|                     |                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Objective           | GuideSession + GuideSessionStep + GuideCommandReceipt (ADR 0019)                             |
| Tables touched      | only the 3 it creates                                                                        |
| Classification      | **additive**                                                                                 |
| Statements          | 5 × `CREATE TYPE`, 3 × `CREATE TABLE`, 6 × `CREATE INDEX`, 5 × `CREATE UNIQUE INDEX`, 4 × FK |
| Locks               | none on pre-existing tables except the FK to `User` (validated on an empty child table)      |
| Existing data       | untouched — zero backfill                                                                    |
| Old-code compatible | yes — the models simply do not exist in main's client                                        |
| DB rollback         | not required                                                                                 |

Scanned for and **not present** in either migration: `DROP TABLE`, `DROP COLUMN`,
`TRUNCATE`, `DELETE FROM`, `ALTER COLUMN`, `SET NOT NULL`, type conversion,
actual `RENAME`.

> `DESTRUCTIVE_MIGRATIONS_WITHOUT_PLAN=0`

---

## 4. Local migration rehearsal — executed

Two throwaway databases on a local Docker PostgreSQL. Prisma was invoked with the
CWD inside each worktree, because `prisma.config.ts` pins
`migrations.path` **relative to CWD** — a `--schema` flag alone silently
resolves the wrong migrations directory (this was caught and corrected mid-run;
the first baseline attempt was discarded because it had picked up develop's 49).

| Step                                           | Result                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| main's full chain → empty DB                   | 47 applied, 0 CC-7 present → `LOCAL_MAIN_MIGRATIONS_PASS=true`                                |
| clone baseline, run develop's `migrate deploy` | exactly 2 applied (`applied_steps_count=1` each), 47 → 49 → `LOCAL_DEVELOP_UPGRADE_PASS=true` |
| second `migrate deploy`                        | "No pending migrations to apply", still 49 → `LOCAL_SECOND_MIGRATE_DEPLOY_NOOP=true`          |
| `prisma migrate status`                        | "Database schema is up to date!"                                                              |

Objects verified post-upgrade: tables `GuideSession`, `GuideSessionStep`,
`GuideCommandReceipt`; columns `idempotencyKey`, `schemaVersion`, `conceptId`,
`guideSessionId` on `LearningEvent`; `LearningEventKind` gained
`CONCEPT_EXPLORED`, `ACTIVE_RECALL_ATTEMPTED`, `PRACTICE_COMPLETED` **appended**
after the existing 8 values (existing values unmoved).

---

## 5. Code-rollback compatibility — executed, with a documented caveat

Strategy under test: **old code + new schema**, so an emergency rollback never
needs a down migration.

Main's Prisma client was generated from main's schema and run against the
**upgraded** database.

| Probe                                                                                                                                                                                                                  | Result                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 13 model queries main knows (`User`, `Book`, `Chapter`, `ChapterBlock`, `RefreshToken`, `DiaryEntry`, `MoodLog`, `Resonance`, `ContentUnit`, `RevisionUnit`, `LearningEvent` count + findMany, `EmotionalMapSnapshot`) | **13/13 pass, 0 fail**                                                          |
| Guide delegates present in main's client                                                                                                                                                                               | absent, as expected (`guideSession`, `guideSessionStep`, `guideCommandReceipt`) |
| `LearningEvent.findMany` on a table with no V1 rows                                                                                                                                                                    | passes                                                                          |

### The caveat worth knowing

A deliberate hazard probe inserted a row with `kind = 'CONCEPT_EXPLORED'` (a value
only the new enum has) and read it back with **main's** client:

```
Value 'CONCEPT_EXPLORED' not found in enum 'LearningEventKind'
```

This is a genuine Prisma property: an older client cannot deserialise an enum
value it does not know.

**Why it does not block rollback:** main's runtime code never queries
`LearningEvent`. Verified across `apps/api/src` in the main worktree —
Prisma model accesses (`learningEvent.…`): **0**, in both API and worker; raw SQL
against the table: **0**. The only two files naming `LearningEvent`
(`content-core/read/content-read.ts`, `content-core/read/content-manifest.ts`)
mention it in prose comments that say "Never touches LearningEvent".

So the unreachable-by-construction conclusion is:

- `ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true`
- `DB_DOWN_MIGRATION_REQUIRED_FOR_CODE_ROLLBACK=false`

**Invariant to preserve:** any future rollback target that _does_ read
`LearningEvent` must either know the V1 enum values or filter them out. Record
this before choosing a rollback SHA other than
`c4a4b5bf59a82c31aef60d9d4e2c6ff58620fd7e`. With Guide left at `mode=off` no V1
rows are ever written, so the off-first window is unconditionally safe.

---

## 6. Content Core / ingestion rehearsal — executed locally

Authority (read, not guessed):
`apps/api/src/content-core/backfill-cli.ts`, `backfill-runner.ts`, `backfill.ts`,
`exercise-ingestion.ts`, `exercise-ingestion-catalog.ts`,
`apps/api/src/guide/guide-catalog.ts`.

Official command:

```
node dist/content-core/backfill-cli.js --book-slug=<slug>           # dry-run (default)
node dist/content-core/backfill-cli.js --book-slug=<slug> --apply   # real backfill
```

An `--apply` on a deployed box additionally requires
`ALLOW_CONTENT_CORE_BACKFILL=on`. The CLI records rollback registers
(`previous_published_revision_id`, `previous_main_sha`) before applying, emits
metrics-only stdout, and surfaces errors as whitelisted machine codes.

Rehearsal ran the repository's own authority suites against real PostgreSQL —
these create isolated databases and assert idempotency and non-destructiveness:

| Suite                                                              | Tests    |
| ------------------------------------------------------------------ | -------- |
| `content-core-backfill.pg-spec` (atomic idempotent backfill)       | 10 pass  |
| `content-core-ingest-v2.pg-spec` (non-destructive ingest v2)       | 6 pass   |
| `backfill-runner.pg-spec` (CC-6F targeted runner)                  | 12 pass  |
| `exercise-ingestion.pg-spec`                                       | 20 pass  |
| guide + learning domain (incl. `guide-production-catalog.pg-spec`) | 168 pass |

Production guide definition, as asserted by `guide-production-catalog.pg-spec`
against a real database (real names, not invented ones):

```
productionGuideRegistry.size            = 1
latestStartableVersion(guideKey)        = 1
definition.steps                        = 3   (order 1,2,3 · unique stepKeys · all required)
step kinds                              = CONCEPT_EXPLORATION, CATALOG_PRACTICE, ACTIVE_RECALL
exercise ingestion targets              = 1 practice (guided_reflection) + 1 objective recall (QUIZ)
definition frozen (Object.isFrozen)     = true
```

> Production ingestion has **not** been run. These counts are what the local
> rehearsal and the authority specs establish as expected.

---

## 7. Environment delta — 2 new variables

Diffed `env.schema.ts` between the worktrees; no new entries in `shared/flags.ts`.

| Variable               | Surface                    | Required at boot         | Initial value | Secret                         | Restart |
| ---------------------- | -------------------------- | ------------------------ | ------------- | ------------------------------ | ------- |
| `GUIDE_ROLLOUT_MODE`   | API (+ worker for posture) | yes on a deployed box    | `off`         | no                             | yes     |
| `GUIDE_PILOT_USER_IDS` | API (+ worker for posture) | only when mode = `pilot` | unset         | operational — treat as private | yes     |

Vercel receives **neither**. The web surface reads only the pre-existing
`NEXT_PUBLIC_API_URL`.

Pre-existing flags/epochs referenced by the changed code (posture unchanged by
this delta, listed as presence only): `EMOTIONAL_MAP_PUBLIC` (required, must be
set explicitly), `ALLOW_CONTENT_CORE_BACKFILL` (required only for an apply),
`PSICO_ENV` / `NODE_ENV` (required), `RAILWAY_GIT_COMMIT_SHA`,
`RAILWAY_PROJECT_ID` (platform-provided).

No value of any variable was read or printed during this preparation.

---

## 8. Verdict

`PRODUCTION_READINESS=READY` — every gate below was executed, not assumed:

- `MAIN_ONLY_SEMANTIC_CHANGES=0` · `MAIN_TREE_HISTORY_RECONCILED=true`
- `LOCAL_MAIN_MIGRATIONS_PASS` · `LOCAL_DEVELOP_UPGRADE_PASS` · `LOCAL_SECOND_MIGRATE_DEPLOY_NOOP`
- `DESTRUCTIVE_MIGRATIONS_WITHOUT_PLAN=0`
- `LOCAL_CONTENT_BACKFILL_PASS` · `LOCAL_EXERCISE_INGESTION_PASS` · `LOCAL_SECOND_INGESTION_NOOP` · `LOCAL_GUIDE_TARGET_RESOLUTION_PASS`
- `ROLLBACK_CODE_ON_UPGRADED_DB_PASS` (with the §5 invariant recorded)
- `ENV_OFF_FIRST_READY=true` · `SMOKE_PLAN_COMPLETE=true` · `ROLLBACK_PLAN_COMPLETE=true`

`PRODUCTION_BLOCKERS=0`. Readiness is not permission: the promotion itself is a
separate, explicitly authorised execution — see
[cc7-production-runbook.md](cc7-production-runbook.md).
