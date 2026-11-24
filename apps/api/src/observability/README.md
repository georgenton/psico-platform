# Observabilidad de errores

Errores técnicos hacia Sentry desde los cinco procesos servidos. Se enciende por
variable de entorno y **sin DSN es inerte**: no se abre ninguna conexión.

| Proceso         | `service`               | Dónde se arranca                                                  |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| API             | `feelverse-api`         | `apps/api/src/main.ts` → `sentry.ts`                              |
| worker          | `feelverse-worker`      | `apps/api/src/worker.ts` → `sentry.ts` y `worker-failures.ts`     |
| Web · servidor  | `feelverse-web-server`  | `apps/web/src/instrumentation.ts` → `lib/observability/server.ts` |
| Web · Edge      | `feelverse-web-edge`    | `apps/web/src/middleware.ts` → `lib/observability/edge.ts`        |
| Web · navegador | `feelverse-web-browser` | `components/observability/ObservabilityBoot` → `browser.ts`       |

El móvil (`apps/mobile/src/observability/sentry.ts`) usa la misma lista, pero no
está publicado y **no se ha ensayado**.

## Qué sale

Todo pasa dos veces por `@psico/types` → `observability-allowlist.ts`, que
**reconstruye** el evento. Sólo existe esto:

- tipo del error, de una lista; si no está, `UnlistedError`;
- mensaje: una frase constante nuestra si se reconoce («connect ECONNREFUSED»,
  «Prisma: consulta rechazada»), o `[mensaje omitido] #huella`, donde la huella
  sale del **sitio** del fallo y no de su texto;
- la pila: fichero relativo, función, línea, columna. El fichero tiene que ser del
  despliegue (en Node, existir; en el navegador, un guion que la página cargó); si
  no, `[externo]`. La función tiene que constar en él, y donde no se puede abrir
  —Edge y navegador— sólo se aceptan nombres de código minificado;
- el encadenamiento de causas;
- `environment` (de `PSICO_ENV`, nunca de `NODE_ENV`), `release` (el commit),
  `service` y `runtime`;
- etiquetas con su conjunto cerrado: método, ruta **plantilla** registrada en el
  enrutador, estado, código de la respuesta, código técnico (`error_code`: `P2002`,
  `ECONNREFUSED`…), y los de Eco y las colas;
- versión de Node y del SDK, identificador del evento y hora.

## Qué no sale

La petición entera (dirección, query, fragmento, cabeceras, cookies, cuerpo), la
IP, la persona, migas, `extra`, contextos, etiquetas no declaradas, líneas de
código, variables locales, módulos instalados, nombre del servidor, adjuntos,
comentarios, sesiones, repetición, capturas, perfiles y trazas. Tampoco se añaden
cabeceras `sentry-trace` ni `baggage` a lo que pedimos a otros.

Nada de eso depende de una opción apagada: no se usa `Sentry.init` —el cliente se
construye a mano, sólo con lo que encadena causas y ve lo que nadie atrapó— y el
transporte sólo deja pasar elementos `event`. Por qué, en `sentry.ts`.

En el navegador, además: nada desde `/i`, `/compartir` ni `/ayuda`, que no cargan nada de
terceros; nada de extensiones; y veinte errores por página como mucho.

## Decisiones que conviene conocer

- **Web no usa `@sentry/nextjs`.** Ensayado con la configuración anterior cargada
  como indica su guía: no informaba de un componente de servidor anidado, ni de
  una acción de servidor, ni de un fallo al pintar en el navegador; subía la
  primera carga de 88 a 169 KB (gzip) aun sin DSN, y el middleware de 73 a 300 KB.
  Next 14.2 escribe con `console.error` todo lo que la aplicación no atrapa, y ahí
  escucha una sonda que sólo mira los argumentos que SON un error.
- **Edge no lleva SDK**: el middleware corre en cada petición y en Edge todo va en
  un fichero.
- **Un fallo sin atrapar termina el proceso como lo haría Node**, con código 1. El
  modo por defecto del SDK deja vivo el proceso tras una promesa rechazada.
- **Del worker se informa el intento definitivo** de cada trabajo, con la cola y el
  nombre. `job.data` no se toca.

## Cómo se activa

| Variable                  | Dónde                       | Cuándo se lee    | Si falta                              |
| ------------------------- | --------------------------- | ---------------- | ------------------------------------- |
| `SENTRY_DSN`              | API, worker y Web           | al arrancar      | ese proceso no manda nada             |
| `NEXT_PUBLIC_SENTRY_DSN`  | Web                         | **al construir** | el SDK no entra en el paquete         |
| `PSICO_ENV`               | API, worker y Web           | al arrancar      | `environment: undeclared`             |
| `NEXT_PUBLIC_PSICO_ENV`   | Web                         | **al construir** | se usa `PSICO_ENV` de la construcción |
| `SOURCE_COMMIT`           | la pone Coolify al arrancar | al arrancar      | sin `release`                         |
| `NEXT_PUBLIC_RELEASE_SHA` | Web                         | **al construir** | `SOURCE_COMMIT` de la construcción    |

Encender o apagar el navegador exige **reconstruir** Web. Si sus eventos llegan sin
`release`, es que la construcción no tenía `SOURCE_COMMIT`: se pone
`NEXT_PUBLIC_RELEASE_SHA`, o se activa en Coolify que el commit entre en la
construcción. Una versión que no sea un SHA no se envía.

`SENTRY_RELEASE` y `NEXT_PUBLIC_SENTRY_RELEASE` ya no se leen. Tampoco
`SENTRY_TRACES_SAMPLE_RATE` ni `SENTRY_SPOTLIGHT`, que en el SDK completo
encienden trazas y copias por fuera del transporte.

## Qué falta

1. **Organización y región** (Estados Unidos o Unión Europea): la región no se
   cambia después.
2. En el proyecto: activar «Prevent Storing of IP Addresses». Los eventos piden que
   no se deduzca (`infer_ip: never`), pero la conexión llega desde una IP y lo que
   haga el receptor con ella se decide allí. Lo mismo el agente de usuario: no va
   en el evento, pero el navegador lo manda en la conexión.
3. Los DSN, y tres eventos controlados antes de darlo por bueno.

La librería de videollamadas (`@daily-co/daily-js`) trae dentro su propio informe
de errores a Daily. Sólo se carga en la sala de terapia y no pasa por aquí.

## Ensayo

`node scripts/sentry-sumidero/ensayo.mjs todo` — los cinco procesos, construidos,
contra un receptor local y con señuelos generados al ejecutar. Ver
[`scripts/sentry-sumidero`](../../../../scripts/sentry-sumidero/README.md).
