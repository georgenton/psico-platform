# v1 freeze — ops checklist

**Estado:** código v1 freezeado en `develop` (commit `316a508`). Esto cubre los 3 items ops que faltan para que la plataforma esté **funcionalmente completa en producción** — sin esto, varios endpoints devuelven 4xx con stub o "missing key" aunque el deploy responda 200 a `/health`.

**Cuándo ejecutar cada bloque:** los 3 son independientes. Puedes hacer las API keys primero (más impacto, menos fricción), Stripe después (necesita decisiones de pricing), y ffmpeg al final (requiere los archivos master del audio).

**Cómo verificar todo de una vez al terminar:**

```bash
# Como ADMIN, contra producción:
curl -s https://psico-platform-production.up.railway.app/api/health/integrations \
  -H "Authorization: Bearer <admin-token>" | jq
```

El response esperado: cada `configured: true` y ningún `stub: true`. Si queda alguno en stub o false, el boot banner de Railway lo lista en logs al arrancar el servicio.

---

## 1) Stripe price IDs reales

**Por qué bloquea:** sin price IDs reales, `POST /api/billing/checkout-session` falla porque Stripe rechaza el `price_stub_*` que viene del schema validator. El `/dashboard/plan` UI muestra los planes pero el botón "Suscribirme" tira error.

### 1.1 — Crear los 3 productos + prices en Stripe

