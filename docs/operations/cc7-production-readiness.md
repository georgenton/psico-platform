# CC-7 — Production readiness (inventory + local rehearsal)

```
CC7_R2_STATUS=SHIPPED
PRODUCTION_READINESS=VERIFIED_IN_PRODUCTION
PRODUCTION_BLOCKERS=2
PRODUCTION_BLOCKER_ENV_OFF_FIRST_NOT_APPLIED=true
PRODUCTION_BLOCKER_INDEX_WINDOW_NOT_APPROVED=true

MAIN_SHA=042afa523efce4639755c0a1998e1ed73bc7ab42
MERGE_BASE_SHA=ff926c7ba4a87630f207b6f85580095f6d7e8d7f

RUNTIME_REHEARSAL_SHA=52d7764063ccdea650fb049edeed7592782be4c5
SYNC_CANDIDATE_SHA=PENDING_AFTER_PR598_MERGE
POST_MERGE_DEVELOP_REVALIDATION_REQUIRED=true

DEVELOP_AHEAD_BY_AT_REHEARSAL=148
DEVELOP_BEHIND_BY_AT_REHEARSAL=11

MAIN_TREE_EQUIVALENT_DEVELOP_SHA=d04fb11bddd7ff8b3e53add8b85de7d55aa91d2e
MAIN_TREE_HISTORY_RECONCILED=true
MAIN_ONLY_SEMANTIC_CHANGES=0

RUNTIME_NET_CHANGED_FILES_AT_REHEARSAL=143
SYNC_CANDIDATE_NET_CHANGED_FILES=PENDING_POST_MERGE_REVALIDATION
PRODUCTION_NET_MIGRATIONS=2
DESTRUCTIVE_MIGRATIONS_WITHOUT_PLAN=0

LOCAL_MAIN_MIGRATIONS_PASS=true
LOCAL_DEVELOP_UPGRADE_PASS=true
LOCAL_SECOND_MIGRATE_DEPLOY_NOOP=true

LOCAL_BACKFILL_PG_SPECS_PASS=true
LOCAL_EXERCISE_INGESTION_PG_SPECS_PASS=true
LOCAL_GUIDE_TARGET_PG_SPECS_PASS=true

LOCAL_CONTENT_BACKFILL_DRY_RUN_PASS=true
LOCAL_DRY_RUN_DB_DELTA=0
LOCAL_CONTENT_BACKFILL_CLI_APPLY_PASS=true
LOCAL_EXERCISE_ROWS_EXPECTED=true
LOCAL_GUIDE_TARGET_RESOLUTION_AFTER_CLI=true

LOCAL_SECOND_CLI_ROW_COUNTS_STABLE=true
LOCAL_SECOND_CLI_REVISION_DELTA=0
LOCAL_SECOND_CLI_PARTIAL_STATE=false
LOCAL_SECOND_CLI_STRUCTURAL_IDEMPOTENCY=true
LOCAL_SECOND_CLI_WRITE_NOOP=false

MAIN_API_BUILD_PASS=true
MAIN_WORKER_BUILD_PASS=true
ROLLBACK_MAIN_API_BOOT_PASS=true
ROLLBACK_MAIN_HEALTH_PASS=true
ROLLBACK_MAIN_AUTH_SMOKE_PASS=true
ROLLBACK_MAIN_CONTENT_SMOKE_PASS=true
ROLLBACK_MAIN_WORKER_BOOT_PASS=true
ROLLBACK_MAIN_WORKER_PROCESSORS_ACTIVE=true
ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true

ROLLBACK_PRISMA_CLIENT_QUERY_PROBE_PASS=true
ROLLBACK_UNKNOWN_ENUM_PROBE_FAILS=true
MAIN_RUNTIME_LEARNING_EVENT_READS=0
DB_DOWN_MIGRATION_REQUIRED_FOR_CODE_ROLLBACK=false

PRISMA_CLIENT_BACKUP_CREATED=true
PRISMA_CLIENT_RESTORED_BYTE_EQUIVALENT=true
DEVELOP_GUIDE_E2E_AFTER_RESTORE_PASS=true

GUIDE_OFF_PREVENTS_GUIDE_EVENTS=true
GUIDE_OFF_PREVENTS_ALL_LEARNING_V1_EVENTS=false

PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=false
PRODUCTION_LEARNING_EVENT_SIZE_CHECKED=false
PRODUCTION_LEARNING_EVENT_WRITE_ACTIVITY_CHECKED=false
EXPECTED_INDEX_WINDOW_APPROVED=false
LEARNING_EVENT_INDEX_LOCK_RISK=UNKNOWN_PENDING_PREDEPLOY_CHECK

API_DEPLOY_REQUIRED=true
WORKER_DEPLOY_REQUIRED=true
WEB_DEPLOY_REQUIRED=true
MOBILE_RELEASE_REQUIRED=false

GUIDE_INITIAL_PRODUCTION_MODE_RECOMMENDED=off
GUIDE_PILOT_USERS_CONFIGURED=false
GUIDE_PRODUCTION_DEPLOYED=false

ENV_OFF_FIRST_PLAN_READY=true
ENV_OFF_FIRST_APPLIED=false
ENVIRONMENT_CHANGED=false
DEPLOY_EXECUTED=false
```

