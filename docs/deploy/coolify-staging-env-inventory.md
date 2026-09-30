# Variables de FeelVerse staging en Coolify · fuente canónica

Autoridad de la decisión: [ADR 0024](../adr/0024-migracion-a-coolify-syntavera.md).
El **proceso** de despliegue vive en [coolify-runbook.md](coolify-runbook.md); la
**configuración** vive aquí. Cuando las dos cosas se cuenten en dos sitios acaban
divergiendo, así que el runbook enlaza a este documento en vez de repetirlo.

Derivado del código en `dd451e40` — no de la configuración de Railway ni de memoria.
Cada exigencia lleva su fichero y su línea, para que se pueda comprobar en vez de
creer.

```
TOTAL_VARIABLES=73
REQUIRED_TO_BOOT=26
REQUIRED_FOR_INITIAL_SMOKE=34        (35 si Voz entra en el smoke)
OWNER_DECISION_REQUIRED=10
CLIENT_ATTESTATION_REQUIRED_FOR_SECURE_STAGING=true
```

`TOTAL_VARIABLES` cuenta nombres distintos de runtime en api, worker, web y móvil.
Excluye las 5 de QA/ops y las 8 de plataforma heredada, que tienen su sección y **no**
se ponen en Coolify.

---

## 1 · El contrato de arranque

Sin estas 26, el proceso no arranca. No es una recomendación: es lo que el código
comprueba antes de aceptar la primera petición.

### 1.1 Exigidas por el esquema de env · 13

`apps/api/src/config/env.schema.ts`, sin `.optional()` y sin `.default()`.

| variable                      | nota                 |
| ----------------------------- | -------------------- |
| `DATABASE_URL`                | URL válida           |
| `JWT_SECRET`                  | mínimo 32 caracteres |
| `R2_ACCOUNT_ID`               |                      |
| `R2_ACCESS_KEY_ID`            |                      |
| `R2_SECRET_ACCESS_KEY`        |                      |
| `R2_BUCKET_NAME`              |                      |
| `ANTHROPIC_API_KEY`           |                      |
| `VOYAGE_API_KEY`              |                      |
| `STRIPE_SECRET_KEY`           |                      |
| `STRIPE_WEBHOOK_SECRET`       |                      |
| `STRIPE_PRO_MONTHLY_PRICE_ID` |                      |
| `STRIPE_PRO_YEARLY_PRICE_ID`  |                      |
| `STRIPE_B2B_PRICE_ID`         |                      |

Los cinco de Stripe se exigen para arrancar aunque los pagos no entren en el smoke
inicial. Consecuencia práctica: staging necesita valores **válidos de test mode**, no
placeholders. Ver §5.

### 1.2 Condicional a `NODE_ENV=production` · 1

| variable    | nota                                                |
| ----------- | --------------------------------------------------- |
| `REDIS_URL` | `superRefine` la exige cuando `NODE_ENV=production` |

Y es la trampa del módulo: si falta, el arranque **no falla**. `createRedisClient` cae
a `ioredis-mock`, y las colas quedan mudas en silencio. Por eso el runbook la comprueba
explícitamente en vez de confiar en que el proceso se queje.

### 1.3 Barreras de caja desplegada, fuera del esquema · 12

Éstas son las que no aparecen en ningún `.env.example` y son la razón de que un primer
despliegue pueda entrar en bucle de reinicio. Las verifica
`assertEmotionalMapConfigured()` en `apps/api/src/main.ts` **y** en
`apps/api/src/worker.ts`: las dos, con los mismos valores.

