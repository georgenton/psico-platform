# ADR 0025 — El fixture de usuarios QA pregunta «¿estoy desplegado?», no «¿soy producción?»

- **Estado:** aceptado
- **Fecha:** 2026-10-01
- **Afecta a:** `apps/api/prisma/seed-test.ts`, `apps/api/prisma/seed-guard.ts`,
  `apps/api/prisma/seed-test-config.ts`
- **No sustituye:** nada. [ADR 0007](0007-e2e-encryption-diario-eco.md) sigue intacto;
  esto no toca criptografía ni datos de usuario real. La decisión C.0A1 sobre el seed
  de catálogo (el guard de producción) se conserva **tal cual** y se explica abajo por
  qué no se modificó.

## Contexto

`georgenton/psico-platform` es un repositorio **público** (`gh repo view --json
visibility` → `PUBLIC`). Hasta hoy, `apps/api/prisma/seed-test.ts` llevaba tres
contraseñas fijas en texto plano, versionadas en git:

| cuenta             | rol     | abre                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------- |
| `admin@psico.test` | `ADMIN` | el back-office de Pulso: overview, reports, cohorts, listados de usuarios |
| `free@psico.test`  | `USER`  | la app como plan FREE                                                     |
| `pro@psico.test`   | `USER`  | la app como plan PRO                                                      |

Tres agravantes, no uno:

1. **No tenía guard de entorno de ningún tipo.** `prisma/seed.ts` llama a
   `assertSeedAllowed()` antes de la primera llamada a Prisma; este fichero no
   llamaba a nada. Nada impedía ejecutarlo con `DATABASE_URL` apuntando a
   producción.
2. **Imprimía las contraseñas por stdout**, así que los valores acababan también
   en logs de CI y en el scrollback de la terminal, que sobreviven a la ejecución.
3. **Decía de sí mismo que ambos comandos eran «SAFE in any environment».** La
   frase describía el _radio de daño_ (sólo toca tres direcciones `.test`) y se
   leía como una afirmación sobre _dónde_ puede ejecutarse. Son dos cosas
   distintas y la segunda era falsa.

Una contraseña `ADMIN` publicada en GitHub más un `api-staging.feelverse.app`
alcanzable desde internet es una vía de entrada directa, no un fixture de pruebas.
Por eso, al preparar el baseline funcional de staging el 2026-10-01 **no se
ejecutó `seed:test`**: se usó `scripts/seed-demo-users.mjs`, que ya exigía la
contraseña sin default, no la imprimía y tenía su propio rechazo.

## Decisión

### 1. La contraseña no tiene default

Llega por `--password=…` o `QA_USER_PASSWORD`, se valida en
`resolveQaSeedConfig()` —puro, sin `dotenv`, sin Prisma, sin `pg`— y por tanto
**antes de que exista cliente alguno**. Una ejecución sin contraseña aborta sin
haberse dirigido a ninguna base de datos. El valor no se imprime nunca, y los
errores de validación no lo reproducen: la longitud de una contraseña rechazada
ya es más de lo que una línea de log necesita saber.

La ventana de longitud (8–72) es la del propio `RegisterDto` de la app. El techo
no es cosmético: bcrypt trunca en silencio más allá de 72 bytes, así que aceptar
más sembraría una cuenta cuya contraseña no se puede volver a teclear en ningún
formulario que la app exponga.

### 2. La pregunta correcta es «¿es una caja desplegada?»

El peligro del fixture **no** es el que tiene el seed de catálogo:

- el seed de **catálogo** sobreescribe datos curados y gestionados por operaciones
  (disponibilidad de terapeutas, `publishedAt`, banderas `isActive`). Eso es un
  problema de producción: borrar la disponibilidad de staging no le cuesta nada a
  nadie;
- el **fixture** acuña logins que funcionan, uno con rol `ADMIN`. Una caja
  desplegada responde a internet —**staging incluido**— así que la cuenta que crea
  es allí una credencial viva. «No es producción» no consuela en absoluto.

Por eso nace `isDeployedEnvironment()` junto a `isProductionEnvironment()`, en vez
de aflojar la segunda. Aflojar la detección compartida para dejar pasar staging le
habría regalado al seed de catálogo un rechazo más silencioso como efecto
colateral: un guard debilitado para la comodidad de otro script.

Los marcadores de plataforma replican los de `deploymentPlatform()`
(`src/emotional-map/cache-identity.ts`), **incluida su exclusión aprendida a
golpes**: `COOLIFY_URL` y `COOLIFY_TOKEN` son cómo se configura un _cliente_ para
_hablar_ con un Coolify, así que cualquier portátil con el CLI o el MCP
configurado los lleva. Leerlos como «estoy desplegado» haría que el fixture se
negara en la máquina del mantenedor, que es justo donde se usa de forma legítima.

