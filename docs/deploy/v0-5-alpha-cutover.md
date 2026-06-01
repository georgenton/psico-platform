# Deploy runbook · v0.5.0-alpha cutover

**Target release:** Plan v2 foundation + Fase 1 core (Sprints 0.A through S4)
**Trigger PR:** `feat/plan-v2-foundation-fase1-core` → `develop` → `main`
**Estimated downtime:** 5–15 min en una ventana de baja actividad
**Estrategia de cutover:** ventana de mantenimiento coordinada (no alias temporal)

> **Por qué ventana en lugar de alias:** Psico Platform v1 tiene tráfico bajo (~ decenas de usuarios) y el costo de mantener handlers duplicados durante 30 días supera el costo de 10 minutos de mantenimiento en una mañana de domingo. Documentado en CLAUDE.md Sesión de saneamiento, opción A.

---

## 0. Pre-requisitos (hacer ANTES de mergear el PR)

### 0.1 Provisionar Upstash Redis en Railway

1. Railway dashboard → proyecto Psico → **+ New** → **Database** → **Add Upstash Redis**.
2. Una vez provisionado, Railway expone `REDIS_URL` como variable. Copiar el valor (formato `rediss://default:<password>@<host>:<port>`).
3. Plan recomendado: free tier (10k commands/day) basta para v1 con < 100 usuarios activos.

### 0.2 Variables de entorno nuevas en el servicio `psico-api` Railway

| Variable           | Valor sugerido                                                     | Obligatoria en prod                  |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `REDIS_URL`        | (de Upstash)                                                       | ✅ — envSchema rechaza boot sin esto |
| `EMAIL_FROM`       | `no-reply@psico.app` (o tu dominio)                                | ✅ con default                       |
| `APP_URL`          | `https://psico-platform-web.vercel.app`                            | ✅ con default                       |
| `RESEND_API_KEY`   | (dejar vacío por ahora — emails caen a console log)                | ❌                                   |
| `GOOGLE_CLIENT_ID` | (dejar vacío — `/oauth/google` retorna `400 OAUTH_NOT_CONFIGURED`) | ❌                                   |

> `RESEND_API_KEY` y `GOOGLE_CLIENT_ID` son **opt-in**: el back boota sin ellos. `RESEND_API_KEY` se llena cuando se cree la cuenta Resend (Sprint S5 o cuando se necesite enviar emails reales). `GOOGLE_CLIENT_ID` cuando Google verifique el OAuth app (proceso de 4-6 semanas, ya iniciado).

### 0.3 Smoke test de la build en local

```bash
pnpm install
pnpm --filter @psico/types build
pnpm --filter @psico/api build         # incluye prisma generate + nest build
pnpm --filter @psico/api typecheck     # debe estar verde
pnpm --filter @psico/api test          # 217/217 ✅
pnpm --filter @psico/api-client generate:check  # OK
```

### 0.4 Mergear PR a `develop` y de ahí a `main`

`develop` → preview deploys / staging.
`main` → producción.

No merge a `main` hasta haber validado en `develop` que:

- Vercel preview renderiza el web sin 404s.
- Railway preview (si hay) bootea sin errores.

---

## 1. Aplicar migraciones Prisma (Railway prod)

**8 migraciones acumuladas** desde el último deploy (Sesión 8 = 2026-05-08). Todas son **additive only** — agregan tablas/columnas, no borran ni renombran. Compatible con la versión actual del back que está corriendo.

```bash
# Desde el directorio del proyecto local con DATABASE_URL apuntando a Railway prod:
pnpm --filter @psico/api prisma migrate deploy
```

**Lo que va a aplicar (orden importa):**

1. `add_user_settings_and_account_lifecycle` (Sesión 9) — UserPreferences, ReaderPreferences, NotificationSettings, PrivacySettings, Achievement, UserAchievement, EmailChangeRequest, DataExportRequest + 7 columnas en User.
2. `add_auth_event_log` (Sprint S1) — AuthEvent + 3 índices.
3. `add_auth_provider_and_email_tokens` (Sprint S2) — AuthProvider enum, PasswordResetToken, EmailVerificationToken, passwordHash nullable, providerId, authProvider columns.
4. `add_onboarding_catalogs_and_state` (Sprint S4) — OnboardingMotivo, OnboardingMood, OnboardingState.

**Validación post-migración (SQL queries para confirmar):**

```sql
-- Should return 0 (newly empty tables)
SELECT COUNT(*) FROM "OnboardingMotivo";
SELECT COUNT(*) FROM "OnboardingMood";
SELECT COUNT(*) FROM "AuthEvent";
SELECT COUNT(*) FROM "DataExportRequest";

-- User table should have new columns
SELECT "firstName", "authProvider", "providerId", "mood" FROM "User" LIMIT 1;
```

**Si una migración falla a mitad:** Railway Postgres tiene snapshot automático. Restore al snapshot anterior, investigar la migración offending, fixear, retry. **No** subas el código nuevo hasta que la migración esté aplicada.

