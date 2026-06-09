# Sprint S62 — Terapia foundations (Crisis + Hub)

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s62-terapia-foundations`
**Tests:** 471/472 API + 34/34 crypto + 50/50 web + 20/20 mobile (461 → 471, +10 nuevos · 1 skipped sentinel)
**ADR producido:** [0014 — Video provider: Daily.co](../adr/0014-video-provider-daily-co.md)

---

## Lo que se construyó

Apertura del módulo Terapia (área 11 del diseño, boundary v1 según `docs/design/handoff/11-terapia.md`). De las 7 pantallas del boundary v1, este sprint shipea las DOS que el diseño marca como "no negociable v1" + foundations para el resto:

- **Pantalla 10 Crisis** — endpoint **público sin auth** + endpoint opt-in para logging anónimo.
- **Pantalla 1 Hub** — landing del usuario con `intro + activeTherapist + nextSession + recentPrescriptions`.

Las siguientes 5 pantallas (Directorio, Perfil terapeuta, Reserva 3 pasos, Pre-sesión, Mis sesiones, Post-sesión, Sala de video) aterrizan en S63–S66.

### Schema Prisma (8 modelos nuevos)

```
Therapist                    # catálogo curado por ops
TherapistAvailability        # slots semanales recurrentes
TherapistFavorite            # toggle del usuario
TherapistReview              # rating + tags + text público
TherapySession               # sesión con E2E intention + feedback
TherapyPrescription          # recetas del terapeuta
TherapyNotification          # inbox del usuario
CrisisLog                    # auditoría sin contenido sensible
```

5 enums (TherapyModality, TherapySessionStatus, TherapyPrescriptionKind, TherapyNotificationKind, CrisisTrigger).

**Migración** `20260609220000_s62_terapia_foundations` (aditiva, NO aplicada a Railway todavía).

### Endpoints (3 nuevos)

| Método | Path | Auth | Notas |
|---|---|---|---|
| GET | `/api/terapia/crisis?country=EC` | **PÚBLICO** | Decisión ética del diseño — no exigir login en crisis |
| POST | `/api/terapia/crisis/log` | Auth **opcional** | Audita usando `trigger` categórico + `contactedLineId`. SIN contenido |
| GET | `/api/terapia/hub` | Auth | Landing — intro, activeTherapist, nextSession, recentPrescriptions |

### Crisis catalog (`crisis-catalog.ts`)

Curado en código (no DB). EC + CO + MX con líneas reales + fallback internacional vía findahelpline.com. Diseñado para crecer sin migration.

Cada país expone:
- `lines[]` con `id, name, phone, whatsapp?, chatUrl?, availability, languages[]`
- `safetyTipsShort[]` (tips inmediatos)
- `nextSteps[]` (qué hacer en próximas 24h)

### Tipos compartidos

`@psico/types` extendido con: `TherapyModality`, `CrisisLine`, `CrisisResponse`, `CrisisTrigger`, `CrisisLogRequest`, `TherapistSummary`, `TherapyHubResponse`.

### Tests (+10)

`terapia.service.spec.ts`:
- getCrisis: EC default, EC explicit, fallback ZZ, lowercase normalization (4)
- logCrisis: row creation + anonymous fallback (2)
- getHub: empty state, activeTherapist from last COMPLETED, nextSession projection, prescriptions cap to 3 (4)

---

## Privacidad

ADR 0007 (E2E para Diario/Eco) extendido al patrón en `TherapySession`:
- `intentionCiphertext + intentionNonce` — el pre-session intention va cifrado cliente-side igual que Diario.
- `feedbackNoteCiphertext + feedbackNoteNonce` — la nota post-sesión también E2E.
- `sharedEntryIds: string[]` — IDs del Diario compartidos para esta sesión; el blob re-encriptado vive en `SharedDiaryEntry` (existente desde S6).

Therapist notes (visible solo al terapeuta) NO entran en este sprint — son del módulo B2B Editor de autor (S19+).

`CrisisLog` es estrictamente metadata: trigger categórico + contactedLineId. No texto. No mood. No IP cliente.

---

## Decisiones del sprint

1. **Crisis sin auth** — diseño es explícito: "alguien en crisis no debería tener que loguearse". Ruta pública.
2. **logCrisis con auth opcional** — `req.user` se lee directamente del request en lugar de gate guard; si no hay token, el row queda anónimo.
3. **Crisis catalog en código no DB** — cambia despacio, edita ops via PR. Una semana con 50k requests = 1 deploy.
4. **Therapist como tabla separada del User** — la mayoría son catálogos curados por ops sin app login. `userId` opcional para cuando se abra dashboard B2B (S19+).
5. **TherapistAvailability recurrente** — slots semanales que la API proyecta sobre los próximos 14 días, no rows futuras pre-creadas. Menos GC.
6. **TherapySession.priceUsd snapshot** — el precio se snapshotea en la sesión al reservar, así si el terapeuta sube tarifas el user paga lo que aceptó.
7. **8 modelos Prisma de una vez** — preferible a 3 sprints de migrations chicas que romperían el orden.
8. **TerapiaService.getHub() pequeño y pegado al diseño** — sin lógica de scoring/matching todavía (ese llega en S64 con el directorio).

---

## ADR 0014 — Video provider

Documenta:
- Decisión: **Daily.co** con interface `IVideoProvider` strategy.
- Razones: TURN regional São Paulo, iframe prebuilt, free tier suficiente para validación.
- Env vars: `VIDEO_PROVIDER` (`daily`/`console`), `DAILY_API_KEY`, `DAILY_API_URL`, `DAILY_DOMAIN`.
- Sala policy: audio+video, sin chat ni screenshare ni recording.
- Token expiry: 2h. Solo se entrega dentro de `[scheduledAt - 5min, scheduledAt + duration + 15min]`.

Implementación del provider aterriza en S65 cuando se construya `/api/terapia/sessions/:id/join`.

---

## Smoke verification

- API tests **471/472** (+10 nuevos · 1 skipped sentinel).
- Crypto tests 34/34.
- API typecheck OK.
- API lint OK (4 warnings preexistentes).
- Schema valid (`npx prisma validate`).

---

## Deuda técnica abierta

- **OpenAPI regen** — `apps/api/openapi.json` no se actualizó (requiere boot del API con DB local). Cliente generado quedó usando openapi viejo. Sin impacto en frontend porque puede llamar `apiFetch` directo a las nuevas rutas.
- **Migración acumulada** S62 sin aplicar en Railway (suma a las pendientes desde S9). Aplicar cuando se haga el próximo deploy.
- **DailyVideoProvider real** — aterriza en S65 (junto con `/sessions/:id/join`).
- **5 pantallas restantes** del boundary v1 — S63 (Directorio + Perfil), S64 (Reserva + Pre-sesión), S65 (Sala video + Post-sesión), S66 (Mis sesiones + Prescripciones + Notificaciones).
- **Seed de Therapist demo** — necesario para smoke testear el Hub end-to-end. Aterriza en S63.
- **Frontend del Crisis modal** — Eco ya tiene `CrisisModal` desde S29 con datos hardcoded. En S63 web migrará a consumir `/api/terapia/crisis` real.
- **Pulso gates de Terapia** — el flag `terapia.enabled` que oculta la sección hasta que ops la habilite vive en `docs/design/pulso/HANDOFF.md`. No implementado todavía; se agrega cuando el módulo esté completo.

---

## Próximo sprint

**S63 — Directorio + Perfil terapeuta + seed:**
- GET `/api/terapia/therapists` (paginado + filtros)
- GET `/api/terapia/therapists/filters` (catálogo de filtros)
- GET `/api/terapia/therapists/:id` (detalle)
- GET `/api/terapia/therapists/:id/reviews` (paginado)
- POST `/api/terapia/therapists/:id/favorite` (toggle)
- Seed de 5-8 terapeutas demo en Ecuador
- Web `/dashboard/terapia` y `/dashboard/terapia/terapeutas/:id`
- Mobile paridad
