# Cuándo se despliega Web

**FeelVerse se despliega exclusivamente en OVH con Coolify.** Decisión del
propietario del **2026-11-05**: Vercel y Railway quedan retiradas del plan
operativo — no son destino de despliegue, ni de staging, ni de pruebas alojadas,
ni de contingencia, ni de retorno a una versión anterior.

## La respuesta de hoy

Web se despliega **a mano, en Coolify**, cuando un cambio funcional lo justifica.
Las tres aplicaciones están fijadas a `main`@`HEAD`, así que un despliegue sirve
la punta de `main` en ese momento.

|               |                                                                                         |
| ------------- | --------------------------------------------------------------------------------------- |
| Aplicación    | `feelverse-staging-web` · uuid `wwsluxasxlko4yf3fliwmkek`                               |
| Cómo          | `POST /api/v1/deploy?uuid=<uuid>` con el token de despliegue, o el botón de su interfaz |
| Qué lo cierra | el contenedor pasa a servir el commit esperado **y** la página responde                 |
| De uno en uno | tres builds en paralelo tumban el demonio de buildkit y fallan los tres                 |

**Igualar el SHA del repositorio con el servido no es motivo para desplegar.** No
existe «el commit servido»: hay uno por servicio, y pueden ir a tres alturas
distintas a la vez. Lo que justifica un despliegue es un cambio funcional que
afecte a ESE servicio.

## Y Vercel, ¿qué construye? Nada, nunca

`scripts/vercel-ignore-web.sh` responde **«no construyas»** a todo lo que Vercel
pregunte. Es el único control de la retirada que vive en el repositorio.

**Borrarlo, o borrar `apps/web/vercel.json`, consigue lo contrario de lo que
parece:** sin `ignoreCommand`, Vercel construiría en **cada** commit de la rama
conectada. La integración Git vive en la cuenta de Vercel y no se desactiva desde
el repositorio; responder «no» a todo sí.

Hay trinquete en `apps/web/src/deploy-policy.test.ts`, verificado por mutación:
un `exit 1` por cualquier camino, o cualquier condicional nuevo, rompe el build.
Y ya no levanta clones de git, así que corre en cualquier entorno, con o sin red.

**Retirar la plataforma del plan no implica borrar nada suyo** — ni proyecto, ni
dominio, ni variable, ni cuenta.

---

## Antecedente — la política de afectación en Vercel (#725)

> Lo que sigue describe la regla que gobernó los despliegues de Web hasta el
> **2026-11-05**, cuando Vercel dejó de ser un destino. Se conserva porque
> explica por qué los ficheros están donde están y qué costó aprenderlo; **no es
> una instrucción vigente**. La regla de hoy es la de arriba.

Regla única de entonces: **`@psico/web` se construye si el commit la afecta,
directa o transitivamente. Si no, se omite.**

## La polaridad, que es lo único que no se puede equivocar

Para Vercel, en un Ignored Build Step:

| salida   | qué hace Vercel                                      |
| -------- | ---------------------------------------------------- |
| `exit 0` | **aborta** el build · el deployment queda `CANCELED` |
| `exit 1` | **construye**                                        |

Es al revés de lo que sugiere «0 = todo bien». Invertirlo tiene dos formas de
doler: o dejas de desplegar cambios reales, o despliegas en cada commit. Hay una
prueba que fija la polaridad y los dos sentidos de la decisión en
`apps/web/src/deploy-policy.test.ts`; corre con `pnpm --filter @psico/web test`.

## Qué cuenta como «afecta a Web»

Lo responde `turbo query affected` recorriendo el grafo del workspace, así que
cubre `@psico/web` y todo lo que Web importa —hoy `@psico/api-client`,
`@psico/crypto`, `@psico/types` y `@psico/ui`, más lo que ellos importen— sin que
nadie mantenga una lista de carpetas. Una dependencia nueva de Web queda cubierta
sola el día que se añada.

Medido, commit a commit:

| cambio                                            | resultado |
| ------------------------------------------------- | --------- |
| sólo `docs/`                                      | **omite** |
| sólo un test de la API                            | **omite** |
| runtime de la API que Web no importa              | **omite** |
| `pnpm-lock.yaml`, sin mover dependencias          | **omite** |
| `apps/web/**`                                     | construye |
| `packages/ui`, `types`, `api-client`, `crypto`    | construye |
| `pnpm-lock.yaml`, moviendo una dependencia de Web | construye |
| `apps/web/vercel.json` o la propia política       | construye |
| base ausente, clon superficial, turbo que falla   | construye |