---

## 2. Seed de catálogos de onboarding

Los endpoints `GET /api/onboarding/motivos` y `GET /api/onboarding/moods` devuelven `[]` si la tabla está vacía. El frontend de onboarding (cuando exista) los necesita poblados.

```bash
DATABASE_URL="<railway-prod-url>" pnpm --filter @psico/api prisma db seed
```

Sale idempotente — se puede correr múltiples veces sin error.

**Validación:**

```sql
SELECT COUNT(*) FROM "OnboardingMotivo" WHERE "isActive" = true;  -- 7
SELECT COUNT(*) FROM "OnboardingMood"   WHERE "isActive" = true;  -- 7
```

---

## 3. Ventana de mantenimiento (deploy del API)

### 3.1 Comunicar el mantenimiento (5-10 min antes)

Si existe Twitter/IG/Discord del producto: post breve. Si no, está OK saltarlo en v1 con tráfico bajo.

### 3.2 Pausar auto-deploy de Vercel (para evitar deploy a media transacción)

Vercel dashboard → Project → Settings → Git → temporarily disconnect `main` branch, OR temporarily set deployment to manual.

### 3.3 Push a `main` → Railway auto-deploys el API

```bash
git checkout main
git merge develop --ff-only
git push origin main
```

Railway detecta el push y bootea el nuevo container. **Watch logs en Railway:**

```
[NestFactory] Starting Nest application...
[InstanceLoader] PassportModule dependencies initialized
[InstanceLoader] RedisModule dependencies initialized
[InstanceLoader] NotificationsModule dependencies initialized
[InstanceLoader] JobsModule dependencies initialized
... (todos los módulos)
[NestApplication] Nest application successfully started
API running on http://localhost:3001
  Routes mounted under /api/*
  Swagger UI: http://localhost:3001/api/docs
```

Si ves `[RedisModule] No REDIS_URL set` en prod, **algo está mal** — verificar env var.
Si ves `EnvironmentValidationError`, falta una env requerida — agregar y restart.

### 3.4 Smoke test del API en Railway prod

```bash
# Reemplaza <api-url> con el dominio Railway de tu API
curl -s -o /dev/null -w "/health %{http_code}\n"        https://<api-url>/health
curl -s -o /dev/null -w "/api/health %{http_code}\n"   https://<api-url>/api/health
curl -s https://<api-url>/api/auth/login -X POST -d '{}' -H "Content-Type: application/json" | python3 -m json.tool
curl -s https://<api-url>/api/onboarding/motivos -H "Authorization: Bearer <expired_or_dummy_token>"
```

**Resultados esperados:**

| Endpoint                                | Status | Razón                                     |
| --------------------------------------- | ------ | ----------------------------------------- |
| `GET /health`                           | 200    | Health excluído del prefix                |
| `GET /api/health`                       | 404    | Exclusión bidireccional funciona          |
| `POST /api/auth/login {}`               | 400    | Envelope `VALIDATION_ERROR` con `details` |
| `GET /api/onboarding/motivos` (no auth) | 401    | JwtAuthGuard rechaza                      |

### 3.5 Provisionar el servicio worker en Railway

1. Railway → proyecto Psico → **+ New service** → **Empty Service** (mismo repo, branch `main`).
2. Settings → **Start command:** `pnpm --filter @psico/api start:worker`.
3. Copiar **TODAS** las env vars del servicio `psico-api` al `psico-worker` (mismo `DATABASE_URL`, `REDIS_URL`, etc.).
4. Deploy.

**Watch logs:**

```
[NestFactory] Starting Nest application...
[InstanceLoader] BullModule dependencies initialized (×2)
[WorkerBootstrap] Worker started · processors: email, data-export, account-deletion
[WorkerBootstrap] Awaiting jobs from Redis…
```

### 3.6 Deploy del web (Vercel)

Re-activar auto-deploy en Vercel (sección 3.2 reverse). Vercel detecta el push a `main` y deploya. **Watch logs.**

### 3.7 Smoke test web en prod

1. Abrir `https://psico-platform-web.vercel.app`.
2. Login con cuenta existente (debe funcionar — passwords no cambiaron).
3. Verificar que el dashboard carga (`/dashboard` muestra libros).
4. (Opcional) abrir Network tab y confirmar que las requests van a `/api/*`.

### 3.8 Cerrar ventana de mantenimiento

Anunciar fin del mantenimiento (si se anunció el inicio).

---

## 4. Validación post-deploy

### 4.1 Tag de release

```bash
git tag -a v0.5.0-alpha -m "Plan v2 foundation + Fase 1 core (Sprints 0.A through S4)"
git push origin v0.5.0-alpha
```

### 4.2 Crear el "Version Packages" PR (Changesets)

GitHub Action de Changesets debe crear automáticamente un PR titulado "Version Packages" cuando se mergea el PR principal a `main`. Mergear ese PR → tag `@psico/types@0.8.0` y `@psico/api-client@0.1.0`.

