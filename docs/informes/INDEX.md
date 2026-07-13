# Bitácoras de sprints — índice

**Última actualización:** 2026-07-13 · **143 bitácoras.**

Este índice agrupa las bitácoras **por programa/tema** (más útil que la cronología pura: las sesiones dejaron de numerarse tras S54). Para la **línea temporal completa** con Resumen para Notion, decisiones y deuda técnica por sesión, ver el session log de [`CLAUDE.md`](../../CLAUDE.md).

**Sesiones 1–10** (bootstrap → primer deploy) están condensadas inline en `CLAUDE.md` — sin bitácora separada por convención de la época.

**Convención de nombres:** `sprint-0a/0b` (setup) · `sprint-s{N}-{titulo}` (Plan v2, S1–S11) · `sprint-{N}-{titulo}` (S37+, sin prefijo "s") · `sprint-{titulo}` (sin número) · `sprint-v2-fase-{x}` (Mapa Emocional V2) · `deploy-{fecha}` (deploys/incidentes).

---

## 1 · Setup & núcleo backend (Plan v2)

| Archivo                                                            | Qué                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| [sprint-0a.md](sprint-0a.md)                                       | Global prefix + URI versioning + Swagger + shared kernel    |
| [sprint-0b.md](sprint-0b.md)                                       | Rate limiting + Idempotency + OpenAPI codegen               |
| [sprint-s1.md](sprint-s1.md)                                       | AuthModule hardening + AuthEvent + infra E2E                |
| [sprint-s2.md](sprint-s2.md)                                       | Email flows + OAuth Google + Resend                         |
| [sprint-s3.md](sprint-s3.md)                                       | UsersModule prod-ready + worker BullMQ                      |
| [sprint-s4.md](sprint-s4.md)                                       | OnboardingModule (11 endpoints + catálogos)                 |
| [sprint-s5.md](sprint-s5.md)                                       | HomeModule + BooksModule expandido (rebrand)                |
| [sprint-s6.md](sprint-s6.md)                                       | DiarioModule con E2E encryption                             |
| [sprint-s7-subscription-usage.md](sprint-s7-subscription-usage.md) | SubscriptionModule completo (usage + cancel + invoices)     |
| [sprint-s8-voice.md](sprint-s8-voice.md)                           | VoiceModule (Whisper + Deepgram)                            |
| [sprint-s10-eco-chat.md](sprint-s10-eco-chat.md)                   | AIModule conversacional (Eco chat + crisis + SSE)           |
| [sprint-s11-billing-cleanup.md](sprint-s11-billing-cleanup.md)     | BillingModule + `GET /api/plan` + `GET /api/billing/return` |

## 2 · Frontend Fase 1 (web + mobile)

| Archivo                                                        | Qué                                        |
| -------------------------------------------------------------- | ------------------------------------------ |
| [sprint-s5-front.md](sprint-s5-front.md)                       | Web — Home + Biblioteca + Detalle + Diario |
| [sprint-s5-front-mobile.md](sprint-s5-front-mobile.md)         | Paridad mobile (React Native)              |
| [sprint-s4-front-onboarding.md](sprint-s4-front-onboarding.md) | Onboarding UI (5 pantallas)                |
| [sprint-front-fase1-mi-plan.md](sprint-front-fase1-mi-plan.md) | Mi Plan (usage + invoices + cancel)        |
| [sprint-front-voz.md](sprint-front-voz.md)                     | Voice-to-text UI                           |
| [sprint-front-eco.md](sprint-front-eco.md)                     | Eco chat UI con SSE + cripto cliente       |
| [sprint-37-tour.md](sprint-37-tour.md)                         | Tour overlay onboarding (paso 5)           |
| [sprint-b-polish.md](sprint-b-polish.md)                       | Pulir Phase 1 (Eco reports + paginación)   |
| [sprint-polish-phase1.md](sprint-polish-phase1.md)             | Paginación Eco mobile                      |

## 3 · Cripto E2E (Diario / Eco)

