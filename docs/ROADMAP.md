# 🗺️ Roadmap Psico Platform — v1 freeze + validación

**Documento maestro de planificación.** Generado tras audit completo del 2026-06-13. Source of truth para:

1. Saber **dónde estamos** sin volver a hacer el audit.
2. Planificar los **próximos sprints** con scope claro.
3. **Congelar v1** para una prueba profunda + validación con users reales.
4. Decidir el **gate hacia v2** (Therapy, Dynamic Island, LATAM expand).

Cuando el estado cambie, edita este documento en lugar de crear uno nuevo. Las bitácoras de sprint individuales viven en [docs/informes/](informes/).

---

## 1. Dónde estamos (2026-06-13)

**Producto:** SaaS de psicoeducación. Mercado: Ecuador → LATAM. Freemium → Pro $7/mo · Anual $59 · B2B $120+/mo.

**Estado del repo:**

- **66 modelos Prisma** en 10 dominios (auth, users, books, diary, eco, therapy, voice, billing, author, admin/pulso).
- **25 migraciones** desde abril 2026.
- **26 módulos NestJS** + ~144 endpoints REST bajo `/api/*`.
- **47 rutas web** Next.js 14 + **30+ pantallas mobile** Expo.
- **14 ADRs** activas en [docs/adr/](adr/).
- **39+ bitácoras** de sprint en [docs/informes/](informes/).
- **716 tests verdes** total — API 654, web 135, crypto 34, mobile 29.
- **3 paquetes shared** publicables: `@psico/types@0.9.0`, `@psico/api-client@0.1.0`, `@psico/crypto@0.2.0`.
- **Deploy:** API + worker en Railway, web en Vercel. Smoke walk con users reales ya hecho.

## 2. Cobertura de las 17 áreas del diseño

```
✅ Completo  14/17  (82 %)
⚠️ Parcial    1/17  (6 %)   — Dynamic Island (backend stub)
❌ Sin tocar  2/17  (12 %)  — Rutas, Wallpapers (no priorizadas v1)
```

| Categoría                                                                                     | Áreas | Estado                                   |
| --------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- |
| **Core experience** (Onboarding, Inicio, Biblioteca, Detalle, Diario, Eco, Voz, Plan, Perfil) | 9     | ✅ 9/9                                   |
| **Lectura** (Lector + audio metadata + lock-screen)                                           | 1     | ✅ web full · ⚠️ mobile view-only        |
| **Insights** (Patrones, LLM weekly summary)                                                   | 1     | ✅                                       |
| **Terapia v2** (18 sub-pantallas, gated)                                                      | 1     | ✅                                       |
| **B2B Author** (Editor)                                                                       | 1     | ✅ web-only por diseño                   |
| **Admin** (Pulso: reports, overview, cohorts, time series)                                    | 1     | ✅ web-only por diseño                   |
| **Live Activities iOS** (Dynamic Island)                                                      | 1     | ⚠️ stub (ADR-0012 escrita, falta iOS UI) |
| **No priorizadas v1** (Rutas bundles, Wallpapers)                                             | 2     | ❌                                       |

Ver [docs/design/handoff/INDEX.md](design/handoff/INDEX.md) para el mapeo exacto por área.

---

## 3. Qué falta para finalizar v1

### 🔴 Bloqueantes para revenue (ops, no código)

> **Update 2026-06-17:** parte código del Sprint 1 cerrada con `sprint-ops-bundle` — script ffmpeg + `GET /api/health/integrations` (ADMIN-only) + boot banner. Las 3 tareas debajo siguen abiertas porque dependen de credenciales en Railway/Stripe. Validación en prod: `curl -H "Authorization: Bearer <admin-jwt>" .../api/health/integrations`.

| #   | Tarea                                                                                                                                                                                                                | Effort     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Stripe price IDs reales en Railway** — `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`, `STRIPE_B2B_PRICE_ID`. Sin esto el checkout no funciona en prod. Deuda desde Sesión 30.                        | 30 min     |
| 2   | **API keys de servicios externos en Railway** — `ANTHROPIC_API_KEY` (Eco + WeeklySummary), `OPENAI_API_KEY` o `DEEPGRAM_API_KEY` (Voz), `RESEND_API_KEY` (emails), `GOOGLE_CLIENT_ID` (OAuth), `VAPID_*` (web push). | 1 hora     |
| 3   | **Embed ID3v2/m4a tags en audio files** — para lock-screen artwork iOS/Android. Receta ffmpeg ya documentada en [apps/api/src/lector/README.md](../apps/api/src/lector/README.md).                                   | 30 min ops |

