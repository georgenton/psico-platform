# CC-7 — Production runbook (off-first)

```
PRODUCTION_SYNC_STATUS=NOT_STARTED
GUIDE_PRODUCTION_DEPLOYED=false
GUIDE_PILOT_USERS_CONFIGURED=false
GUIDE_INITIAL_PRODUCTION_MODE=off
GUIDE_MODE_CHANGE_REQUIRES_RESTART=true
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

The command gate lives in the **API**. Keeping the same posture on the **worker**
is operational coherence — both services read one config and neither can drift
into a different answer — not a functional requirement.

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
MAIN_TREE_HISTORY_RECONCILED=true     ✅ (readiness §1)
MAIN_ONLY_SEMANTIC_CHANGES=0          ✅ (readiness §1)
LOCAL_MIGRATION_REHEARSAL=PASS        ✅ (readiness §4)
ROLLBACK_COMPATIBILITY=PASS           ✅ (readiness §5)
ENV_OFF_FIRST_READY=true              ✅ (§1 above, once actually set)
```

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
 1. Stage env posture: GUIDE_ROLLOUT_MODE=off, GUIDE_PILOT_USER_IDS unset.
 2. Verify API and worker carry the same posture.
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

```
node dist/content-core/backfill-cli.js --book-slug=<slug>           # dry-run first
node dist/content-core/backfill-cli.js --book-slug=<slug> --apply   # then apply
```

`--apply` on a deployed box also requires `ALLOW_CONTENT_CORE_BACKFILL=on`. Read
the dry-run report before applying. The CLI records
`previous_published_revision_id` and `previous_main_sha` as rollback registers;
capture both from its output. stdout is metrics-only by design — do not paste
block text, titles or quotes into any report.

Expected post-ingestion shape (from the local rehearsal): 1 guide definition at
version 1, 3 steps, 1 practice target, 1 objective-recall target.

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

No down migration is required: the readiness rehearsal proved main's code runs
against the upgraded schema (readiness §5). Note the recorded invariant — main
never queries `LearningEvent`, which is what makes the new enum values harmless
to it. Re-check that property before choosing a different rollback SHA.

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