| Archivo                                                                | Qué                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| [sprint-s6-crypto.md](sprint-s6-crypto.md)                             | `@psico/crypto` + Diario E2E en producción     |
| [sprint-s6-crypto-polish.md](sprint-s6-crypto-polish.md)               | Detail view + legacy salt backfill + BIP39     |
| [sprint-seed-and-password-rekey.md](sprint-seed-and-password-rekey.md) | Backup UI + rotación de contraseña atómica     |
| [sprint-seed-recovery.md](sprint-seed-recovery.md)                     | Mostrar seed phrase desde Security             |
| [sprint-fix-salt-length.md](sprint-fix-salt-length.md)                 | Fix DTO salt-length + audit                    |
| [sprint-e2e-rekey-lectorshell.md](sprint-e2e-rekey-lectorshell.md)     | E2E re-encrypt full-circle + LectorShell tests |

## 4 · Lector (Modo Libro / Modo Guía)

| Archivo                                                                | Qué                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| [sprint-s6-lector.md](sprint-s6-lector.md)                             | LectorModule backend (blocks + highlights + annotations) |
| [sprint-s6-front-lector.md](sprint-s6-front-lector.md)                 | Reader UI (web + mobile)                                 |
| [sprint-mobile-highlights.md](sprint-mobile-highlights.md)             | Highlights block-level v1 (mobile)                       |
| [sprint-lector-audio.md](sprint-lector-audio.md)                       | Audio playback web + mobile                              |
| [sprint-lector-audio-polish.md](sprint-lector-audio-polish.md)         | Transcript sync + speed control                          |
| [sprint-lector-audio-background.md](sprint-lector-audio-background.md) | Background playback + sleep timer                        |
| [sprint-lector-audio-metadata.md](sprint-lector-audio-metadata.md)     | Lock-screen artwork + API contract                       |
| [sprint-lector-audio-tests.md](sprint-lector-audio-tests.md)           | UI tests del LectorAudioBar                              |
| [sprint-lector-video-player.md](sprint-lector-video-player.md)         | Reproductor de video inline (backlog #3)                 |

## 5 · Arco de libros (contenido real + acompañamiento)

| Archivo                                                                  | Qué                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| [sprint-a-chapter-ingestion.md](sprint-a-chapter-ingestion.md)           | Ingesta de capítulos reales (Parte I)                   |
| [sprint-a2-book-parts.md](sprint-a2-book-parts.md)                       | Partes del libro + Modo Libro/Guía                      |
| [sprint-b-eco-contextual.md](sprint-b-eco-contextual.md)                 | Eco contextual en el lector (subrayar → profundizar)    |
| [sprint-reader-companion.md](sprint-reader-companion.md)                 | Panel compañero (dock/sheet) + actividades interactivas |
| [sprint-post-exercise-nudges.md](sprint-post-exercise-nudges.md)         | Nudges post-ejercicio (backlog #2)                      |
| [sprint-eco-adaptive-suggestions.md](sprint-eco-adaptive-suggestions.md) | Sugerencias adaptativas de Eco                          |
| [sprint-arc-exercise-resonance.md](sprint-arc-exercise-resonance.md)     | Resonancia desde ejercicios (3er origen ARC)            |

## 6 · Mapa Emocional — modelo (Etapas 0–6)

> El detalle por Etapa vive en el session log de `CLAUDE.md` + `docs/research/`. Bitácoras dedicadas:

| Archivo                                                            | Qué                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| [emotional-map-hybrid-phase-a.md](emotional-map-hybrid-phase-a.md) | Híbrido Fase A (honestidad + señales ricas + transparencia) |
| [emotional-map-tier2-live.md](emotional-map-tier2-live.md)         | Tier 2 (OU) en vivo                                         |
| [emotional-map-affect-surface.md](emotional-map-affect-surface.md) | Dinámica afectiva visible + siembra de datos                |
| [e2e-prod-emotional-map.md](e2e-prod-emotional-map.md)             | Runbook E2E del Mapa en producción                          |

**Research asociado:** `docs/research/emotional-map-{benchmark,affect-dynamics,model-registry}.md` · `docs/research/paper-1-*.md`.

## 7 · Mapa Emocional V2 (Fases A–H · Facts/Narrator)

> Programa de transformación. Arquitectura: `docs/architecture/emotional-map-v2.md` · [ADR 0014](../adr/0014-emotional-map-v2-facts-narrator.md). Fase A resumida en la arquitectura (sin bitácora dedicada).

| Archivo                                                                        | Fase                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| [sprint-v2-fase-b-contratos.md](sprint-v2-fase-b-contratos.md)                 | B — contratos, registry, flags, ratchets          |
| [sprint-v2-fase-b-prime-hotfix.md](sprint-v2-fase-b-prime-hotfix.md)           | B' — hotfix L1 (EWS off · gate 100 · copy neutro) |
| [sprint-v2-fase-c-learning.md](sprint-v2-fase-c-learning.md)                   | C — aprendizaje ≠ mapa (LearningDashboard)        |
| [sprint-v2-fase-d-consent.md](sprint-v2-fase-d-consent.md)                     | D — opt-in análisis local (L4) + Evidence lite    |
| [sprint-v2-fase-e-arc.md](sprint-v2-fase-e-arc.md)                             | E — ciclo ARC (resonancias confirmadas)           |
| [sprint-v2-fase-f-ui-v2.md](sprint-v2-fase-f-ui-v2.md)                         | F — UI V2 (L2 radar autoinforme + L3 Narrator)    |
| [sprint-v2-fase-g-legacy-retirement.md](sprint-v2-fase-g-legacy-retirement.md) | G — el V2 es el producto (retiro legacy)          |
| [sprint-v2-fase-h-eco-contextual.md](sprint-v2-fase-h-eco-contextual.md)       | H — Eco contextual + ARC-P1 (Propósito)           |

## 8 · Patrones (Pro analytics)

| Archivo                                            | Qué                                |
| -------------------------------------------------- | ---------------------------------- |
| [sprint-s10-patrones.md](sprint-s10-patrones.md)   | PatronesModule + UI (paywall FREE) |
| [sprint-38-llm-weekly.md](sprint-38-llm-weekly.md) | LLM-backed WeeklySummary           |

## 9 · Notificaciones (push · email · timezone)

| Archivo                                                                      | Qué                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [sprint-43-notifications.md](sprint-43-notifications.md)                     | Push infra (device tokens + Expo)          |
| [sprint-44-notification-processors.md](sprint-44-notification-processors.md) | WeeklyDigest + InactiveNudge processors    |
| [sprint-45-notifications-ui.md](sprint-45-notifications-ui.md)               | Notifications UI + WeeklySummary en digest |
| [sprint-46-auto-weekly-summary.md](sprint-46-auto-weekly-summary.md)         | Auto-generate WeeklySummary (cron domingo) |
| [sprint-47-web-push.md](sprint-47-web-push.md)                               | Web Push (VAPID + Service Worker)          |
| [sprint-53-timezone-aware.md](sprint-53-timezone-aware.md)                   | Crons conscientes del huso horario         |
| [sprint-54-timezone-settings.md](sprint-54-timezone-settings.md)             | TimezoneCard Settings UI + tests           |
| [sprint-heartbeat-webpush-tests.md](sprint-heartbeat-webpush-tests.md)       | Tests de heartbeat + web push              |
| [sprint-e5-live-activities-stub.md](sprint-e5-live-activities-stub.md)       | Live Activities backend stub               |

## 10 · Pulso v2 (back-office admin)

| Archivo                                                        | Qué                                          |
| -------------------------------------------------------------- | -------------------------------------------- |
| [sprint-42-pulso-reports.md](sprint-42-pulso-reports.md)       | Admin reports Eco (inbox)                    |
| [sprint-48-pulso-overview.md](sprint-48-pulso-overview.md)     | Overview (KPIs dashboard)                    |
| [sprint-49-reports-resolved.md](sprint-49-reports-resolved.md) | Reports resolution flow (tabs Open/Resolved) |
| [sprint-50-pulso-timeseries.md](sprint-50-pulso-timeseries.md) | Time series + sparklines                     |
| [sprint-51-cohort-retention.md](sprint-51-cohort-retention.md) | Cohort retention triangle                    |
| [sprint-s72-admin-users.md](sprint-s72-admin-users.md)         | Admin user search + role promotion           |

## 11 · Terapia (v2)

| Archivo                                                                          | Qué                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| [sprint-62-terapia-foundations.md](sprint-62-terapia-foundations.md)             | Foundations (Crisis + Hub)                    |
| [sprint-63-terapia-directory.md](sprint-63-terapia-directory.md)                 | Directorio + Perfil terapeuta + seed          |
| [sprint-64-terapia-booking.md](sprint-64-terapia-booking.md)                     | Reserva + Pre-sesión (E2E intention)          |
| [sprint-65-terapia-session.md](sprint-65-terapia-session.md)                     | Sala video + Post-sesión + Technical report   |
| [sprint-66a-stripe-one-time.md](sprint-66a-stripe-one-time.md)                   | Stripe Checkout one-time + webhook            |
| [sprint-66b-terapia-lifecycle.md](sprint-66b-terapia-lifecycle.md)               | Lifecycle endpoints                           |
| [sprint-67-terapia-web.md](sprint-67-terapia-web.md)                             | Frontend web (Hub + Directorio + Sesiones)    |
| [sprint-67b-terapia-booking-web.md](sprint-67b-terapia-booking-web.md)           | Web · Reserva + Pre-sesión E2E                |
| [sprint-67c-terapia-lifecycle-web.md](sprint-67c-terapia-lifecycle-web.md)       | Web · Post-sesión + Notifs + Recetas + Crisis |
| [sprint-67d-video-reschedule-web.md](sprint-67d-video-reschedule-web.md)         | Web · Sala video Daily SDK + Reschedule       |
| [sprint-68-terapia-mobile.md](sprint-68-terapia-mobile.md)                       | Mobile · Hub + Directorio + Sesiones + Crisis |
| [sprint-68b-terapia-mobile-lifecycle.md](sprint-68b-terapia-mobile-lifecycle.md) | Mobile · Pre-sesión + Feedback + Reschedule   |
| [sprint-69-daily-video-provider.md](sprint-69-daily-video-provider.md)           | DailyVideoProvider real (Daily.co REST)       |
| [sprint-s70-daily-webhooks.md](sprint-s70-daily-webhooks.md)                     | Daily.co webhooks (duración real de sesión)   |
| [sprint-therapy-mood-narrowing.md](sprint-therapy-mood-narrowing.md)             | `SessionPrep.checkInMood` enforcement         |

## 12 · Editor de autor (B2B)

| Archivo                                                                      | Qué                                |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| [sprint-s71-author-module.md](sprint-s71-author-module.md)                   | Backend core                       |
| [sprint-s71-front-author-workspace.md](sprint-s71-front-author-workspace.md) | Workspace web del autor            |
| [sprint-s71b-author-promotion.md](sprint-s71b-author-promotion.md)           | Book promotion (copy-on-publish)   |
| [sprint-s71b-author-notifications.md](sprint-s71b-author-notifications.md)   | Email al autor cuando admin decide |
| [sprint-s71b-front-author-reviews.md](sprint-s71b-front-author-reviews.md)   | Admin UI para revisar libros       |
| [sprint-s71c-uploads.md](sprint-s71c-uploads.md)                             | Cover + audio upload a R2          |
| [sprint-s71c-revenue.md](sprint-s71c-revenue.md)                             | Cobros + payout settings           |
| [sprint-s71c-author-ai-helpers.md](sprint-s71c-author-ai-helpers.md)         | AI helpers en el editor            |

## 13 · Perfil · Auth · Biblioteca (features de producto)

| Archivo                                                              | Qué                                          |
| -------------------------------------------------------------------- | -------------------------------------------- |
| [sprint-perfil.md](sprint-perfil.md)                                 | Preferencias + Privacidad en el perfil       |
| [sprint-57-perfil-ui.md](sprint-57-perfil-ui.md)                     | Perfil UI (web + mobile)                     |
| [sprint-58-google-signin.md](sprint-58-google-signin.md)             | Google Sign-In (web)                         |
| [sprint-59-avatar-email-change.md](sprint-59-avatar-email-change.md) | Avatar upload + Email change                 |
| [sprint-diary-edit.md](sprint-diary-edit.md)                         | Editar entrada del Diario                    |
| [sprint-diary-edit-meta.md](sprint-diary-edit-meta.md)               | Editar mood + tags desde el detalle          |
| [sprint-bookmarks-ui.md](sprint-bookmarks-ui.md)                     | Filtrar libros por favoritos + guardados     |
| [sprint-bookmark-sort.md](sprint-bookmark-sort.md)                   | Ordenar favoritos/guardados por recency      |
| [sprint-bookcard-indicators.md](sprint-bookcard-indicators.md)       | Bookmark/favorito en grid card mobile        |
| [sprint-marked-at.md](sprint-marked-at.md)                           | `favoritedAt`/`bookmarkedAt` + "hace 3 días" |

## 14 · Diseño & paridad visual (Claude Design)

| Archivo                                                                                    | Qué                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| [sprint-f1-design-parity-internal-screens.md](sprint-f1-design-parity-internal-screens.md) | Paridad en pantallas internas            |
| [sprint-f2-design-parity-mapa-evolucion.md](sprint-f2-design-parity-mapa-evolucion.md)     | Paridad en Mapa + Evolución              |
| [sprint-f3-design-parity-polish.md](sprint-f3-design-parity-polish.md)                     | Polish final (Inicio · Biblioteca · Eco) |
| [sprint-g1-ui-tests-f1-f2-f3.md](sprint-g1-ui-tests-f1-f2-f3.md)                           | Tests UI para F1/F2/F3                   |
| [sprint-g2-emotional-map-snapshot.md](sprint-g2-emotional-map-snapshot.md)                 | EmotionalMapSnapshot + EvoChart real     |
| [sprint-g2b-home-stats-counters.md](sprint-g2b-home-stats-counters.md)                     | HomeStats con insights/patterns counters |
| [sprint-g2c-eslint-nestjs-override.md](sprint-g2c-eslint-nestjs-override.md)               | ESLint override para NestJS injectables  |
| [sprint-g3-consistency-sweep.md](sprint-g3-consistency-sweep.md)                           | Consistency sweep settings               |
| [sprint-g4-client-component-tests.md](sprint-g4-client-component-tests.md)                 | Tests UI InicioV2 + EcoShell             |
| [sprint-g-polish-replay-tour.md](sprint-g-polish-replay-tour.md)                           | Re-trigger tour button en Security       |

## 15 · Calidad · OpenAPI · DTOs · tests

| Archivo                                                                            | Qué                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| [sprint-39-web-ui-tests.md](sprint-39-web-ui-tests.md)                             | UI tests web (Vitest + RTL)                  |
| [sprint-40-mobile-ui-tests.md](sprint-40-mobile-ui-tests.md)                       | UI tests mobile (Jest + RNTL)                |
| [sprint-41-ci-wire-tests.md](sprint-41-ci-wire-tests.md)                           | Tests por workspace al CI + coverage         |
| [sprint-ui-tests.md](sprint-ui-tests.md)                                           | Tests Author + Pulso + AI helper             |
| [sprint-error-envelope.md](sprint-error-envelope.md)                               | `ErrorEnvelopeDto` 4xx/429 en Auth           |
| [sprint-error-envelope-propagate.md](sprint-error-envelope-propagate.md)           | Propagar a Users + Billing + Diario          |
| [sprint-error-envelope-propagate-rest.md](sprint-error-envelope-propagate-rest.md) | Propagar al resto de controllers             |
| [sprint-error-envelope-per-method.md](sprint-error-envelope-per-method.md)         | 409/410/422 por endpoint                     |
| [sprint-envelope-alignment-spec.md](sprint-envelope-alignment-spec.md)             | Drift detection envelope ↔ filter            |
| [sprint-dto-jsdoc-seeding.md](sprint-dto-jsdoc-seeding.md)                         | JSDoc field-level (5 DTOs)                   |
| [sprint-dto-jsdoc-round-2.md](sprint-dto-jsdoc-round-2.md)                         | JSDoc round 2 (8 DTOs)                       |
| [sprint-dto-jsdoc-round-3.md](sprint-dto-jsdoc-round-3.md)                         | JSDoc round 3 (10 DTOs)                      |
| [sprint-dto-jsdoc-round-4.md](sprint-dto-jsdoc-round-4.md)                         | JSDoc round 4 (11 DTOs)                      |
| [sprint-dto-jsdoc-round-5.md](sprint-dto-jsdoc-round-5.md)                         | JSDoc round 5 (DTOs v2)                      |
| [sprint-jsdoc-introspection.md](sprint-jsdoc-introspection.md)                     | Comments surfacean en OpenAPI                |
| [sprint-swagger-cli-plugin.md](sprint-swagger-cli-plugin.md)                       | Swagger CLI Plugin — full DTO coverage       |
| [sprint-cleanup-redundant-apiprop.md](sprint-cleanup-redundant-apiprop.md)         | Plugin deduce de `@IsIn`                     |
| [sprint-response-types-narrow.md](sprint-response-types-narrow.md)                 | `@ApiOkResponse` POC                         |
| [sprint-openapi-mood-enum.md](sprint-openapi-mood-enum.md)                         | `@ApiProperty({ enum })` para cliente narrow |
| [sprint-dto-mood-narrowing.md](sprint-dto-mood-narrowing.md)                       | Type + runtime enforcement de mood IDs       |
| [sprint-mood-enforcement.md](sprint-mood-enforcement.md)                           | Seed ↔ DIARY_MOODS alignment test            |
| [sprint-moods-shared.md](sprint-moods-shared.md)                                   | Extraer MOODS a `@psico/types`               |
| [sprint-user-mood-shared.md](sprint-user-mood-shared.md)                           | `WELLNESS_MOOD_IDS` en `@psico/types`        |
| [sprint-motivos-enforcement.md](sprint-motivos-enforcement.md)                     | Seed ↔ RECOMMENDATION_BY_MOTIVO alignment    |

## 16 · Ops · observability · deploys

| Archivo                                                        | Qué                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| [sprint-ops-bundle.md](sprint-ops-bundle.md)                   | Integrations health + embed audio script + boot banner |
| [sprint-sentry.md](sprint-sentry.md)                           | Observability (Sentry) en los 4 surfaces               |
| [deploy-2026-06-01-incident.md](deploy-2026-06-01-incident.md) | Incidente Railway (migration corruption) + recovery    |
| [deploy-2026-07-13-seed-fix.md](deploy-2026-07-13-seed-fix.md) | Auditoría env Railway/Vercel + fix seed idempotente    |

---

## Cómo navegar

- **Un sprint específico** → click en el link.
- **Línea temporal completa + decisiones + deuda** → session log de [`CLAUDE.md`](../../CLAUDE.md).
- **Diseño de producto** → `docs/design/handoff/` (specs UI/UX + endpoints por área).
- **Arquitectura** → `docs/adr/` (ADRs) + `docs/architecture/` + `docs/research/` (Mapa Emocional).

**Sesiones 1–10** (pre-convención bitácora) viven inline en `CLAUDE.md`: bootstrap monorepo · AuthModule · ContentModule · SubscriptionModule + Stripe · Web Next.js · Deploy Railway/Vercel · Payment Pool · Mobile RN + Expo · AIModule + pgvector + RAG · UsersModule · Planning v2.
