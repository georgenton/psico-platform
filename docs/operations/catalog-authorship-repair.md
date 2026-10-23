# Reparación de autoría y credenciales del catálogo

Manifiesto y procedimiento. **Preparado, no aplicado.** Al cerrar este
documento `STAGING_DATA_REPAIR = NOT_EXECUTED`: no se ha escrito en ninguna
base alojada, y aplicar requiere una autorización posterior sobre el plan ya
revisado.

---

## 1 · Qué estaba mal

`apps/api/prisma/seed.ts` creaba un `BookAuthor` de fixture con **título
profesional, número de colegiatura e `isVerified: true`**, y reafirmaba el
título y la verificación en la rama `update`. Ese mismo bloque fijaba
`authorId` en el `update` del libro ancla.

Tres consecuencias, que son tres problemas distintos:

1. **Una identidad de fixture se presentaba como profesional acreditada.**
   Nadie había acreditado nada de eso.
2. **Los campos viajaban al público.** `BooksService.toAuthorDetail` los envía
   en el detalle de libro y `BookHero` los pinta, incluido un ✓ con
   `title="Verificado"`. Comprobado sin autenticación contra staging: el
   detalle de _Emociones en Construcción_ devolvía `title`, `licenseNumber` e
   `isVerified: true`.
3. **Corregir una fila a mano no bastaba.** El `update` del seed reimponía el
   autor y la verificación. Con precisión: el seed **no** está encadenado al
   despliegue actual —`migrate deploy` corre como pre-deploy y C.0A1 quitó el
   encadenado del seed—, así que la reintroducción corresponde a **una futura
   ejecución del seed**, no a cada deploy. Eso la hace menos inmediata y no
   menos real: cualquier refresco de catálogo habría devuelto los valores.

`BookAuthor` registra lo que alguien escribió. No registra quién lo dijo ni con
qué autoridad — y hasta este cambio nada en el repositorio lo registraba.

## 2 · Fuente de autoría

Documento canónico de coordinación editorial: **«07 — Libros prioritarios:
Parejas y Emociones»**.

Segunda fuente, posterior: **«Autorización operativa de Jorge Quizamanchuro ·
2026-10-23»**, §3.B «Autoría del catálogo» y §3.C «Disponibilidad».

| Obra                        | Autor                   | Estado del registro   | Fuente    |
| --------------------------- | ----------------------- | --------------------- | --------- |
| _Emociones en construcción_ | **Jorge Quizamanchuro** | atribución sustentada | 07 Notion |
| _Familias ensambladas_      | **Jorge Quizamanchuro** | atribución sustentada | 2026-10-23 |
| _Parejas que perduran_      | **David Jaramillo**     | atribución sustentada | 07 Notion |

Esa fuente acredita **autoría editorial** y nada más. No acredita doctorado ni
otro título, licencia o colegiatura, verificación profesional, titularidad de
una cuenta, permisos sobre `AuthorBook` ni derechos económicos. **Ser autor de
un libro no es ser profesional verificado**, y este expediente no convierte lo
uno en lo otro: las altas de autor que propone llevan sólo `slug` y `name`.

**Familias ensambladas estuvo en `PENDING` hasta el 2026-10-23**, y la razón
de que ya no lo esté importa: no es que el razonamiento anterior fuera
erróneo. La nota del 2026-10-13 declaraba la autoría y en la misma frase decía
que no autorizaba corregir la fila, así que acreditarla habría sido afirmar lo
aplazado. La autorización del 2026-10-23 retira ese aplazamiento con todas sus
letras —«levanta el aplazamiento operativo anterior de esas atribuciones de
catálogo»— y nombra al autor de esa obra. Una obra que no figure en ninguna de
las dos tablas sigue sin fuente, y el plan lo dice de esa obra en concreto.

### Disponibilidad: una tabla aparte

Quién escribió una obra y si se ofrece a los lectores son dos afirmaciones con
fuentes distintas, así que viven en tablas distintas (`RETAINED_BOOKS`).
Mezclarlas dejaría que una atribución arrastrase una publicación, que es como
una obra retenida acaba servida sin que nadie lo decidiera.

