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

| Fase      | Qué                                                           | Puerta previa                                   | Estado                     |
| --------- | ------------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| **C.0A**  | Desplegar V1 doble lock (`GLOBAL_COMPAT → LINEAGE → SESSION`) | —                                               | ✅ desplegada              |
| **C.0A1** | Hardening del despliegue (ver abajo)                          | C.0A desplegada                                 | ✅ completa                |
| **C.0B1** | Crear `UNIQUE(userId, guideKey) WHERE ACTIVE`                 | C.0A1 completa, incluido el enlace de configs   | ⬜ PR abierta, sin aplicar |
| **C.0B2** | Retirar el índice global                                      | **V0 extinto, demostrado** (ver abajo)          | ⬜ PR abierta, sin aplicar |
| **C.0B3** | Desplegar V2 lineage-only                                     | C.0B2 aplicada; V1 y V2 **sí** pueden coexistir | ⬜ PR abierta, sin aplicar |

**Checkpoint de producción — 2026-08-18.** Ambos servicios sirven
`1a6be6d3adb3501c30f957e6b87c547aca191769` y **consumen sus ficheros
versionados**: API `6813ac01` con `/apps/api/railway.api.json`, worker
`d93f2d6a` con `/apps/api/railway.worker.json`, ambos con
`propertyFileMapping` atribuyendo los nueve campos gobernados al fichero. 56
migraciones aplicadas, 0 pendientes. El seed no aparece en ningún preDeploy.
El esquema sigue en modo **GLOBAL**: el índice de lineage aún no existe.

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
  `apps/api/railway.worker.json`. Reproducen los campos efectivos **restantes**,
  con dos diferencias deliberadas: los `watchPatterns` son un **hardening
  distinto** del dashboard —cierran el grafo de build que hoy queda abierto— y
  `preDeployCommand: null` con `healthcheckPath: null` en el worker son
  **declaraciones nuevas**, no reflejo de lo existente. Ninguna de esas
  diferencias entra en vigor hasta que **un deployment consuma los ficheros**.

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

**Qué está probado y qué está derivado** — la distinción importa, porque el
último eslabón no se observó:

```
NULL_IS_FILE_CONTRIBUTION=proven
FILE_VALUE_PRECEDENCE_OVER_DASHBOARD=documented
NULL_OVER_NON_NULL_DASHBOARD_OBSERVED=false
NULL_CLEAR_BEHAVIOR=derived_from_provenance_plus_documented_precedence
```

Que `null` es una contribución del fichero está **medido** — dos veces: en la
sonda de C.0A1 y otra vez en un deployment desde fuente, donde ambos `null` del
worker aparecen en `propertyFileMapping`. Que una propiedad presente en código
prevalece sobre el dashboard está **documentado** por Railway. Que `null` por
tanto _limpia_ un valor del dashboard es una **derivación** de ambas cosas, **no
una observación**: ninguna de las dos sondas enfrentó un `null` del fichero
contra un valor no nulo almacenado en el dashboard, que es la única prueba que
cerraría ese eslabón.

Aun así la decisión no depende de ese eslabón: declarar `null` **nunca es peor**
que omitir —la omisión provablemente no contribuye nada— y es la única forma que
pone el campo bajo la autoridad del fichero.

**Cinco estados distintos, que no deben confundirse** — todos cerrados el
2026-08-18 sobre `1a6be6d3adb3501c30f957e6b87c547aca191769`:

```
REPO_CONFIG_RATCHET=true                     el contrato vive en el repo
RAILWAY_CONFIG_PATHS_BOUND=true              las rutas quedan configuradas
CONFIG_SOURCE_USED_BY_API_DEPLOYMENT=true    un deployment consumió el fichero
CONFIG_SOURCE_USED_BY_WORKER_DEPLOYMENT=true
DEPLOYED_CONFIG_MATCHES_REPO=true            y coincide con el commit desplegado
```

