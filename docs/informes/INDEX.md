# Bitácoras de sprints — índice cronológico

**Convención de nombres** (heredada de la evolución del proyecto):

- `sprint-0a.md`, `sprint-0b.md` — Sprints de setup (Plan v2).
- `sprint-s{N}.md` — Sprints S1–S11 (numerados por Plan v2).
- `sprint-s{N}-{titulo}.md` — Iteraciones / extensiones (e.g. `sprint-s6-crypto.md`).
- `sprint-{N}-{titulo}.md` — Sprints S37+ (cambió la convención dropping the "s" prefix).
- `sprint-{titulo}.md` — Sprints sin número Plan v2 (e.g. `sprint-b-polish.md`).
- `sprint-front-{area}.md` — Sprints UI puros sin equivalente backend.
- `deploy-{fecha}-incident.md` — Bitácoras de incidentes de deploy.

**Sesiones 1–10** son pre-Plan-v2 (bootstrap + módulos iniciales) y están condensadas inline en `CLAUDE.md` — no tienen bitácora separada por convención de la época.

---

## Tabla cronológica

| Sesión | Fecha      | Sprint                                                                                     | Archivo                                                                      |
| -----: | ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
|     11 | 2026-05-25 | Sprint 0.A — Global prefix + URI versioning                                                | [sprint-0a.md](sprint-0a.md)                                                 |
|     12 | 2026-05-25 | Sprint 0.B — Rate limiting + Idempotency + OpenAPI codegen                                 | [sprint-0b.md](sprint-0b.md)                                                 |
|     13 | 2026-05-25 | Sprint S1 — Auth hardening + AuthEvent + E2E infra                                         | [sprint-s1.md](sprint-s1.md)                                                 |
|     14 | 2026-05-26 | Sprint S2 — Email verification + Google OAuth + Resend                                     | [sprint-s2.md](sprint-s2.md)                                                 |
|     15 | 2026-05-26 | Sprint S3 — BullMQ worker + UsersModule jobs realizados                                    | [sprint-s3.md](sprint-s3.md)                                                 |
|     16 | 2026-05-26 | Sprint S4 — OnboardingModule (11 endpoints + catálogos)                                    | [sprint-s4.md](sprint-s4.md)                                                 |
|     17 | 2026-05-26 | Sprint S5 — BooksModule (rebrand) + HomeModule                                             | [sprint-s5.md](sprint-s5.md)                                                 |
|     18 | 2026-05-26 | Sprint S6 — DiarioModule (E2E encryption)                                                  | [sprint-s6.md](sprint-s6.md)                                                 |
|     19 | 2026-05-26 | Sprint S5-front (web) — Dashboard + Biblioteca + Detalle + Diario UI                       | [sprint-s5-front.md](sprint-s5-front.md)                                     |
|     20 | 2026-05-27 | Sprint S5-front-mobile — Paridad mobile (Home/Biblioteca/Detalle/Diario)                   | [sprint-s5-front-mobile.md](sprint-s5-front-mobile.md)                       |
|     21 | 2026-05-27 | Sprint S6-crypto — `@psico/crypto` package + Diario E2E cliente                            | [sprint-s6-crypto.md](sprint-s6-crypto.md)                                   |
|     22 | 2026-05-27 | Sprint S6-crypto-polish — Legacy salt backfill + BIP39 + detail views                      | [sprint-s6-crypto-polish.md](sprint-s6-crypto-polish.md)                     |
|     23 | 2026-05-27 | Sprint seed-and-password-rekey — Cripto completo (seed phrase + re-encrypt)                | [sprint-seed-and-password-rekey.md](sprint-seed-and-password-rekey.md)       |
|     24 | 2026-05-27 | Sprint S7 — SubscriptionModule + Usage + Stripe portal/cancel                              | [sprint-s7-subscription-usage.md](sprint-s7-subscription-usage.md)           |
|     25 | 2026-05-27 | Sprint S8 — VoiceModule (Whisper + Deepgram providers)                                     | [sprint-s8-voice.md](sprint-s8-voice.md)                                     |
|     26 | 2026-05-27 | Sprint S10 — AIModule conversacional (Eco chat + crisis + SSE)                             | [sprint-s10-eco-chat.md](sprint-s10-eco-chat.md)                             |
|     27 | 2026-05-27 | Sprint front-fase1 — Mi Plan UI (web + mobile)                                             | [sprint-front-fase1-mi-plan.md](sprint-front-fase1-mi-plan.md)               |
|     28 | 2026-05-27 | Sprint front-voz — Voice UI (web + mobile)                                                 | [sprint-front-voz.md](sprint-front-voz.md)                                   |
|     29 | 2026-05-27 | Sprint front-eco — Eco chat UI (web + mobile)                                              | [sprint-front-eco.md](sprint-front-eco.md)                                   |
|     30 | 2026-06-01 | Deploy a Railway + incident recovery + 3 bugfixes                                          | [deploy-2026-06-01-incident.md](deploy-2026-06-01-incident.md)               |
|     31 | 2026-06-02 | Sprint S11 — BillingModule rebrand (/api/billing/\*) + `/api/plan` envolvente              | [sprint-s11-billing-cleanup.md](sprint-s11-billing-cleanup.md)               |
|     32 | 2026-06-02 | Sprint S6 LectorModule backend — ChapterBlocks + Highlights + Annotations + ReadingSession | [sprint-s6-lector.md](sprint-s6-lector.md)                                   |
|     33 | 2026-06-02 | Sprint S6-front Reader UI (web + mobile)                                                   | [sprint-s6-front-lector.md](sprint-s6-front-lector.md)                       |
|     34 | 2026-06-03 | Sprint S4-front Onboarding UI (web + mobile)                                               | [sprint-s4-front-onboarding.md](sprint-s4-front-onboarding.md)               |
|     35 | 2026-06-03 | Sprint S10 PatronesModule + UI (Pro analytics)                                             | [sprint-s10-patrones.md](sprint-s10-patrones.md)                             |
|     36 | 2026-06-03 | Sprint B — Pulir Phase 1 (Eco reports UI + paginación)                                     | [sprint-b-polish.md](sprint-b-polish.md)                                     |
|     37 | 2026-06-03 | Sprint S37 — Tour overlay onboarding                                                       | [sprint-37-tour.md](sprint-37-tour.md)                                       |
|     38 | 2026-06-03 | Sprint S38 — LLM-backed WeeklySummary (Claude Sonnet 4.6)                                  | [sprint-38-llm-weekly.md](sprint-38-llm-weekly.md)                           |
|     39 | 2026-06-04 | Sprint S39 — UI tests web (Vitest + RTL setup + 24 tests)                                  | [sprint-39-web-ui-tests.md](sprint-39-web-ui-tests.md)                       |
|     40 | 2026-06-04 | Sprint S40 — UI tests mobile (Jest + RNTL + 16 tests)                                      | [sprint-40-mobile-ui-tests.md](sprint-40-mobile-ui-tests.md)                 |
|     41 | 2026-06-04 | Sprint S41 — CI tests por workspace + coverage opt-in                                      | [sprint-41-ci-wire-tests.md](sprint-41-ci-wire-tests.md)                     |
|     42 | 2026-06-04 | Sprint S42 — Pulso v2 · Admin reports Eco                                                  | [sprint-42-pulso-reports.md](sprint-42-pulso-reports.md)                     |
|     43 | 2026-06-05 | Sprint S43 — Push infrastructure (device tokens + Expo)                                    | [sprint-43-notifications.md](sprint-43-notifications.md)                     |
|     44 | 2026-06-05 | Sprint S44 — Notification processors (WeeklyDigest + InactiveNudge)                        | [sprint-44-notification-processors.md](sprint-44-notification-processors.md) |
|     45 | 2026-06-05 | Sprint S45 — Notifications UI + WeeklySummary wire en digest                               | [sprint-45-notifications-ui.md](sprint-45-notifications-ui.md)               |
|     46 | 2026-06-05 | Sprint S46 — Auto-generate WeeklySummary (cron domingo 23:00 UTC)                          | [sprint-46-auto-weekly-summary.md](sprint-46-auto-weekly-summary.md)         |
|     47 | 2026-06-05 | Sprint S47 — Web Push (VAPID + Service Worker + dual-platform PushService)                 | [sprint-47-web-push.md](sprint-47-web-push.md)                               |
|     48 | 2026-06-05 | Sprint S48 — Pulso v2 · Overview (admin KPIs dashboard)                                    | [sprint-48-pulso-overview.md](sprint-48-pulso-overview.md)                   |
|     49 | 2026-06-06 | Sprint S49 — Pulso v2 · Reports resolution flow (resolvedAt + tabs Open/Resolved)          | [sprint-49-reports-resolved.md](sprint-49-reports-resolved.md)               |
|     50 | 2026-06-08 | Sprint S50 — Pulso v2 · Time series + sparklines (PlatformMetricDaily + deltas)            | [sprint-50-pulso-timeseries.md](sprint-50-pulso-timeseries.md)               |
|     51 | 2026-06-08 | Sprint S51 — Pulso v2 · Cohort retention triangle (CohortRetentionWeek + heatmap)          | [sprint-51-cohort-retention.md](sprint-51-cohort-retention.md)               |