| variable                    | exigencia                                                                                  | fuente                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `PSICO_ENV`                 | `staging` o `production`; nada más. `development` en caja desplegada **falla a propósito** | `cache-identity.ts:108-119`                                                   |
| `EMOTIONAL_MAP_CACHE_EPOCH` | entero ≥ 1, explícito                                                                      | `readEpoch`, bajo `isProduction()` = `isDeployedEnvironment()`                |
| `EMOTIONAL_MAP_FACTS_EPOCH` | entero ≥ 1, explícito                                                                      | idem                                                                          |
| `EMOTIONAL_MAP_V2`          | **on**                                                                                     | `CRITICAL_FLAGS`                                                              |
| `EMOTIONAL_MAP_LEGACY_UI`   | **off**                                                                                    | `CRITICAL_FLAGS`                                                              |
| `EMOTIONAL_MAP_LLM_SCORING` | **off**                                                                                    | `CRITICAL_FLAGS`                                                              |
| `EMOTIONAL_MAP_EWS_PUBLIC`  | **off**                                                                                    | `CRITICAL_FLAGS`                                                              |
| `EMOTIONAL_MAP_NARRATOR`    | **off**                                                                                    | `CRITICAL_FLAGS`                                                              |
| `CONTENT_RESONANCE`         | **off**                                                                                    | `CRITICAL_FLAGS`                                                              |
| `EMOTIONAL_MAP_OU`          | declarada, valor libre válido                                                              | `REQUIRED_DEFINED_FLAGS`                                                      |
| `EMOTIONAL_MAP_PUBLIC`      | declarada, valor libre válido                                                              | `REQUIRED_DEFINED_FLAGS`                                                      |
| `GUIDE_ROLLOUT_MODE`        | obligatoria; si `pilot`, allowlist no vacía                                                | `guide-rollout.ts:101`, resuelto en `guide.module.ts:55` al iniciar el módulo |

Dos trampas dentro de esta tabla:

- **`EMOTIONAL_MAP_NARRATOR` tiene `default=true`** en `shared/flags.ts` y aquí se
  exige **off**. Gana la barrera; el default sólo aplica en local. Copiar el default
  produce un arranque fallido.
- Los valores son fijos porque son **decisiones de seguridad, no preferencias**. El
  comentario del código lo dice sin rodeos: `EMOTIONAL_MAP_LLM_SCORING` por defecto
  es `true`, así que «a box that simply forgot to set it would let an LLM invent
  psychological scores».

### 1.4 Del arranque al smoke · +8

Sobre las 26, el recorrido sintético inicial necesita estas ocho. Ninguna impide
arrancar; cada una rompe algo que el smoke comprueba.

| variable                    | qué rompe si falta o queda en su default                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`           | el default es `http://localhost:3000`, así que **toda** llamada del navegador muere en el preflight. Debe ser `https://staging.feelverse.app` |
| `APP_URL`                   | el default es localhost; los enlaces que salen en emails apuntarían fuera de staging                                                          |
| `NODE_ENV`                  | el default es `development`; en producción activa optimizaciones y exige `REDIS_URL`                                                          |
| `PSICO_DEPLOYED`            | marcador propio. Los de Coolify también sirven, pero éste es el único que no depende de que un proveedor mantenga sus nombres                 |
| `CLIENT_ATTESTATION_SECRET` | ver §6. Sin él el guard del BFF **deja pasar todo**                                                                                           |
| `NEXT_PUBLIC_API_URL`       | el navegador no encuentra la API: sin Eco, lector, voz ni Diario                                                                              |
| `NEXT_PUBLIC_APP_URL`       | enlaces internos del cliente                                                                                                                  |
| `NEXT_PUBLIC_PSICO_ENV`     | Sentry del navegador etiquetaría todo como `development`                                                                                      |

**34** = 26 + 8. Con Voz dentro del smoke son **35**, porque `VOICE_PROVIDER=whisper`
arrastra `OPENAI_API_KEY`.

---

## 2 · Clasificación · no todo lo que hay que instalar es un secreto

Confundirlo tiene un coste real: trata un identificador público como material sensible
y acabas sin poder documentarlo; trata un secreto como configuración y acaba en un
bundle.

### 2.1 `EXTERNAL_SECRET_VALUES` · 6

Valores que **son** secretos. Los proporciona el propietario.

```
ANTHROPIC_API_KEY
VOYAGE_API_KEY
OPENAI_API_KEY               (si VOICE_PROVIDER=whisper)
STRIPE_SECRET_KEY            (test mode)
STRIPE_WEBHOOK_SECRET        (test mode)
R2_SECRET_ACCESS_KEY
```