Siguen siendo cinco preguntas distintas: enlazar no es consumir, y consumir no
es coincidir. Que hoy valgan `true` a la vez no las colapsa en una sola.

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
3. enlazar `railwayConfigFile` **primero solo en el worker**
   (`/apps/api/railway.worker.json`) y verificarlo;
4. enlazar el API (`/apps/api/railway.api.json`) **solo con el worker sano**;
5. realizar o esperar deployments explícitamente autorizados;
6. verificar **en cada deployment** que la configuración provino del fichero y
   coincide con el commit desplegado.

#### C.0A1 — plan productivo en dos ondas

C.0A1 **no** queda completa con el merge, ni con configurar los config paths.
Termina cuando **ambos deployments hayan consumido sus ficheros** y la
configuración resuelta coincida con el commit desplegado.

##### Onda 1 — merge bajo la configuración de dashboard actual

Preflight: PR abierta y en el HEAD auditado · 0 commits detrás · mergeable/CLEAN
· checks terminales · 0 hilos · el API con **solo** `migrate:deploy` · el worker
**sin** preDeploy ni healthcheck · `ALLOW_PRODUCTION_BOOTSTRAP_SEED` **no**
persistida en ninguno de los dos · 0 migraciones nuevas en la PR · 0 migraciones
pendientes en producción (solo lectura) · registrar SHA de `main` y los
deployments de retorno de API, worker y Vercel.

Después: merge commit → monitorizar API, worker, Vercel y Release hasta estado
terminal → verificar en logs que el preDeploy del API ejecutó `migrate:deploy` y
aplicó **0** → verificar que **el seed no aparece** → smoke anónimo de solo
lectura.

**Efectos en producción, dichos por adelantado.** Esta onda **sí despliega API y
worker**, porque la PR toca `apps/api/**` y ambos observan esa ruta. Vercel
**también** producirá un deployment de producción aunque la web no cambie: es su
comportamiento con cualquier push a `main`, ya observado. El binding todavía no
ocurre, así que **los ficheros no gobiernan nada en esta onda** — el despliegue
usa la configuración del dashboard, que ya es seedless.

##### Onda 2 — binding secuencial y verificación real

Solo si la onda 1 quedó sana. **Los dos servicios no se enlazan a la vez.** El
worker va primero como canario: no atiende tráfico y no toca la base de datos,
así que si el modelo de fusión no se comporta como creemos, lo descubrimos donde
nadie lo nota. El API se toca **después**, y solo con el worker sano.

Cada subpaso produce **exactamente un deployment verificable** para su servicio:

```
WAVE_2_WORKER_FIRST=true
WAVE_2_API_AFTER_WORKER_HEALTHY=true
WAVE_2_WORKER_DEPLOYMENTS_EXPECTED=1
WAVE_2_API_DEPLOYMENTS_EXPECTED=1
WAVE_2_MANUAL_REDEPLOYS_EXPECTED=0_or_1_per_service
```

El binding puede generar ese deployment por sí solo o no; si no lo genera, se
inicia un deployment desde la fuente sobre el SHA ya fusionado. Lo que **nunca**
es correcto es reportar «0 deployments en la onda 2 porque el binding los
disparó»: el deployment existe y es justamente el que hay que verificar. Lo que
sí puede ser 0 es el número de **deployments manuales**.

###### Escribir el path y aplicarlo son operaciones distintas

Este es el error que costó el primer intento de la onda 2A. **Escribir**
`railwayConfigFile` deja el path guardado; **aplicarlo** exige un deployment que
vuelva a resolver la configuración desde el repositorio. Son dos operaciones, no
una.

Y no cualquier deployment sirve. Un **redeploy del deployment actual** reutiliza
la configuración ya resuelta de ese deployment: termina en `SUCCESS`, no aplica
el binding pendiente y **no demuestra nada**. Lo que hace falta es un deployment
**desde la fuente**.

Medido en una sonda efímera: un proyecto Railway desechable conectado a este
mismo repo en `main`, sin base de datos, sin Redis, sin variables, sin dominio y
sin volumen. Al cerrar la sonda, el **servicio** quedó eliminado de inmediato y
el **proyecto** quedó con borrado programado por Railway —un tombstone diferido,
no una desaparición instantánea:

```
TEMP_SERVICE_DELETED=true
TEMP_PROJECT_DELETION_SCHEDULED=true
TEMP_PROJECT_DELETED=false_as_of_report
ACTIVE_COMPUTE_RESOURCES_REMAINING=0
PROJECT_TOMBSTONE_PENDING=true
```

No quedan servicios ni recursos computables; el objeto Project todavía existe
hasta que Railway ejecute su borrado. Resultado de la medición:

```
BINDING_WRITE_CREATED_STAGED_CHANGE=false   la escritura se aplica directa
BINDING_WRITE_CREATED_DEPLOYMENT=false      no dispara nada por sí sola
BINDING_APPLICATION_MODE=FROM_SOURCE_REDEPLOY_AFTER_APPLIED_BINDING
COMMAND_VERIFIED=railway redeploy --from-source   (CLI 5.41.2)
```

Si en un intento futuro la escritura **sí** produjera un staged change, el
mecanismo correcto sería aplicar ese changeset —no un redeploy— y volver a
medir. La secuencia empieza con **cero staged changes** y termina con **cero
staged changes**; cualquier otro estado es ambiguo y detiene la onda.

###### La prueba autoritativa son los tres manifests

El estado `SUCCESS` **no** es evidencia de nada. Un deployment sano con
manifests vacíos es un **fallo de la onda**, no un aprobado con matices. La
prueba es:

- `fileServiceManifest` **no vacío**, coincidiendo **estructuralmente en los
  nueve campos gobernados** de `build` y `deploy`;
- `propertyFileMapping` **no vacío**, atribuyendo cada campo declarado a su ruta
  JSON de origen (`$.build.*`, `$.deploy.*`);
- `serviceManifest` resolviendo exactamente los valores de esos campos.

Precisión sobre «exacto»: `fileServiceManifest` **no** es el fichero. No trae
`$schema`, así que la igualdad JSON completa es `false`. Lo que se compara —y lo
único que puede llamarse exacto— son los nueve campos gobernados y sus valores:

```
FILE_MANIFEST_CLAIM=structurally matched all nine governed build/deploy fields
FILE_MANIFEST_FULL_JSON_EQUALITY=false   (fileServiceManifest carece de $schema)
```

La sonda **reconfirmó**, ahora en un deployment desde fuente, que los `null`
declarados del worker aparecen en `propertyFileMapping` como contribuciones del
fichero. Eso es `NULL_IS_FILE_CONTRIBUTION=proven` visto por segunda vez, **no**
el cierre de la colisión no observada: la sonda nunca enfrentó un `null` del
fichero contra un valor no nulo almacenado en el dashboard, así que
`NULL_OVER_NON_NULL_DASHBOARD_OBSERVED` sigue en `false` y
`NULL_CLEAR_BEHAVIOR` sigue siendo una derivación.

###### Desenlazado se decide por «bound vs unbound», no por el valor guardado

`serviceInstanceUpdate` no sabe escribir `null`: lo trata como campo ausente y
devuelve `true` sin cambiar nada. Al limpiar un binding, el campo queda en `""`.

Observado en el dashboard de producción, un servicio cuyo `railwayConfigFile`
vale `""` muestra **`Add File Path`** — el mismo estado que uno con `null`. Son
**dos representaciones de almacenamiento distintas del mismo estado semántico**
«sin custom config path»; no son el mismo valor y no se comparan por igualdad
entre sí. La comprobación correcta es si el servicio está enlazado o no:

```
UNBOUND  ⇔  railwayConfigFile ∈ { null, "" }  Y  cero staged changes
BOUND    ⇔  cualquier path no vacío
```

Un path no vacío **nunca** cuenta como desenlazado, aunque apunte a un fichero
que no existe.

###### Onda 2A — worker (canario)

1. Comprobar que el entorno arranca con **cero staged changes**.
2. Enlazar únicamente `/apps/api/railway.worker.json`.
3. Registrar por separado `BINDING_WRITE_CREATED_STAGED_CHANGE` y
   `BINDING_WRITE_CREATED_DEPLOYMENT`. No esperar pasivamente.