En **[Stripe Dashboard](https://dashboard.stripe.com/products) → modo LIVE** (no test):

1. **Producto: Psico Pro mensual**
   - Tipo: Recurring
   - Precio: $7.00 USD / mes
   - Copiar el `price_…` ID que aparece después de crearlo.

2. **Producto: Psico Pro anual**
   - Tipo: Recurring
   - Precio: $59.00 USD / año
   - Copiar el `price_…` ID.

3. **Producto: Psico B2B**
   - Tipo: Recurring
   - Precio: $120.00 USD / mes (base — el dashboard de B2B negocia volumen aparte)
   - Copiar el `price_…` ID.

> **Si todavía no estás listo para LIVE,** crea los 3 en modo Test primero, deploya con esos en Railway, smoke-testea el checkout con tarjeta `4242 4242 4242 4242`, y cuando el flujo end-to-end funcione, cambias a LIVE en una sola sesión coordinada (rotar TODOS los `STRIPE_*` envs juntos).

### 1.2 — Setear en Railway (API service + worker service)

`STRIPE_PRO_MONTHLY_PRICE_ID=price_…`
`STRIPE_PRO_YEARLY_PRICE_ID=price_…`
`STRIPE_B2B_PRICE_ID=price_…`

Los 3 en **ambos** services Railway (API + worker). El worker no los usa hoy, pero los mantenemos sincronizados para evitar drift cuando un job futuro toque billing.

### 1.3 — Smoke test

1. **Sanity boot:** después del re-deploy, en Railway logs del API debe desaparecer cualquier línea `[boot] STRIPE_*_PRICE_ID missing` o `stub`.
2. **Checkout end-to-end (test mode si aplica):**
   ```bash
   TOKEN=...  # accessToken de un user logueado
   curl -s -X GET "https://psico-platform-production.up.railway.app/api/billing/checkout-session?plan=PRO&billingCycle=monthly" \
     -H "Authorization: Bearer $TOKEN"
   # esperado: { "url": "https://checkout.stripe.com/c/pay/cs_…", "sessionId": "cs_…" }
   ```
3. **UI walk:** `/dashboard/plan` → click "Activar Pro" → debe redirigir a Stripe Checkout con el price correcto en el line item.
4. **Cancel/reactivate** desde la misma página después de pagar — `/api/billing/cancel` y `/api/billing/reactivate` no tocan price IDs pero usan el subscription mirror que el webhook crea.

---

## 2) API keys faltantes

Mismas dos reglas para todas:

- Setear en **API + worker** services Railway.
- Después de cada bloque, re-deploy y verifica el boot banner — Railway logs deben dejar de listar el item en la sección `[boot] integrations missing`.

### 2.1 — Anthropic (Claude) — Eco + WeeklySummary LLM

**Obtener:** [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key.

**Setear:** `ANTHROPIC_API_KEY=sk-ant-…` en Railway (API + worker).

> El worker la necesita porque el `WeeklySummaryGenerationProcessor` (S46) corre allí los domingos 23:00 UTC y llama a Claude Sonnet 4.6 para generar el narrative de cada user. Sin la key, fallback automático a rule-based, pero el digest pierde el block editorial.

**Smoke test:**

```bash
# Como user logueado:
curl -N -X POST https://psico-platform-production.up.railway.app/api/eco/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "threadId": "<thread-id>", "textPlaintext": "hola eco", "textCiphertext": "...", "textNonce": "..." }'
# esperado: stream SSE con eventos `delta` que contienen texto del modelo + un `done` final.
```

### 2.2 — OpenAI (Whisper) — VoiceModule

**Obtener:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

**Setear:** `OPENAI_API_KEY=sk-…` en Railway (API + worker).

> Default `VOICE_PROVIDER=whisper`. Si prefieres Deepgram, configura `DEEPGRAM_API_KEY=…` Y `VOICE_PROVIDER=deepgram` (los dos juntos — el env schema lo gatea con superRefine).

**Smoke test:**

```bash
# Como user PRO logueado:
curl -X POST https://psico-platform-production.up.railway.app/api/voz/transcribe \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@sample.m4a;type=audio/m4a" \
  -F "language=es"
# esperado: { "transcript": "...", "durationSec": N, "language": "es" }
```

### 2.3 — Resend (email) — verify-email + password-reset + weekly-digest

**Obtener:** [resend.com/api-keys](https://resend.com/api-keys).

**Setear:** `RESEND_API_KEY=re_…` en Railway (API + worker).
**Plus:** `EMAIL_FROM=...@<dominio-verificado>` en ambos. Default `no-reply@psico.app` requiere que `psico.app` esté verificado en Resend; si no lo está, usa un dominio que SÍ esté verificado para no perder emails.

> El sandbox de Resend solo permite mandar a tu propia dirección verificada (georgenton@gmail.com). Para validar contra users reales necesitas un dominio verificado.

**Smoke test:**

```bash
curl -X POST https://psico-platform-production.up.railway.app/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{ "email": "georgenton@gmail.com" }'
# esperado: 200 OK (no-leak) + email llega a la inbox en <30s.
```

### 2.4 — Google OAuth Sign-in

**Obtener:** [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client → Web application.

**Configurar:**

- Authorized redirect URIs: agregar tanto `https://psico-platform-web.vercel.app/auth/callback/google` como `http://localhost:3000/auth/callback/google` (dev local).
- Copiar el **Client ID** (no el secret — backend solo verifica el ID token firmado).

**Setear:** `GOOGLE_CLIENT_ID=…apps.googleusercontent.com` en Railway (API + worker) **y** en Vercel como `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (mismo valor — el frontend lo necesita para Google Sign-in JS SDK).

**Smoke test:** abre `/login` en el web, click "Continuar con Google", completa el OAuth flow → debe terminar logueado.

### 2.5 — VAPID (Web Push)

**Obtener:** ya tenemos un script. Desde cualquier máquina con el repo clonado:

```bash
pnpm --filter @psico/api gen:vapid
# Imprime: VAPID_PUBLIC_KEY=… / VAPID_PRIVATE_KEY=… / VAPID_SUBJECT="mailto:..."
```

Guárdalo en password manager — no se puede recuperar después.

**Setear:**

- En Railway (API + worker): `VAPID_PUBLIC_KEY=…`, `VAPID_PRIVATE_KEY=…`, `VAPID_SUBJECT=mailto:soporte@<tu-dominio>`.
- En Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=…` (mismo valor que la public key — el browser la necesita para `pushManager.subscribe`).

> Half-set rechazado por el env schema — los 3 juntos o ninguno. Esto evita silently-broken push delivery.

**Smoke test:** `/dashboard/notifications` → toggle "Web Push" → "Activar" → el browser pide permiso → permites → toggle dice "Activadas". Luego en Railway logs, ningún `[boot] VAPID keys missing/stub`.

### 2.6 — Sentry (opcional pero altamente recomendado)

**Obtener:** [sentry.io](https://sentry.io) → New Project → Node.js (para API + worker) + Next.js (para web) + React Native (para mobile). Cada uno da su propio DSN.

**Setear:**

- Railway API + worker: `SENTRY_DSN=https://…@sentry.io/…`
- Vercel: `SENTRY_DSN=https://…@sentry.io/…` (DSN del proyecto Next.js, diferente del del API)
- EAS (mobile): cuando hagas builds, el DSN va en `app.config.ts` o como variable EAS Build.

> Sin Sentry no se rompe nada (init es no-op), pero pierdes el primer canal de alerta cuando algo explota en prod. Privacy: `beforeSend` ya filtra `authorization`, `cookie`, `x-api-key`, `stripe-signature`. Session replay HARD-OFF en cliente (defensive contra el Diario plaintext).

---

## 3) ffmpeg embed + R2 upload de audios de capítulos

**Estado actual del seed:** 5 capítulos (book1: 2 caps · book2: 3 caps), ninguno tiene `Audio` records aún. Esto es **greenfield**, no migración — el script ya está en `scripts/embed-audio-metadata.mjs`, falta tener los archivos master.

### 3.1 — Pre-requisitos físicos

Necesitas en disco local:

- 5 archivos `.m4a` (o `.mp3`) con la grabación de cada capítulo.
- 2 archivos `cover-emociones.png` y `cover-familias.png` (≤500×500, idealmente cuadradas, RGB sin alpha para iOS lock-screen).
- `ffmpeg` instalado (`brew install ffmpeg`).
- Credenciales R2 con write access al bucket (ya configuradas en `R2_*` envs).

### 3.2 — Manifest de embed

Crear `scripts/manifests/v1-audios.json` (gitignored si quieres — contiene paths locales):

```json
[
  {
    "input": "./raw/emociones-cap01.m4a",
    "cover": "./covers/cover-emociones.png",
    "title": "Cap. 1 · Introducción: Entendiendo tus Emociones",
    "artist": "Marina Quintana",
    "album": "Emociones en Construcción"
  },
  {
    "input": "./raw/emociones-cap02.m4a",
    "cover": "./covers/cover-emociones.png",
    "title": "Cap. 2 · Las Emociones Básicas y su Función",
    "artist": "Marina Quintana",
    "album": "Emociones en Construcción"
  },
  {
    "input": "./raw/familias-cap01.m4a",
    "cover": "./covers/cover-familias.png",
    "title": "Cap. 1 · ¿Qué es una Familia Ensamblada?",
    "artist": "Marina Quintana",
    "album": "Familias Ensambladas"
  },
  {
    "input": "./raw/familias-cap02.m4a",
    "cover": "./covers/cover-familias.png",
    "title": "Cap. 2 · Roles y Vínculos en la Nueva Familia",
    "artist": "Marina Quintana",
    "album": "Familias Ensambladas"
  },
  {
    "input": "./raw/familias-cap03.m4a",
    "cover": "./covers/cover-familias.png",
    "title": "Cap. 3 · Comunicación y Manejo de Conflictos",
    "artist": "Marina Quintana",
    "album": "Familias Ensambladas"
  }
]
```

### 3.3 — Embed + smoke verify local

```bash
# Dry-run primero — imprime ffmpeg commands sin tocar nada:
node scripts/embed-audio-metadata.mjs --manifest scripts/manifests/v1-audios.json --dry-run

# Embed real:
node scripts/embed-audio-metadata.mjs --manifest scripts/manifests/v1-audios.json --out ./out/embedded
# → escribe los 5 archivos con metadata embebida en ./out/embedded/

# Sanity check — abre uno en QuickTime o Apple Music:
open ./out/embedded/emociones-cap01.m4a
# La ventana de info debe mostrar el title, artist, album, cover.
```

### 3.4 — Upload a R2

Usa `aws s3 cp` con un alias R2 (o rclone). Una sola convención de paths:
`{bucket}/audios/{book-slug}/cap-{NN}.m4a`

```bash
# Configurar AWS CLI con credenciales R2 (una sola vez):
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID" --profile r2
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY" --profile r2

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

aws s3 cp ./out/embedded/emociones-cap01.m4a "s3://${R2_BUCKET_NAME}/audios/emociones-en-construccion/cap-01.m4a" --endpoint-url "$ENDPOINT" --profile r2
aws s3 cp ./out/embedded/emociones-cap02.m4a "s3://${R2_BUCKET_NAME}/audios/emociones-en-construccion/cap-02.m4a" --endpoint-url "$ENDPOINT" --profile r2
aws s3 cp ./out/embedded/familias-cap01.m4a "s3://${R2_BUCKET_NAME}/audios/familias-ensambladas/cap-01.m4a"  --endpoint-url "$ENDPOINT" --profile r2
aws s3 cp ./out/embedded/familias-cap02.m4a "s3://${R2_BUCKET_NAME}/audios/familias-ensambladas/cap-02.m4a"  --endpoint-url "$ENDPOINT" --profile r2
aws s3 cp ./out/embedded/familias-cap03.m4a "s3://${R2_BUCKET_NAME}/audios/familias-ensambladas/cap-03.m4a"  --endpoint-url "$ENDPOINT" --profile r2
```

### 3.5 — Crear los Audio records en DB

El backend no tiene un seed para esto todavía. Más rápido: inserta vía Prisma Studio o crea un script seed dedicado. Sketch del SQL (correr una vez en Railway Postgres):

```sql
-- 5 capítulos, 5 audios. Los IDs de Chapter ya están seeded.
-- Reemplazar duraciones con valores reales (segundos).
INSERT INTO "Audio" ("id", "chapterId", "title", "fileUrl", "durationSeconds", "createdAt")
SELECT
  'aud-' || c."id",
  c."id",
  c."title",
  CASE
    WHEN b."slug" = 'emociones-en-construccion'
      THEN 'audios/emociones-en-construccion/cap-' || lpad(c."order"::text, 2, '0') || '.m4a'
    WHEN b."slug" = 'familias-ensambladas'
      THEN 'audios/familias-ensambladas/cap-' || lpad(c."order"::text, 2, '0') || '.m4a'
  END,
  c."durationMinutes" * 60,
  NOW()
FROM "Chapter" c
JOIN "Book" b ON c."bookId" = b."id"
WHERE b."slug" IN ('emociones-en-construccion', 'familias-ensambladas')
  AND c."isPublished" = TRUE;
```

> `fileUrl` se guarda como **path relativo al bucket** (no URL completo). El `LectorService.getAudio()` lo firma con `R2_PUBLIC_URL` + signed query string en cada request (TTL 1h).

### 3.6 — Smoke test end-to-end

```bash
# Como user, request del audio del primer capítulo:
TOKEN=...
BOOK_ID=$(curl -s "https://psico-platform-production.up.railway.app/api/books/emociones-en-construccion" -H "Authorization: Bearer $TOKEN" | jq -r .id)
curl -s "https://psico-platform-production.up.railway.app/api/lector/${BOOK_ID}/1/audio" -H "Authorization: Bearer $TOKEN" | jq
# esperado: { "url": "https://r2.../...?X-Amz-Signature=...", "durationSec": 480, "metadata": { "title": "Cap. 1 · ...", "artist": "Marina Quintana", "artworkUrl": "..." } }
```

**UI walk:**

1. Web: `/dashboard/biblioteca/emociones-en-construccion/lector/1` → pestaña audio → reproducir.
2. Mobile: abrir el mismo capítulo → `LectorAudioBar` → reproducir.
3. iOS lock screen: pausa + bloquea la pantalla → debe verse el title + artwork del cover.

---

## Orden recomendado de ejecución

1. **API keys (2.x)** — cero costo, desbloquea Eco / Voice / emails / OAuth / Web Push de un golpe. Hazlo primero.
2. **Stripe (1.x)** — requiere decisión de pricing finale. Si tienes dudas, monta primero los 3 productos en modo Test y promueve a LIVE cuando estés cómodo.
3. **ffmpeg embed + R2 (3.x)** — requiere los masters de audio físicamente. Es el que más bloquea la experiencia premium del lector, pero el resto del producto camina sin él.

Al terminar los 3, corre el smoke de `/api/health/integrations` y dame el output. Si todo limpio, levantamos la bandera de "v1 ready for paid users".
