# Deploy trigger

This file exists to force Railway's auto-deploy watch path to trigger
when the deploy pipeline needs a kick. Railway services configured with
"watch paths = apps/api/\*\*" only redeploy when files under this path
change, so a root-only commit (e.g. a pnpm-lock.yaml security override)
will be SKIPPED.

When that happens, bump the deploy trigger comment below and push.

<!-- bump 2026-06-09 03:13 UTC — react-server-dom-webpack CVE override -->


## Cache-bust 2026-06-10 16:35 — S69 deploy
// Daily.co activated 20260610-1959