Si la action no está configurada todavía: hacerlo manual:

```bash
pnpm changeset version  # consume los archivos en .changeset/ y bumpea
pnpm install            # actualiza pnpm-lock.yaml con las nuevas versiones
git add .
git commit -m "chore(release): bump versions"
git push
```

### 4.3 Confirmar Swagger en producción

```bash
curl -s https://<api-url>/api/docs-json | jq '.paths | keys | length'
# debe retornar ~48 endpoints
```

(Swagger UI estará desactivada en prod por la guard `if (process.env.NODE_ENV !== "production")` — el JSON sí queda disponible.)

> **Decisión pendiente para sprint futuro:** ¿queremos Swagger UI en producción (público o protegido por basic auth)? Para v1 con docs internas la respuesta default es **no**.

---

## 5. Plan de rollback (si las cosas salen mal)

| Síntoma                               | Acción                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API no bootea (env var missing, etc.) | Revertir Railway deploy al SHA anterior (UI: rollback button). Investigar offline.                                                                                                               |
| API bootea pero 500s constantes       | Revertir Railway deploy. Las migraciones Prisma **NO se revierten automáticamente** — pero como son additive only, el back viejo sigue funcionando con el schema nuevo (ignora columnas extras). |
| Web 404s en producción                | Revertir Vercel deploy. Si el back ya fue al estado nuevo, las requests del web viejo van a fallar — re-deploy el web inmediatamente.                                                            |
| Migración Prisma rompe                | Restore Postgres a snapshot anterior (Railway Postgres tiene snapshots automáticos cada 24h).                                                                                                    |

**Worst case:** revertir ambos servicios al SHA del 2026-05-08 + restore de Postgres. Recovery time ~30 min con backups Railway.

---

## 6. Frontend companion sprints

**Decisión del usuario en sesión de saneamiento:** front companion **diferido** hasta cerrar Fase 1 (Sprints S5–S12). Después: un "Frontend catch-up sprint" agrupado.

**Implicación operacional inmediata:**

- El frontend en producción (web) tiene 3 pantallas: landing, login/register, dashboard básico, plan.
- Los **45 endpoints nuevos** (Auth flows nuevos, Users, Onboarding) **no tienen UI**. La API responde correctamente pero ningún usuario puede invocarlos hasta que el front se actualice.
- `/api/auth/forgot-password` no se puede testear end-to-end en prod sin enviar la request manual (Postman, curl).
- `/api/onboarding/*` queda como API muerta hasta el catch-up.

**Esto es aceptado.** El back está listo para cuando llegue el front catch-up. Pulso (S25) eventualmente surfaceará "endpoints sin tráfico" como signal de catch-up pendiente.

---

## 7. Checklist final

Marcar uno por uno:

- [ ] Upstash Redis provisionado en Railway
- [ ] `REDIS_URL` + `EMAIL_FROM` + `APP_URL` configurados en `psico-api`
- [ ] Build local verde: tests + typecheck + lint + generate:check
- [ ] PR `feat/plan-v2-foundation-fase1-core` mergeado a `develop`
- [ ] `develop` revisado en preview (sin smoke test e2e pero al menos el build OK)
- [ ] `develop` → `main` (ff-only)
- [ ] `prisma migrate deploy` ejecutado contra Railway prod
- [ ] `prisma db seed` ejecutado contra Railway prod
- [ ] Migraciones validadas via SQL
- [ ] Vercel auto-deploy pausado
- [ ] Push a `main`
- [ ] Railway API redeployó y bootea limpio
- [ ] Smoke test API: 4 endpoints respondiendo según expectations
- [ ] Servicio Railway `psico-worker` creado y bootea
- [ ] Vercel auto-deploy reactivado y deployó
- [ ] Smoke test web: login + dashboard OK
- [ ] Tag `v0.5.0-alpha` pusheado
- [ ] "Version Packages" PR de Changesets mergeado
- [ ] Bitácora `docs/deploy/v0-5-alpha-cutover-log.md` (escribir post-deploy con timestamps reales)

---

## 8. Lecciones esperadas (pre-mortem)

Cosas que podrían sorprendernos durante el cutover (anotar resultados reales en una `cutover-log.md` post-deploy):

1. **Migración Prisma puede tardar** (~30s-2min para 8 migraciones en una transacción contra una DB poblada). Acceptable.
2. **El primer worker boot puede tomar 30-60s** mientras BullMQ inicializa conexiones a Redis. Esperable.
3. **`User.passwordHash` ahora es nullable** — pero los usuarios existentes tienen valores, no será null. Sin impacto a runtime.
4. **Stripe webhook sigue en `/subscriptions/webhook`** (excluído del prefix). Confirmar que Stripe Dashboard sigue apuntando ahí — no cambia de path.
5. **OpenAPI JSON en prod no incluye Swagger UI** (intencional). Si necesitamos Swagger UI público, sprint futuro.

Si descubres algo más, sumarlo aquí para el próximo cutover (v0.6.0 cuando cerremos S5+).