## Fail open

Si no se puede **demostrar** que Web no está afectada, se construye. Un despliegue
de más cuesta unos minutos; uno de menos deja producción atrás sin que nadie se
entere. Por eso terminan en «construye»: una base que no está en el clon, un clon
superficial, turbo ausente o con un código de salida que no es 0 ni 1.

## Contra qué compara

`VERCEL_GIT_PREVIOUS_SHA`, que es el commit del último deployment **de esa rama**.
No `HEAD^`: entre dos deployments de Web pueden haber pasado varios commits, y
`HEAD^` sólo vería el último. Si esa variable no está —primer deployment de una
rama— se usa el punto de divergencia con la rama de producción, que es lo que un
PR compara de verdad; y si tampoco, se construye.

## Forzar un despliegue sin tocar la política

Tres caminos, de menos a más invasivo:

1. **Redeploy saltando el Ignored Build Step.** En el dashboard, en el deployment
   → `···` → _Redeploy_, y **desmarcar** «Use project's Ignore Build Step». Es el
   camino soportado y no deja rastro en el repositorio.
2. **Desde el CLI**, un deployment explícito, que no pasa por el paso de ignorado:
   ```bash
   cd apps/web && npx vercel deploy --prod
   ```
3. **Tocar algo de Web** en el commit. Es el peor: ensucia el historial para
   conseguir un efecto de despliegue.

## El trade-off que esto NO resuelve

Un `ignoreCommand` **no evita que se cree el deployment**: lo crea y lo aborta, así
que en el historial aparece un `CANCELED` y —según la propia documentación de
Vercel— «las builds canceladas cuentan como deployments completos» a efectos de
cuota y de slots de build concurrentes.

O sea que cambiamos un `READY` innecesario por un `CANCELED` innecesario. Lo que
se gana es lo que importaba: Web deja de **publicarse** por un cambio que no la
toca, y un PR que sí la toca vuelve a tener preview. Lo que no se gana todavía es
silencio total en el historial de deployments.

Para eso existe el salto nativo de proyectos no afectados, que Vercel puede
resolver antes de crear el deployment. No se adoptó aquí por dos razones: es un
ajuste del dashboard, así que la regla dejaría de ser visible en un PR, y su
comportamiento con cambios fuera de los workspaces (`docs/`, `CLAUDE.md`,
`.changeset/`) no está documentado de forma que se pueda verificar sin desplegar a
ciegas. Si algún día se prefiere ese camino, el trabajo pendiente es medir esos
casos y decidir a conciencia; la tabla de arriba sirve de contrato de aceptación.

## Qué pasaba con esto en Coolify — resuelto el 2026-11-05

> Esta sección preguntaba qué haría falta «cuando Web se sirva desde Coolify».
> Ya se sirve desde Coolify, y la respuesta resultó más simple que la prevista:
> **no hace falta ningún equivalente.** La regla de afectación existía para no
> gastar builds de Vercel en commits que no tocaban Web; en Coolify el
> despliegue es manual, así que no hay nada que decidir automáticamente. Lo
> que sigue es el razonamiento de entonces.

Nada, por ahora, y a propósito. [ADR 0024](../adr/0024-migracion-a-coolify-syntavera.md)
mueve el runtime a Coolify, pero Vercel sigue encendido como respaldo, así que esta
política sigue vigente y sin tocar mientras lo esté.

Cuando Web se sirva desde Coolify hará falta el equivalente, y **no es el mismo
mecanismo**: un `ignoreCommand` es una pieza de Vercel. La regla —«se construye si el
commit afecta a `@psico/web`, directa o transitivamente»— y su polaridad —fail open—
son lo que hay que conservar; el sitio donde se declara cambia. Lo que sí se resuelve
solo es el efecto secundario de esta sección: en Coolify no se crea un deployment para
después abortarlo, así que el `CANCELED` que cuenta como deployment desaparece.

El retiro de este fichero es el último paso del runbook de decomisado, no un paso del
cutover.

## De dónde viene esto

[#725](https://github.com/georgenton/psico-platform/issues/725). La regla anterior
era `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]` en el dashboard: omitía **toda** rama
que no fuera `main` —así que el PR #726, que cambiaba Web, se quedó sin preview— y
construía **siempre** en `main` —así que el PR #751, que sólo tocaba un test de la
API, desplegó Web en producción—. Era una regla de rama, no de afectación, y
fallaba en los dos sentidos.
