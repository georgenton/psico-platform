# Tour · matriz de veracidad

Justificación de cada texto que cambia en `apps/api/src/onboarding/constants.ts`.
No es una investigación: es la evidencia detrás de las frases que se tocan, y la
razón por la que las demás se dejan como estaban.

Se distingue siempre entre **visión documentada**, **implementación**,
**habilitación** y **evidencia de funcionamiento**. Una cosa puede estar escrita
en Notion, existir en el código, estar encendida en un entorno y aun así no
haberse visto funcionar.

Verificado el 2026-10-08 contra `main` en `85188dfd` y, donde se indica, contra
`staging.feelverse.app`.

---

## 1 · Inicio

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| **Afirmación**  | Lectura en curso, pregunta del día, saludo de Eco, mini Mapa Emocional. |
| **Evidencia**   | Los cuatro bloques existen en el panel de Inicio.                       |
| **Estado**      | Implementado y visible.                                                 |
| **Texto final** | Sin cambios.                                                            |

---

## 2 · Biblioteca

|                 |                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Cada libro está escrito por psicólogos especializados.»                                                                                              |
| **Evidencia**   | No hay en el repositorio ningún dato de credenciales de autoría: `BookAuthor` guarda nombre y biografía, no titulación. No es verificable desde aquí. |
| **Estado**      | **Sin respaldo.** Es una credencial profesional afirmada sin evidencia.                                                                               |
| **Texto final** | «Cada libro lleva su autoría y su ficha: puedes mirarla antes de empezar.»                                                                            |

|                 |                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Muchos vienen con audio para escuchar mientras caminas.»                                                                                                                                                                                                        |
| **Evidencia**   | `GET /api/lector/:libro/:cap/audio` en staging devuelve **403** con la cuenta sintética disponible: es la puerta Pro, no una respuesta sobre si hay audio. La bitácora del proyecto registra que los m4a aún no están en R2, pero eso no se volvió a medir aquí. |
| **Estado**      | **No verificado.** No se puede afirmar «muchos» ni se degrada a «próximamente» por no haber podido medirlo.                                                                                                                                                      |
| **Texto final** | «Cuando un capítulo tiene audio, el lector lo ofrece junto al texto; si todavía no está publicado, te lo dice en su sitio.» Describe el comportamiento, que sí es cierto en ambos casos.                                                                         |

|                 |                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | Filtros por tema o autor · resaltados y notas.                                                                              |
| **Evidencia**   | `Filters.tsx` tiene búsqueda («Buscar libros, autores…»), orden y categorías. El lector web tiene resaltados y anotaciones. |
| **Estado**      | Implementado.                                                                                                               |
| **Texto final** | Sin cambios de fondo.                                                                                                       |

---

## 3 · Reflexiones (el tour lo llamaba «Tu Diario»)

|                 |                                                                     |
| --------------- | ------------------------------------------------------------------- |
| **Afirmación**  | Título «Tu Diario».                                                 |
| **Evidencia**   | La navegación vigente dice **«Reflexiones»**.                       |
| **Estado**      | Nombre desalineado: manda a buscar una sección que no se llama así. |
| **Texto final** | «Tus Reflexiones».                                                  |

|                 |                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Solo tú puedes leerlo — ni siquiera nuestro equipo tiene acceso.» · «Tu llave se crea con tu contraseña y nunca sale de tu dispositivo.»                                                     |
| **Evidencia**   | ADR 0007 y `@psico/crypto`: Argon2id en el cliente, XChaCha20-Poly1305, el servidor sólo recibe `textCiphertext + textNonce`. Hay un test de privacidad que falla si un log toca esos campos. |
| **Estado**      | Implementado.                                                                                                                                                                                 |
| **Texto final** | Se conserva, redactado como «se cifra en tu dispositivo antes de salir».                                                                                                                      |

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Si olvidas tu contraseña, **te daremos** una frase de 24 palabras para poder volver a entrar.»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Evidencia**   | El número real es **12**: `SEED_PHRASE_WORD_COUNT = 12` en [`packages/crypto/src/bip39.ts`](../../packages/crypto/src/bip39.ts) (clave maestra de 16 bytes, lista española). 24 fue cierto hasta la revisión de [ADR 0007](../adr/0007-e2e-encryption-diario-eco.md) de julio de 2026 y dejó de serlo entonces. `SeedPhraseModal` la muestra tras el primer desbloqueo y marca `cryptoSeedShownAt`; `ShowSeedPhraseCard` la vuelve a derivar desde Ajustes → Seguridad con el diario desbloqueado. El servidor nunca tiene la clave: entregarla después es criptográficamente imposible. |
| **Estado**      | **Falso por tres motivos**, no uno: promete una entrega que la arquitectura impide, dice 24 donde el producto usa 12, y presenta la primera exhibición como la única.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Texto final** | Tres frases, no una. (1) «te mostramos una frase de **12** palabras. Guárdala en un lugar seguro: si olvidas la contraseña, es lo que te permite volver a abrirlas». (2) «No es tu única oportunidad de verla: puedes volver a consultarla en **Ajustes → Seguridad**, mientras tengas tus reflexiones desbloqueadas». (3) Separa recuperar la **cuenta** de recuperar el **contenido**: restablecer la contraseña devuelve el acceso a FeelVerse, pero **por sí solo no descifra** nada de lo ya escrito.                                                                               |
| **Trinquete**   | `onboarding.service.spec.ts` ata el número del texto a `SEED_PHRASE_WORD_COUNT` importado de `@psico/crypto`, y comprueba que la constante coincide con la longitud de una frase realmente derivada. Si alguien cambia uno de los dos sin el otro, falla. Exige además que exista al menos una mención, para que borrar la frase no deje el test verde por vacío.                                                                                                                                                                                                                        |