### 3. Autorización propia y separada

`ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1`, exactamente `"1"`, efímera para una sola
invocación. **No** se reutiliza `ALLOW_PRODUCTION_BOOTSTRAP_SEED`: una variable
para las dos cosas significaría que autorizar un refresco de catálogo autoriza
además acuñar un login `ADMIN`. Son dos preguntas distintas y reciben respuestas
distintas; hay un test que fija que no son intercambiables en ninguna dirección.

El `--wipe` queda tras el mismo interruptor, porque borra filas de esa misma base
desplegada — pero **no** exige contraseña: si una cuenta `ADMIN` del fixture
aparece en una caja desplegada, borrarla no puede ser más difícil que haberla
creado.

### 4. `isProductionEnvironment` también cree a `PSICO_ENV`

Cambio **aditivo**: un servicio de producción en Coolify que declara
`PSICO_ENV=production` pero no `NODE_ENV` era invisible para este guard. Añadir la
señal sólo puede producir **más** rechazos, nunca menos, así que no necesita una
decisión aparte. Por el mismo motivo la comparación se normaliza (`trim` +
`toLowerCase`): `NODE_ENV=" production"` es producción, y un `===` exacto lo
dejaba pasar.

## Lo que esta ADR deliberadamente NO decide

> **Resuelto el 2026-10-04 — Workstream C.** Lo que esta sección dejó pendiente
> («unificar el criterio de entorno… con su propia revisión») es exactamente la
> revisión que se hizo, y el falso positivo de staging ya no existe. El
> razonamiento original se conserva íntegro abajo porque explica por qué no se
> arregló entonces; lo que cambió está en **«Addendum C — postura de seed
> unificada»** al final.

**Unificar el criterio de entorno entre los dos guards queda pendiente, con su
propia revisión.**

El resolutor canónico del proyecto es `resolveEnvironment()` en
`cache-identity.ts`: en una caja desplegada `PSICO_ENV` es la única palabra que
cuenta, porque `NODE_ENV` lo pone el tooling por cien razones que no dicen nada de
nuestra postura de seguridad. `seed-guard.ts` nació antes de esa norma y detecta
producción por `NODE_ENV` / `RAILWAY_ENVIRONMENT_NAME`.

Consecuencia medida, que se **acepta** y no se corrige aquí: en
staging-sobre-Coolify conviven `NODE_ENV=production` y `PSICO_ENV=staging`, así
que el seed de **catálogo** se niega en staging y pide el token de producción. Es
un falso positivo.

No se arregla en este PR porque arreglarlo exige **estrechar** un guard, y
estrechar un guard puede abrir lo que protegía. Ampliar es gratis; estrechar
necesita que alguien compruebe, caja por caja, que ninguna ruta queda descubierta
—incluida la del cutover, donde Railway y Coolify son reales a la vez (ADR 0024)—.
Eso es una revisión, no una línea de código al final de otro cambio.

## Consecuencias

- **La debilidad conocida de este diseño:** el fixture se niega también en
  staging, que es donde se quiere de verdad, así que el token se teclea de forma
  rutinaria allí. Un guard que salta siempre es un guard que se deja de leer. Se
  acepta porque la alternativa es peor: sin token, la única forma de distinguir
  «staging, a propósito» de «producción, por accidente» es fiarse de un hostname,
  y una ejecución de seed no llega a ver ninguno.
- La contraseña pasa a ser una credencial real que alguien tiene que generar,
  guardar en su propio gestor de secretos y **no** commitear. Mientras las
  cuentas existan, hay que tratarla como tal, y hacer `seed:test:wipe` al cerrar
  la ventana de pruebas.
- Las tres contraseñas anteriores están **quemadas**: son públicas y permanentes
  en el historial de git. No se listan en ningún test —ni en una lista negra—
  porque nombrarlas sólo añadiría una copia fresca de tres credenciales
  publicadas al diff de un repositorio público: exactamente el error que se
  corrige, cometido por el test que lo prohíbe. Los trinquetes que sí existen son
  estructurales (ningún identificador con forma de contraseña recibe un literal;
  el valor que se hashea nunca nace como literal; ninguna línea de log interpola
  una contraseña) y son más fuertes que una lista negra: cierran la ruta, no el
  valor.
