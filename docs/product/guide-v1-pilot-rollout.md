# Guide V1 — rollout piloto server-owned (CC-7.R1)

```
PILOT_ROLLOUT_STATUS=IN_REVIEW

GUIDE_ROLLOUT_MODES=off|pilot|on
GUIDE_ROLLOUT_DECISION_OWNER=server
GUIDE_ROLLOUT_PERCENTAGE=false
GUIDE_ROLLOUT_RANDOM=false

GUIDE_ROLLOUT_FAIL_CLOSED_DEPLOYED=true
GUIDE_PILOT_ALLOWLIST_REQUIRED=true
GUIDE_ROLLOUT_DEFAULT_LOCAL=on
GUIDE_ROLLOUT_DEFAULT_TEST=on

GUIDE_AVAILABILITY_ENDPOINT=/api/guide/availability
GUIDE_AVAILABILITY_JWT_ONLY=true
GUIDE_AVAILABILITY_ROLLOUT_GUARD=false
GUIDE_AVAILABILITY_RESPONSE_SHAPE={available:boolean}
GUIDE_AVAILABILITY_CREATES_ROWS=false
GUIDE_AVAILABILITY_REVEALS_MODE=false
GUIDE_AVAILABILITY_REVEALS_ALLOWLIST=false
GUIDE_AVAILABILITY_REVEALS_REASON=false

GUIDE_COMMANDS_GUARDED=5
GUIDE_COMMAND_DENIED_STATUS=503
GUIDE_COMMAND_DENIED_CODE=GUIDE_UNAVAILABLE
GUIDE_COMMAND_DENIED_ZERO_WRITES=true
GUIDE_GUARD_ORDER=jwt→rollout→parser→lifecycle

GUIDE_WEB_AVAILABILITY_DEFAULT=false
GUIDE_WEB_AVAILABILITY_GATES_ENTRY=true
GUIDE_WEB_AVAILABILITY_GATES_PLAYER=true
GUIDE_WEB_ROLLOUT_MODE_REFERENCES=0
GUIDE_WEB_PILOT_ALLOWLIST_REFERENCES=0

GUIDE_INITIAL_PRODUCTION_MODE_RECOMMENDED=off
GUIDE_PILOT_USERS_CONFIGURED=false
GUIDE_PRODUCTION_DEPLOYED=false
GUIDE_MODE_CHANGE_REQUIRES_RESTART=true
```

## Qué resuelve

La guía ya está mergeada (`f5b490d`), pero encenderla para **todos** sin
observación es un riesgo de producto. Esta ronda añade **una sola decisión
server-owned** que decide si la guía está habilitada para el actor autenticado,
sin exponer nada de la política al cliente.

No es un flag de features genérico, ni cohortes en Redis, ni un porcentaje
aleatorio, ni analítica de piloto, ni un panel de admin. Es un gate: un modo y,
para `pilot`, una allowlist exacta.

## Los tres modos

| Modo    | Quién tiene la guía habilitada             |
| ------- | ------------------------------------------ |
| `off`   | Nadie.                                     |
| `pilot` | Solo los `userId` EXACTOS de la allowlist. |
| `on`    | Cualquier usuario autenticado.             |

No hay porcentaje ni azar: `pilot` es un conjunto explícito de ids, nunca "el
10 %".

## Configuración (server-side)

Dos variables, resueltas **una vez** al boot por
`apps/api/src/guide/guide-rollout.ts`:

- `GUIDE_ROLLOUT_MODE` — `off` | `pilot` | `on`.
- `GUIDE_PILOT_USER_IDS` — CSV de `userId` (`^[A-Za-z0-9_-]{1,128}$`, máx. 500),
  requerida y no vacía cuando el modo es `pilot`.

Ambas son **datos operacionales del servidor**. Viven solo en el servicio API
(y el worker si lo necesitara) de Railway. **Nunca** se copian a Vercel, nunca
se loguean, nunca viajan al cliente.

### Fail-closed

`resolveGuideRolloutConfig(env, deployed)` decide con `resolveEnvironment()`:

- **Caja desplegada** (production/staging) sin modo → error de config al boot
  (`GUIDE_ROLLOUT_MODE_REQUIRED`). El servicio no arranca en un estado ambiguo.
- **`pilot` sin allowlist** → error de config (`GUIDE_PILOT_ALLOWLIST_REQUIRED`).
- **Modo inválido** en cualquier entorno → error (`GUIDE_ROLLOUT_MODE_INVALID`).
- **Local / test** sin modo → default `on` (preserva todas las fixtures y el DX).

Una allowlist con un segmento vacío, un duplicado, espacios internos, un email o
más de 500 ids es `GUIDE_PILOT_ALLOWLIST_INVALID`. **El error nunca contiene
ningún id recibido** — ni en `message` ni en su serialización.