---

## 4 · Eco

|                 |                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Tus conversaciones son **igual de privadas que tu diario** — solo tú las lees.»                                                                                                                                                            |
| **Evidencia**   | `eco.service.ts`: el mensaje llega como `body.textPlaintext`, se evalúa para crisis (L321), se envía al servicio de _embeddings_ (L374) y al proveedor conversacional (L401); la respuesta se guarda en `assistantText`, sin cifrar (L454). |
| **Estado**      | **Falso.** Era la frase más engañosa del tour.                                                                                                                                                                                              |
| **Texto final** | «Para responderte, Eco procesa lo que escribes mediante servicios de inteligencia artificial. Tu mensaje se guarda cifrado; su respuesta, no. No es lo mismo que tus reflexiones.»                                                          |

|                 |                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Una IA **entrenada** para acompañarte.»                                                        |
| **Evidencia**   | Se usa un proveedor conversacional externo con un _system prompt_. No hay entrenamiento propio. |
| **Estado**      | Induce a error.                                                                                 |
| **Texto final** | «Es una IA conversacional: responde con calma y no te juzga.»                                   |

|                 |                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Afirmación**  | «Si detecta señales de crisis, te muestra líneas de ayuda profesional **inmediatas**.»                                                           |
| **Evidencia**   | Hay dos capas de detección (regex + centinela del modelo). Ninguna es infalible, y lo que se muestra son líneas de ayuda, no atención inmediata. |
| **Estado**      | Sobreafirma.                                                                                                                                     |
| **Texto final** | «Si aparecen señales de crisis, te muestra líneas de ayuda. No detecta todos los casos y no sustituye a una urgencia.»                           |

|                 |                                                              |
| --------------- | ------------------------------------------------------------ |
| **Afirmación**  | «Complementa el trabajo con un terapeuta — no lo reemplaza.» |
| **Estado**      | Correcta y necesaria.                                        |
| **Texto final** | Sin cambios.                                                 |

---

## 5 · Patrones (el tour lo llamaba «Tus Patrones» y describía el Mapa)

|                 |                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | El cuerpo describía «tu mapa emocional» dentro del paso de Patrones.                                            |
| **Evidencia**   | La navegación tiene **«Patrones IA»** y **«Mapa Emocional»** como secciones distintas, con funciones distintas. |
| **Estado**      | Dos funciones contadas como una.                                                                                |
| **Texto final** | El paso habla de lo que se repite y añade: «Tu Mapa Emocional es una sección aparte».                           |

|                 |                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Afirmación**  | «Con unas 7 entradas de diario empiezan a aparecer los primeros insights.»                                                                                         |
| **Evidencia**   | `PatronesService.MIN_ENTRIES_FOR_FULL_VIEW = 7`, y la comprobación es sobre las entradas **de la última semana** (`entries.length < MIN…` → `NOT_ENOUGH_ENTRIES`). |
| **Estado**      | Cierto en el número, impreciso en la ventana.                                                                                                                      |
| **Texto final** | «El resumen de la semana necesita unas 7 reflexiones dentro de esos siete días.»                                                                                   |

|                 |                                                                                |
| --------------- | ------------------------------------------------------------------------------ |
| **Afirmación**  | «Es una función Pro — desde aquí siempre ves un preview.»                      |
| **Evidencia**   | El servicio devuelve `locked: true` con una cáscara para FREE en lugar de 403. |
| **Estado**      | Implementado.                                                                  |
| **Texto final** | Sin cambios de fondo.                                                          |

---

