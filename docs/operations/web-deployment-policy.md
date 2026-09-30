# Cuándo se despliega Web

Regla única: **`@psico/web` se construye si el commit la afecta, directa o
transitivamente. Si no, se omite.**

La decide `scripts/vercel-ignore-web.sh`, declarado como `ignoreCommand` en
`apps/web/vercel.json`. Vive en el repositorio a propósito: quien revisa un PR
tiene que poder ver qué regla decide si Web se despliega, sin entrar al dashboard
de Vercel.

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

## Qué pasa con esto en Coolify

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
