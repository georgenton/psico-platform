# Sprint Ops Bundle — código de Sprint 1 del roadmap

**Fecha:** 2026-06-17
**Rama:** `feature/sprint-ops-bundle`
**Tests:** 660/661 API (+6 nuevos · 1 skipped sentinel) + 34 crypto + 135 web + 29 mobile
**Roadmap:** [docs/ROADMAP.md §3-4 — Sprint 1 Ops bundle](../ROADMAP.md)

---

## Lo que se construyó

El roadmap llamó "Ops bundle" al Sprint 1: Stripe price IDs reales + API keys + ffmpeg embed. Las primeras dos requieren credenciales del usuario en Railway / Vercel y se quedan como tareas ops. Lo demás es código que sí hago — y este sprint cierra esa parte:

1. **Script ffmpeg-embed** para que ops pueda bulk-embed metadata en los audio files.
2. **Endpoint `GET /api/health/integrations`** ADMIN-only para validar de un curl qué integraciones están vivas en un Railway box.
3. **Boot-time banner** que lista en stderr cada integración no configurada / con valor stub al arrancar el API.
4. **Tests + smoke** del IntegrationsService.

### Script ffmpeg embed

`scripts/embed-audio-metadata.mjs` — Node 20+ puro (sin deps). Toma un manifest JSON con `[{input, cover, title, artist, album}, ...]` y produce archivos con tags ID3v2 (mp3) o m4a atoms (m4a) embebidos.

- `--dry-run` imprime los comandos ffmpeg sin ejecutar.
- Idempotente: re-correr sobreescribe el output, seguro tras un fix puntual.
- Salida en `out/embedded/` por default; ops sube a R2 con `rclone` / `aws s3 cp` aparte.

```bash
node scripts/embed-audio-metadata.mjs --manifest manifests/anchor-books.json
# Output: out/embedded/emociones-cap01.m4a (con title + artist + album + cover)
```

Receta ops documentada en [apps/api/src/lector/README.md §audio](../../apps/api/src/lector/README.md).

### Endpoint `GET /api/health/integrations`

Reportea para cada integración externa un `{ configured: boolean, stub?: boolean }`. Booleanos solamente — el endpoint **nunca** filtra el valor real del env.

- Doble gate: `JwtAuthGuard + @RequiredRole("ADMIN")`.
- Cubre: Stripe (secret + webhook + 3 price IDs), Anthropic, Voice (Whisper/Deepgram), Resend, Google OAuth, Redis, VAPID, R2.
- Routing dentro del controller existente `/health` — heredado `@SkipThrottle()` de la clase. La acción está vivo en `/api/health/integrations` (con `/api` prefix) mientras `/health` simple sigue sin prefix para los monitores de uptime.

**`stub` flag:** detecta valores que parecen placeholders (`stub`, `test`) que ops podría dejar pegados de los smoke envs. Es lo que distingue "no configurado" de "configurado mal" — el segundo es el smell que mata revenue en prod.

### Boot-time banner

En `main.ts` después del `app.listen()`. Resuelve `IntegrationsService` desde el container Nest y lista cada item en estado producción-impacting con tag `[MISSING]` o `[STUB]`. Si todo está OK en dev, imprime "All external integrations configured ✅". En prod sin issues queda silente.

Ejemplo con los stubs de tests:

```
⚠️  Integration check · 11 item(s) need attention:
   [STUB] STRIPE_SECRET_KEY
   [STUB] STRIPE_WEBHOOK_SECRET
   [STUB] STRIPE_PRO_MONTHLY_PRICE_ID
   [STUB] STRIPE_PRO_YEARLY_PRICE_ID
   [STUB] STRIPE_B2B_PRICE_ID
   [STUB] ANTHROPIC_API_KEY
   [STUB] VOICE (whisper) KEY
   [MISSING] RESEND_API_KEY
   [MISSING] GOOGLE_CLIENT_ID
   [MISSING] REDIS_URL
   [MISSING] VAPID keys
   Fix in Railway / Vercel env panel. See docs/ROADMAP.md §3.
```

### Tests

`apps/api/src/health/integrations.service.spec.ts` — 6 tests:

- Empty env → todo missing.
- Stub values → `stub: true` flag + raw value no aparece serializado.
- Real-looking value → `configured: true` sin stub flag.
- Voice key se enruta según `VOICE_PROVIDER`.
- `bootIssues` retorna lista vacía con env real; lista con razón cuando falta o es stub.

---

## Decisiones

