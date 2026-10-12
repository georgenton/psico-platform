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

| Obra                        | Autor                   | Estado del registro   |
| --------------------------- | ----------------------- | --------------------- |
| _Emociones en construcción_ | **Jorge Quizamanchuro** | atribución sustentada |
| _Parejas que perduran_      | **David Jaramillo**     | atribución sustentada |

Esa fuente acredita **autoría editorial** y nada más. No acredita doctorado ni
otro título, licencia o colegiatura, verificación profesional, titularidad de
una cuenta, permisos sobre `AuthorBook` ni derechos económicos. **Ser autor de
un libro no es ser profesional verificado**, y este expediente no convierte lo
uno en lo otro: las altas de autor que propone llevan sólo `slug` y `name`.

Para cualquier otra obra —incluida **Familias Ensambladas**— no hay fuente en
este repositorio: `AUTHORSHIP_SOURCE = PENDING`. Extrapolar uno de los dos
nombres de arriba sería inventar la atribución.

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

```bash
# Dry-run — no escribe. Es el modo por defecto. Congela el plan en disco.
DATABASE_URL=<cadena del destino> \
  pnpm --filter @psico/api catalog:authorship:plan -- \
  --plan-out=~/.psico-ops/authorship-plan.json

# Aplicar CONSUMIENDO ese plan, declarando el destino y con respaldo previo.
DATABASE_URL=<la misma cadena> \
  pnpm --filter @psico/api catalog:authorship:apply -- \
  --plan=~/.psico-ops/authorship-plan.json \
  --reversal-out=~/.psico-ops/authorship-reversal.json \
  --expect-database=<nombre> --expect-posture=<local|staging>
```

`--json` deja en la salida estándar **sólo** el informe sanitizado, para poder
canalizarlo; el relato humano sigue imprimiéndose, por la salida de error. El
informe dice si un campo estaba presente, nunca qué decía.

### El plan es un archivo, no un recálculo

La primera versión replanificaba en cada invocación, así que `--apply` **no
ejecutaba el dry-run que alguien había revisado**: ejecutaba lo que la base
pareciera en ese momento, adoptando en silencio condiciones que nadie había
visto. Ahora `plan` congela un archivo con `planId` y `planHash`, y `apply` lo
consume.

El `planHash` cubre **las operaciones y el destino**, así que un plan revisado
para una base no valida contra otra. Al cargarlo se comprueban el formato, el
hash, que cada operación sea una de las tres que esta herramienta ejecuta, y
que el destino y la postura coincidan con la conexión actual. **Un archivo de
plan no es una lista arbitraria de escrituras.** El identificador vincula lo
revisado con lo aplicado; **no sustituye la autorización humana**.

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

| Comprobación                             | Comportamiento                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` ausente                   | rechazo. No hay destino por defecto: elegir una base implícitamente es cómo se repara la equivocada                                                                                                                                                                                                 |
| `--expect-database` / `--expect-posture` | obligatorias para aplicar, y deben coincidir con la conexión real. Una orden copiada no aterriza en otra caja                                                                                                                                                                                       |
| `current_database()`                     | se consulta y debe coincidir con la cadena de conexión                                                                                                                                                                                                                                              |
| host no loopback                         | cuenta como **alojado** diga lo que diga la etiqueta: exige postura `staging` **y** `ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR=1` en **esa** invocación. El token del seed no sirve, y no debe quedar fijado en las variables del servicio — eso convierte un permiso puntual en un bypass permanente |
| `production`                             | **rechazado en esta versión**, sin token que lo habilite                                                                                                                                                                                                                                            |
| argumento desconocido                    | rechazo, en vez de ignorarlo: una bandera mal escrita no debe convertirse en silencio en otro modo                                                                                                                                                                                                  |

### Reversión antes de escribir

El CLI imprimía los valores previos **después** de que la transacción
terminara, y no exigía respaldo. Ahora el archivo de reversión se **persiste y
se vuelve a leer antes de la primera escritura**; si no se puede guardar o
verificar, la base no se toca. **No sobrescribe** un respaldo anterior: repetir
el comando no debe destruir la única copia del estado previo.

Tres estados distintos, escritos en momentos distintos: `intended` (preparado),
`applied` y `aborted`. **Un archivo en `intended` no acredita que se aplicara
nada.**

El dry-run comprueba **todas** las precondiciones que puede, incluido el caso
del plan inicial —autor destino ausente—, donde la versión anterior salía antes
de validar `expectAuthorId` y **sin guardar el vínculo previo del libro**, que
es justo el valor que después no se puede reconstruir.

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
- **Idempotencia.** Repetir encuentra las filas en su valor final, cuenta cero
  escrituras y no acuña un segundo autor.
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
   `--expect-database`, `--expect-posture` y, en una base alojada, el token de
   esta invocación. El respaldo se persiste y se verifica **antes** de la
   primera escritura; si eso falla, la base no se toca.
4. Comprobar el cuerpo público: `GET /api/books/emociones-en-construccion` debe
   devolver el autor de fuente con `title: null`, `licenseNumber: null` e
   `isVerified: false`.
5. Confirmar que _Familias Ensambladas_ sigue donde estaba y que ningún otro
   autor cambió.
6. Comprobar que el archivo de reversión quedó en estado `applied`. Si quedó en
   `aborted`, **nada se aplicó** y el motivo está en la salida.

**Reversión**, con el archivo del paso 3: restaurar los tres campos de la fila
de fixture y el `authorId` previo del libro, en una transacción. La fila de
autor creada se retira **sólo** si ningún libro la referencia, y eso necesita
su propia autorización de alcance. No se restaura la base, y no hay borrado
automático de autores.

El archivo de reversión contiene los **valores literales** previos. Vive fuera
del repositorio, con permisos 600, y no se adjunta a un PR ni se pega en una
bitácora.

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
