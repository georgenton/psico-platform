# CC-7 — Production runbook (off-first)

```
PRODUCTION_SYNC_STATUS=COMPLETED
PRODUCTION_SHA=042afa523efce4639755c0a1998e1ed73bc7ab42
PRODUCTION_DEPLOYED_AT=2026-07-31
GR3_PRODUCTION_PILOT_SMOKE=PASS

GUIDE_PRODUCTION_DEPLOYED=true
GUIDE_PILOT_USERS_CONFIGURED=true
GUIDE_RECOMMENDED_INITIAL_PRODUCTION_MODE=off
GUIDE_ACTUAL_MODE_AT_2026_07_31_DEPLOY=pilot
GUIDE_MODE_CHANGE_REQUIRES_RESTART=true
ENV_OFF_FIRST_PLAN_READY=true
ENV_OFF_FIRST_APPLIED=false
ENVIRONMENT_CHANGED=false
DEPLOY_EXECUTED=true
```

El release descrito aquí **ya se ejecutó** el 2026-07-31 (`042afa52`) — ver
«Cierre» al final. Lo que sigue sin ejecutarse es la postura _off-first_: el modo
ya estaba en `pilot` cuando se desplegó, así que §1 describe el procedimiento
para un entorno que arranque de cero, no lo que ocurrió.
Evidencia: [cc7-production-readiness.md](cc7-production-readiness.md).
Smoke matrices: [cc7-production-smoke.md](cc7-production-smoke.md).

Every smoke count is taken **scoped to a dedicated smoke actor** (and, for
Guide-originated events, to the Guide session created during the run). Global
table counts are not an acceptable substitute — see the smoke document's
prechecks.

---

## 1. Environment posture — off-first

Set **before** the sync PR, so the very first production boot of CC-7 has Guide
closed for everyone.

```
API (Railway):
GUIDE_ROLLOUT_MODE=off
GUIDE_PILOT_USER_IDS=<unset>

Worker (Railway):
GUIDE_ROLLOUT_MODE=off
GUIDE_PILOT_USER_IDS=<unset>

Vercel (web): no Guide variable. Never the allowlist.
```

**API is the functional authority for the Guide rollout.** The API resolves and
applies `GUIDE_ROLLOUT_MODE`. The worker exposes no Guide command and does not
decide Guide command availability; mirroring the variable there is **deployment
posture**, so the two services never read a different answer. Nothing here claims
an absent value on the worker necessarily fails its boot.

**Vercel receives neither Guide rollout variable.**

This posture is **planned, not applied** (`ENV_OFF_FIRST_APPLIED=false`). Setting
and verifying it in Railway is step 1 below and is itself the open production
blocker recorded in the readiness document.

**A mode change is not instantaneous.** `GUIDE_ROLLOUT_MODE` is resolved **once at
boot** by `resolveGuideRolloutConfig`. Changing the variable needs no commit, no
migration and no new build, **but it only takes effect after restarting or
redeploying the API instances.** Plan every flip as _variable + restart_, never as
an instant switch.

Fail-closed at boot on a deployed box: a missing mode, an invalid mode, or
`pilot` without a non-empty allowlist is a **boot config error** — the service
refuses to start ambiguous rather than starting open.

---

## 2. Promotion strategy — exact-tree sync commit

Because of the squash/sync history, a plain `develop → main` PR is not guaranteed
to produce a clean merge or an exact tree. The candidate is an exact-tree sync
commit whose tree is byte-identical to the approved `develop`.

### 2.0 Re-validate the rehearsal first

The runtime rehearsal ran against
`RUNTIME_REHEARSAL_SHA=52d7764063ccdea650fb049edeed7592782be4c5`. Merging the
readiness PR advances develop past that point, so before building any sync commit:

```bash
git fetch origin
git diff --name-status \
  52d7764063ccdea650fb049edeed7592782be4c5 \
  origin/develop
```

The delta must contain **only** these three paths:

```
docs/operations/cc7-production-readiness.md
docs/operations/cc7-production-runbook.md
docs/operations/cc7-production-smoke.md
```

If it does — the rehearsal still describes the code being shipped:

```
POST_REHEARSAL_RUNTIME_CHANGE_DETECTED=false
RUNTIME_REHEARSAL_REMAINS_VALID=true
```

If anything else appears — runtime, schema, migration, package, workflow, web or
mobile — the rehearsal is stale and describes code that is no longer what would
ship:

```
POST_REHEARSAL_RUNTIME_CHANGE_DETECTED=true
PRODUCTION_PREP_STATUS=BLOCKED_REHEARSAL_STALE
```

Stop and repeat the affected inventory/rehearsal. Do not promote on the strength
of a rehearsal that predates a runtime change.

### 2.1 Building the commit

**Use the tree of the new approved SHA** (`origin/develop` as re-read above) —
never the historical `52d7764` tree, which no longer includes these documents.

