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

Three gates must already be **true before the release starts** — they are the
open items from CC-7.R2, not smoke steps to discover on the way:

```
PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=true
EXPECTED_INDEX_WINDOW_APPROVED=true
ENV_OFF_FIRST_APPLIED=true
```

Record the booleans only. The cardinality figure itself may be operationally
sensitive — the boolean plus the window approval is the whole reportable
outcome; do not paste row counts or any row content.

Capture the four baseline counts **before** smoking, so every later delta is
meaningful:

```
GuideSession, GuideSessionStep, GuideCommandReceipt, LearningEvent
```

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

Deltas after the whole OFF matrix:

```
GuideSession delta        = 0
GuideSessionStep delta    = 0
GuideCommandReceipt delta = 0
LearningEvent delta       = 0
```

A non-zero delta here is a **STOP**: the gate is not holding.

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

GUIDE_SESSION_DELTA=0
GUIDE_SESSION_STEP_DELTA=0
GUIDE_COMMAND_RECEIPT_DELTA=0
LEARNING_EVENT_DELTA=0

REGRESSION_FAILURES=<n>
SMOKE_RESULT=PASS|FAIL
```
