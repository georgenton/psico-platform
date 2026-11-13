# ADR 0024 — Migrar el runtime de Vercel/Railway a Coolify sobre infraestructura SyntaVera

- **Estado:** aceptado (staging), pendiente para producción
- **Fecha:** 2026-09-29
- **Sustituye parcialmente a:** [ADR 0001](0001-monorepo-turborepo.md) (§Deployment),
  [ADR 0003](0003-content-module-slug-urls-r2-storage.md) (§hosting; R2 se conserva),
  [ADR 0010](0010-bullmq-worker-same-codebase-separate-service.md) (el worker sigue
  siendo un segundo proceso del mismo código; cambia la plataforma que lo corre)
- **No sustituye:** ninguna decisión de producto, privacidad ni criptografía.
  [ADR 0007](0007-e2e-encryption-diario-eco.md) sigue intacto.
- **Sustituido en parte por su propia enmienda:** la decisión del **2026-11-05**,
  justo debajo, retira Vercel y Railway del plan operativo. Lo que este ADR decía
  sobre conservarlas encendidas como respaldo queda como **antecedente**.

---

## Enmienda vigente — 2026-11-05 · plataforma única

> **Esta sección manda.** Donde el cuerpo histórico de abajo la contradiga, gana
> esta enmienda. El cuerpo se conserva entero porque explica cómo se llegó aquí;
> no es una lista de pasos ejecutables.

Decisión del propietario, reafirmada el **2026-11-13**:

1. **OVH con Coolify es la única plataforma autorizada para FeelVerse**, en
   staging y en producción. No hay una segunda plataforma de despliegue.
2. **Vercel y Railway no son una alternativa de retorno.** Quedan retiradas del
   plan operativo: no son destino de despliegue, ni de staging, ni de pruebas
   alojadas, ni de contingencia, ni de retorno a una versión anterior. La
   elección no se vuelve a plantear, y el avance no se condiciona a mantenerlas
   disponibles.
3. **Los recursos históricos se conservan sin mantener conexiones activas**, y
   son dos cosas distintas que conviene no confundir. No se elimina ningún
   proyecto, base, dominio, variable ni cuenta de esas plataformas, y menos como
   efecto secundario de una limpieza documental. Lo que sí se retira es la
   **conexión del cliente**: desde el 2026-11-13, al trabajar en este
   repositorio no se cargan sus servidores MCP, ni su plugin, ni sus skills, ni
   sus hooks — detalle y mecanismo en
   [el runbook §7.1](../deploy/coolify-runbook.md).
4. **La recuperación de la plataforma se prepara dentro de OVH.** Reconstruir
   tras perder el servidor significa provisionar un host nuevo, instalar
   Coolify, recrear los tres recursos y restaurar desde la copia de R2 —
   nunca «volver a la plataforma anterior». Ese es el nivel 4 del
   [runbook §3](../deploy/coolify-runbook.md), y su ensayo sigue pendiente de un
   recurso autorizado.
5. **Las instrucciones anteriores de conservar esos proveedores como
   contingencia son antecedentes sustituidos, no pasos ejecutables.** En
   concreto: el último párrafo del §Contexto, el punto 3 de §Estrategia y la
   sección entera de §Criterios de apagado. Los tres quedan marcados en su
   sitio.

**Lo que esta enmienda NO retira.** Los servicios externos que el producto usa
para funciones que no son alojamiento siguen exactamente donde estaban:
almacenamiento (**R2**), pagos (**Stripe**), correo (**Resend**), modelo
(**Anthropic**), embeddings (**Voyage**), transcripción, vídeo (**Daily**,
**Cloudflare Stream**), traza de errores (**Sentry**), identidad de Google y
**Expo/EAS** para la distribución móvil. Retirar dos plataformas de alojamiento
no es retirar el resto de la casa, y ninguno de esos se migra: no son hosting.

**Dos ficheros del repositorio cuyo borrado consigue lo contrario de lo que
parece**, y por eso se conservan: `scripts/vercel-ignore-web.sh` y
`apps/web/vercel.json`. Sin su `ignoreCommand`, Vercel construiría en cada
commit de la rama conectada. Hay trinquete en
`apps/web/src/deploy-policy.test.ts`. Igual se conservan
`apps/api/railway.api.json` y `railway.worker.json`: son el inventario de cómo
estaban configurados los dos procesos, que es justo lo que hace falta para
reconstruir en una caja nueva.

---

## Contexto