---

## Cómo navegar

- **Para ver un sprint específico** — Click en el link del archivo.
- **Para entender la línea temporal completa** — `CLAUDE.md` mantiene el session log con Resumen para Notion de cada sesión + bullets clave + decisiones + deuda técnica abierta.
- **Para una visión de producto** — `docs/design/handoff/` tiene los specs de UI/UX y endpoints por área.

---

## Cobertura

**39 sprints documentados** (Sesiones 11–51, sin gaps).

Sesiones 1–10 (pre-Plan-v2, bootstrap → primer deploy) están condensadas inline en `CLAUDE.md`:

- **Sesión 1** — Bootstrap monorepo Turborepo
- **Sesión 2** — AuthModule (JWT + refresh)
- **Sesión 3** — ContentModule (predecesor de Books)
- **Sesión 4** — SubscriptionModule + Stripe + webhooks
- **Sesión 5** — Web app Next.js 14 (landing + auth + dashboard)
- **Sesión 6** — Deploy Railway + Vercel (producción activa)
- **Sesión 6B** — Payment Pool (strategy pattern multi-provider)
- **Sesión 7** — Mobile app React Native + Expo Router
- **Sesión 8** — AIModule Claude API + pgvector + RAG
- **Sesión 9** — UsersModule (12 endpoints, código local)
- **Sesión 10** — Planning v2 (`IMPLEMENTATION_PLAN_v2.md`)

Esos sprints son pre-convención bitácora, así que **NO** tienen archivo separado. La info detallada vive en el session log de `CLAUDE.md`.