**La retirada sólo va en una dirección.** La operación se llama
`retire-book-publication`, su `next` sólo admite `isPublished: false`, y el
tipo del aplicador no sabe expresar la contraria. No es una precaución
decorativa: nadie buscaría el acto de **publicar** una obra dentro de un plan
de reparación, así que la herramienta no debe poder ejecutarlo aunque el
archivo lo pida. Publicar sigue siendo un acto editorial por las superficies
normales.

| Obra                   | Estado         | Fuente     |
| ---------------------- | -------------- | ---------- |
| _Familias ensambladas_ | **no ofrecer** | 2026-10-23 |

El seed dejó de publicarla en #797, pero sólo en `create`: `isPublished` salió
a propósito del `update` del upsert para que una fila alojada pudiera
retirarse sin editar el archivo. Nada ha retirado la fila alojada todavía, así
que una base sembrada antes de aquel cambio **sigue sirviendo la obra** por
muchas veces que corra el seed. Ese es el hueco que cierra esta operación.

## 3 · Alcance de `Book.authorId`, comprobado antes de proponer nada

Antes de proponer un cambio de `authorId` hay que saber si tiene efectos fuera
de la exhibición. Leído en el código:

| Consumidor                                       | Qué hace con `authorId`                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BooksService` (lista, detalle, autores, filtro) | exhibición y filtrado                                                                                                                                  |
| `content-core/backfill`                          | **lee** el nombre para el manifiesto de la obra                                                                                                        |
| `pulso/author-review`                            | **escribe** `authorId` al publicar un `AuthorBook`, derivándolo del autor B2B que publica — comportamiento correcto, no el problema de este expediente |

La titularidad y los cobros B2B se anclan en `AuthorBook.authorUserId`, un
árbol de modelos separado: `AuthorBook` y `AuthorEarning` **no referencian**
`BookAuthor` ni `Book.authorId`. Por tanto corregir `Book.authorId` **no
transfiere derechos, permisos ni beneficiarios**, y este plan no los toca.

## 4 · Prevención en el código (ya implementada en este PR)

| Cambio                                                                                                | Por qué                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| El autor de fixture se siembra **sin** título, colegiatura ni verificación, en `create` y en `update` | una identidad de fixture no debe llegar acreditada; `isVerified` conserva su default de esquema (`false`)                     |
| `update: {}` en el autor de fixture                                                                   | una fila curada o reparada sobrevive a cada corrida; es la disciplina que `bootstrap-book` y `author-review` ya seguían       |
| `authorId` **fuera** del `update` de los dos libros                                                   | una atribución corregida sobrevive al despliegue siguiente — sin esto, reparar la fila es inútil                              |
| El libro ancla se crea atribuido a su autor de fuente                                                 | una base nueva no nace con la atribución equivocada                                                                           |
| La sinopsis del libro ancla pierde el nombre equivocado                                               | la atribución errónea también viajaba en texto editorial. Ajuste factual mínimo: se quita el nombre, no se reescribe la frase |
| La fila de fixture **no se renombra**                                                                 | un `BookAuthor` puede llevar varias obras; renombrarlo reatribuiría las demás y fundiría dos identidades                      |

Trinquetes: `src/catalog/seed-authorship.spec.ts` falla si alguien reintroduce
una credencial o vuelve a reafirmar `authorId` en un `update`. Comprobado con
un control negativo: reintroducir los tres mecanismos hace fallar 3 pruebas.

## 5 · Manifiesto de metadatos

Identificadores obtenidos por **lectura del catálogo público** de staging
(`GET /api/books`, `GET /api/books/authors`, `GET /api/books/:slug`), sin
acceso directo a la base y sin consultar usuarios, Diario, respuestas
personales ni información financiera.

| #   | Registro                                                         | Valor esperado                                                   | Valor que queda                                             | Fuente                                   |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| 1   | `BookAuthor` `marina-quintana` (`cmupxxdri0000r7lmnj5foynz`)     | `title` presente · `licenseNumber` presente · `isVerified: true` | `title: null` · `licenseNumber: null` · `isVerified: false` | sin fuente acreditada en este expediente |
| 2   | `BookAuthor` `jorge-quizamanchuro`                               | ausente                                                          | alta con **sólo** `slug` + `name`                           | documento canónico                       |
| 3   | `Book` `emociones-en-construccion` (`cmupxxdtd0001r7lmqg8wdst6`) | `authorId = cmupxxdri0000r7lmnj5foynz`                           | `authorId` → la fila de la operación 2                      | documento canónico                       |

**Intacto, con su motivo:**

| Registro                                                                                   | Por qué no se toca                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Book` `familias-ensambladas` (`cmupxxdz80004r7lm3tw2t58p`)                                | `AUTHORSHIP_SOURCE = PENDING`. Sigue apuntando a la fila de fixture. Decidirlo requiere una fuente editorial que este repositorio no tiene |
| La fila `marina-quintana` como tal                                                         | lleva un libro; borrar un autor con relaciones lo dejaría huérfano. Se retiran las afirmaciones, no la fila                                |
| Cualquier otro autor y sus credenciales                                                    | ajeno a este expediente. Si tiene respaldo independiente, se respeta                                                                       |
| `AuthorBook`, `AuthorProfile`, `AuthorEarning`, usuarios, roles, planes, cobros            | fuera de alcance por completo                                                                                                              |
| Slugs, ids de obra y de capítulo, revisiones, bloques, anclas, experiencias, `TEXT_LOCKED` | no se cambian para corregir una atribución                                                                                                 |