1. **Endpoint ADMIN-only en `/api/health/integrations`** (no público) — aunque solo devuelve booleanos, el shape revela qué integraciones espera el sistema. Mantenerlo gated reduce surface para fingerprinting.
2. **`stub` flag detectado por regex `/stub|test/i`** — heurística minimalista. Falsos positivos posibles si un environment real contiene "test" en el path; aceptable porque el banner es advisory, no bloqueante.
3. **Sin breaking change al `/health` simple** — los monitores externos (Railway, UptimeRobot) siguen pegándole a `/health` sin prefix `/api`. La nueva ruta `/api/health/integrations` es un add-on dentro del mismo controller.
4. **`require()` dinámico para resolver IntegrationsService desde main.ts** — el módulo se carga en runtime evitando cualquier circularidad con AppModule. Try/catch porque el banner es observabilidad, no contrato.
5. **Banner silente en prod cuando todo está OK** — solo informa cuando hay issues. Reduce ruido en logs de Railway.
6. **Script `embed-audio-metadata.mjs` sin deps externas** — Node 20+ tiene todo lo necesario (`child_process` + `fs/promises`). Ops no necesita `pnpm install` para usarlo.
7. **Manifest JSON en lugar de CLI args por archivo** — al subir 4 archivos × 2 libros = 8 invocaciones manuales serían frágiles; el manifest es ops-friendly y diffeable.

---

## Smoke verification

```
@psico/api tests       660/661 (+6 nuevos)
@psico/api typecheck   OK
@psico/api lint        OK (4 warnings preexistentes)
boot banner            ✅ detecta 11 issues con stubs reales
script ffmpeg-embed    ✅ --dry-run válido con manifest sample
OpenAPI generate:check ✅ in sync
```

---

## Qué queda pendiente del Sprint 1 (ops, NO código)

Estas tres tareas dependen de credenciales del usuario y no las puedo ejecutar yo. La parte código está lista, falta la ejecución ops:

1. **Stripe price IDs reales en Railway** (15 min):
   - En Stripe Dashboard → Products, crear 3 prices:
     - Pro Monthly $7
     - Pro Yearly $59
     - B2B (custom)
   - Copiar los IDs `price_XXXX` y pegar en Railway env:
     - `STRIPE_SECRET_KEY=sk_live_...`
     - `STRIPE_WEBHOOK_SECRET=whsec_...`
     - `STRIPE_PRO_MONTHLY_PRICE_ID=price_...`
     - `STRIPE_PRO_YEARLY_PRICE_ID=price_...`
     - `STRIPE_B2B_PRICE_ID=price_...`
   - Re-deploy. El banner del boot confirmará.

2. **API keys de servicios externos en Railway** (30 min):
   - `ANTHROPIC_API_KEY` (Eco + WeeklySummary)
   - `OPENAI_API_KEY` (Voz · default whisper)
   - `RESEND_API_KEY` (emails)
   - `GOOGLE_CLIENT_ID` (OAuth Google Sign-in)
   - `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (web push) — generar con `pnpm --filter @psico/api gen:vapid`
   - En Vercel también: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

3. **Embed audio files** (30 min):
   - Preparar manifest con los 4 archivos m4a actualmente en R2:
     ```json
     [
       { "input": "./raw/emociones-cap01.m4a", "cover": "./covers/emociones.png",
         "title": "Cap. 1 · El primer paso", "artist": "Marina Quintana",
         "album": "Emociones en Construcción" },
       ...
     ]
     ```
   - `node scripts/embed-audio-metadata.mjs --manifest manifests/v1.json`
   - QuickTime preview de uno para verificar.
   - `aws s3 cp out/embedded/*.m4a s3://r2-bucket/audio/` (o equivalente para R2).

**Validación post-deploy:**

```bash
# Como ADMIN, después del re-deploy:
curl -H "Authorization: Bearer <admin-jwt>" https://prod.example/api/health/integrations
# Esperado: todos los items en { "configured": true } sin "stub" flag.
```

---

## Deuda técnica abierta

- **Sin tests UI del endpoint `/api/health/integrations`** — cubierto por el spec del IntegrationsService. Si quisiéramos cubrir el handler del controller, requiere mock del ConfigService + RolesGuard.
- **`stub` detection heurística** — un value real que contenga "test" lo flagéa. Aceptable v1.
- **Script `embed-audio-metadata.mjs` no sube a R2** — diferido a ops manual. Cuando el catálogo crezca, agregar un `--upload-r2` flag con credenciales del env.
- **Boot banner no se imprime en el worker** (`apps/api/src/worker.ts`) — solo el API entry. El worker hereda el mismo env así que es redundante; si se quiere paridad, mover el banner a una utility importada por ambos entry points.

---

## Próximo paso

Sprint 2 del roadmap: **Sentry wire** (API + worker + web + mobile). Bloqueante para visibility en prod.

Las 3 tareas ops del Sprint 1 quedan en backlog del usuario — el banner del boot las hace visibles, el endpoint las hace verificables.