Más `RESEND_API_KEY` y `DAILY_API_KEY` / `DAILY_WEBHOOK_SECRET` /
`CLOUDFLARE_STREAM_API_TOKEN` si esas capacidades entran, que en la configuración
recomendada no.

### 2.2 `EXTERNAL_CREDENTIAL_IDENTIFIERS` · 1

No equivale a una contraseña, pero identifica una credencial: no se publica.

```
R2_ACCESS_KEY_ID
```

### 2.3 `EXTERNAL_NONSECRET_CONFIG` · 6

Configuración que hay que instalar y que **no** es secreta. Documentarla es legítimo.

```
R2_ACCOUNT_ID
R2_BUCKET_NAME
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_YEARLY_PRICE_ID
STRIPE_B2B_PRICE_ID
SENTRY_DSN
```

Más `GOOGLE_CLIENT_ID`, `DAILY_DOMAIN` y `R2_PUBLIC_URL` según lo que se habilite.

### 2.4 `PUBLIC_BUILD_CONFIG` · 9

**Una variable que acaba en el bundle no es un secreto, nunca.** No es una
convención: es una propiedad del medio. Cualquiera que abra el navegador la lee.

```
NEXT_PUBLIC_API_URL       NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_PSICO_ENV     NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_SENTRY_RELEASE
EXPO_PUBLIC_API_URL       EXPO_PUBLIC_WEB_ORIGIN
EXPO_PUBLIC_SENTRY_DSN    EXPO_PUBLIC_SENTRY_RELEASE
```

### 2.5 `GENERATED_INTERNAL` · 5

Las genera el ciclo de creación. **No se piden al propietario.**

```
JWT_SECRET                  aleatoria, ≥32 caracteres
CLIENT_ATTESTATION_SECRET   aleatoria; el MISMO valor en api y en web
contraseña de Postgres      al crear el recurso; nunca impresa
DATABASE_URL                derivada del recurso
REDIS_URL                   derivada del recurso
```

Más `CIRCLES_SHARED_DATA_KEY_V1` (base64 que decodifique a exactamente 32 bytes,
`circles-crypto.ts:54,134`) y el trío VAPID (`pnpm --filter @psico/api gen:vapid`) si
esas capacidades se habilitan.

### 2.6 `NOT_NEEDED_INITIAL` · 20

Capacidades apagadas en el primer staging. Cada una con su motivo en §7.

```
DEEPGRAM_API_KEY
DAILY_API_KEY · DAILY_DOMAIN · DAILY_WEBHOOK_SECRET
CLOUDFLARE_STREAM_ACCOUNT_ID · _API_TOKEN · _CUSTOMER_CODE
VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT · NEXT_PUBLIC_VAPID_PUBLIC_KEY
CIRCLES_SHARED_DATA_KEY_V1 · CIRCLES_PILOT_USER_IDS
EEC_C01_GUIDED_SUITE_V1 · EEC_C01_OPERATOR_USER_ID
RESEND_API_KEY
GOOGLE_CLIENT_ID · NEXT_PUBLIC_GOOGLE_CLIENT_ID
R2_PUBLIC_URL
GUIDE_PILOT_USER_IDS
```

### 2.7 `NO_OWNER_ACTION_REQUIRED` · 9

Tienen default y el default sirve para staging inicial. No se pide configurarlas.

```
JWT_ACCESS_EXPIRES_IN=15m          JWT_REFRESH_EXPIRES_IN=30d
AI_MAX_CONTEXT_CHUNKS=5            DEFAULT_PAYMENT_PROVIDER=stripe
PORT=3001                          EMAIL_FROM=no-reply@psico.app
VOICE_PROVIDER=whisper             VIDEO_PROVIDER=console
CLOUDFLARE_STREAM_UPLOADS_ENABLED=false
```

`PORT` merece una nota: es `RESOURCE_CONFIGURATION`. Lo fija Coolify como propiedad
del recurso; no es un valor que nadie escriba a mano.

Ojo con las que **tienen default y aun así hay que poner**: `ALLOWED_ORIGINS`,
`APP_URL` y `NODE_ENV`. Sus defaults son correctos en un portátil y equivocados en
staging, que es precisamente el caso peligroso — el que no se queja.