- `runGuardedSeed` acepta ahora qué rechazo aplica. La garantía que ese módulo
  existe para dar —negarse **antes** de construir cliente, adaptador o pool— no
  era específica de un peligro, así que el peligro pasa a ser un parámetro. El
  default sigue siendo el del seed de catálogo, con un test que fija que omitir el
  argumento no lo degrada en silencio.

---

## Addendum C — postura de seed unificada (2026-10-04)

Esta es la revisión que la sección «lo que no decide» reservó. Nada de lo
anterior se reescribe: lo que sigue dice qué cambió y por qué.

### La postura decide, no una disyunción de señales

`seed-guard.ts` gana `seedPosture(env)`, que responde una de cinco cosas:
`development` · `test` · `staging` · `production` · `invalid`. Reemplaza al `OR`
sobre todas las señales como entrada del guard de catálogo, y sigue exactamente
la norma del resolutor canónico: en una caja desplegada `PSICO_ENV` es la única
palabra que cuenta.

`invalid` **no es un entorno**. Es la respuesta cuando la caja no dice qué es, en
dos formas: desplegada y callada (o llamándose «development»), y cualquier caja
cuyo `PSICO_ENV` sea una palabra que nadie puede interpretar. **Ninguna variable
lo levanta.** Eso cierra un agujero que existía: una caja de Railway o Coolify sin
`PSICO_ENV` se leía como producción, y entonces el token de producción la
autorizaba. Una postura que nadie declaró no es una postura.

### Staging tiene su propio interruptor

`ALLOW_STAGING_BOOTSTRAP_SEED=1` —exactamente `"1"`—. El falso positivo que esta
ADR aceptaba (staging-sobre-Coolify lleva `NODE_ENV=production`, así que el seed
de catálogo pedía el token de producción) desaparece **sin estrechar nada**: la
precedencia de `PSICO_ENV` ya era la norma del proyecto, y ampliar el guard de
producción para dejar pasar staging habría aflojado producción como efecto
colateral. Ninguno de los dos tokens sustituye al otro, en ninguna dirección, y
hay un test que lo fija.

### Por qué el guard sigue sin importar el resolutor del runtime

Se mantiene la decisión de no acoplar el guard de Prisma al runtime, por dos
razones medidas: el runtime **lanza** en una caja que no puede clasificar —
correcto para un servidor que no debe arrancar, y equivocado para una CLI, cuyo
rechazo correcto es un mensaje que nombra la variable a poner—; y el guard recibe
un `env` inyectable, así que su matriz se ejerce como datos en vez de mutando el
proceso y confiando en que el `finally` corrió.

Lo que hace aceptable esa duplicación es que ahora hay un trinquete:
`seed-environment-conformance.spec.ts` pasa **una sola tabla de fixtures** por los
tres clasificadores —el resolutor del runtime, el guard TypeScript y el espejo
`.mjs` que importan los scripts ejecutables— y rompe la build en cuanto dos
discrepan. El acuerdo verificado por un test es mejor que código compartido que
arrastraría un grafo de dependencias dentro de un script cuyo valor entero es
negarse antes de construir nada.

**La tabla ya se pagó sola, dos veces:**

1. `PSICO_ENV=prod` —el atajo que la gente teclea de verdad— hacía **lanzar** al
   runtime y el guard respondía `development`, así que el seed corría **sin
   autorización ninguna**. No es una discrepancia cosmética: el seed elige su
   base de datos por `DATABASE_URL`, nunca por `PSICO_ENV`, así que un portátil
   apuntado a producción más ese error de tecleo llegaba justo al fallo que
   C.0A1 existe para evitar. Ahora es `invalid` en ambos.
2. `RAILWAY_ENVIRONMENT_NAME` no estaba en la lista de marcadores del runtime —el
   propio comentario de `deploymentPlatform()` advierte que la lista es
   estructuralmente incompleta—. El guard sí lo contaba, así que una caja con
   sólo ese marcador era «desplegada, sin declarar» para el seed y
   «development» —todas las barreras apagadas— para el runtime. Se añadió al
   runtime: un servicio real de Railway inyecta los cuatro juntos (verificado
   contra los nombres de variables del servicio en vivo, sin leer valores), así
   que no cambia nada para ninguna caja real y cierra el hueco para conjuntos
   parciales. Nota: la caja legada de Railway **no** lleva `PSICO_DEPLOYED`, así
   que allí la detección descansa entera en esa lista.

### El tercer vocabulario de autorización, eliminado