### 🟡 Deuda técnica para cerrar v1 con calidad

> **Update 2026-06-17:** Sentry wire (item 5) cerrado con `sprint-sentry`. Falta solo configurar DSNs en Railway/Vercel/EAS Build + validar con un throw 500 controlado.
> **Update 2026-06-17 (2):** Sprint `fix-salt-length-dto` arregla el bug descubierto en Sprint 3 — el DTO ahora acepta salts de 22 chars (lo que auth produce realmente). Rekey real funciona en prod después de este merge.

| #   | Tarea                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | ✅ **Mobile highlights v1 (block-level)** — cubierto con `sprint-mobile-highlights`. Long-press → action sheet con 3 colores + nota. Character-level diferido hasta RN selection API estable. |
| 5   | ✅ **Observability (Sentry)** — código wireado en los 4 surfaces. Falta solo configurar DSNs en Railway/Vercel/EAS.                                                                           |
| 6   | ✅ **Tests UI del LectorShell** — cubierto con `sprint-e2e-rekey-lectorshell` (7 tests). Text-selection flow sigue diferido.                                                                  |
| 7   | ✅ **E2E full-circle del re-encrypt del Diario** — cubierto con `sprint-e2e-rekey-lectorshell` (1 test que pasa por cripto real + HTTP real).                                                 |
| 8   | **Sunset 2026-08-31 del path `/api/subscriptions/*` legacy** — eliminar el doble exposure cuando cierre la ventana 90d (Sprint S11).                                                          |
| 9   | **Migración de tests E2E API a Postgres real (testcontainers)** — actualmente usan mock de Prisma. No captura bugs de queries reales.                                                         |
| 10  | **Issue #639 — Experiencias independientes.** Ver la secuencia por fases abajo. Autoridad de diseño: [ADR 0022](adr/0022-guide-lineage-active-scope.md).                                      |

#### Issue #639 — secuencia de despliegue

Cada fase necesita su propia autorización. El orden **no** es negociable: lo
impone qué locks comparten dos binarios que conviven durante un rolling deploy,
no el esquema.

| Fase      | Qué                                                           | Puerta previa                                   |
| --------- | ------------------------------------------------------------- | ----------------------------------------------- |
| **C.0A**  | Desplegar V1 doble lock (`GLOBAL_COMPAT → LINEAGE → SESSION`) | —                                               |
| **C.0A1** | Hardening del despliegue (ver abajo)                          | C.0A desplegada                                 |
| **C.0B1** | Crear `UNIQUE(userId, guideKey) WHERE ACTIVE`                 | C.0A1 completa, incluido el enlace de configs   |
| **C.0B2** | Retirar el índice global                                      | **V0 extinto, demostrado** (ver abajo)          |
| **C.0B3** | Desplegar V2 lineage-only                                     | C.0B2 aplicada; V1 y V2 **sí** pueden coexistir |

- **V0 y V2 nunca coexisten** — no comparten ningún lock de START.
- **V1 y V2 sí coexisten**: ambos toman el lock de lineage. Esa convivencia es
  la función del puente, no un efecto colateral tolerado.
- **C.0B3 termina** verificando que V1 quedó drenado.

#### C.0A1 — contrato de despliegue

Hasta esta fase, el preDeploy del API era
`migrate:deploy && prisma db seed`: **cada despliegue de producción reejecutaba
el seed completo**. No es una lectura — borra y reinserta
`TherapistAvailability`, reescribe `Journey.publishedAt` a la hora del
despliegue y fuerza `isActive`/`isPublished` a los valores del fichero,
revirtiendo en silencio lo que operaciones o contenido hubieran cambiado.

Contrato vigente:

- **El API es el único migrador.** El worker **nunca** ejecuta `migrate:deploy`.
  Dos migradores concurrentes no se encolan: el advisory lock de Prisma expira a
  los 10 s (no configurable) y el par acaba con uno en deadlock, un índice
  INVALID y toda migración posterior bloqueada por P3009 — reproducido en
  PostgreSQL 18.4.
- **El seed no forma parte de ningún despliegue.** Es una operación
  administrativa que exige `ALLOW_PRODUCTION_BOOTSTRAP_SEED=1` para una única
  invocación, nunca una variable persistente de Railway.
- **`apps/api/railway.json` se eliminó**: declaraba NIXPACKS y un preDeploy sin
  seed mientras producción usaba RAILPACK y sí sembraba.