FeelVerse × PsicoContent nació en abril de 2026 con una decisión de hosting que
era la correcta entonces y está documentada en la bitácora: `apps/web` en Vercel,
`apps/api` y su worker en Railway, con PostgreSQL y Redis gestionados por Railway.
Eso permitió llegar a producción en la Sesión 6 sin gastar un solo día en
infraestructura, que era exactamente lo que el proyecto necesitaba en ese momento.

Diecisiete meses después existe infraestructura propia —SyntaVera: un VPS OVH con
Docker, Coolify, Traefik, DNS y R2 en Cloudflare— ya auditada y endurecida, y en
ella vive otro producto (EIA Studio). El coste de mantener dos proveedores
gestionados para un producto que ya tiene casa propia dejó de justificarse.

**Esta decisión no borra la anterior.** Vercel y Railway se quedan encendidos como
fallback durante todo el cutover, y las bitácoras que describen el despliegue
anterior se conservan como historia.

> ⚠️ **Antecedente sustituido** por la enmienda del 2026-11-05. La segunda mitad
> sigue vigente —las bitácoras se conservan como historia— y la primera no: no
> hay fallback. Lo que se conserva son los **recursos**, no una vía de retorno.

## Decisión

Mover el runtime —web, API y worker— a Coolify en el servidor SyntaVera, con
`staging` primero y `production` sólo después de validar. Los servicios externos
que no son hosting (R2, Stripe, Anthropic, Voyage, Resend, Daily, Cloudflare
Stream, Sentry) **no se tocan**.

## Lo que la auditoría encontró, y que decide el plan

### Un bloqueante de seguridad, no de comodidad

`apps/api/src/emotional-map/cache-identity.ts` decide si la máquina está
desplegada con esta función:

```ts
function looksDeployed(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ??
    process.env.RAILWAY_PROJECT_ID ??
    process.env.RAILWAY_SERVICE_ID,
  );
}
```

En Coolify ninguna de las tres existe. `looksDeployed()` devolvería `false`, se
salta la rama estricta —la que **exige** `PSICO_ENV` y rechaza que una máquina
desplegada se llame «development»— y cae al camino local, donde la ausencia de
`PSICO_ENV` resuelve a `development`.

El comentario que el propio código lleva encima describe exactamente esa
consecuencia: «every safety barrier below quietly turns itself off. That is
precisely the failure we are trying to make impossible».

Hay **16 puntos de llamada** que dependen de ese resolutor: la ingesta destructiva
de contenido, el bootstrap de libros, el backfill, la activación de aprendizaje, la
aplicación de guías, el fixture visual de QA, el rollout de la guía y el servicio
de identidad del mapa. Migrar sin arreglar esto no degrada una comodidad: apaga
barreras pensadas para que nadie borre subrayados de usuarios reales por error.

**Por tanto:** la detección de «máquina desplegada» debe conocer Coolify antes del
primer deploy de staging, y debe seguir conociendo Railway mientras Railway siga
encendido.

### Una regresión de alcance en la web

`apps/web/src/app/prototipos/lectura-guiada/page.tsx` devuelve 404 cuando
`VERCEL_ENV=production`. En Coolify esa variable no existe, así que la ruta de
prototipos quedaría **accesible en producción**. Igual que arriba: el gate no es
decorativo, y su condición desaparece con la plataforma.

`apps/web/sentry.client.config.ts` usa `NEXT_PUBLIC_VERCEL_ENV` para etiquetar el
entorno en Sentry; sin ella, todo se reporta como «development» y se pierde la
separación entre entornos en el panel de errores.

### Lo que NO está acoplado, y conviene decirlo

- **Cero paquetes `@vercel/*`.** Ninguno declarado en ningún workspace.
- **Cero edge runtime.** El middleware usa `crypto.randomUUID()` de Node y corre
  en runtime Node.
- **Ninguna función de plataforma de Vercel:** ni KV, ni Blob, ni Postgres, ni
  Cron, ni Analytics, ni ISR declarado. Los nueve route handlers son Node normales.
- **Las cabeceras y el CSP** viven en `next.config.js` y `middleware.ts`, que
  viajan con la aplicación, no en configuración de Vercel.
- **La API ya respeta `PORT`** (`process.env.PORT ?? 3001`) y ya expone
  `/health`, `/health/integrations` y `/health/emotional-map`.
- **El worker ya es un proceso aparte** del mismo build (ADR 0010), que es
  justamente la forma que Coolify necesita.