**`parejas-que-perduran`** **no aparece en el catálogo público consultado** de
staging. El alcance de esa consulta es `GET /api/books`, que lista lo
publicado: **no demuestra la ausencia de una fila no publicada**, y la primera
versión de este documento la presentó como si lo hiciera.

De ahí lo que se hace y lo que no: no se repara una fila que no se ha
identificado, y **no se hace bootstrap ni ingesta** por esa inferencia. La
atribución a David Jaramillo queda **preparada** para cuando la fila se
identifique, y el código que la crearía (`bootstrap-book`) ya usa
`authorSlug: david-jaramillo`. El planificador lo dice con el mismo cuidado:
«sin fila identificada en el alcance consultado».

**Pendiente de decisión, no automatizado:** la sinopsis de _Emociones en
Construcción_ en bases ya sembradas sigue empezando con el nombre equivocado
(el seed sólo la escribe en `create`). Es texto editorial; el ajuste factual
mínimo está hecho en el código para bases nuevas, y reescribir la fila
existente es una decisión editorial que este plan no toma.

## 6 · Procedimiento

La herramienta **no lee `.env`**. `DATABASE_URL` se pasa en el entorno de cada
invocación, a propósito: el destino tiene que ser una elección visible en la
línea que se ejecuta, no un archivo que estaba ahí. Sin ella, se detiene
diciendo que no usa un destino por defecto.

Las rutas se pasan **expandidas**. `--plan-out=~/x.json` NO expande la tilde:
un shell la expande al principio de una palabra, no después de un `=`, y Node
no la expande en absoluto. El comando de abajo usa `$HOME`, que sí se expande
ahí. Con la tilde literal se crearía un directorio llamado `~` en el
directorio actual — dentro del repositorio si se ejecuta desde él — y el
respaldo se niega a escribirse allí.

Las posturas son las que `resolveEnvironment()` devuelve:
`development`, `test`, `staging` y `production` (esta última, rechazada). No
existe una postura `local`.

```bash
# Dry-run — no escribe. Es el modo por defecto. Congela el plan en disco.
DATABASE_URL=<cadena del destino> \
  pnpm --filter @psico/api catalog:authorship:plan -- \
  --plan-out="$HOME/.psico-ops/authorship-plan.json"

# Revísalo. El dry-run imprime las DOS mitades de su identidad, y las dos son
# obligatorias para aplicar. El directorio privado tiene que existir ya.
mkdir -p "$HOME/.psico-ops" && chmod 700 "$HOME/.psico-ops"

DATABASE_URL=<la misma cadena> \
  pnpm --filter @psico/api catalog:authorship:apply -- \
  --plan="$HOME/.psico-ops/authorship-plan.json" \
  --reversal-out="$HOME/.psico-ops/authorship-preimagen.json" \
  --expect-database=<nombre> \
  --expect-posture=<development|test|staging> \
  --expect-plan-id=<el planId que revisaste> \
  --expect-plan-hash=<el planHash que revisaste>
```

