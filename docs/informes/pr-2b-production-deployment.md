# PR-2B — Despliegue a producción + incidente P0 (credencial demo)

**Fecha:** 2026-07-16
**Estado producción:** `main@bac6e1f` · API + worker en `bac6e1f5b` · PR-2B vivo.

---

## 1. Despliegue (runbook Opción A)

| Ítem                                  | Valor                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rama sync                             | `sync/pr-2b-to-main` (commit `db81c83`, árbol idéntico a `develop`)                                                                                                                                                                                         |
| PR de sync                            | **#554** (squash → `main@bac6e1f`). #553 (directo develop→main) cerrado por conflicto de divergencia squash                                                                                                                                                 |
| Deploy API                            | `55e0c5d2` · SUCCESS · `bac6e1f5b` · `/health` 200                                                                                                                                                                                                          |
| Deploy worker                         | `37f81809` · SUCCESS · `bac6e1f5b`                                                                                                                                                                                                                          |
| Migración                             | `20260715230000_pr2b_mood_selection_version` — aditiva (2 columnas `TEXT` nullable), aplicada por el `preDeployCommand` del API. In-container: `applied=true`, ambas columnas presentes (`MoodLog.moodSelectionVersion`, `DiaryEntry.moodSelectionVersion`) |
| `CACHE_EPOCH`                         | **2** (staged con `--skip-deploys`, live en el contenedor nuevo)                                                                                                                                                                                            |
| `FACTS_EPOCH`                         | **1** (sin cambio)                                                                                                                                                                                                                                          |
| `OU`                                  | **off**                                                                                                                                                                                                                                                     |
| Higiene WeeklySummary                 | política A · dry-run `found=1` → `--apply` `deleted=1` → re-check `found=0`. Solo la fila test (`non_test_rows=0`, ningún dato real perdido)                                                                                                                |
| Smoke API (cuenta demo, con limpieza) | POST con `mood`+`moodSelectionVersion:"explicit-v1"` → **201** (el API viejo daba 400); POST sin mood → **201**; ambas entradas borradas (200)                                                                                                              |
| Claves SSH temporales                 | `pr2b-readonly-20260716` y `pr2b-deploy-20260716` creadas, usadas, **retiradas**; agente + dir temporal limpios; `railway logout`                                                                                                                           |

**Desviaciones del runbook (todas justificadas):**

- **Pausa del worker eliminada** — todas las queries del worker sobre tablas de ánimo usan `select` explícito sin `moodSelectionVersion` → cero race; además `railway down` no sobrevive el auto-deploy del merge.
- **Pausa de Vercel omitida** — decisión del usuario ("sin pausa"); ventana ~1–2 min sin incidentes.
- **Sync directo develop→main conflictivo** → resuelto con `commit-tree` (árbol exacto de develop sobre main; `git diff sync develop` vacío).

**Smoke visual pendiente:** el walk en la UI (momento / Patrones / Related / PATCH null / re-atestación) queda para el usuario como usuario interno. El contrato de fondo ya respondió correcto en el smoke API.

---

## 2. Incidente P0 — credencial demo

**Qué pasó:** el smoke autenticado del despliegue usó una cuenta demo `@psico.test` con la contraseña por defecto `<redacted-known-default>` **hardcodeada** en `apps/api/scripts/seed-demo-users.mjs`. Eso significa que las cuentas `@psico.test` sembradas en producción son **credenciales vivas con contraseña conocida** — un riesgo real, no solo del smoke.

### Fase 0 — contención (aplicada tras pairing aprobado)

Consultas agregadas (sin PII) previas al remedio:

```
demo_total_users            = 7
demo_active_users           = 7
demo_active_refresh_tokens  = 56
demo_auth_ok_last_24h       = 1     ← el smoke autorizado de hoy
demo_auth_ok_last_30d       = 76
demo_distinct_ip_count      = 47    ← ⚠️ 47 IPs distintas en 30 días
```

