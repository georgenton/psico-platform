# CC-7 — Production smoke (prepared, not executed)

```
SMOKE_PLAN_COMPLETE=true
SMOKE_EXECUTED=false
```

Two matrices: one for the release with Guide **off**, one for after the pilot is
activated. Run the first before considering the second.

## Reporting rules

Record **only**: HTTP status, boolean flags, aggregate counts, SHAs, timestamps.

Never record: tokens, refresh cookies, response bodies, emails, real `userId`s,
private URLs, connection strings, block text, titles or quotes.

---

## 0. Prechecks (before any request)

| Check                               | Expected                        |
| ----------------------------------- | ------------------------------- |
| `origin/main` HEAD                  | equals the approved sync commit |
| Railway API deploy                  | SUCCESS                         |
| Railway worker deploy               | SUCCESS                         |
| Vercel web deploy                   | SUCCESS                         |
| Migrations applied this release     | 2, once each                    |
| `GUIDE_ROLLOUT_MODE` (API + worker) | `off`                           |
| `GUIDE_PILOT_USER_IDS`              | unset                           |

These gates must already be **true before the release starts** — they are the
open items from CC-7.R2, not smoke steps to discover on the way:

```
RUNTIME_REHEARSAL_REMAINS_VALID=true            (runbook §2.0 — procedural gate)

PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=true      ┐
PRODUCTION_LEARNING_EVENT_SIZE_CHECKED=true             │ blocker 2
PRODUCTION_LEARNING_EVENT_WRITE_ACTIVITY_CHECKED=true   │
EXPECTED_INDEX_WINDOW_APPROVED=true                     ┘

ENV_OFF_FIRST_APPLIED=true                       blocker 1
```

Record the booleans only. The cardinality and size figures are operationally
sensitive — the four booleans are the whole reportable outcome; never paste row
counts, table sizes or any row content.

### The dedicated smoke actor

```
DEDICATED_SMOKE_ACCOUNT_READY=true
DEDICATED_SMOKE_ACCOUNT_HAS_NO_CONCURRENT_ACTIVITY=true
```

Use one account — synthetic, or operationally approved — that is **not** doing
anything else during the window. Its identity is used internally to scope
queries and is never written down: no `userId`, `email`, token, full
`sessionId` or `idempotencyKey` belongs in this document or in any report.

### Baselines are scoped to that actor, never global

Capture baselines **before** smoking, and take the after-counts the same way, so
every delta means "this actor did this" rather than "the platform moved":

```
All baseline and after-count queries are scoped internally to the dedicated
smoke actor.

GuideSession:
  WHERE userId = internal smoke actor

GuideSessionStep:
  JOIN GuideSession and scope by GuideSession.userId

GuideCommandReceipt:
  WHERE userId = internal smoke actor

LearningEvent:
  WHERE userId = internal smoke actor
```

During the pilot flow, Guide-originated events are additionally correlated
internally to the session that was created:

```
LearningEvent.guideSessionId = internal Guide session
```

That id is used for the query and is not reported.

If scoped counts cannot be obtained:

```
SMOKE_COUNT_SCOPING_PASS=false
SMOKE_RESULT=FAIL
```

Do not fall back to a global table count. A global count cannot distinguish the
gate leaking from another user simply being active, which is exactly the
distinction the whole matrix exists to make.

---

## 1. Matrix — Guide OFF (the release)

| Request                                       | Expected                       |
| --------------------------------------------- | ------------------------------ |
| `GET /health`                                 | 200                            |
| `GET /api/guide/availability` (authenticated) | 200 · `{ available: false }`   |
| `POST /api/guide/sessions` (authenticated)    | 503 · code `GUIDE_UNAVAILABLE` |
| `POST /api/guide/sessions` (no JWT)           | 401 — **not** 503              |

UI:

```
Guide card visible   = false
Guide player mounted = false
```

Deltas, **scoped to the dedicated smoke actor**:

```
GUIDE_SESSION_DELTA=0
GUIDE_SESSION_STEP_DELTA=0
GUIDE_COMMAND_RECEIPT_DELTA=0
LEARNING_EVENT_DELTA_FROM_GUIDE_REQUESTS=0
```

A non-zero delta here is a **STOP**: the gate is not holding.

**Do not exercise the standalone Learning endpoints with this account during the
OFF window.** They are legitimately reachable while Guide is off, so using them
here would put rows in the actor's own `LearningEvent` scope and make the delta
ambiguous.

> **Scope this correctly.** `mode=off` closes the five Guide commands, not the
> whole learning domain:
>
> ```
> GUIDE_OFF_PREVENTS_GUIDE_EVENTS=true
> GUIDE_OFF_PREVENTS_ALL_LEARNING_V1_EVENTS=false
> ```
>
> Other users' ordinary learning traffic may legitimately write
> `CONCEPT_EXPLORED`, `ACTIVE_RECALL_ATTEMPTED` or `PRACTICE_COMPLETED` while
> Guide is off. Actor-scoping is what keeps that from reading as a gate failure.

### Regression sweep (unchanged surfaces)

| Area                  | Expected                     |
| --------------------- | ---------------------------- |
| login / refresh       | works; rotated pair persists |
| dashboard             | renders                      |
| Content Core manifest | resolves                     |
| lector — chapter read | renders from Core            |
| highlights            | create + read                |
| annotations           | create + read                |
| learning endpoints    | respond as before            |
| Mapa Emocional        | unchanged output             |
| worker processors     | running, no crash-loop       |