- **Las configuraciones versionadas** viven en `apps/api/railway.api.json` y
  `apps/api/railway.worker.json`, y reproducen la configuración efectiva.

**Los servicios todavía NO están enlazados a esos ficheros.**

Config-as-Code **no reemplaza el dashboard**: Railway combina ambas fuentes en
cada deployment y el fichero solo sobrescribe los valores que declara. Un campo
omitido **no** vuelve a su default — conserva el del dashboard. Por eso todo
campo efectivo queda clasificado, sin categoría implícita:

| Campo                                                                                       | Autoridad                            | Por qué                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `builder`, `buildCommand`, `watchPatterns`                                                  | `CODE_OWNED`                         | declarados                                                                         |
| `startCommand`; `preDeployCommand` (API)                                                    | `CODE_OWNED`                         | declarados                                                                         |
| `healthcheckPath` (API), `restartPolicyType`, `restartPolicyMaxRetries`, `sleepApplication` | `CODE_OWNED`                         | declarados                                                                         |
| `preDeployCommand` (worker), `healthcheckPath` (worker)                                     | `CODE_OWNED`                         | declarados **como `null`**, no omitidos — medido: `null` contribuye, la omisión no |
| `rootDirectory`                                                                             | `DASHBOARD_OWNED`                    | no existe en el schema oficial de Config-as-Code                                   |
| `railwayConfigFile`                                                                         | `DASHBOARD_OWNED`                    | es el puntero al propio fichero                                                    |
| `cronSchedule`, `numReplicas`, `region`, `healthcheckTimeout`                               | `NOT_APPLICABLE` · **no declarados** | sin valor efectivo hoy; el fichero no los gobierna                                 |

**Resuelto por medición** (servicio desechable, eliminado tras la prueba):

| Variante en `railway.json` | `fileServiceManifest` | `propertyFileMapping` | resuelto      |
| -------------------------- | --------------------- | --------------------- | ------------- |
| campo **omitido**          | no aparece            | no aparece            | del dashboard |
| `preDeployCommand: null`   | **aparece** (`null`)  | **aparece**           | `null`        |
| `preDeployCommand: []`     | **aparece** (`[]`)    | **aparece**           | `[]`          |

Dos hechos que esto establece. Primero, **el fichero no escribe en la
configuración almacenada**: tras desplegar un fichero que declaraba preDeploy y
healthcheck, la `serviceInstance` seguía en `null` — fichero y dashboard son
almacenes distintos que se combinan en cada deployment. Segundo, **`null` es una
declaración y la omisión no lo es**: `propertyFileMapping` mapea cada propiedad
resuelta a la ruta JSON de la que vino, y solo los campos escritos aparecen ahí.

Por eso el worker declara `preDeployCommand: null` y `healthcheckPath: null` en
lugar de callarlos: callar no contribuye nada y deja el campo al dashboard.

**Límite honesto:** no llegué a observar el paso final —que `null` sobrescriba un
valor **no nulo** ya almacenado—, porque no conseguí fijar uno: `railway api`
rechaza `serviceInstanceUpdate` y el fichero no escribe en la instancia. Lo que
sí está medido es que `null` se contribuye y la omisión no; combinado con la
regla documentada de que el código sobrescribe al dashboard, declarar `null`
**nunca es peor** que omitir, y es la única forma que pone el campo bajo la
autoridad del fichero.

**Cinco estados distintos, que no deben confundirse:**

```
REPO_CONFIG_RATCHET=true                     ya cierto
RAILWAY_CONFIG_PATHS_BOUND=false             las rutas quedan configuradas
CONFIG_SOURCE_USED_BY_API_DEPLOYMENT=false   un deployment consumió el fichero
CONFIG_SOURCE_USED_BY_WORKER_DEPLOYMENT=false
DEPLOYED_CONFIG_MATCHES_REPO=false           y coincide con el commit desplegado
```

Enlazar solo demuestra el segundo. **Los tres últimos exigen al menos un
deployment por servicio y evidencia en su configuración resuelta**: releer
`serviceInstance` después del binding no prueba que un deployment haya
consumido el fichero.

La evidencia existe y es concreta: `deployment.meta.serviceManifest` registra la
configuración **resuelta** de cada deployment (bloques `build` y `deploy`
completos), y `meta.fileServiceManifest` junto con `meta.propertyFileMapping`
están hoy **vacíos** en el deployment activo del API — coherente con que no hay
fichero enlazado. La verificación posterior al binding consiste en comprobar que
dejan de estarlo y que el `serviceManifest` coincide con el fichero del commit
desplegado.

