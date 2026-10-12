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
3. **Corregir una fila a mano no servía de nada.** El `update` del seed
   reimponía el autor y la verificación en el despliegue siguiente.

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

**`parejas-que-perduran`** no tiene fila `Book` en staging: no aparece en el
catálogo público. No hay nada que reparar allí; la atribución a David Jaramillo
queda **preparada** para cuando la fila exista, y el código que la crearía
(`bootstrap-book`) ya usa `authorSlug: david-jaramillo`.

**Pendiente de decisión, no automatizado:** la sinopsis de _Emociones en
Construcción_ en bases ya sembradas sigue empezando con el nombre equivocado
(el seed sólo la escribe en `create`). Es texto editorial; el ajuste factual
mínimo está hecho en el código para bases nuevas, y reescribir la fila
existente es una decisión editorial que este plan no toma.

## 6 · Procedimiento

```bash
# Dry-run — no escribe. Es el modo por defecto.
pnpm --filter @psico/api catalog:authorship:plan

# Aplicar en local
pnpm --filter @psico/api catalog:authorship:apply
```

**La puerta de entrada.** La postura sale de `resolveEnvironment()`, alcanzada
por la vía neutral `shared/psico-environment` — la autoridad semántica de
`PSICO_ENV` que `prisma/seed-guard` nombra en sus propios comentarios. Se
reutiliza, no se re-deriva ni se relaja.

| Postura                | Comportamiento                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production`           | **rechazado en esta versión**, sin token que lo habilite. Una reparación en producción es una decisión aparte                                                                                                    |
| `staging`              | exige `ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR=1` en la invocación. **El token del seed de staging no sirve**: sembrar catálogo y reparar atribuciones son decisiones distintas, con radios de impacto distintos |
| `development` / `test` | `--apply` basta                                                                                                                                                                                                  |
| sin clasificar         | `resolveEnvironment()` lanza antes de llegar aquí; se rechaza                                                                                                                                                    |

**Garantías, cada una con prueba:**

- **Dry-run por defecto.** Sin `--apply` no se escribe nada, en ningún entorno.
- **Verificación de valores esperados dentro de la transacción.** El plan se
  construye desde una instantánea; si la fila cambió desde entonces, la
  operación se rechaza en vez de sobrescribir el cambio de otra persona.
- **Una sola transacción.** Un fallo en la segunda operación no deja aplicada
  la primera: una corrección a medias es peor que ninguna, porque parece
  terminada.
- **Idempotencia.** Repetir encuentra las filas ya en su valor final, cuenta
  cero escrituras y no acuña un segundo autor.
- **Detención ante ambigüedad.** Dos filas con el mismo slug de libro, o un
  slug de autor con otro nombre, bloquean el plan completo.
- **Resumen antes/después y número real de filas escritas**, no de operaciones
  planificadas.
- **Metadatos de reversión** emitidos antes de aplicar.

Lo que el procedimiento **no** hace: no usa el seed como herramienta de
reparación, no borra autores, no cambia slugs ni ids, y no restaura la base
como estrategia de reversión.

## 7 · Aplicación posterior y reversión (propuesta, no ejecutada)

Aplicación, cuando haya autorización específica sobre este plan:

1. `catalog:authorship:plan` en el entorno objetivo y revisar el plan impreso.
2. **Guardar los metadatos de reversión fuera del repositorio.** Contienen los
   valores previos, incluidas las credenciales sin fuente que se retiran; no
   deben entrar al árbol del producto.
3. `catalog:authorship:apply` con el token de la postura.
4. Comprobar el cuerpo público: `GET /api/books/emociones-en-construccion`
   debe devolver el autor de fuente con `title: null`, `licenseNumber: null` e
   `isVerified: false`.
5. Confirmar que _Familias Ensambladas_ sigue donde estaba y que ningún otro
   autor cambió.

Reversión, con los metadatos del paso 2: restaurar los tres campos de la fila
de fixture y el `authorId` previo del libro, en una transacción. La fila de
autor creada se retira **sólo** si ningún libro la referencia. No se restaura
la base.

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