---

## 2. Matrix — after activating the pilot

Only after §1 is clean, IDs are configured, `mode=pilot` is set **and the API has
been restarted/redeployed**.

### Pilot member

| Step                                      | Expected                    |
| ----------------------------------------- | --------------------------- |
| `GET /api/guide/availability`             | 200 · `{ available: true }` |
| START                                     | 201                         |
| concept step                              | 201                         |
| practice step                             | 201                         |
| recall step                               | 201                         |
| session complete                          | 201                         |
| replay any command (same idempotency key) | 200                         |

### Non-member (authenticated, outside the allowlist)

| Step                          | Expected                     |
| ----------------------------- | ---------------------------- |
| `GET /api/guide/availability` | 200 · `{ available: false }` |
| any command                   | 503 · `GUIDE_UNAVAILABLE`    |

### What the pilot run must emit — exact counts

Per actor **and** per Guide session (`LearningEvent.guideSessionId` = the session
created above), never global:

```
GUIDE_SESSION_STARTED_EVENT_DELTA=1
PRACTICE_COMPLETED_EVENT_DELTA=1
ACTIVE_RECALL_ATTEMPTED_EVENT_DELTA=1
GUIDE_SESSION_COMPLETED_EVENT_DELTA=1

GUIDE_STEP_COMPLETED_EVENT_DELTA=0
CONCEPT_EXPLORED_FROM_GUIDE_DELTA=0
```

The two zeros are structural, not incidental: **there is no
`guide_step_completed` event** (ADR 0019), and the concept step and the explicit
confirmation emit nothing at all. Only the practice step, the recall step and the
two session-lifecycle transitions produce events. A non-zero value in either zero
row means the lifecycle is emitting something the contract does not define.

### Firewall — the educational/emotional boundary

After the full pilot run:

```
canonical Emotional Map projection delta = 0
Resonance delta                          = 0
Check-in delta                           = 0
guide_step_completed events              = 0
concept_explored originating from Guide  = 0
```

Any non-zero value is a **STOP** — the learning domain must never write into the
emotional domain.

### Auth interaction

| Scenario                                        | Expected                      |
| ----------------------------------------------- | ----------------------------- |
| expired access + valid refresh, soft navigation | succeeds                      |
| first Guide command after that navigation       | uses the rotated access token |
| cross-account recovery calls                    | 0                             |

---

## 3. STOP conditions

Halt and consider rollback (runbook §4) on any of:

- any non-zero delta in the OFF matrix
- Guide reachable while `mode=off`
- a non-member receiving anything other than 503
- unauthenticated request answered 503 instead of 401 (guard order inverted)
- any firewall counter above zero
- FREE entitlement bypass
- migration mismatch (count ≠ 2, or applied more than once)
- API or worker crash-loop
- `/health` != 200
- auth refresh regression
- reader / marks regression

---

## 4. Cleanup

The pilot run creates real rows for the pilot user. Leave them: they are that
user's genuine progress, and the kill switch does not delete data.

Remove nothing from `GuideSession`, `GuideSessionStep`, `GuideCommandReceipt` or
`LearningEvent` as a "cleanup" step. If the pilot is abandoned, set
`GUIDE_ROLLOUT_MODE=off` and restart — the rows stay inert and correct.

---

## 5. Report template

```
SYNC_COMMIT_SHA=<sha>
MAIN_HEAD_SHA=<sha>
MIGRATIONS_APPLIED=<n>
API_DEPLOY=SUCCESS|FAILED
WORKER_DEPLOY=SUCCESS|FAILED
WEB_DEPLOY=SUCCESS|FAILED

GUIDE_ROLLOUT_MODE=off
GUIDE_AVAILABILITY_AUTHENTICATED=false
GUIDE_COMMAND_STATUS=503
GUIDE_UNAUTHENTICATED_STATUS=401
GUIDE_CARD_VISIBLE=false

DEDICATED_SMOKE_ACCOUNT_READY=true
DEDICATED_SMOKE_ACCOUNT_HAS_NO_CONCURRENT_ACTIVITY=true
SMOKE_COUNTS_ACTOR_SCOPED=true
SMOKE_GUIDE_EVENTS_SESSION_SCOPED=true
SMOKE_GLOBAL_TABLE_COUNTS_USED=false
SMOKE_COUNT_SCOPING_PASS=true

GUIDE_SESSION_DELTA=0
GUIDE_SESSION_STEP_DELTA=0
GUIDE_COMMAND_RECEIPT_DELTA=0
LEARNING_EVENT_DELTA_FROM_GUIDE_REQUESTS=0

REGRESSION_FAILURES=<n>
SMOKE_RESULT=PASS|FAIL
```

After the pilot matrix, add the per-actor / per-session event counts:

```
GUIDE_SESSION_STARTED_EVENT_DELTA=1
PRACTICE_COMPLETED_EVENT_DELTA=1
ACTIVE_RECALL_ATTEMPTED_EVENT_DELTA=1
GUIDE_SESSION_COMPLETED_EVENT_DELTA=1
GUIDE_STEP_COMPLETED_EVENT_DELTA=0
CONCEPT_EXPLORED_FROM_GUIDE_DELTA=0
```

Nothing above is an identifier. Keep it that way — statuses, booleans and counts
only.