**`--expect-plan-id` y `--expect-plan-hash` son obligatorias para aplicar.**
Eran opcionales y el cargador sólo las comparaba cuando se suministraban, así
que la invocación corriente aplicaba **cualquier plan válido** que estuviera en
esa ruta. El id dice _qué archivo_ se aprobó; el hash, _qué contenía_. Una sin
la otra deja el hueco abierto: otro archivo puede llevar el mismo id, y el
mismo contenido puede estar en un archivo que nadie revisó. Las dos vienen de
la invocación, nunca del archivo que se está validando — un archivo sustituido
respondería por sí mismo.

**Leer un plan no las exige.** Inspeccionar un archivo es una lectura, no una
escritura, y no hace falta reclamar autorización para escribir sólo para
mirarlo.

`--apply` y `--json` son interruptores y **no llevan valor**:
`--apply=false` se rechaza en vez de interpretarse como activación. Una
bandera repetida también se rechaza, y los argumentos de aplicación en un
dry-run (o `--plan-out` junto a `--apply`) se rechazan en lugar de ignorarse en
silencio.

`--json` deja en la salida estándar **sólo** el informe sanitizado, para poder
canalizarlo; el relato humano sigue imprimiéndose, por la salida de error. El
informe dice si un campo estaba presente, nunca qué decía, y tampoco publica
digests de esos valores.

### El plan es un archivo, no un recálculo

La primera versión replanificaba en cada invocación, así que `--apply` **no
ejecutaba el dry-run que alguien había revisado**: ejecutaba lo que la base
pareciera en ese momento, adoptando en silencio condiciones que nadie había
visto. Ahora `plan` congela un archivo con `planId` y `planHash`, y `apply` lo
consume.

El `planHash` cubre **todo lo que decide qué va a pasar**: las operaciones, el
destino completo —host, puerto, base, postura e `isLoopback`—, los bloqueos y
las notas que alguien leyó. La primera versión cubría sólo las operaciones y la
huella del destino, así que un archivo podía tener su **postura** editada, o
sus **bloqueos** borrados, y seguir cuadrando el hash — y los bloqueos son el
mecanismo que detiene un plan ambiguo.

Fuera del hash quedan a propósito el `planId` y la fecha: el hash direcciona
**contenido**, así que dos congelados de un catálogo sin cambios coinciden.
Distinguir dos **archivos** es trabajo del `planId` esperado, que el operador
pasa con `--expect-plan-id` — una entrada independiente del archivo, porque un
archivo sustituido respondería por sí mismo. **El hash vincula; no sustituye el
permiso humano.**

### El archivo no es una lista de escrituras

Comprobar los **nombres** de las operaciones no bastaba. Los payloads llegaban
sin validar al aplicador, y `op.next` —un objeto del JSON— se pasaba a `data`
de Prisma. Un archivo con un `kind` permitido y campos de más era, por tanto,
una lista arbitraria de escrituras con la etiqueta correcta.

Ahora el plan se valida como entrada no confiable, y el **alcance se comprueba
antes que la integridad**: un archivo rehasheado correctamente y lleno de
payloads prohibidos falla por lo que pide, no sólo por su hash.

| Comprobación                            | Qué rechaza                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conjunto exacto de claves por operación | campos de más y campos de menos                                                                                                                                                      |
| Tipos                                   | un booleano que llega como texto, un digest que es un literal                                                                                                                        |
| Referencias coherentes                  | `expect.slug` que no corresponde al `authorSlug`; un libro que espera un alta que el plan no da                                                                                      |
| Correspondencias sustentadas            | retirar credenciales a quien no es una identidad de fixture; atribuir una obra a un autor que **ninguna fuente de este repositorio** pareja con ella; un alta con una cita inventada |
| Retirada fija                           | `next` sólo puede ser exactamente `{title: null, licenseNumber: null, isVerified: false}`                                                                                            |
| Coherencia del destino                  | una huella o un `isLoopback` **declarados** que no corresponden al host                                                                                                              |

Y la retirada que se ejecuta es una **constante del módulo**, no el objeto del
archivo: el plan dice _cuál_ operación correr, no qué escribe.

### Expectativas exactas

