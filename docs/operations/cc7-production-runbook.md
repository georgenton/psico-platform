# CC-7 — Production runbook (off-first)

```
PRODUCTION_SYNC_STATUS=NOT_STARTED
GUIDE_PRODUCTION_DEPLOYED=false
GUIDE_PILOT_USERS_CONFIGURED=false
GUIDE_INITIAL_PRODUCTION_MODE=off
GUIDE_MODE_CHANGE_REQUIRES_RESTART=true
ENV_OFF_FIRST_PLAN_READY=true
ENV_OFF_FIRST_APPLIED=false
ENVIRONMENT_CHANGED=false
DEPLOY_EXECUTED=false
```

Nothing in this runbook has been executed. It is the plan to be authorised
separately. Evidence: [cc7-production-readiness.md](cc7-production-readiness.md).
Smoke matrices: [cc7-production-smoke.md](cc7-production-smoke.md).

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
commit whose tree is byte-identical to the approved `develop`:

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
ENV_OFF_FIRST_APPLIED=true                         ⬜ NOT YET — step 1 below
PRODUCTION_LEARNING_EVENT_CARDINALITY_CHECKED=true ⬜ NOT YET — precheck, readiness §3
EXPECTED_INDEX_WINDOW_APPROVED=true                ⬜ NOT YET — precheck, readiness §3
```

The three unchecked rows are the reason readiness reads
`PARTIALLY_VERIFIED`, not `READY`.

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
 9. Run the smoke suite with Guide still off.
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

Reach for this first: it is narrow, reversible, and touches no other surface.

### Level 2 — code rollback (all three surfaces together)

Target: `c4a4b5bf59a82c31aef60d9d4e2c6ff58620fd7e`

Roll back **web + API + worker together**. Do not roll back a single surface
unless a diagnosis explicitly names it — mixed versions across the API/web
contract are their own outage.

No down migration is required: the readiness rehearsal **built and booted** main's
API and worker against the upgraded schema — health 200, auth and content smoke
green, worker processors alive, zero Prisma errors (readiness §5). Note the
recorded invariant — main never queries `LearningEvent`, which is what makes the
new enum values harmless to it. An older client genuinely cannot read a new enum
value; re-check that property before choosing a different rollback SHA.

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