Orden operativo futuro, cada paso con autorización propia:

1. fusionar el código bajo la configuración seedless actual;
2. verificar ese deployment;
3. enlazar `railwayConfigFile` a `/apps/api/railway.api.json` y
   `/apps/api/railway.worker.json`;
4. realizar o esperar deployments explícitamente autorizados;
5. verificar **en cada deployment** que la configuración provino del fichero y
   coincide con el commit desplegado.

**Diferencia deliberada pendiente de aplicar por binding:** los `watchPatterns`
versionados corrigen un cierre de dependencias incompleto en el dashboard. Hoy
el API observa `apps/api/**` y `packages/**`, y el worker solo `apps/api/**`
— pero `packages/types/tsconfig.json` extiende `@psico/typescript-config`, y
ambos builds corren `pnpm install --frozen-lockfile`. Los ficheros añaden
`config/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json` y `.npmrc`
a ambos, más `turbo.json` solo al API, que es el único que construye con Turbo.
Hasta el binding, el dashboard sigue con el cierre incompleto.

**Registro corregido del despliegue de C.0A.** El informe original decía
«sin escrituras en producción». Era falso:

```
PRODUCTION_SEED_EXECUTED=true
PRODUCTION_DB_WRITE_COMMAND_EXECUTED=true
PRODUCTION_SEMANTIC_DATA_MUTATIONS=>0
EXACT_CHANGED_ROW_COUNT=unknown  (no reconstruible sin baseline previo)
PREVIOUS_PRODUCTION_WRITES_REPORT_ACCURATE=false
```

**Deuda del seed, separada de C.0A1:** retirar el `deleteMany` de
`TherapistAvailability`; dejar de reescribir `Journey.publishedAt` en la rama
`update`; y separar bootstrap, catálogos versionados, contenido editorial y
configuración operativa, que hoy conviven en un solo fichero.

**Prueba de drenaje exigida antes de C.0B2.** El único runtime capaz de
ejecutar START es el servicio API (`GuideLifecycleService` no se exporta de
`GuideModule`; el worker no lo importa; ningún script lo instancia). La
evidencia combina metadatos de Railway —deployment activo por servicio, SHA,
deployments previos en estado terminal, y la ventana de overlap más draining
(`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` y `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`)
ya cumplida— **con el marcador que cada réplica emite al arrancar**:

```
GUIDE_START_LOCK_PROTOCOL=dual-v1 BUILD_SHA=<sha> REPLICA=<id>
```

El SHA por sí solo no basta: dice qué fuente se compiló, no que el proceso tome
ambos locks. Y una petición al balanceador no habla por las demás réplicas.

### 🟢 Polish y mejoras incrementales (priorizado por impacto)

| #   | Tarea                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **Migración `expo-av` → `expo-audio` o `react-native-track-player`** — metadata dinámica de lock-screen desde JS. Sprint largo (~3-5 días).                                                                                                     |
| 11  | ✅ **Recovery seed phrase del Diario** — verificado wireado en ambos clients (web `DiarioShell.tsx:69`, mobile `(tabs)/diario/index.tsx:121-126`). POST `/api/user/crypto-seed-acknowledged` activo. (Auditado 2026-06-17.)                     |
| 12  | ⚠️ **Web Push toggle UI** — código completo y testeado (cobertura del unsubscribe path añadida en `chore/heartbeat-webpush-tests` 2026-06-17). Lo único pendiente es ops: provisionar VAPID en Vercel para validar end-to-end con un push real. |
| 13  | ✅ **Settings UI: explicit TZ selector** — verificado shipped en S54. `TimezoneCard.tsx` muestra stored vs browser TZ + dropdown `<select>` de IANA + botón "Usar la de mi dispositivo". (Auditado 2026-06-17.)                                 |
| 14  | ✅ **Edit entry Diario mobile parity** — verificado implementado en `(tabs)/diario/[id].tsx` con state machine completo (editing/draft/draftMood/draftTags) + PATCH al endpoint. (Auditado 2026-06-17.)                                         |

### 🔵 Áreas restantes del diseño (decisión: ship o cortar)

- **Dynamic Island (área 14)** — backend stub + ADR escritos. Falta iOS Live Activity widget + sesión activa emisor de updates. **Decisión:** sólo vale si iOS user-base supera ~20 % en LATAM. **Diferir hasta validar.**
- **Rutas / bundles temáticos (área 13)** — explícitamente no priorizado v1. Reabrir cuando catálogo crezca a >10 libros.
- **Wallpapers descargables (área 15)** — no prioridad v1. Quick win cuando se quiera marketing push.