Las expectativas eran presencias (`hasTitle`, `hasLicense`). Un título que
cambia de un valor no nulo a **otro** valor no nulo dejaba esas presencias
iguales, y el aplicador habría retirado un valor que nadie revisó. Ahora el
plan lleva un **digest SHA-256 por campo** más el `name` y el `slug` de la
fila: detecta A → B, y comprueba que son los campos correctos **de la fila
correcta**.

Los digests permiten comparar sin publicar nada. Los **valores literales viven
en un único sitio**: el archivo de reversión, privado, permisos 600, fuera del
árbol del producto. El resumen compartible no lleva ni los valores ni sus
digests.

### La ventana entre comprobar y escribir

El aplicador releía y después escribía **por id**, así que otra conexión podía
cambiar la fila en el intervalo y la escritura aterrizaba igual: la lectura no
probaba nada sobre el estado en el momento de escribir.

Ahora **toda escritura es condicionada por los valores recién leídos** —
`updateMany` con los valores antiguos en el `WHERE`, exigiendo exactamente una
fila afectada. Es un compare-and-set en SQL, así que la garantía viene **del
propio enunciado** y no de un nivel de aislamiento que nadie declaró. Si otra
operación cambió el dato, cero filas coinciden, nada se sobrescribe y la
reparación se detiene.

Ante un conflicto **no se replanifica con el dato nuevo**: adoptarlo sería
autorizar un estado que nadie revisó.

### Destino explícito

`resolveEnvironment()` clasifica el **proceso**. En una máquina local sin
marcadores devuelve `development` sin lanzar, mientras `DATABASE_URL` elige el
**destino** por separado — así que «sin clasificar siempre lanza» sólo era
cierto en una caja desplegada reconocida, y una etiqueta `development` no debe
autorizar escribir en una base alojada.

| Comprobación                                           | Comportamiento                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` ausente                                 | rechazo. No hay destino por defecto: elegir una base implícitamente es cómo se repara la equivocada                                                                                                                                                                                                                                                                           |
| `--expect-database` / `--expect-posture`               | obligatorias para aplicar, y deben coincidir con la conexión real. Una orden copiada no aterriza en otra caja                                                                                                                                                                                                                                                                 |
| `current_database()`                                   | se consulta y debe coincidir con la cadena de conexión                                                                                                                                                                                                                                                                                                                        |
| postura `staging`                                      | exige `ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR=1` en **esa** invocación, **también por loopback**. El permiso es de la postura, no del host: un túnel, un proxy o una caja de staging con base local se presentan como loopback. El token del seed no sirve, y no debe quedar fijado en las variables del servicio — eso convierte un permiso puntual en un bypass permanente |
| host no loopback con etiqueta local                    | rechazo, con token o sin él: una etiqueta `development` no autoriza escribir en una base alojada                                                                                                                                                                                                                                                                              |
| `production`                                           | **rechazado en esta versión**, sin token que lo habilite                                                                                                                                                                                                                                                                                                                      |
| argumento desconocido                                  | rechazo, en vez de ignorarlo: una bandera mal escrita no debe convertirse en silencio en otro modo                                                                                                                                                                                                                                                                            |
| `--apply=false`, bandera repetida, modos incompatibles | rechazo. Un interruptor no lleva valor, no se elige el último de dos valores en silencio, y un argumento que se ignoraría parecería haber hecho algo                                                                                                                                                                                                                          |

### Preimagen antes de escribir, resultado al lado

El CLI imprimía los valores previos **después** de que la transacción
terminara, y no exigía respaldo. Ahora la **preimagen** se persiste y se
vuelve a leer antes de la primera escritura; si no se puede guardar o
verificar, la base no se toca.

Cuatro propiedades del archivo, cada una por un fallo distinto:

| Propiedad                        | Por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruta privada comprobada          | se exige absoluta, sin `..`, fuera del repositorio, sin enlace en el componente final, y con el directorio resuelto también fuera. Lo que se comprueba es dónde **resuelve** la ruta                                                                                                                                                                                                                                                                             |
| Directorio privado **existente** | el `realpath` sólo se resolvía cuando el padre existía, y la escritura creaba los padres que faltaran. Juntos dejaban un hueco con nombre: un enlace en una ruta externa apuntando al repositorio, un subdirectorio aún inexistente bajo él, y el `mkdir` recursivo lo creaba **dentro del árbol del producto** con la preimagen y sus literales. Ahora el directorio tiene que existir y resolverse fuera **antes** de escribir nada; no se crea implícitamente |
| Creación exclusiva (`wx`)        | un `existsSync` seguido de una escritura deja una ventana en la que el archivo puede aparecer y perderse                                                                                                                                                                                                                                                                                                                                                         |
| `fsync` explícito                | `writeFileSync` no promete que llegó al disco                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Comparación íntegra al releer    | antes se comparaban `planId`, hash y número de entradas: eso coincidía aunque los **valores** de una entrada hubieran cambiado                                                                                                                                                                                                                                                                                                                                   |

Y la preimagen **no se reabre para escribir**. El resultado va a un archivo
hermano (`<ruta>.outcome.json`), porque estampar el estado sobre el respaldo
significaba truncar y reescribir la única copia de los valores previos
**después** de que la base ya había cambiado: un fallo ahí destruía justo lo
que el archivo existía para proteger.

Los estados dicen **lo que se observó**, no lo que conviene suponer:

| Estado         | Qué significa                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intended`     | la preimagen está en disco. No se afirma nada más                                                                                                                                                                                              |
| `applied`      | se observó que la transacción se confirmó                                                                                                                                                                                                      |
| `rolled-back`  | hay **evidencia** de que la reparación no se confirmó: el fallo vino de una precondición de esta herramienta, o de un SQLSTATE de un conjunto corto y justificado (clases 22, 23, 42 y `40001`/`40P01`) donde el servidor rechazó el enunciado |
| `undetermined` | el resultado de la transacción **no se pudo determinar**. Una conexión perdida al confirmar es indistinguible, desde aquí, de una confirmación que sí ocurrió y cuyo acuse nunca llegó                                                         |