- **El almacenamiento ya es R2 vía S3 SDK**, con credenciales por variables: no
  cambia nada.
- **Las variables `RAILWAY_*` del código de QA** (`CIRCULOS_E2E_RAILWAY_*`) son
  herramientas de prueba que hablan con la API de Railway del entorno de pruebas.
  No son runtime y no bloquean nada.

### Una contradicción que la auditoría destapó

`nixpacks.toml` sigue en `main` **con marcadores de conflicto de merge
committeados**:

```
<<<<<<< HEAD
=======

# force rebuild Fri May  1 19:47:08 -05 2026
>>>>>>> origin/main
```

El fichero fue eliminado a propósito en `c4083174` («chore: remove nixpacks.toml,
use Railway custom commands») y volvió en el merge de release `6fc93135`. Hoy es
configuración **muerta e inválida**: los dos servicios de Railway usan
`builder: RAILPACK` con comandos explícitos en `railway.api.json` y
`railway.worker.json`, así que nadie lee ese TOML. Se documenta aquí porque es
exactamente la clase de residuo que una migración convierte en una hora perdida.

## Por qué Coolify, sustentado en decisiones existentes

- **Propiedad del despliegue.** El proyecto ya tomó dos decisiones en esa
  dirección: [ADR 0013](0013-openapi-as-source-of-truth.md) puso el contrato del
  cliente en el repositorio en vez de en un panel, y
  [#725](https://github.com/georgenton/psico-platform/issues/725) sacó la regla de
  despliegue del dashboard de Vercel a `apps/web/vercel.json`. Coolify continúa
  esa línea: la infraestructura se describe donde se revisa.
- **Multi-producto.** EIA Studio ya vive en el mismo Coolify. Un solo plano de
  control para los dos productos es menos superficie que mantener.
- **Backups bajo control.** El plano de control de Coolify ya se respalda en R2
  con retención de 30 días; la base de FeelVerse podrá tener su propia política en
  su propio bucket, cosa que hoy depende de lo que Railway ofrezca.
- **Coste.** Dos proveedores gestionados frente a un VPS que ya está pagado y en
  uso.

No se alega rendimiento: no hay medición que lo sustente, y afirmarlo sería
inventarse una justificación.

## Lo que sigue siendo externo

R2 (almacenamiento y backups) · Stripe · Anthropic · Voyage · Resend · Daily.co ·
Cloudflare Stream · Sentry · Google Identity · Expo/EAS para la distribución
móvil. Ninguno se migra: no son hosting.

## Estrategia

1. **Staging primero**, con base de datos y Redis propios, nunca compartidos con
   producción.
2. **Producción después** de validar staging, con su propio gate.
3. **Vercel y Railway siguen encendidos** durante todo el cutover, como fallback y
   rollback. No se borra ningún proyecto, base, dominio ni variable.
   > ⚠️ **Antecedente sustituido** (2026-11-05). No son fallback ni rollback. La
   > segunda frase se mantiene: no se borra nada.
4. **Criterios de apagado** explícitos, más abajo, en vez de «cuando parezca que
   ya está».
   > ⚠️ **Antecedente sustituido** (2026-11-05). La retirada no espera criterios:
   > ya está decidida. Y retirar del plan no es apagar — ver el punto 3 de la
   > enmienda.

## Mapeo de componentes

| Hoy                   | Plataforma actual                          | Destino Coolify                                                                                   |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `apps/web` (Next 14)  | Vercel · proyecto `psico-platform-web`     | Application, Nixpacks, puerto interno 3000, `staging.feelverse.app`                               |
| `apps/api` (NestJS)   | Railway · servicio `psico-platform`        | Application, puerto interno 3001, `/health`, **con dominio público** — ver la corrección de abajo |
| `apps/api` worker     | Railway · servicio `psico-platform-worker` | Application sin dominio ni puerto público                                                         |
| PostgreSQL + pgvector | Railway Postgres                           | Database Coolify (`pgvector/pgvector:pg18`), red privada, sin puerto al host                      |
| Redis                 | Railway Redis                              | Database Coolify, red privada, sin puerto al host                                                 |
| Variables de servicio | Railway variables / Vercel env             | Coolify environment variables, con el scope más estrecho                                          |
| Volúmenes             | ninguno en uso                             | ninguno necesario; el estado vive en Postgres y R2                                                |
| Dominios              | `*.vercel.app`, `*.up.railway.app`         | `staging.feelverse.app` + `api-staging.feelverse.app`; producción después                         |
| Deploy                | push a `main` + política de #725           | Coolify deploy                                                                                    |

## Una corrección al plan: la API no puede ser privada

La primera versión de este ADR daba por hecho que la API viviría sin dominio
público, hablando con la web por la red privada. **Eso es falso, y el código lo
dice sin ambigüedad.**

`apps/web/src/app/dashboard/_ApiClientBootstrap.tsx` es un Client Component —corre
en el navegador— que hace `apiClient.configure(apiBase, …)` con
`NEXT_PUBLIC_API_URL`. Su propio comentario lo explica: «It wires the singleton so
those typed wrappers actually reach the API on Railway». Docenas de componentes
cliente reciben ese `apiBase` y salen desde el navegador: el chat de Eco por SSE, el
lector, el grabador de voz, el composer del Diario, el alta de Web Push, el cambio
de contraseña, el reproductor de medios, el panel de la guía.

El móvil hace lo mismo por su cuenta: `apps/mobile/src/context/auth.tsx:20` lee
`EXPO_PUBLIC_API_URL` y construye `API_BASE = ${API_URL}/api`; `assetUrl()` compone
URLs de imagen contra ese host; `voz.tsx` sube audio multipart ahí; `EcoChat.tsx`
abre el SSE ahí. El único uso del origen web desde el móvil es
`EXPO_PUBLIC_WEB_ORIGIN`, y sólo para las URLs de retorno de Stripe.

Consecuencias, que son de arquitectura y no de comodidad:

- la API necesita **dominio público** en cada entorno: `api-staging.feelverse.app`
  para staging. No es un dominio inventado por si acaso; sin él no hay Eco, ni
  lector, ni voz, ni Diario, ni en web ni en móvil;
- `ALLOWED_ORIGINS` tiene que incluir el origen de la web —`main.ts` lo pasa a
  `enableCors` con `credentials: true`—, porque las peticiones del navegador sí
  están sujetas a CORS;
- **no hace falta dominio de WebSocket.** No hay ni uno: Eco transmite por SSE sobre
  HTTPS, mismo host y mismo puerto. Cero coincidencias de `WebSocket`, `ws://`,
  `wss://` o `socket.io` en el móvil.

Lo que sí sigue privado, sin puerto al host y sin dominio: PostgreSQL, Redis y el
worker.

## Criterios de apagado de Vercel y Railway

> ⚠️ **Sección entera: antecedente sustituido** por la enmienda del 2026-11-05.
> **No son pasos ejecutables.** Se conserva porque documenta qué se consideraba
> necesario entonces, y porque tres de sus seis puntos siguen siendo buenas
> condiciones para **producción en OVH** —salud sostenida, restore drill
> ejecutado, webhooks reapuntados y verificados— leídos contra la plataforma
> autorizada. El punto 5, «volver a Vercel/Railway», ya no existe como opción:
> el retorno a una versión anterior se hace **dentro de OVH**, con los
> candidatos de reversión por servicio del
> [runbook §3.1](../deploy/coolify-runbook.md).

Ninguno de los dos se apaga hasta que **todos** se cumplan:

1. `production` en Coolify sirviendo `feelverse.app` con salud verde durante siete
   días consecutivos.
2. Base de datos de producción migrada, con un **restore drill** ejecutado y
   documentado desde el backup de R2 — no sólo un backup que existe.
3. La app móvil publicada apuntando al dominio nuevo, y la versión anterior
   fuera de circulación o compatible.
4. Webhooks de Stripe y Daily reapuntados y verificados con un evento real.
5. Un rollback ensayado: volver a Vercel/Railway en menos de una hora, demostrado
   una vez.
6. Sin incidentes abiertos atribuibles a la migración.

Mientras falte uno, los dos proveedores se quedan. La factura de un mes es más
barata que un cutover sin vuelta atrás.

## Consecuencias

- Asumimos la operación del runtime: parches del host, capacidad, certificados vía
  Traefik, y la disciplina de backups. El host ya está endurecido y respaldado, así
  que lo que se añade es la parte de la aplicación.
- Perdemos los previews automáticos por PR que daba Vercel. Es una pérdida real y
  queda anotada como pendiente, no disimulada.
- Ganamos un solo lugar donde mirar cuando algo falla, y la posibilidad de tener
  `staging` de verdad —hoy el entorno de pruebas vive en un proyecto Railway
  aparte— dentro del mismo proyecto y con los mismos mecanismos.