4. Ramificar según lo registrado, y solo según eso:
   - **staged change** → aplicar ese changeset y verificar el deployment que
     resulte;
   - **deployment directo** → verificar **ese** deployment y **no crear otro**;
   - **ninguno de los dos** → lanzar **un** deployment desde la fuente
     (`railway redeploy --from-source`) sobre el SHA fusionado, no sobre otro
     commit.

   Un redeploy plano **nunca** vale como prueba en ninguna de las tres ramas.

5. Verificar en **ese** deployment los tres manifests: `fileServiceManifest` y
   `propertyFileMapping` no vacíos, y `serviceManifest` con los siete watch
   paths en orden, `preDeployCommand = null`, `healthcheckPath = null`,
   `sleepApplication = false`, ninguna mención del seed; y en logs, arranque
   limpio del worker con sus processors registrados.
6. Comprobar que el entorno queda otra vez con **cero staged changes**.
7. Ante cualquier divergencia: desenlazar **solo** el worker, restaurar su
   deployment previo y detenerse.
8. **Gate terminal:** no se pasa al API hasta que el worker esté sano y
   verificado. Un worker «probablemente bien» no habilita la onda 2B. Mientras
   `WAVE_2A_COMPLETE=false`, el siguiente paso es reintentar la 2A, nunca
   empezar la 2B.

###### Onda 2B — API

Misma máquina de decisión que la 2A. La 2B no es una versión abreviada: lo único
que cambia es qué se verifica al final, porque el API sí ejecuta un preDeploy y
sí atiende tráfico.

1. Comprobar que el entorno del API arranca con **cero staged changes**.
2. Escribir únicamente `/apps/api/railway.api.json`.
3. Registrar por separado `BINDING_WRITE_CREATED_STAGED_CHANGE` y
   `BINDING_WRITE_CREATED_DEPLOYMENT` para el API.
4. Ramificar según lo registrado:
   - **staged change en el API** → aplicar ese changeset y verificar el
     deployment que resulte;
   - **deployment directo del API** → verificar **ese** deployment y **no crear
     otro**;
   - **ninguno de los dos** → lanzar **un** deployment desde la fuente
     (`railway redeploy --from-source`) sobre el mismo SHA fusionado.

   Tampoco aquí un redeploy plano cuenta como prueba.

5. Verificar los tres manifests del API: `fileServiceManifest` y
   `propertyFileMapping` no vacíos, y `serviceManifest` con los `watchPatterns`
   del fichero (incluido `turbo.json`, exclusivo del API),
   `preDeployCommand = ["pnpm --filter @psico/api migrate:deploy"]`,
   `healthcheckPath = "/health"` y `sleepApplication = false`.
6. Verificar en logs que el preDeploy ejecuta **solo** `migrate:deploy`, aplica
   **0** migraciones y **nunca** invoca el seed; distinguir menciones nominales
   de una invocación ejecutable.
7. Comprobar `/health`, arranque limpio, y que el entorno del API queda otra vez
   con **cero staged changes**.
8. Cerrar con smoke anónimo de solo lectura.
9. Ante cualquier ambigüedad: desenlazar el API, restaurar su deployment previo
   y detenerse.

C.0A1 termina **solo** cuando ambos subpasos están cerrados:

```
RAILWAY_CONFIG_PATHS_BOUND=true
CONFIG_SOURCE_USED_BY_API_DEPLOYMENT=true
CONFIG_SOURCE_USED_BY_WORKER_DEPLOYMENT=true
DEPLOYED_CONFIG_MATCHES_REPO=true
```

##### Rollback — dos niveles que no se confunden

Restaurar un deployment anterior **no** revierte el código: `main` sigue
apuntando al commit nuevo, producción ejecuta un artefacto viejo, y cualquier
push o redeploy posterior vuelve a publicar el HEAD defectuoso. Por eso el
rollback operativo y la reconciliación de fuente son cosas distintas y se
autorizan por separado.