`aborted` ya no existe: absorbía todos los rechazos de `$transaction` y con
ello afirmaba una evidencia que la herramienta no tiene. Ante incertidumbre
**no se replanifica, ni se reintenta, ni se revierte** por cuenta propia.

Y no hay un estado que signifique «se confirmó pero el registro falló»: si el
registro no se pudo escribir, **no existe archivo de resultado**, e inventar
uno sería el mismo error con otra forma. Ese caso lo informa el comando,
separando los dos hechos —qué se sabe de la transacción y que el registro
falló—, con la preimagen intacta y **salida distinta de cero** para que alguien
mire. Si se escribieron cero filas por idempotencia, lo dice así: no afirma que
se modificaron datos.

El dry-run comprueba todas las precondiciones que puede **comprobar sin
escribir**, incluido el autor de destino tanto cuando está pendiente de alta
como cuando ya existe. La versión anterior salía antes de validar
`expectAuthorId` y **sin guardar el vínculo previo del libro**, que es justo el
valor que después no se puede reconstruir.

### Identidad y ambigüedad

El planificador acepta un slug normalizado; el aplicador volvía a buscar el
slug **canónico exacto**, así que una fila como ` Jorge-Quizamanchuro` se le
escapaba y habría acuñado un duplicado. Ahora el plan **congela el id que el
planificador resolvió** y el aplicador revalida su identidad antes de tocar
cualquier relación.

Dos coincidencias normalizadas **bloquean**: no se elige una con `find`. Y la
ambigüedad de libro va a `blockers`, no a `untouched` — la primera versión
prometía bloquear el plan completo y lo dejaba continuar.

### Lo demás, que se conserva

- **Una sola transacción.** Un fallo en la segunda operación no deja aplicada
  la primera: una corrección a medias es peor que ninguna, porque parece
  terminada.
- **Idempotencia del recorrido completo.** Repetir encuentra las filas en su
  valor final, cuenta cero escrituras y no acuña un segundo autor. Esto era
  falso de extremo a extremo hasta este cierre: el aplicador sí era
  idempotente, pero la recogida de la reversión leía el libro ya reparado, lo
  comparaba con `expectAuthorId` y lanzaba un **conflicto** antes de que el
  aplicador llegara a su no-op. Un estado final reconocido no es una
  divergencia ajena.
- **Número real de filas escritas**, no de operaciones planificadas.

Lo que el procedimiento **no** hace: no usa el seed como herramienta de
reparación, no borra autores, no cambia slugs ni ids, y no restaura la base
como estrategia de reversión.