This document is the evidence behind the verdict. Nothing here was executed against production: every rehearsal ran on throwaway local PostgreSQL databases.

**Which SHA the evidence describes.** Every rehearsal below ran against
`RUNTIME_REHEARSAL_SHA=52d7764…` — the develop head at the time. This PR itself
advances develop (with docs only), so that SHA is deliberately **not** called
"DEVELOP_SHA", and every count taken from it is suffixed `_AT_REHEARSAL` rather
than presented as a standing production figure. After this PR merges, develop's
head is a different commit, and the future sync commit must use the tree of that
**new approved SHA**, not the historical `52d7764` tree. Before promoting,
re-validate that the delta since the rehearsal is docs-only — the exact procedure
is runbook §2.0.

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

## 2. Runtime production delta at the rehearsal SHA — 143 files

`git diff --name-status origin/main..RUNTIME_REHEARSAL_SHA` → 143 files,
41 869 insertions, 218 deletions, **0 files deleted**.

> **143 excludes the three readiness documents introduced by PR #598.** The
> future total sync-candidate file count is not frozen until the post-merge
> revalidation runs — hence
> `SYNC_CANDIDATE_NET_CHANGED_FILES=PENDING_POST_MERGE_REVALIDATION`. Do not
> pre-compute a total here: develop can still advance, and the authority is the
> real diff taken at promotion time (runbook §2.0).

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
| Locks               | brief `ACCESS EXCLUSIVE` on `LearningEvent` for the ADD COLUMNs; plus a non-concurrent unique-index build (see the note below)           |
| Existing data       | preserved — no backfill, no rewrite; NULL `idempotencyKey` rows are exempt from the unique index by PostgreSQL's distinct-NULL semantics |
| Old-code compatible | yes (see §5)                                                                                                                             |
| DB rollback         | not required                                                                                                                             |

The destructive scan matched `RENAME` **once**, in the prose comment
"Existing values are neither removed nor renamed". Actual
`ALTER … RENAME` statements: **0**.

> **Index lock risk — unknown, not small.**
>
> `LearningEvent` production cardinality was not queried in CC-7.R2. The
> non-concurrent unique-index build has an operational lock/duration risk whose
> magnitude is unknown until a pre-deploy production metadata check.
>
> ```
> LEARNING_EVENT_INDEX_LOCK_RISK=UNKNOWN_PENDING_PREDEPLOY_CHECK
> ```
>
> Local rehearsal timings say nothing about production here, because the local
> table was effectively empty.

This is a **mandatory precheck** of the future production preparation, and it is
the second blocker. One blocker, four components:

```
PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=false
PRODUCTION_LEARNING_EVENT_SIZE_CHECKED=false
PRODUCTION_LEARNING_EVENT_WRITE_ACTIVITY_CHECKED=false
EXPECTED_INDEX_WINDOW_APPROVED=false
```

The authorised execution inspects, **internally**:

- `COUNT(*)` on `LearningEvent`
- relation and index size
- recent write activity against the table
- locks or long-running transactions that would contend with the build
- the operational window, and gets it approved

No production SQL is included here to run, deliberately. And the future report
keeps **only the four booleans** — never exact counts, never sizes, never rows,
never content, never identities. A magnitude that is operationally sensitive does
not become safe by living in a runbook.

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