## Fuera del tour, misma ronda

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| **Afirmación**  | La bienvenida firmaba «— Psico Platform».                               |
| **Estado**      | Marca interna en una superficie de usuario.                             |
| **Texto final** | «— FeelVerse». Sin renombrar paquetes, repositorio, tablas ni historia. |

|                 |                                                             |
| --------------- | ----------------------------------------------------------- |
| **Afirmación**  | «Tarda 60 segundos.»                                        |
| **Evidencia**   | Nadie lo midió.                                             |
| **Estado**      | Número inventado.                                           |
| **Texto final** | «Son cuatro pasos breves. Puedes saltarlos cuando quieras.» |

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | La recomendación atribuía **todos** los libros a «Marina Quintana».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Evidencia**   | `onboarding.service.ts` tenía `author: "Marina Quintana"` fijo, resto de un momento en que `BookAuthor` no existía; desde S5 sí existe. **Una versión anterior de esta fila añadía que, consultada la base, los dos libros sembrados «sí son suyos». Esa frase se retira: era circular.** El valor de la base lo escribe `apps/api/prisma/seed.ts`, que fija ese mismo nombre; preguntarle a la base si la atribución es correcta sólo devuelve lo que el seed puso. Que exista una fila `BookAuthor` acredita una **atribución registrada**, no autoría editorial ni verificación profesional, y nada en este repositorio aporta lo segundo. Ver §6 del informe del bloque (integridad de credenciales). |
| **Estado**      | **Autoría fabricada.** Lo verificable es que el nombre estaba fijo en el código y ahora se lee de la relación. Si ese nombre corresponde a quien escribió los libros es una cuestión editorial, abierta y rastreada aparte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Texto final** | Autoría leída de `BookAuthor`; «Autoría por confirmar» cuando el libro no tiene ninguna registrada. La prueba no fija ningún nombre: comprueba que se muestra el de la relación —uno distinto del antiguo valor fijo— y el aviso cuando la relación falta.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

|                 |                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | El `voicePreference` del onboarding «elige la voz que te acompañará en los audios», y su propio docstring decía que el lector escoge la pista según esa preferencia.                                                                                                                                |
| **Evidencia**   | Rastreado en API, web y paquetes: sólo se escribe y se relee para mostrarse en el perfil. Ningún reproductor, narración, transcripción ni persona de Eco lo consume.                                                                                                                                |
| **Estado**      | **Sin consumidor.**                                                                                                                                                                                                                                                                                 |
| **Texto final** | La pregunta sale del onboarding. El campo se conserva, se vuelve opcional y, si no llega, **no se escribe nada**: ni valor por defecto ni sobrescritura de una preferencia anterior. La tarjeta de preferencias del perfil todavía la ofrece; queda señalada para revisión, no vaciada en silencio. |

---

## Segunda pasada (2026-10-08) — tres filas que seguían mal

La primera pasada corrigió afirmaciones y dejó otras tres sin tocar, dos de
ellas porque la propia matriz las daba por buenas.

**La frase de recuperación.** Decía 24 palabras. La constante real,
`SEED_PHRASE_WORD_COUNT`, es **12** desde la revisión de ADR 0007 de julio de 2026. Además presentaba la primera exhibición como la única, cuando
`ShowSeedPhraseCard` la vuelve a derivar desde Ajustes → Seguridad con el
diario desbloqueado. El número queda atado a la constante por un test, no por
disciplina.

Quedaba un absoluto que **se contradecía con la línea de arriba**: «si pierdes
la contraseña y la frase, el contenido cifrado no se puede recuperar». La
pérdida exige **tres** cosas, no dos. Comprobado en el componente, no supuesto:
`ShowSeedPhraseCard` lee `masterKey` directamente de `useDiaryKey()`, así que
una sesión que aún conserve las reflexiones desbloqueadas puede revelar la
frase **sin contraseña**; sólo cae al desbloqueo cuando esa clave ya no está.
Una sesión abierta es la tercera salida, y es la que alguien en apuros tiene
más probabilidad de seguir teniendo delante: decir lo contrario empujaría a
rendirse mientras el rescate está en pantalla.

Texto final, repartido entre los puntos: «Restablecer tu contraseña recupera el
acceso a tu cuenta, pero no descifra por sí solo tus reflexiones anteriores. Si
aún las tienes desbloqueadas, guarda tu frase desde Ajustes → Seguridad.» Y:
«Sin la contraseña que permite abrirlas, sin la frase de recuperación y sin una
sesión que las conserve desbloqueadas, no podremos recuperar ese contenido.»
Se añade además **no compartirla**: la frase _es_ la clave —`masterKey`
serializado—, así que quien la tenga puede abrir el diario, y el tour pedía
guardar algo así sin decirlo nunca.