## 7 · Aplicación posterior y reversión (propuesta, no ejecutada)

Cuando haya autorización específica sobre el plan revisado:

1. `catalog:authorship:plan -- --plan-out=<ruta privada>` en el entorno
   objetivo. Revisar el plan impreso y el archivo congelado.
2. Comprobar que el `planId` y el `planHash` del archivo son los del plan que
   se aprobó. **Apply rechaza cualquier otro**, y rechaza también un plan de
   otra base o de otra postura.
3. `catalog:authorship:apply` con `--plan`, `--reversal-out`,
   `--expect-database`, `--expect-posture`, `--expect-plan-id` y, en postura
   `staging`, el token de esta invocación. La preimagen se persiste y se
   verifica **antes** de la primera escritura; si eso falla, la base no se
   toca.
4. Comprobar el cuerpo público: `GET /api/books/emociones-en-construccion` debe
   devolver el autor de fuente con `title: null`, `licenseNumber: null` e
   `isVerified: false`.
5. Confirmar que _Familias Ensambladas_ sigue donde estaba y que ningún otro
   autor cambió.
6. Leer el archivo de resultado, `<ruta de la preimagen>.outcome.json`.
   **Antes de usarlo para decidir qué pasó, tiene que validarse**: formato,
   estado reconocido, identidad del plan, y que su campo `preimage` apunte a la
   preimagen que lo acompaña. Un JSON legible no es evidencia, y un archivo
   ajeno o de otro plan **no decide nada** — la herramienta lo descarta y dice
   por qué.

   Y la validación de forma no basta: tiene que **emparejarse con algo
   independiente del propio archivo**, que es la preimagen que lo acompaña o el
   `planId` **y** el `planHash` aprobados. Si la preimagen falta y no se pasan
   las dos mitades, el resultado es **no verificable** — se puede inspeccionar,
   pero no responde qué pasó, y su falta de pareja tampoco significa que la
   base no cambiara.
   - `applied` → se observó que la transacción se confirmó.
   - `rolled-back` → hay evidencia de que **no** se confirmó; el motivo está en
     la salida.
   - `undetermined` → el resultado **no se pudo determinar**. No se lee como
     «se aplicó» ni como «no pasó nada»: hay que comprobar el estado real de
     las filas antes de reintentar.
   - **sin archivo de resultado** → **no demuestra que no hubo cambios.**
     Demuestra que nadie lo registró. Pueden ser dos cosas distintas: que el
     comando nunca llegó a la transacción, o que se confirmó y el registro
     falló — y en ese segundo caso el comando lo dijo y salió con código
     distinto de cero. La preimagen sigue en `intended`, que es su único
     estado, así que no responde la pregunta por sí sola.

   Si la ruta de resultado ya existía antes de aplicar, el comando **se detiene
   antes de modificar la base**: un resultado anterior no se sobrescribe ni se
   adopta como evidencia de la ejecución nueva. Una preimagen archivada no
   implica que su `.outcome.json` también se archivara.

**Reversión**, con el archivo del paso 3: restaurar los tres campos de la fila
de fixture y el `authorId` previo del libro, en una transacción. La fila de
autor creada se retira **sólo** si ningún libro la referencia, y eso necesita
su propia autorización de alcance. No se restaura la base, y no hay borrado
automático de autores.

La **preimagen** contiene los valores literales previos. Vive fuera del
repositorio, con permisos 600, se escribe una sola vez y no se adjunta a un PR
ni se pega en una bitácora. El archivo de resultado, al lado, no lleva ningún
valor.

## 8 · Límites

- **Los tests locales no sanean el catálogo alojado.** Pasan contra una base
  desechable; staging sigue con los valores anteriores.
- El valor histórico de la credencial permanece en el historial de git
  (`seed.ts` antes de este cambio). Reescribir historia está fuera de alcance.
- «Sin fuente acreditada en este expediente» **no** significa que la persona no
  exista ni que alguna credencial fuera falsificada. No hay evidencia de
  ninguna de las dos cosas y este documento no las afirma.
- `AUTHOR_CREDENTIAL_INTEGRITY` sigue **abierto** hasta que el plan se aplique
  y se verifique en el entorno objetivo.