**Nivel 1 · Rollback operativo inmediato** — autorizable dentro de cada onda,
sin consulta adicional:

- **Onda 1** — restaurar los deployments de retorno registrados en Railway (API
  y worker) y el de producción en Vercel.
- **Binding** — vaciar `railwayConfigFile` en el servicio afectado hasta dejarlo
  desenlazado (`null` o `""`, según lo dicho arriba). Eso restituye la autoridad
  del dashboard, que sigue intacta porque el fichero nunca escribe en ella.
- **API sana y worker fallido** — desenlazar **solo** el worker y restaurar su
  deployment previo. El API queda como esté; son servicios independientes y el
  worker no atiende tráfico.
- **El binding resuelve una configuración distinta de la esperada** — desenlazar
  el servicio afectado (y cualquiera enlazado antes) y **detenerse** a
  investigar. Una configuración resuelta que no coincide con el fichero
  significa que no entendemos la fusión, y operar sobre esa base sería peor que
  quedarse con el dashboard.
- Tras cualquiera: releer la configuración efectiva, comprobar salud, reportar
  la causa exacta y registrar `SOURCE_RUNTIME_DIVERGENCE=true`.

**Sin rollback de base de datos.** La PR aporta 0 migraciones y el preflight
habrá demostrado 0 pendientes, así que no hay ninguno que hacer ni que proponer.

**Nivel 2 · Reconciliación de fuente** — nunca automática:

- preparar un revert commit o una PR de revert;
- ejecutar CI sobre ella;
- **solicitar autorización** antes de fusionarla;
- **no declarar cerrado el incidente** mientras `main` y producción no vuelvan a
  coincidir.

Un rollback operativo con `SOURCE_RUNTIME_DIVERGENCE=true` es una **mitigación
completada, no un incidente cerrado**. Y no se pausa el autodeploy ni se revierte
Git sin autorización independiente: ambas cosas cambian el comportamiento del
repositorio, no solo el de un deployment.