---

## 3 · Pre-recurso frente a post-recurso

La distinción importa porque pedirle al propietario una `DATABASE_URL` antes de crear
Postgres es pedirle algo imposible.

### `OWNER_PRE_RESOURCE_INPUTS`

Deben existir **antes** de crear cualquier recurso:

```
DNS         api-staging.feelverse.app   A → 148.113.254.26   DNS only
R2          bucket de media de staging, con nombre distinto del de producción
R2          credencial scoped a ese bucket
providers   las decisiones de §7
externos    los valores de §2.1 a §2.3 para las capacidades elegidas
```

### `GENERATED_DURING_RESOURCE_CREATION`

No se piden antes porque todavía no pueden existir:

```
DATABASE_URL · REDIS_URL · contraseña de Postgres
JWT_SECRET · CLIENT_ATTESTATION_SECRET
CIRCLES_SHARED_DATA_KEY_V1  (si Círculos se habilita)
trío VAPID                  (si Web Push se habilita)
```

---

## 4 · Variables de plataforma

```
PSICO_ENV=staging        entorno del PRODUCTO: decide barreras y etiquetas
NODE_ENV=production      modo del runtime de NODE: optimizaciones, y exige REDIS_URL
PSICO_DEPLOYED=true      estamos en una caja desplegada
```

No son intercambiables, y esta combinación es la correcta. `NODE_ENV=staging` no
valida —el enum sólo acepta development/production/test— y `PSICO_ENV=production` en
staging le diría a las barreras que son producción.

---

## 5 · Stripe

`STRIPE_MODE=TEST`.

Los tres price IDs **no son secretos**, pero el esquema los exige para arrancar. Así
que staging necesita valores válidos aunque los pagos no entren en el smoke:
recursos de **test mode**, creados en el dashboard de Stripe.

Nunca se copian los valores live: ni la secret key, ni el webhook secret —el endpoint
es otro, así que el secreto es otro—, ni los price IDs. Una live key en staging puede
cobrar de verdad.

---

## 6 · `CLIENT_ATTESTATION_SECRET`

```
CLASSIFICATION=GENERATED_INTERNAL
REQUIRED_FOR_SECURE_STAGING_DEPLOY=true
```

No es una variable de una capacidad opcional. `circles-bff-only.guard.ts:35` lo dice
en su propio comentario: **sin ella el guard deja pasar todo**. Consumidores reales:

| consumidor                     | fichero                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| guard BFF-only de Círculos     | `apps/api/src/circles/circles-bff-only.guard.ts:55`                   |
| throttler por cliente atestado | `apps/api/src/shared/throttler/attested-client-throttler.guard.ts:58` |
| atestación del lado web        | `apps/web/src/lib/circulos/atestacion.ts:88`                          |

Tiene que existir **antes** de exponer api y web de staging, con el **mismo valor en
los dos** —si difieren, la atestación no verifica—, generado nuevo y nunca reutilizado
de producción.

Y es independiente de `CIRCLES_ROLLOUT_MODE`: el modo decide si Círculos funciona; la
atestación decide si el BFF está cerrado. Aunque Círculos esté `off`, el secreto se
evalúa como requisito de seguridad.

---

## 7 · Decisiones del propietario · 10

`OWNER_DECISION_REQUIRED=10`. Ninguna se toma en silencio. La columna «recomendación»
es una propuesta para aprobar o rechazar, no una decisión tomada.