- Las pruebas de concurrencia intercalan una segunda conexión de forma
  determinista, dirigida por código. Eso demuestra que la escritura
  condicionada cierra **esa** ventana; no es un modelo de todas las
  concurrencias posibles del sistema.
- La garantía de la escritura condicionada viene del `WHERE`, no de un nivel de
  aislamiento. El procedimiento **no** cambia la configuración de la base ni
  depende de una no declarada.
- **Un plan es de un entorno.** El congelado para una base local no sirve para
  staging: el hash cubre el destino, así que apply lo rechaza. Hay que generar
  el plan **en** el entorno objetivo y revisarlo allí.
- Aplicar en una base alojada necesita una autorización **explícita para ese
  entorno**. Ni el plan ni su hash la sustituyen: vinculan el archivo al que se
  revisó, y eso es todo lo que hacen.
- El recorrido del comando se ejercita contra una base **local desechable**.
  Eso demuestra que el comando funciona; no demuestra nada sobre una base
  alojada, que no se ha tocado.
- Las correspondencias permitidas son las de `authorship-sources.ts`. Añadir
  una atribución —o una obra retenida— es editar ese archivo con su cita, no
  pasar un plan distinto: un archivo no puede ampliar el alcance de la
  herramienta. Un plan bien formado y bien hasheado que retire una obra que
  nadie decidió retener se rechaza por `CORRESPONDENCIA NO SUSTENTADA`.
- **Retirar una obra del catálogo no es borrarla.** La operación escribe una
  columna. Capítulos, revisiones, unidades, bloques, medios, anclas y el
  historial de lectura de cada persona quedan exactamente como estaban: una
  obra que ya no se ofrece no es una obra que nunca existió.
- **La retirada sola no basta para que deje de servirse.** Lo que impide
  servir una obra no publicada son las comprobaciones de las rutas, no esta
  columna. Aplicar la retirada sobre una imagen que todavía no las tenga
  cambia el dato y no el comportamiento, que es peor que no haberla aplicado
  porque parece hecho. Por eso el orden es: primero el código servido,
  después la reparación.
- `describeError` imprime la clase y el código de un fallo ajeno, no su
  mensaje. Eso evita volcar valores, cadenas de conexión o argumentos de
  consulta, y significa que el detalle de un fallo del driver hay que buscarlo
  en los registros del propio servidor.
- **La clasificación del fallo de transacción es una lista corta y declarada**,
  no una certeza del protocolo ni un reconocedor general de errores. Un fallo
  ajeno es **indeterminado salvo prueba en contra**, y la prueba es pertenecer
  a un conjunto pequeño justificado: una precondición de esta herramienta, o un
  SQLSTATE de clase 22, 23 o 42, o `40001`/`40P01`, donde el enunciado lo
  rechazó el servidor y la transacción cae con él. Todo lo demás —clase 08,
  caída del servidor, socket, `XX000`, clase 25 y **cualquier código `P####`
  de Prisma**— queda indeterminado. **No se clasifica por la longitud del
  código**: `P1017` («el servidor cerró la conexión»), `P2028` y `P2010`
  (envoltorios) y hasta un `ABCDE` inventado tienen cinco caracteres, y una de
  las versiones anteriores los leía por eso como reversión confirmada. Tampoco
  se clasifica por palabras del mensaje, que puede llevar valores de fila, una
  cadena de conexión o argumentos de consulta.
- **«Resultado verificado» no significa «JSON legible».** Un registro que sólo
  concuerda consigo mismo no acredita nada: hace falta algo **independiente**
  del archivo — la preimagen que lo acompaña, o el `planId` **y** el `planHash`
  aprobados, las dos mitades. Sin ninguno de los dos, la respuesta es **no
  verificable**, y el archivo se puede inspeccionar pero no presentar como
  evidencia. La preimagen no se recrea para cerrar ese hueco: un respaldo
  inventado para validar un registro no es respaldo de nada.
- El caso «se confirmó y el registro falló» se **simula** en las pruebas
  (haciendo imposible escribir el archivo después del commit) y el de resultado
  desconocido también (inyectando el rechazo con la forma que Prisma produce de
  verdad: un envoltorio con código `P1017` o `P2028`). Son simulaciones de
  transporte y de disco, **no incidencias observadas en un entorno alojado**.
