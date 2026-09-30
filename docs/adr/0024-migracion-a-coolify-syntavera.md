# ADR 0024 — Migrar el runtime de Vercel/Railway a Coolify sobre infraestructura SyntaVera

- **Estado:** aceptado (staging), pendiente para producción
- **Fecha:** 2026-09-29
- **Sustituye parcialmente a:** [ADR 0001](0001-monorepo-turborepo.md) (§Deployment),
  [ADR 0003](0003-content-module-slug-urls-r2-storage.md) (§hosting; R2 se conserva),
  [ADR 0010](0010-bullmq-worker-same-codebase-separate-service.md) (el worker sigue
  siendo un segundo proceso del mismo código; cambia la plataforma que lo corre)
- **No sustituye:** ninguna decisión de producto, privacidad ni criptografía.
  [ADR 0007](0007-e2e-encryption-diario-eco.md) sigue intacto.

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
4. **Criterios de apagado** explícitos, más abajo, en vez de «cuando parezca que
   ya está».

## Mapeo de componentes

| Hoy                   | Plataforma actual                          | Destino Coolify                                                              |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `apps/web` (Next 14)  | Vercel · proyecto `psico-platform-web`     | Application, Dockerfile o Nixpacks, puerto interno 3000, dominio por Traefik |
| `apps/api` (NestJS)   | Railway · servicio `psico-platform`        | Application, puerto interno 3001, `/health`                                  |
| `apps/api` worker     | Railway · servicio `psico-platform-worker` | Application sin dominio ni puerto público                                    |
| PostgreSQL + pgvector | Railway Postgres                           | Database Coolify (imagen con pgvector), red privada, sin puerto al host      |
| Redis                 | Railway Redis                              | Database Coolify, red privada, sin puerto al host                            |
| Variables de servicio | Railway variables / Vercel env             | Coolify environment variables, con el scope más estrecho                     |
| Volúmenes             | ninguno en uso                             | ninguno necesario; el estado vive en Postgres y R2                           |
| Dominios              | `*.vercel.app`, `*.up.railway.app`         | `feelverse.app`, `staging.feelverse.app` por Traefik                         |
| Deploy                | push a `main` + política de #725           | Coolify deploy                                                               |

## Criterios de apagado de Vercel y Railway

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