| #   | decisión                              | recomendación                                   | arrastra                                                                                                                           |
| --- | ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Voz** · `VOICE_PROVIDER`            | `whisper` si Voz entra en el smoke; fuera si no | whisper → `OPENAI_API_KEY`; deepgram → `DEEPGRAM_API_KEY`. El esquema falla al arrancar si el selector y su clave no concuerdan    |
| 2   | **Vídeo** · `VIDEO_PROVIDER`          | `console`                                       | con `console`, `DAILY_*` queda `NOT_NEEDED_FOR_INITIAL_STAGING`                                                                    |
| 3   | **Stripe**                            | test mode                                       | los 5 valores de §5                                                                                                                |
| 4   | **Email** · `RESEND_API_KEY`          | fuera del smoke inicial                         | ver §8                                                                                                                             |
| 5   | **Google OAuth**                      | diferir                                         | ver §9                                                                                                                             |
| 6   | **Sentry**                            | proyecto compartido                             | ver §10                                                                                                                            |
| 7   | **Guía** · `GUIDE_ROLLOUT_MODE`       | `off`                                           | **obligatoria para arrancar**. `pilot` exige allowlist, y sólo con IDs sintéticos                                                  |
| 8   | **Círculos** · `CIRCLES_ROLLOUT_MODE` | `off`                                           | con `off` no se lee la clave de cifrado (`circles-crypto.ts:315`). El resolver nunca lanza, así que un error aquí no tira Círculos |
| 9   | **Web Push**                          | fuera del smoke inicial                         | trío VAPID completo o nada; el esquema rechaza el estado a medias                                                                  |
| 10  | **Credenciales R2**                   | token scoped al bucket de staging               | mínimo privilegio: una credencial compartida podría escribir en los medios de producción                                           |

---

## 8 · Email

**No** se clasifica `RESEND_API_KEY` como compartida sin más. El riesgo es concreto:
staging podría **enviar correo real** si una persona sintética usa un dominio que
existe.

Cuatro caminos, de menos a más trabajo:

1. Email fuera del smoke inicial. Es lo recomendado.
2. Personas sintéticas con un dominio que no recibe.
3. Clave o proyecto de Resend separado para staging.
4. Restricciones explícitas en el proveedor.

Con email habilitado, `APP_URL=https://staging.feelverse.app` **siempre**: si no, los
enlaces del correo de staging llevan a producción.

---

## 9 · Google OAuth

`GOOGLE_CLIENT_ID` **no es secreto** — viaja al navegador como
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

Reutilizar el client de producción sólo funciona si el proveedor acepta el origen y el
redirect de staging, lo que exige registrarlos en Google.

```
GOOGLE_STAGING_CONFIGURATION=OWNER_PROVIDER_CONFIGURATION_REQUIRED
```

Google no se modifica desde este repositorio ni desde ningún ciclo automático.

---

## 10 · Sentry

`SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` **no son secretos**: el segundo está en el
bundle por definición.

