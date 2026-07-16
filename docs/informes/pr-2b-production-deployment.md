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
| Claves SSH temporales                 | creadas, usadas, **retiradas**; agente + dir temporal limpios; `railway logout`                                                                                                                                                                             |

**Desviaciones del runbook (todas justificadas):**

- **Pausa del worker eliminada** — todas las queries del worker sobre tablas de ánimo usan `select` explícito sin `moodSelectionVersion` → cero race; además `railway down` no sobrevive el auto-deploy del merge.
- **Pausa de Vercel omitida** — decisión del usuario ("sin pausa"); ventana ~1–2 min sin incidentes.
- **Sync directo develop→main conflictivo** → resuelto con `commit-tree` (árbol exacto de develop sobre main; `git diff sync develop` vacío).

**Smoke visual pendiente:** el walk en la UI (momento / Patrones / Related / PATCH null / re-atestación) queda para el usuario como usuario interno. El contrato de fondo ya respondió correcto en el smoke API.

---

## 2. Incidente de credencial demo — resumen sanitizado

> El detalle operacional (conteos exactos, timestamps, TTL, dominio de las cuentas,
> ruta criptográfica de derivación, punto PITR y mecanismo de re-contención) **ya no
> se mantiene en el árbol actual del repositorio**. Versiones anteriores permanecen
> accesibles en el historial Git y en artefactos del PR mientras no se ejecute una
> remoción histórica deliberada.
>
> Se generó una **copia temporal fuera de Git**, pendiente de transferencia a un
> almacenamiento privado, cifrado y durable. La preservación se considera completada
> únicamente después de verificar el SHA-256 en el destino y eliminar la copia
> temporal.

**Qué pasó:** durante el smoke del despliegue se detectó que las cuentas demo se
sembraban con una **contraseña por defecto conocida**, hardcodeada en
`apps/api/scripts/seed-demo-users.mjs`. Eso las convertía en **credenciales vivas
con contraseña conocida**.

**Resumen:**

- **Credencial demo conocida** — password por defecto hardcodeado; removido del código (PR #555).
- **Cuentas demo desactivadas** (`isActive=false`).
- **Refresh tokens revocados.**
- **Actividad no atribuida** — se observó acceso que no corresponde al smoke autorizado; la evidencia **no distingue** actividad interna, testers o terceros.
- **Contenido no generado por el seed** — se observaron `DiaryEntry`, `EcoThread`, `EcoMessage` y `VoiceTranscription` en cuentas demo. **Esas filas no fueron creadas por el seed y fueron observadas posteriormente en las cuentas.** Autoría y sensibilidad **no determinadas**.
- **No hay prueba de acceso efectivo al plaintext.**
- **`authRevision` pendiente** — cierre estructural del gap de access-token (un token vigente sobrevive a `isActive=false` hasta su expiración natural), en PR aparte.
- **Investigación abierta.**

**Precisiones de cifrado:**

- `DiaryEntry`: el **cuerpo textual y el excerpt** están cifrados E2E; `mood`, `tags`, `kind`, timestamps y metadata de audio permanecen como **metadata plaintext**.
- Eco: los mensajes USER persistidos están cifrados en reposo, **pero el turno actual se procesa temporalmente en plaintext por el servidor y el proveedor**; las respuestas no-USER pueden persistir `assistantText` en plaintext.

### Remediación (código)

**Hotfix `seed-demo-users.mjs`** — guard testeable `resolveSeedConfig({ argv, env })`
que corre antes de conectar: sin contraseña por defecto (requiere `--password` o
`DEMO_USER_PASSWORD`); aborta en `PSICO_ENV=production` salvo
`ALLOW_DEMO_USERS_IN_PRODUCTION=on`; no rota passwords existentes salvo
`--rotate-passwords`; nunca imprime la contraseña; guard `isMain`. Tests
(`apps/api/src/auth/seed-demo-users.spec.ts`) fallan si vuelve el default, si
producción corre sin la allow-flag, o si reaparece la rotación implícita.

**Retiro del "loaded gun"** — `pr2b-weekly-summary-hygiene.mjs` (un `deleteMany({})`
sin guard interno) eliminado junto con su spec.

### Evidencia post-deploy (agregada, sin PII)

En la ventana del despliegue: `reflexiones` POST/PATCH `4xx=0`, `5xx=0`, errores de
worker `0` (Sentry no configurado). El único tráfico de reflexiones fue el smoke
autorizado. El uso no atribuido se concentró en los días previos, no en la ventana
post-deploy.

---

## 3. PR-2C — HOLD

**No se inicia PR-2C.** Ventana de observación 24–48 h. `OU` permanece off. Sin rollback de PR-2B.
