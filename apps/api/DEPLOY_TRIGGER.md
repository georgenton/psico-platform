# Deploy trigger

**Este fichero ya no dispara nada, y conviene saberlo antes de tocarlo.**

Existía para forzar el «watch path» de auto-despliegue de la plataforma
anterior: sus servicios sólo redesplegaban cuando cambiaba algo bajo
`apps/api/**`, así que un commit sólo en la raíz —por ejemplo un override de
seguridad en `pnpm-lock.yaml`— se saltaba el despliegue, y había que tocar
este fichero para provocarlo.

Desde el **2026-11-05** FeelVerse se despliega **exclusivamente en OVH con
Coolify**, y allí el despliegue se pide explícitamente: no hay watch path que
engañar ni commit vacío que empujar. Bumpear el comentario de abajo no produce
ningún efecto.

**Cómo se despliega hoy:** a mano desde Coolify, de uno en uno (tres
construcciones en paralelo agotan el demonio de construcción). El runbook está
en `docs/deploy/coolify-runbook.md`, y la autoridad de la decisión en el
ADR 0024 y en `CLAUDE.md § Deployment`.

El fichero se conserva —no se borra— porque es el registro de cómo funcionaba
aquello, y porque borrarlo no gana nada.

<!-- bump 2026-06-09 03:13 UTC — react-server-dom-webpack CVE override -->

## Cache-bust 2026-06-10 16:35 — S69 deploy

// Daily.co activated 20260610-1959

// S70 webhook secret trigger 204532
