# Staging for Content Studio

A deployed place to let real people edit and read real chapters, without any of
it touching production.

Not provisioned. Creating it adds a second Postgres and a second Redis to the
Railway project, which is a recurring cost, and the decision is Jorge's. What
follows is the design and the exact steps.

## Why not just test on production

Content Studio's whole job is editing published books. The risky operations are
the ones we most need to rehearse — publishing a revision, moving the audiobook
pointer, replacing a cover — and every one of them is visible to whoever is
reading that book at the time. A canary on production is a reasonable _later_
step; it is not where an editor should learn which button does what.

## What staging is made of

| Piece    | Choice                                                       | Why                                                     |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| API      | New Railway service, `staging` environment                   | Same image, different variables                         |
| Worker   | New Railway service                                          | Digests and nudges must not fire at real users          |
| Database | **New** Postgres in the staging environment                  | Editing is destructive; a shared DB defeats the point   |
| Redis    | New Redis                                                    | Cheap, and cache bleed across environments is confusing |
| Media    | **Existing `psico-media-dev` R2 bucket**                     | Already proven end to end; no new bucket needed         |
| Video    | **Not configured**                                           | Stream is deferred; staging must not need it            |
| Web      | Vercel preview/branch deployment pointing at the staging API | No new project                                          |
| Accounts | Test accounts only, created on staging                       | Never a production user record                          |

Reusing `psico-media-dev` is deliberate. It is private, non-production, and its
signed-read path is already proven by `smoke:r2`. A third bucket would be one
more thing to keep straight for no additional safety.

## The variables that must differ

Railway's environment duplication copies variables. That is the dangerous part:
duplicating production and deploying immediately would point a staging API at
the production database. **Override these before the first deploy.**

| Variable                                    | Staging value                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | The staging Postgres reference, never production's                               |
| `REDIS_URL`                                 | The staging Redis reference                                                      |
| `R2_BUCKET_NAME`                            | `psico-media-dev`                                                                |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | The dev bucket's credentials                                                     |
| `R2_PUBLIC_URL`                             | Unset, unless a public dev URL is configured                                     |
| `CLOUDFLARE_STREAM_*`                       | Unset — staging does not need video                                              |
| `CLOUDFLARE_STREAM_UPLOADS_ENABLED`         | `false` (the default; leaving it unset is fine)                                  |
| `STRIPE_*`                                  | Test-mode keys, or unset                                                         |
| `RESEND_API_KEY`                            | Unset, so staging cannot email a real person                                     |
| `NODE_ENV`                                  | `production` (it is a real deployment; this is not the dev/prod switch for data) |

The two that would do real damage if missed are `DATABASE_URL` and
`RESEND_API_KEY`. The first writes to production; the second writes to
someone's inbox.

## Steps

These need the Railway dashboard or an interactive shell; they change billing
and cannot be done from a non-interactive session.

1. **Create the environment.** Railway → `psico-platform` → Environments → New.
   Prefer creating it _empty_ over duplicating production, so no production
   variable is ever present even briefly. Name it `staging`.
2. **Add Postgres and Redis** to the staging environment from the Railway
   template catalog. Note their internal connection references.
3. **Add the API service**, pointed at the same repository, with root directory
   `apps/api` and the build/deploy commands already in `apps/api/railway.json`.
4. **Add the worker service**, same repository, start command
   `pnpm --filter @psico/api start:worker`.
5. **Set the variables** from the table above. Set them before the first
   deploy, not after.
6. **Deploy, then migrate.** `railway run --environment staging pnpm --filter
@psico/api prisma migrate deploy` (the `preDeployCommand` also does this).
7. **Seed content to edit.** Ingest a chapter into staging using the existing
   script; do not copy production rows.
8. **Create test accounts** on staging and promote one to `ADMIN` with the
   existing role-promotion procedure.
9. **Point a web deployment at it.** In Vercel, a preview branch with
   `NEXT_PUBLIC_API_URL` set to the staging API URL. Note that these must be
   added as **plain** variables, not "sensitive" — a sensitive `NEXT_PUBLIC_*`
   variable is empty at build time and produces a relative API URL that fails
   server-side. That has bitten this project before.
10. **Run the smoke matrix** in `docs/operations/content-studio-smoke.md`.

## Verifying staging is actually isolated

Before letting anyone in, confirm all four:

```
staging DATABASE_URL  ≠  production DATABASE_URL
staging R2_BUCKET_NAME == psico-media-dev
staging CLOUDFLARE_STREAM_ACCOUNT_ID is unset
staging RESEND_API_KEY is unset
```

If any of those is wrong, stop. The failure modes are writing to real books,
writing to the production bucket, and emailing real users.

## Cost

Four extra services, of which Postgres and Redis are the ones that accrue while
idle. Railway bills by usage, so the honest statement is: this is a small but
recurring increase, and the environment can be deleted when the pilot ends.
Whether that is worth it is a call only Jorge can make.