```bash
PARENT=$(git rev-parse origin/main)
TREE=$(git rev-parse origin/develop^{tree})
SYNC_COMMIT=$(printf '%s\n' \
  'chore(sync): promote CC-7 and Guide pilot gate to production' |
  git commit-tree "$TREE" -p "$PARENT")
```

**Not executed in CC-7.R2.** No `commit-tree`, no branch from `main`, no push, no
PR to `main`.

It may only be used once all of these hold:

```
MAIN_TREE_HISTORY_RECONCILED=true                  ✅ (readiness §1)
MAIN_ONLY_SEMANTIC_CHANGES=0                       ✅ (readiness §1)
LOCAL_MIGRATION_REHEARSAL=PASS                     ✅ (readiness §4)
ROLLBACK_COMPATIBILITY=PASS                        ✅ (readiness §5, runtime booted)
LOCAL_CONTENT_BACKFILL_CLI_APPLY_PASS=true         ✅ (readiness §6.2)
RUNTIME_REHEARSAL_REMAINS_VALID=true               ⬜ NOT YET — §2.0 above (procedural gate)
ENV_OFF_FIRST_APPLIED=true                         ⬜ blocker 1 — step 1 below
PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=true      ┐
PRODUCTION_LEARNING_EVENT_SIZE_CHECKED=true             │ blocker 2 — precheck,
PRODUCTION_LEARNING_EVENT_WRITE_ACTIVITY_CHECKED=true   │ readiness §3
EXPECTED_INDEX_WINDOW_APPROVED=true                     ┘
```

The two blockers are the reason readiness reads `PARTIALLY_VERIFIED`, not `READY`
(`PRODUCTION_BLOCKERS=2`). The rehearsal revalidation is a **procedural** gate on
this execution, not a third production blocker.

The precheck reports **only those four booleans** — no counts, no sizes, no rows,
no identities.

Verification the future execution must demand, before merging:

```
sync commit parent == current origin/main   (re-read at that moment)
sync commit tree   == approved origin/develop tree
force push == false
```

If `origin/main` moved since the parent was captured, recapture and rebuild the
commit — never force.

---

## 3. Deploy order

Activation of the pilot is **not** part of the first deploy.

```
 0. Precheck: read LearningEvent production row count (count only), size the
    unique-index lock window, get that window approved.  (readiness §3)
 1. Stage env posture: GUIDE_ROLLOUT_MODE=off, GUIDE_PILOT_USER_IDS unset.
 2. Verify API and worker carry the same posture → ENV_OFF_FIRST_APPLIED=true.
 3. Create the exact-tree sync PR to main.
 4. Wait for CI.
 5. Merge (authorised).
 6. Wait for Railway API + worker + Vercel to report success.
 7. Confirm migrations applied (expect the 2 net migrations, once each).
 8. Run the approved production ingestion.
 9. Run the smoke suite with Guide still off, using the dedicated smoke actor
    (all counts scoped to it — never global table counts).
10. Observe stability.
11. Configure the approved pilot user IDs.
12. Set GUIDE_ROLLOUT_MODE=pilot.
13. Restart / redeploy the API.
14. Run the cohort smoke.
```

Steps 1–10 are the _release_. Steps 11–14 are a separate, later decision that can
be deferred indefinitely without leaving the system in a half-state.

### Ingestion (step 8)

Five ordered moves — the guard is opened for the apply and closed again, never
left standing open:

```
1. dry-run:
   node dist/content-core/backfill-cli.js --book-slug=<slug>
2. review the report: drift_conflicts, unresolved_blocks,
   destructive_operations, database_writes=0, backfill_safe=true
3. temporarily enable the guard: ALLOW_CONTENT_CORE_BACKFILL=on
4. apply:
   ALLOW_CONTENT_CORE_BACKFILL=on \
     node dist/content-core/backfill-cli.js --book-slug=<slug> --apply
5. verify, then REMOVE ALLOW_CONTENT_CORE_BACKFILL (or restore its prior
   posture). Do not leave the backfill guard permanently open.
```

The CLI records `previous_published_revision_id` and `previous_main_sha` as
rollback registers; capture both from its output. On a first backfill the
previous pointer is `null` — that is the register's initial state, not an error.
stdout is metrics-only by design — do not paste block text, titles or quotes into
any report.

**Re-running is safe but not free.** A repeat apply converges structurally (same
row counts, no new `Revision`) yet still upserts `Work.title` / `Work.authorName`,
`Edition.slug` and `Concept.label`, bumping their `@updatedAt`
(`LOCAL_SECOND_CLI_WRITE_NOOP=false`, readiness §6.3). Treat a re-run as a real
write, not a no-op.

**What ingestion creates, and what it does not:**

```
Exercise rows are created/verified by ingestion.
GuideDefinition is code-owned and is verified by target resolution; it is not
inserted by the backfill CLI.
```