**El aviso de audio.** Prometía, a todo el mundo, que si un capítulo aún no
tiene audio «te lo dice en su sitio». El reproductor sí lo dice —«Este
capítulo aún no tiene audio»— pero sólo a quien llega a esa respuesta:
`LectorService.getAudio` lanza `PRO_REQUIRED` para el plan FREE **antes** de
buscar el archivo. Como el tour corre justo después del onboarding, casi todo
el que leía esa línea estaba en FREE, o sea en el único caso en que no era
cierta. No se construyó ninguna función para sostener el texto anterior.

El primer reemplazo todavía abría con «Algunos capítulos tienen audio», que es
una afirmación sobre el **catálogo**: dice que existen pistas reproducibles.
Nada en esta entrega midió el inventario del entorno, y medirlo no es el
punto — un tour puede describir una capacidad **condicional** sin
inventariarla. Texto final: «El audio requiere Pro y sólo está disponible
cuando el capítulo tiene una pista publicada. El reproductor del lector te
dice en qué caso estás.» Deliberadamente **no** se dice que comprar Pro
consiga audio para un capítulo dado: Pro es necesario, no suficiente, y la
segunda condición es editorial, no comercial.

**La autoría.** La fila justificaba la atribución diciendo que, consultada la
base, los libros sembrados «sí son suyos». Esa frase se retira porque el
argumento es circular: el valor de la base lo escribe el mismo seed que fija
el nombre. Lo que `BookAuthor` acredita es una atribución **registrada**.

### Lo que la ruta del seed sí expone (verificado en local, sólo lectura)

`apps/api/prisma/seed.ts` fija, además del nombre, un título profesional, un
número de colegiatura y `isVerified: true`; el `update` reafirma título y
verificación en cada corrida. De ahí:

| Dónde                                 | Qué                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma` · `BookAuthor`        | `title`, `licenseNumber`, `isVerified` existen como columnas de exhibición                                                                                           |
| `books.service.ts` · `toAuthorDetail` | el detalle de libro envía los tres; la colegiatura va condicionada a `isVerified`, que el seed pone en `true`, así que **sí viaja**                                  |
| `BookHero.tsx`                        | pinta el nombre, el título profesional y un **✓ con `title="Verificado"`**; la colegiatura no se pinta en ninguna superficie, pero está en el cuerpo de la respuesta |

Comprobado contra el stack local (contenedor `psico-postgres`, base
`psico_dev`): el campo llega al cliente con contenido, no nulo. **No** se
comprobó en staging ni en producción —requeriría leer datos desplegados, fuera
del alcance de esta ronda—, así que para esos entornos queda `NOT_VERIFIED`.
Esto es un asunto editorial separado: no se reasignó autoría, no se tocó el
seed y no se cambió ningún dato.

---

### Cómo queda cubierto

Dos mitades, porque ninguna basta sola.

**En la API**, `onboarding.service.spec.ts` ata las afirmaciones a sus fuentes:
el número a `SEED_PHRASE_WORD_COUNT` (comparado además con la longitud de una
frase realmente derivada), la condición de pérdida a las tres cosas, la
petición de no compartir, y el audio a sus dos condiciones — rechazando tanto
la afirmación de catálogo («algunos capítulos tienen audio») como la promesa de
que Pro consiga audio.

**En la Web**, `_TourOverlay.test.tsx` comprueba que ese texto **llega al ojo**:
monta el componente real con el catálogo real importado de la API, llega al paso
con los controles del tour, abre «Saber más» y lee el panel renderizado. Las
ampliaciones de **Biblioteca** y **Reflexiones** están parametrizadas sobre el
mismo cuerpo y seleccionadas por `target`, no por índice — el orden del tour es
editorial y ya cambió una vez, y un índice empezaría a comprobar otro panel sin
avisar. Se conservan Entendido, velo y Escape para ambas, con el tour sin
completarse.

Las dos mitades se verificaron con un control negativo: devolviendo los textos
anteriores fallan **4** pruebas de la API y **3** de la Web. Sin eso, una
aserción sobre una constante que nadie renderiza no probaría nada.

## Lo que esta matriz no afirma

No se midió la disponibilidad real de audio en staging (403 por plan) ni se
inventarió qué capítulos tienen pista publicada en ningún entorno — por eso el
texto describe la condición y no el catálogo. No se
auditó el ciclo completo de cambio y restablecimiento de contraseña más allá de
lo necesario para la frase de recuperación. No se verificaron Dúo ni Círculos
porque el tour no los menciona. No se afirma nada sobre la validez profesional
del título o la colegiatura que el seed fija: sólo sobre su recorrido hasta la
interfaz. Nada de esto cambia cifrado, permisos, planes, rollout ni
proveedores.
