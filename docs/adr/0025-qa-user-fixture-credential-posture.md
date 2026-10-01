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