Compartir proyecto con producción es técnicamente correcto desde
[#758](https://github.com/georgenton/psico-platform/pull/758), porque `environment`
sale de `PSICO_ENV` y los errores quedan separados en el panel. La razón para separar
sería cuotas y alertas, no la separación de datos.

---

## 11 · R2

Contrato duro:

```
STAGING_MEDIA_BUCKET != PRODUCTION_MEDIA_BUCKET
```

Staging **escribe** medios. Apuntarlo al bucket de producción haría que cada subida de
prueba cayera en los medios reales.

| variable               | clasificación                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | `SAFE_SHARED_NONSECRET_CONFIG` — es la cuenta, la misma; no aísla nada por sí sola                                                                                                |
| `R2_ACCESS_KEY_ID`     | `STAGING_CREDENTIAL`                                                                                                                                                              |
| `R2_SECRET_ACCESS_KEY` | `STAGING_SECRET`                                                                                                                                                                  |
| `R2_BUCKET_NAME`       | `STAGING_SPECIFIC_NONSECRET_CONFIG`                                                                                                                                               |
| `R2_PUBLIC_URL`        | sólo si staging va a probar portadas e ilustraciones públicas. Ausente es una configuración legítima: `StorageService` se niega en el punto de uso en vez de exigirla al arrancar |

### Cuatro buckets que no se mezclan

```
1  media de producción
2  media de staging
3  syntavera-feelverse-db-backups        respaldos de la base de FeelVerse
4  syntavera-coolify-backups             plano de control de Coolify
```

Que los cuatro hablen S3 no los hace intercambiables. Mezclar 3 con 4 haría que
restaurar uno pusiera en riesgo el otro.

---

## 12 · Web · variables de build

Las `NEXT_PUBLIC_*` se **inlinean en el bundle al construir**, así que tienen que estar
presentes en el build, no sólo en runtime.

```
MANUAL_COOLIFY_BUILD_TIME_FLAGS =
  NEXT_PUBLIC_API_URL
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_PSICO_ENV
  NEXT_PUBLIC_GOOGLE_CLIENT_ID     (si OAuth entra)
  NEXT_PUBLIC_SENTRY_DSN
  NEXT_PUBLIC_SENTRY_RELEASE
  PSICO_ENV
  NODE_ENV
```

**La API documentada de Coolify no puede marcarlas.** `is_build_time` aparece en la
respuesta de los endpoints de variables pero **no** en el cuerpo de la petición, ni al
crear ni al actualizar. Así que se crean por API y la casilla «Build Variable» se marca
en la UI.

```
WEB_BUILD_TIME_ENV_GATE=WAITING_FOR_OWNER
```

Web **no se despliega** hasta que esa confirmación llegue. Esto no se arregla metiendo
valores en el repositorio.

Las rutas de `/prototipos/*` ya **no** dependen de esto: son `force-dynamic` desde
#758, así que su gate se resuelve por petición.

---

## 13 · QA y ops · nunca en Coolify

```
DO_NOT_COPY_TO_COOLIFY_RUNTIME =
  ALLOW_QA_VISUAL_FIXTURE     gate del fixture visual
  QA_PERSONAS_PASSWORD        CLI de personas de QA
  CONTENT_STUDIO_R2_SMOKE     spec de imagen en R2
  CIRCLES_SPEC_TRACE          traza de specs
  TEST_DATABASE_URL           sólo suites pg-spec
```

No son runtime del producto. Copiarlas a un servicio desplegado añade superficie sin
añadir capacidad.

---

## 14 · Plataforma heredada · no poner en Coolify

```
LEGACY_PROVIDER_FALLBACK · DO_NOT_SET_ON_COOLIFY =
  VERCEL_ENV · NEXT_PUBLIC_VERCEL_ENV · EXPO_PUBLIC_VERCEL_ENV
  RAILWAY_ENVIRONMENT · RAILWAY_PROJECT_ID · RAILWAY_SERVICE_ID
  RAILWAY_REPLICA_ID · RAILWAY_GIT_COMMIT_SHA
```

Siguen **leídas en el código a propósito**: Railway y Vercel son el rollback mientras
no se cumplan los seis criterios de apagado del ADR 0024. Retirarlas del código es un
paso del decomisado, no de la llegada.

---

## 15 · Checklist del propietario

Antes de crear recursos:

```
[ ] api-staging.feelverse.app resolviendo al VPS (A → 148.113.254.26, DNS only)
[ ] bucket de media de staging creado
[ ] credencial R2 scoped a ese bucket creada
[ ] decisión de Voz
[ ] decisión de Vídeo
[ ] recursos de Stripe en test mode listos
[ ] decisión de rollout de la Guía
[ ] decisión de rollout de Círculos
[ ] decisión de Email
[ ] decisión de Google OAuth
[ ] decisión de Sentry
[ ] decisión de Web Push
```

Y antes de meter datos que importe conservar:

```
[ ] almacenamiento S3/R2 de respaldos configurado en Coolify
    → syntavera-feelverse-db-backups
```

`DATABASE_URL` y `REDIS_URL` **no están en esta lista** y no deben estarlo: no existen
hasta que los recursos existen.

---

## 16 · Manejo de los valores

```
DO_NOT_SEND_SECRET_VALUES_IN_CHAT=true
DO_NOT_COMMIT_SECRET_VALUES=true
```

Dónde se instalan:

- **Coolify UI** → Environment Variables del recurso. Es el sitio por defecto.
- **Fichero local con permisos `600`** bajo `~/.config/syntavera/secrets/`, siguiendo
  el patrón que ya existe para el producto vecino, cuando haga falta conservarlos
  fuera de Coolify.

Nunca en una conversación, nunca en el repositorio, nunca en un fichero de
configuración versionado. Un nombre de bucket puede compartirse para verificar
aislamiento; una credencial no.