There is no `GuideDefinition` table. The definition lives in
`apps/api/src/guide/guide-catalog.ts`; ingestion creates the `Exercise` rows its
steps resolve against, and success is confirmed by resolution, not by a row count
for the guide itself.

Expected post-ingestion shape (from the local rehearsal, readiness §6.2): the
pinned definition at version 1 with 3 steps, resolving against 1 practice target
(`REFLECTION`) and 1 objective-recall target (`QUIZ`).

---

## 4. Rollback

Two independent levels. Prefer the first.

### Level 1 — kill switch (Guide only)

```
GUIDE_ROLLOUT_MODE=off
→ restart / redeploy the API
```

Does **not** delete: `GuideSession`, `GuideSessionStep`, `GuideCommandReceipt`,
`LearningEvent`, or the client-side recovery record. A denied command answers
`503 GUIDE_UNAVAILABLE` and writes nothing, so progress already saved survives
for whenever the gate reopens.

Scope of the switch, precisely:

```
GUIDE_OFF_PREVENTS_GUIDE_EVENTS=true
GUIDE_OFF_PREVENTS_ALL_LEARNING_V1_EVENTS=false
```

It closes the five Guide commands before the lifecycle, so no Guide-originated
LearningEvent is written. It does **not** disable the standalone Learning HTTP
commands, which remain reachable and may keep writing V1 events. Reach for it
first for Guide problems — it is narrow, reversible, and touches no other
surface — but do not treat it as a global LearningEvent kill switch.

### Level 2 — code rollback (all three surfaces together)

Target: `c4a4b5bf59a82c31aef60d9d4e2c6ff58620fd7e`

Roll back **web + API + worker together**. Do not roll back a single surface
unless a diagnosis explicitly names it — mixed versions across the API/web
contract are their own outage.

No down migration is required: the readiness rehearsal **built and booted** main's
API and worker against the upgraded schema — health 200, auth and content smoke
green, worker processors alive, zero Prisma errors (readiness §5).

Rollback to `c4a4b5b` stays approved, and it stays approved **even once V1 rows
exist**. The reason is narrow and worth stating exactly:

```
MAIN_RUNTIME_LEARNING_EVENT_READS=0
```

Main tolerates rows carrying `CONCEPT_EXPLORED`, `ACTIVE_RECALL_ATTEMPTED` or
`PRACTICE_COMPLETED` because it never reads that table — not because such rows
are assumed absent. They will not be absent: the standalone Learning HTTP
commands write them regardless of Guide rollout (readiness §5). An older Prisma
client genuinely cannot deserialise a new enum value, so **before choosing any
rollback SHA other than `c4a4b5b`, verify that target's `LearningEvent` reads.**

### Triggers

Any one of these justifies rollback:

- migration failure
- API crash-loop
- worker crash-loop
- `/health` != 200
- auth refresh regression
- **Guide reachable while `mode=off`** (gate integrity failure)
- FREE entitlement bypass
- unexpected Prisma integrity error
- reader / marks regression
- Emotional Map delta caused by Guide

The Guide-specific triggers (gate integrity, Map delta) are satisfied by the
kill switch. The infrastructure triggers need the code rollback.

---

## Cierre — GR-2 + GR-3 en producción (2026-07-31)

El sync `develop → main` se ejecutó como **merge commit** (`042afa52`, dos
padres), no como squash: era el punto del ejercicio. `develop` quedó como
ancestro real de `main` por primera vez, así que las promociones siguientes
parten de una base compartida en vez de re-derivar el árbol a mano.

```
MERGE_METHOD_USED=merge
MERGE_COMMIT=042afa523efce4639755c0a1998e1ed73bc7ab42
MERGE_PARENTS=c7295cdc(main) + 8758c777(PR head)
DEVELOP_IS_ANCESTOR_OF_MAIN=true

MIGRATIONS_APPLIED=2
  20260729120000_gr2_chapter_media_completed
  20260730120000_gr3_resonance_source_guide

API_DEPLOYMENT_STATUS=success
WORKER_DEPLOYMENT_STATUS=success
WEB_DEPLOYMENT_STATUS=ready
POST_DEPLOY_ERRORS=0
```

Ambas migraciones son `ALTER TYPE … ADD VALUE` aditivas y se aplicaron en el
`preDeployCommand`; no reescriben filas ni admiten `down`.

**El modo ya estaba en `pilot` antes de este deploy.** La secuencia off-first
descrita arriba es la **recomendación** (`GUIDE_RECOMMENDED_INITIAL_PRODUCTION_MODE=off`),
no lo que ocurrió (`GUIDE_ACTUAL_MODE_AT_2026_07_31_DEPLOY=pilot`). Se conserva
como procedimiento para un entorno que arranque de cero.

El smoke del recorrido completo está en
[`../product/guide-v1-pilot-rollout.md`](../product/guide-v1-pilot-rollout.md);
el contrato de controles, en
[`../product/guided-reading-v1.md`](../product/guided-reading-v1.md) §8.6.