**Hallazgo (por encima del smoke autorizado):** 56 refresh tokens vivos + **47 IPs
distintas** en 30 días contra cuentas con el password por defecto conocido. Es
**uso no autorizado o no atribuido; la evidencia no distingue todavía actividad
interna, testers o terceros.** Se activó el tripwire ("detente si aparece actividad
que no corresponde al smoke"); el usuario, tras el reporte, autorizó contener de
inmediato.

**Contenido encontrado en las cuentas demo (forense metadata-only, sin PII):** el
seed NO crea contenido, pero el uso real sí lo hizo —

```
DiaryEntry           = 11   (cifrado E2E)
EcoThread            = 4
EcoMessage           = 10
VoiceTranscription   = 1    (solo metadata de uso; sin transcript ni audio)
```

Creados entre 2026-06-19 y 2026-07-10. **Autoría y sensibilidad NO determinadas.**
El diario y los mensajes USER de Eco están cifrados E2E (el servidor no los lee),
pero la clave se deriva del password + `cryptoSalt`, y el password era el default
conocido — quien inició sesión con él podía descifrarlos. Se preserva la evidencia
(ver runbook) antes de cualquier re-contención; ninguna cuenta ni contenido se
borra.

Remedio (transacción atómica; `AuthEvent` **NO** se borra — audit trail):

```
demo_users_disabled              = 7    (User.isActive=false)
demo_refresh_tokens_deleted      = 76   (todos los RefreshToken de esas cuentas)
```

Verificación:

```
demo_active_users_after           = 0   ✅
demo_active_refresh_tokens_after  = 0   ✅
```

Login con el password conocido ahora falla (`isActive=false`). **Corrección sobre
las "sesiones vivas":** `isActive=false` + el borrado de refresh tokens bloquean el
**login y la renovación**, pero **no** invalidan un access token ya emitido —
`JwtStrategy` no re-chequea `isActive` por request, así que un access token sigue
siendo válido hasta su **expiración natural** (`JWT_ACCESS_EXPIRES_IN=15m`). Se
verificó por timestamps que el último token demo posible venció ~`03:21:30Z`
(último evento de emisión `03:06:30Z` + 15m), ya en el pasado → `access_tokens_
potentially_alive=false`. El gap estructural se cierra con `User.authRevision`
(PR aparte).

### Fase 1 — hotfix de código (`seed-demo-users.mjs`)

Guard testeable `resolveSeedConfig({ argv, env })` que corre **antes de conectar**:

- **Sin contraseña por defecto.** Requiere `--password=…` o `DEMO_USER_PASSWORD`; si falta, aborta.
- En `PSICO_ENV=production` **aborta** salvo `ALLOW_DEMO_USERS_IN_PRODUCTION=on`.
- **No rota** la contraseña de cuentas existentes salvo `--rotate-passwords` (una cuenta nueva sí recibe la contraseña en `create`).
- **Nunca imprime** la contraseña.
- Guard `isMain` → `main()` solo corre al invocar directo (import sin efectos).

Tests (`apps/api/src/auth/seed-demo-users.spec.ts`, 10): fallan si vuelve el default, si producción corre sin la allow-flag, o si reaparece la rotación implícita (+ ratchets de source).

### Fase 2 — retiro del "loaded gun"

`apps/api/scripts/pr2b-weekly-summary-hygiene.mjs` (blanket `deleteMany({})` sin guard interno) **eliminado** junto con su spec `apps/api/src/patrones/weekly-summary-hygiene.spec.ts`. Ya cumplió su propósito único (borrar la fila test). Sin referencias colgantes.

### Fase 3 — evidencia post-deploy (agregada, sin PII)

Intervalo del despliegue (desde `2026-07-16T02:57Z`, logs Railway API + worker):

```
reflexiones_post_patch_400  = 0
reflexiones_post_patch_500  = 0
worker_errors               = 0
client_sentry_mood_null     = N/A (SENTRY_DSN no configurado)
```

El único tráfico de reflexiones en la ventana fue el smoke autorizado
(2×201 create + 2×200 delete). Cero 4xx/5xx, cero errores del worker. El uso no
atribuido (47 IPs) se concentró en los 30 días previos, no en la ventana
post-deploy.

---

## 3. PR-2C — HOLD

**No se inicia PR-2C.** Ventana de observación 24–48 h. `OU` permanece off. Sin rollback de PR-2B.