**Diferencia deliberada, ya aplicada:** los `watchPatterns` versionados corrigen
un cierre de dependencias incompleto que el dashboard arrastraba. Antes del
binding el API observaba `apps/api/**` y `packages/**`, y el worker solo
`apps/api/**` — pero `packages/types/tsconfig.json` extiende
`@psico/typescript-config`, y ambos builds corren
`pnpm install --frozen-lockfile`. Los ficheros añaden `config/**`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json` y `.npmrc` a ambos, más
`turbo.json` solo al API, que es el único que construye con Turbo. Desde el
cierre de la onda 2B, esos son los watch paths **resueltos** en ambos servicios.

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

#### C.0B — el tren de release, y por qué son tres fases

Las tres PRs están abiertas y apiladas (`C.0B1 → C.0B2 → C.0B3`), cada una con
base en la anterior. Ninguna está autorizada para fusionarse ni desplegarse: el
desarrollo se adelanta, las barreras de producción no se mueven.

| Fase      | Migración / cambio                         | Global    | Lineage   | Autoridad | Multi-ACTIVE                       |
| --------- | ------------------------------------------ | --------- | --------- | --------- | ---------------------------------- |
| hoy       | —                                          | `HEALTHY` | `ABSENT`  | `GLOBAL`  | imposible                          |
| **C.0B1** | `CREATE UNIQUE INDEX CONCURRENTLY` lineage | `HEALTHY` | `HEALTHY` | `GLOBAL`  | imposible                          |
| **C.0B2** | `DROP INDEX CONCURRENTLY` global           | `ABSENT`  | `HEALTHY` | `LINEAGE` | **sí, entre `guideKey` distintos** |
| **C.0B3** | runtime lineage-only (`lineage-v2`)        | `ABSENT`  | `HEALTHY` | `LINEAGE` | sí                                 |

**C.0B1 no cambia comportamiento visible.** Mientras el índice global exista,
sigue siendo la autoridad: el detector elige la regla más estricta que esté
realmente vigente. Su rollback es trivial — retirar el índice nuevo.

**C.0B2 es el cutover semántico.** Desde su aplicación, un usuario puede tener
varias sesiones `ACTIVE` si pertenecen a `guideKey` distintos, y ahí el rollback
deja de ser simétrico: recrear el índice global es imposible en cuanto existan
filas multi-ACTIVE legítimas, porque el índice mismo las prohíbe. La matriz
está abajo. **Ninguna rama cancela sesiones automáticamente.**

**C.0B3 estrecha el lock**, no el esquema: retira `GLOBAL_COMPAT_START_LOCK` y
deja `LINEAGE → SESSION`. Exige que V0 esté extinto, porque V0 y V2 no comparten
ningún lock de START.

##### Matriz de recuperación del índice

Nunca se decide por el nombre del índice. La evidencia es `pg_index`:
`indisunique`, `indisvalid`, `indisready`, `indislive`, `indnatts` vs
`indnkeyatts`, las columnas en orden y el predicado renderizado.

| Estado observado                     | Qué significa                                      | Acción                                                                  |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `ABSENT`                             | la migración no llegó a crear nada                 | reaplicar la migración                                                  |
| `HEALTHY`                            | índice válido y listo                              | nada                                                                    |
| `INVALID`                            | `CREATE CONCURRENTLY` falló y dejó el índice atrás | `DROP INDEX CONCURRENTLY` + `migrate resolve --rolled-back` + reaplicar |
| `NOT_READY`                          | build interrumpido antes de terminar               | igual que `INVALID`                                                     |
| `WRONG_STRUCTURE_SAME_NAME`          | el nombre coincide, la estructura no               | **detenerse y decidir con una persona** — nunca borrar a ciegas         |
| `HEALTHY_BUT_PRISMA_RECORDED_FAILED` | el índice está bien, el registro de Prisma no      | `migrate resolve --applied` (no re-ejecutar el DDL)                     |
| `FAILED_BEFORE_CREATE`               | falló antes de tocar el índice                     | `migrate resolve --rolled-back` + reaplicar                             |

`DROP INDEX CONCURRENTLY` no puede correr dentro de una transacción, igual que
su contraparte. Prisma ejecuta cada sentencia fuera de una transacción
explícita, lo que hace legales ambas — **medido** contra la cadena real en
PostgreSQL 18.4, no supuesto.

##### Matriz de rollback de C.0B2

| Situación                                        | Qué se puede hacer                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Global retirado, aún sin filas multi-ACTIVE      | recrear el global con `CREATE UNIQUE INDEX CONCURRENTLY`; vuelve a `GLOBAL`                           |
| Ya existen filas multi-ACTIVE                    | **no se puede recrear** sin decidir qué sesiones cerrar; requiere reconciliación humana explícita     |
| Recreación imposible por datos legítimos         | permanecer en `LINEAGE`; el rollback correcto es del runtime, no del esquema                          |
| Prisma marca la migración fallida (P3009)        | resolver el registro según la matriz de arriba antes de tocar el índice                               |
| Índice lineage inválido                          | **no** retirar el global; el detector sigue en `GLOBAL` y `degraded=true`                             |
| Deployment del API falla tras una migración sana | restaurar el deployment anterior; el esquema queda como está, y V1 sigue siendo correcto en `LINEAGE` |

##### Puertas de merge (ninguna concedida todavía)

- **C.0B1** — 0 migraciones pendientes · global sano · lineage ausente · 0
  duplicados `(userId, guideKey) WHERE ACTIVE` en producción · C.0A/C.0A1
  activas · autorización explícita de migración y deploy.
- **C.0B2** — C.0B1 aplicada y sana · **V0 extinto demostrado** por marcador de
  protocolo · ambos índices sanos · aceptación explícita del cutover y de la
  asimetría de rollback.
- **C.0B3** — C.0B2 aplicada · autoridad `LINEAGE` · inexistencia de V0 ·
  autorización para desplegar lineage-only · drenaje final de V1 verificado por
  **marcador de protocolo**, no por SHA.

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