`scripts/seed-demo-users.mjs` tenía su propio guard: un `===` contra `PSICO_ENV`
más una variable de override con forma de valor distinta (`=on`). Tres defectos
a la vez: **fallaba abierto** en una caja desplegada sin `PSICO_ENV`, la
comparación **no estaba normalizada** (`"Production"` pasaba de largo), y era un
**tercer vocabulario** —tres vocabularios son tres oportunidades de echar mano
del más flojo—. La variable era `ALLOW_DEMO_USERS_IN_PRODUCTION`; se borró en vez
de endurecerse, y un trinquete en `src/auth/seed-demo-users.spec.ts` rompe la
build si ese nombre reaparece en el script, incluso en un comentario.

Ahora: producción es **negación dura** sin variable que la levante, cualquier otra
caja desplegada reutiliza `ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1` —el mismo
interruptor del fixture QA, porque es el mismo peligro: un login que funciona en
un host que responde a internet—, y la contraseña sigue siendo obligatoria y sin
default.

### Disponibilidad de terapeutas: lo que ya existe se posee a sí mismo

El paso de `TherapistAvailability` hacía `deleteMany({ therapistId })` y reinsertaba
las ocho franjas canónicas. Es idempotente **contra las constantes del fichero** y
destructivo contra todo lo demás —y el comentario dos líneas arriba dice que la
disponibilidad es «tunable per therapist via ops UI», así que un rerun descartaba
exactamente lo que se espera que ops cambie—. Sobrevivió a la revisión porque la
única señal observable era el **número de filas**, y ese número es idéntico se
preserven ocho filas o se borren y reescriban.

Nueva política: si hay ≥1 franja, el seed **no la toca**. Mismo principio que el
paso de `ChapterBlock`.

Un horario **parcial** (1..7 filas) también se preserva, deliberadamente. No hay
metadato que distinga «un seed interrumpido» de «ops borró la franja del viernes
por la tarde», y equivocarse en la dirección de completar reinstala en silencio
una franja que alguien quitó a propósito. Reparar un horario roto de verdad es
una operación administrativa aparte, no un efecto secundario de sembrar. **No se
añadió ninguna bandera `--reset-availability` en este ciclo**: una bandera
destructiva que nadie ha pedido todavía es una bandera que alguien teclea antes
de que exista el caso de uso que la justifique.

El paso vive ahora en `prisma/seed-therapists.ts` con un cliente de tipo
**estrecho** (`TherapistSeedClient`) que no tiene `delete` ni `deleteMany`: la
versión destructiva no falla un test, **no compila**. Y
`src/ops/therapist-availability.spec.ts` observa la secuencia de llamadas, no el
conteo de filas — el control negativo está verificado: restaurar `deleteMany`
(incluso ensanchando el tipo para acomodarlo) pone los nueve tests en rojo.

### Sembrar es administrativo, con un comando por objetivo

`seed:catalog` · `seed:staging:catalog` · `seed:staging:qa-users` ·
`seed:staging:demo-users`. **No hay «sembrar todo»**, así que refrescar catálogo no
puede significar además acuñar logins.

El wrapper (`scripts/staging-seed.mjs`) comprueba la postura y aplica la
autorización **sólo al entorno del proceso hijo**: no se exporta al shell del
operador, no se escribe en ningún fichero y **no** se añade a las variables de
Coolify —que es cómo una autorización efímera se vuelve un bypass permanente—.
Deliberadamente no construye `DATABASE_URL`, no lee ningún otro secreto, no corre
migraciones, no encadena seeds y no inventa comprobaciones de hostname: una
ejecución de seed no llega a ver ninguno, y fiarse de una cadena que parece una
URL de staging es cómo se siembra producción desde un comando copiado.

### El coste de compilar, medido en vez de supuesto

Compilar `prisma/seed.ts` con comprobación de tipos completa pica en **~837 MiB**
de RSS y tarda ~3,9 s; con `--transpile-only`, **~269 MiB** y ~0,5 s. El wrapper
usa `--transpile-only`. **No se subió el límite de memoria de ningún servicio**:
habría hecho permanente el coste para no comprar nada.

Lo que eso quita es la comprobación de tipos — y resulta que era **lo único** que
comprobaba estos ficheros: `tsconfig.json` es `include: ["src/**/*"]` con
`rootDir: "./src"`, así que `prisma/*.ts` quedaba fuera de `pnpm typecheck` **y** de
`pnpm build`. Un error de tipos en el seed se descubría ejecutando el seed. El
control compensatorio es `tsconfig.seed.json`, enganchado a `pnpm typecheck`: la
comprobación se mueve de la ejecución del operador a CI, que es donde le tocaba.