## 5. Code-rollback compatibility — full runtime rehearsal

Strategy under test: **old code + new schema**, so an emergency rollback never
needs a down migration. A Prisma client probe alone is not enough to call the
runtime compatible, so main's API and worker were **built and actually booted**
against the upgraded database.

### 5.1 Prisma client isolation (no silent overwrite)

`prisma generate` writes into the workspace-shared client directory, so
generating main's client would clobber develop's. It was therefore backed up,
regenerated, and restored under checksum:

```
PRISMA_CLIENT_BACKUP_CREATED=true              (16 files, sha256 manifest)
PRISMA_CLIENT_RESTORED_BYTE_EQUIVALENT=true    (all 16 sha256 match after restore)
DEVELOP_GUIDE_E2E_AFTER_RESTORE_PASS=true      (Guide HTTP E2E 30/30; full API suite 1432 pass / 1 skipped)
```

The functional re-check matters more than the checksum: a byte-identical restore
that failed to run would still be a broken workspace.

### 5.2 Build

Built from main's worktree, with main's own client:

```
MAIN_API_BUILD_PASS=true
MAIN_WORKER_BUILD_PASS=true
```

Sanity check that these are genuinely main's artefacts and not develop's:
`dist/guide/` is **absent** from the build.

### 5.3 API — booted and exercised

Main's `dist/main.js` against the upgraded DB, a local isolated Redis, and
`NODE_ENV=development`. No production URL, no production credential; the
placeholder values are obviously non-secret local strings.

```
ROLLBACK_MAIN_API_BOOT_PASS=true       187 routes mapped · 0 /api/guide · 0 /api/learning
ROLLBACK_MAIN_HEALTH_PASS=true         GET /health → 200
ROLLBACK_MAIN_AUTH_SMOKE_PASS=true
ROLLBACK_MAIN_CONTENT_SMOKE_PASS=true
```

Statuses only — no tokens, no bodies:

| Request (main's own OpenAPI surface)  | Status |
| ------------------------------------- | ------ |
| `GET /health`                         | 200    |
| `POST /api/auth/register`             | 201    |
| `POST /api/auth/login`                | 200    |
| `POST /api/auth/refresh`              | 200    |
| `POST /api/auth/login` (bad password) | 401    |
| `GET /api/books`                      | 200    |
| `GET /api/books/categories`           | 200    |
| `GET /api/user/me`                    | 200    |
| `GET /api/home`                       | 200    |
| `GET /api/user/me` (no JWT)           | 401    |
| `GET /api/home` (no JWT)              | 401    |

Register/login/refresh **write real rows** through main's Prisma client against
the upgraded schema — the strongest available evidence that old code transacts
correctly on the new tables. Prisma errors logged across the whole run: **0**.

`GET /api/books` answers 200 unauthenticated because it is a public catalog in
main — expected, not a gate failure; the auth-gated routes above answer 401.

### 5.4 Worker — booted and observed

```
ROLLBACK_MAIN_WORKER_BOOT_PASS=true
ROLLBACK_MAIN_WORKER_PROCESSORS_ACTIVE=true
```

Observed for ~33 s: process alive throughout, Redis connected, log line
`Worker started · processors: email, data-export, account-deletion, daily-usage`
followed by `Awaiting jobs from Redis…`. Crash-loop markers: 0. Prisma errors: 0.

### 5.5 Verdict

All five required gates (API build, worker build, API boot, health, worker boot)
pass, so:

```
ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true
```

### The caveat worth knowing

A deliberate hazard probe inserted a row with `kind = 'CONCEPT_EXPLORED'` (a value
only the new enum has) and read it back with **main's** client:

```
Value 'CONCEPT_EXPLORED' not found in enum 'LearningEventKind'
```

This is a genuine Prisma property: an older client cannot deserialise an enum
value it does not know. It is recorded as a real incompatibility, kept separate
from the runtime verdict rather than folded into it:

```
ROLLBACK_PRISMA_CLIENT_QUERY_PROBE_PASS=true    13/13 model queries main knows
ROLLBACK_UNKNOWN_ENUM_PROBE_FAILS=true          the hazard reproduces on demand
MAIN_RUNTIME_LEARNING_EVENT_READS=0             which is why it is unreachable
```

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
`c4a4b5bf59a82c31aef60d9d4e2c6ff58620fd7e`.

### What `mode=off` actually prevents

```
GUIDE_OFF_PREVENTS_GUIDE_EVENTS=true
GUIDE_OFF_PREVENTS_ALL_LEARNING_V1_EVENTS=false
```

`GUIDE_ROLLOUT_MODE=off` prevents Guide-originated LearningEvents because the
five Guide commands are denied before the lifecycle.

It does not disable the standalone Learning HTTP commands. Those commands may
write `CONCEPT_EXPLORED`, `ACTIVE_RECALL_ATTEMPTED` and `PRACTICE_COMPLETED`
independently of Guide rollout.

Verified in code: `LearningController` is `@Controller("learning")` guarded only
by `JwtAuthGuard`, exposing `units/:unitKey/open`, `units/:unitKey/complete`,
`concepts/:conceptKey/explore`, `recall-attempts` and
`practices/:exerciseKey/complete`. `GuideRolloutGuard` is applied **nowhere**
outside `guide/`.

So the rollback justification rests on exactly one fact, and no other:

```
ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true   because   MAIN_RUNTIME_LEARNING_EVENT_READS=0
```

Main tolerates V1 rows because it never reads that table — **not** because the
table is assumed to stay free of new enum values. It will not stay free of them.

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

### 6.1 Domain suites (not a CLI rehearsal)

The repository's own authority suites run against real PostgreSQL, creating
isolated databases and asserting idempotency and non-destructiveness. They prove
the **domain logic**; they do not exercise the shipped CLI binary:

| Suite                                                              | Tests    |
| ------------------------------------------------------------------ | -------- |
| `content-core-backfill.pg-spec` (atomic idempotent backfill)       | 10 pass  |
| `content-core-ingest-v2.pg-spec` (non-destructive ingest v2)       | 6 pass   |
| `backfill-runner.pg-spec` (CC-6F targeted runner)                  | 12 pass  |
| `exercise-ingestion.pg-spec`                                       | 20 pass  |
| guide + learning domain (incl. `guide-production-catalog.pg-spec`) | 168 pass |

```
LOCAL_BACKFILL_PG_SPECS_PASS=true
LOCAL_EXERCISE_INGESTION_PG_SPECS_PASS=true
LOCAL_GUIDE_TARGET_PG_SPECS_PASS=true
```

(Whole locks suite at the time of writing: 315 pass / 25 files.)

### 6.2 The official CLI, actually executed

On a throwaway copy of the upgraded database, seeded with the repo's own tools:
`prisma/seed.ts`, then `scripts/ingest-chapter-md.mjs` for the three real Parte I
chapters (382 blocks). That script is frozen for production because it
cascade-deletes marks; it was run under its own documented non-production escape
hatch, on a database with **zero** highlights and annotations. Then develop's API
was built and `dist/content-core/backfill-cli.js` was run for real.

**Dry-run** (default, no `--apply`):

```
LOCAL_CONTENT_BACKFILL_DRY_RUN_PASS=true
LOCAL_DRY_RUN_DB_DELTA=0
```

Report (metrics only): `book_found=true` · `current_manifest_source=legacy` ·
`chapters_found=3` · `legacy_blocks_found=382` · `concepts_found=3` ·
`planned_content_units_created=3` · `planned_content_blocks_created=382` ·
`drift_conflicts=0` · `unresolved_blocks=0` · `destructive_operations=0` ·
`database_writes=0` · `backfill_safe=true`. Row counts before and after the
dry-run were identical — the "no writes" claim is measured, not trusted.

**Apply** (`ALLOW_CONTENT_CORE_BACKFILL=on … --apply`):

```
LOCAL_CONTENT_BACKFILL_CLI_APPLY_PASS=true
LOCAL_EXERCISE_ROWS_EXPECTED=true
LOCAL_GUIDE_TARGET_RESOLUTION_AFTER_CLI=true
```

Resulting shape, using the **real** table names (`Work`, `Edition`, `Revision`,
`ContentUnit`, `ContentUnitVersion`, `ContentBlock`, `Concept`, `Exercise`):

```
Work 1 · Edition 1 · Revision 1 · ContentUnit 3 · ContentUnitVersion 3
ContentBlock 382 · Concept 3 · ConceptLink 3 · Exercise 2
post_manifest_source = content-core
```

The two `Exercise` rows are chapter 1 order 1 (`REFLECTION`, the guided practice)
and order 2 (`QUIZ`, the objective recall) — exactly the pair
`EXERCISE_INGESTION_CATALOG` declares. Note the real model: `Exercise` has
columns `id, chapterId, order, title, type, content` and **no `exerciseKey`
column** — the `exerciseKey` in the catalog is a code-side identifier, resolved
through `(bookSlug, chapterOrder, order)`. The rows are created by `backfill.ts`
via `ingestUnitExercises`, i.e. by the CLI, not by a separate command.

**Guide target resolution after the CLI** — the real
`GuideTargetContextService.resolve()` was run against the backfilled database
with the pinned production definition:

```
GUIDE_DEFINITION_FOUND=true · GUIDE_STEPS=3
GUIDE_TARGET_RESOLUTION_PASS=true · 9 editorial anchors resolved
```

### 6.3 Re-apply — structurally idempotent, but not a write no-op

```
LOCAL_SECOND_CLI_ROW_COUNTS_STABLE=true
LOCAL_SECOND_CLI_REVISION_DELTA=0
LOCAL_SECOND_CLI_PARTIAL_STATE=false
LOCAL_SECOND_CLI_STRUCTURAL_IDEMPOTENCY=true
LOCAL_SECOND_CLI_WRITE_NOOP=false
```

Every row count is identical across applies and no new `Revision` is minted — the
structure converges. That is **not** the same as "the second run does nothing",
and this document previously overstated it.

`backfillContentCore()` upserts mutable metadata on **every** run:

```
Work.title / Work.authorName
Edition.slug
Concept.label
```

All three models carry `@updatedAt`, so Prisma issues the UPDATE whether or not
the values changed. Measured on a rebuilt throwaway database — `updatedAt`
captured before and after a re-apply:

| Model     | after apply #1 | after apply #2 |
| --------- | -------------- | -------------- |
| `Work`    | T              | **T + ~4 s**   |
| `Edition` | T              | **T + ~3 s**   |
| `Concept` | T              | **T + ~4 s**   |

All three advanced. So a repeat run is safe and convergent, but it **does write**
— never describe it as a no-op, and do not treat unchanged row counts as evidence
that nothing was touched.

One register worth reading correctly: `previous_published_revision_id` is `null`
on the first apply and non-null afterwards. That is the **rollback register being
captured** (the pointer that existed before this run), not evidence of a new
revision — the `Revision` count stayed at 1 throughout.

`GuideDefinition` is **not a database table**: no such relation exists after the
migrations. The guide definition is code-owned in `guide-catalog.ts`; ingestion
creates the `Exercise` targets it resolves against.

> Production ingestion has **not** been run. The counts above are what the local
> rehearsal establishes as expected.

---

## 7. Environment delta — 2 new variables

Diffed `env.schema.ts` between the worktrees; no new entries in `shared/flags.ts`.

| Variable               | Surface                    | Required at boot         | Initial value | Secret                         | Restart |
| ---------------------- | -------------------------- | ------------------------ | ------------- | ------------------------------ | ------- |
| `GUIDE_ROLLOUT_MODE`   | API (+ worker for posture) | yes on a deployed box    | `off`         | no                             | yes     |
| `GUIDE_PILOT_USER_IDS` | API (+ worker for posture) | only when mode = `pilot` | unset         | operational — treat as private | yes     |

**API is the functional authority for the Guide rollout.** The API resolves and
applies `GUIDE_ROLLOUT_MODE`; the worker exposes no Guide command and does not
necessarily instantiate the Guide module. Mirroring the value on the worker is
**deployment posture** — one operational answer across services — not a
functional requirement, and this document makes no claim that an absent value on
the worker necessarily produces a boot failure.

**Vercel receives neither Guide rollout variable.** The web surface reads only
the pre-existing `NEXT_PUBLIC_API_URL`.

Pre-existing flags/epochs referenced by the changed code (posture unchanged by
this delta, listed as presence only): `EMOTIONAL_MAP_PUBLIC` (required, must be
set explicitly), `ALLOW_CONTENT_CORE_BACKFILL` (required only for an apply),
`PSICO_ENV` / `NODE_ENV` (required), `RAILWAY_GIT_COMMIT_SHA`,
`RAILWAY_PROJECT_ID` (platform-provided).

No value of any variable was read or printed during this preparation.

---

## 8. Verdict

```
PRODUCTION_READINESS=VERIFIED_IN_PRODUCTION
PRODUCTION_BLOCKERS=2
```

Everything that could be verified locally **was executed, not assumed**:

- `MAIN_ONLY_SEMANTIC_CHANGES=0` · `MAIN_TREE_HISTORY_RECONCILED=true`
- `LOCAL_MAIN_MIGRATIONS_PASS` · `LOCAL_DEVELOP_UPGRADE_PASS` · `LOCAL_SECOND_MIGRATE_DEPLOY_NOOP`
- `DESTRUCTIVE_MIGRATIONS_WITHOUT_PLAN=0`
- domain suites: `LOCAL_BACKFILL_PG_SPECS_PASS` · `LOCAL_EXERCISE_INGESTION_PG_SPECS_PASS` · `LOCAL_GUIDE_TARGET_PG_SPECS_PASS`
- the official CLI, really run: `LOCAL_CONTENT_BACKFILL_DRY_RUN_PASS` (`LOCAL_DRY_RUN_DB_DELTA=0`) · `LOCAL_CONTENT_BACKFILL_CLI_APPLY_PASS` · `LOCAL_EXERCISE_ROWS_EXPECTED` · `LOCAL_GUIDE_TARGET_RESOLUTION_AFTER_CLI` · `LOCAL_SECOND_CLI_STRUCTURAL_IDEMPOTENCY` (with `LOCAL_SECOND_CLI_WRITE_NOOP=false` measured, §6.3)
- main's runtime, really booted: `MAIN_API_BUILD_PASS` · `MAIN_WORKER_BUILD_PASS` · `ROLLBACK_MAIN_API_BOOT_PASS` · `ROLLBACK_MAIN_HEALTH_PASS` · `ROLLBACK_MAIN_AUTH_SMOKE_PASS` · `ROLLBACK_MAIN_CONTENT_SMOKE_PASS` · `ROLLBACK_MAIN_WORKER_BOOT_PASS` · `ROLLBACK_MAIN_WORKER_PROCESSORS_ACTIVE` → `ROLLBACK_CODE_ON_UPGRADED_DB_PASS=true` (with the §5 invariant recorded)
- `ENV_OFF_FIRST_PLAN_READY=true` · `SMOKE_PLAN_COMPLETE=true` · `ROLLBACK_PLAN_COMPLETE=true`

### Why not READY — two blockers

```
PRODUCTION_BLOCKER_ENV_OFF_FIRST_NOT_APPLIED=true
PRODUCTION_BLOCKER_INDEX_WINDOW_NOT_APPROVED=true
```

**Blocker 1 — off-first posture not applied.** CC-7.R2 does not touch Railway, so
the posture is **planned, not applied**: `ENV_OFF_FIRST_APPLIED=false`,
`ENVIRONMENT_CHANGED=false`. Until a separate authorised execution sets
`GUIDE_ROLLOUT_MODE=off` on the API and worker and verifies it, readiness cannot
honestly be called complete — every local gate passing does not make an unset
production variable safe.

**Blocker 2 — index window not approved.** Four components, one blocker:

```
PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=false
PRODUCTION_LEARNING_EVENT_SIZE_CHECKED=false
PRODUCTION_LEARNING_EVENT_WRITE_ACTIVITY_CHECKED=false
EXPECTED_INDEX_WINDOW_APPROVED=false
```

Production cardinality, size and write activity were never read, so the
non-concurrent unique-index build carries an unsized lock/duration risk (§3). All
four must be true before the sync PR.

**Neither is a third blocker:**

- Production ingestion has not been run anywhere — correct, it is a **post-deploy**
  step (runbook §3 step 8), not a pre-sync gate.
- `POST_MERGE_DEVELOP_REVALIDATION_REQUIRED=true` is a **procedural gate** on the
  promotion execution (runbook §2.0), not a production blocker: nothing about
  production is wrong, the evidence simply has to be re-pointed at the SHA that
  will actually ship.

Readiness is not permission: the promotion itself is a separate, explicitly
authorised execution — see
[cc7-production-runbook.md](cc7-production-runbook.md).