## La superficie

### `GET /api/guide/availability`

- Gated **solo por JWT** — nunca por el rollout guard, para poder responder
  `false` con honestidad.
- Devuelve **exactamente** `{ available: boolean }`. Jamás el modo, la
  allowlist ni la razón.
- `Cache-Control: private, no-store` — la decisión es por-actor y cambia con un
  flip de env.
- No crea ninguna fila (sesión, paso, recibo, LearningEvent).

### Los cinco comandos

`GuideRolloutGuard` se aplica a los cinco comandos, en el orden
`JwtAuthGuard → GuideRolloutGuard → parser → lifecycle`. Cuando el actor no
tiene la guía habilitada:

- Respuesta **`503 GUIDE_UNAVAILABLE`**.
- **Cero escrituras**: el gate cierra antes del parser, la máquina de estados y
  la base de datos. Un cuerpo malformado de un actor denegado sigue siendo 503,
  no 400 — prueba de que el guard corre antes del parser.

## Cliente web

- El template de Exploraciones (`template.tsx`) resuelve la disponibilidad con
  un `fetch` `no-store` + bearer del propio actor. **No** es `serverFetch`: un
  401 aquí no debe cerrar sesión, solo significa "no disponible este render".
- Cualquier fallo (sin token, 401, red, API caída) **fail-closed a `false`**.
- `GuideAvailabilityProvider` publica el booleano; `useGuideAvailability`
  default `false`.
- `GuideEntryCardMount` devuelve `null` cuando está cerrado (la guía
  simplemente no se ofrece).
- `GuidePlayerMount` muestra "Esta guía no está disponible por ahora" +
  "Volver a Exploraciones" cuando está cerrado (para quien abre la URL directa).
- `guide-errors.ts` mapea `GUIDE_UNAVAILABLE` como `retryable` con copy
  tranquilizador: «Esta guía no está disponible por ahora. Tu avance sigue
  guardado.»

## Operar el piloto

**El cambio de modo no es instantáneo.** Cambiar el modo **no** requiere un
nuevo commit, una migración ni una nueva versión del código. Pero la config se
resuelve **una sola vez al boot** (`resolveGuideRolloutConfig` corre en el
factory del provider), así que el cambio **solo entra en vigor después de
reiniciar o redesplegar** las instancias del servicio API. No es un kill switch
de efecto inmediato: es una variable + un restart.

### Estado inicial recomendado (antes del primer deploy)

- `GUIDE_INITIAL_PRODUCTION_MODE_RECOMMENDED=off` — producción arranca con la
  guía apagada para todos.
- `GUIDE_PILOT_USERS_CONFIGURED=false` — sin IDs reales configurados todavía.
- `GUIDE_PRODUCTION_DEPLOYED=false` — este PR no despliega nada.

Antes del futuro sync `develop → main`, dejar registrado el estado que debe
tener producción:

```
API + worker:
GUIDE_ROLLOUT_MODE=off
GUIDE_PILOT_USER_IDS=<unset>
```

Mantener la variable también en el **worker** es postura operacional coherente
(que ambos servicios lean la misma config), aunque la **decisión de comandos
vive solo en el API** — el worker no expone la superficie Guide. Nunca se copia
a Vercel.

### Orden productivo (cuando se decida encender el piloto)

1. Dejar el modo en `off` (stage).
2. Sync `develop → main`.
3. Deploy + migraciones (flujo normal).
4. Ingesta productiva del contenido de la guía.
5. Smoke interno con una cuenta de prueba (availability + un comando).
6. Configurar los `GUIDE_PILOT_USER_IDS` aprobados.
7. Cambiar `GUIDE_ROLLOUT_MODE=pilot`.
8. **Reiniciar / redesplegar el API** para que la config re-resuelva.
9. Smoke de la cohorte con un piloto real.

Para ampliar a todos: `GUIDE_ROLLOUT_MODE=on` (la allowlist se ignora) +
restart/redeploy del API.

### Rollback

```
GUIDE_ROLLOUT_MODE=off
→ reiniciar / redesplegar el API
→ los datos y el recovery del cliente permanecen intactos
```

Apagar el gate nunca borra sesiones, pasos, recibos ni LearningEvents: un
comando denegado responde `503 GUIDE_UNAVAILABLE` sin escribir, y el avance
guardado del cliente sobrevive para cuando el gate reabra.

## Fuera de alcance (deliberado)

Tabla de feature flags, cohortes en Redis, porcentaje aleatorio, analítica de
piloto, panel de admin, y **Guide en mobile** (reservado a CC-7.6). Esta ronda no
toca schema, migraciones, el lifecycle, la definición de la guía, el catálogo,
la máquina de estados, el scoring, ARC, el Mapa, el model-registry, `CACHE_EPOCH`
ni `main.ts`.