### 🟣 v2 backlog confirmado (post-validación con users pagos)

- **TherapyModule** ya está implementado (S62–S69). Falta validar gates de Pulso antes de habilitar a users reales + traer therapists reales al directorio.
- **Author B2B** ya tiene workspace + revenue tracking. Falta onboarding de authors reales (proceso humano) + payout method real (hoy Manual / Bank EC / PayPal / Payphone como JSON).
- **Pulso v2** completo. Falta agregar: filtros por rango de fecha, export CSV, alerting en métricas críticas (crisis count, week-1 retention).

---

## 4. Plan de sprints para cerrar v1

| Orden | Sprint                                                       | Effort | Bloqueante?         |
| ----- | ------------------------------------------------------------ | ------ | ------------------- |
| 1     | **Ops bundle:** Stripe price IDs + API keys + ffmpeg embed   | ½ día  | 🔴 Sí — revenue     |
| 2     | **Sentry wire** (API + worker + web + mobile)                | 1 día  | 🔴 Sí — visibility  |
| 3     | **E2E re-encrypt test + LectorShell UI tests**               | 1 día  | 🟡 Quality gate     |
| 4     | **Mobile text-selection en Lector**                          | 2 días | 🟡 UX gap           |
| 5     | **Recovery seed phrase UI wire + Edit entry mobile**         | 1 día  | 🟡 Polish           |
| 6     | **Smoke walk con 3 users reales en prod**                    | ½ día  | 🔴 Sí — bug surface |
| 7     | **Sunset `/api/subscriptions/*`** (cuando 2026-08-31 cumpla) | ½ día  | 🟢 Cleanup          |

**Total estimado para v1 close:** ~6.5 días de trabajo + ~1 semana de validación con users.

---

## 5. Freeze de scope para validación profunda

Una vez completados los sprints 1–6 arriba, **congelamos el código en una rama `release/v1.0.0`** y abrimos la fase de validación profunda. Durante esa fase:

### Qué se puede cambiar

- Bugfixes confirmados con reproducción.
- Strings de copy en cualquier idioma.
- Tweaks de estilos sin cambiar componentes.
- Config en Railway / Vercel.

### Qué NO se puede cambiar

- Schema Prisma.
- Surface de endpoints (paths, request/response shape).
- Modelos de datos compartidos en `@psico/types`.
- Decisiones criptográficas en `@psico/crypto`.
- Nuevas features.

### Protocolo de validación

1. **Cohort:** 3 users reales (georgenton + 2 invitados de Ecuador).
2. **Duración:** 7 días de uso continuo.
3. **Tracking:** Sentry breadcrumbs + un Google Form post-uso (10 preguntas estructuradas).
4. **Cierre:** sesión de retro 1-1 con cada user. Output → `docs/informes/validation-v1-2026-XX-XX.md`.
5. **Decisión gate:** ¿ship v1 a marketing? Sí/No con razón. Si No, qué sprint cierra el gap.

---

## 6. v2 gate (post-validación)

Decisiones a tomar después del freeze:

| Gate                  | Pre-condición                          | Decisión                                                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------- |
| **Habilitar Therapy** | Pipeline humano de therapists definido | Sí/No → si Sí, sprint de wire al UI flag + traer talents |
| **Dynamic Island**    | iOS user-base > 20 % medida en Pulso   | Sí/No → si Sí, sprint iOS Live Activity                  |
| **LATAM expand**      | Pull request de usage desde MX/AR/CO   | Sí/No → si Sí, Payphone real + i18n review               |
| **Rutas (bundles)**   | Catálogo > 10 libros                   | Sí/No → editorial decision                               |
| **Wallpapers**        | Marketing push planificado             | Sí/No → quick win cuando convenga                        |

---

## 7. Cómo usar este documento

- **Antes de iniciar un sprint:** leer §3 y §4, escoger el bloque que toca.
- **Cuando una tarea se complete:** mover de §3 a "completado" (o eliminar) y agregar la bitácora en [docs/informes/](informes/).
- **Cuando cambie el estado de un área de diseño:** actualizar §2 + el mapping en [CLAUDE.md](../CLAUDE.md) + [docs/design/handoff/INDEX.md](design/handoff/INDEX.md).
- **Cuando se entre a la fase de validación:** congelar este documento y trabajar contra él como source of truth.

---

**Última edición:** 2026-06-13
**Próximo paso sugerido:** sprint **Ops bundle** (orden 1 en §4) — desbloquea revenue y deja los servicios externos vivos en prod.
