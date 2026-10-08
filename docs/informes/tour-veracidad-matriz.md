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

|                 |                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | «Si olvidas tu contraseña, **te daremos** una frase de 24 palabras para poder volver a entrar.»                                                                                                                                                                                             |
| **Evidencia**   | `SeedPhraseModal` muestra la frase **una vez**, tras el primer desbloqueo, bajo el título «Guarda tu frase de recuperación», y marca `cryptoSeedShownAt`. El servidor nunca tiene la clave: entregarla después es criptográficamente imposible.                                             |
| **Estado**      | **Falso, y al revés.** Promete algo que la arquitectura impide.                                                                                                                                                                                                                             |
| **Texto final** | «La primera vez que abres tus reflexiones te mostramos una frase de 24 palabras: guárdala en ese momento.» Más una línea nueva que separa recuperar la **cuenta** de recuperar el **contenido**: si se pierden contraseña y frase, el acceso a FeelVerse se puede devolver; lo escrito, no. |

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

|                 |                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | La recomendación atribuía **todos** los libros a «Marina Quintana».                                                                                                                                                                                           |
| **Evidencia**   | `onboarding.service.ts` tenía `author: "Marina Quintana"` fijo, resto de un momento en que `BookAuthor` no existía; desde S5 sí existe. Consultada la base: los dos libros sembrados **sí** son suyos (`emociones-en-construccion` y `familias-ensambladas`). |
| **Estado**      | **Autoría fabricada, aunque todavía no equivocada.** Hoy coincide por casualidad del catálogo; empezaría a mentir en cuanto hubiera un segundo autor, que es justo lo que trae Author B2B.                                                                    |
| **Texto final** | Autoría real desde `BookAuthor`; «Autoría por confirmar» cuando el libro no tiene ninguna registrada.                                                                                                                                                         |

|                 |                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Afirmación**  | El `voicePreference` del onboarding «elige la voz que te acompañará en los audios», y su propio docstring decía que el lector escoge la pista según esa preferencia.                                                                                                                                |
| **Evidencia**   | Rastreado en API, web y paquetes: sólo se escribe y se relee para mostrarse en el perfil. Ningún reproductor, narración, transcripción ni persona de Eco lo consume.                                                                                                                                |
| **Estado**      | **Sin consumidor.**                                                                                                                                                                                                                                                                                 |
| **Texto final** | La pregunta sale del onboarding. El campo se conserva, se vuelve opcional y, si no llega, **no se escribe nada**: ni valor por defecto ni sobrescritura de una preferencia anterior. La tarjeta de preferencias del perfil todavía la ofrece; queda señalada para revisión, no vaciada en silencio. |

---

## Lo que esta matriz no afirma

No se midió la disponibilidad real de audio en staging (403 por plan). No se
auditó el ciclo completo de cambio y restablecimiento de contraseña más allá de
lo necesario para la frase de recuperación. No se verificaron Dúo ni Círculos
porque el tour no los menciona. Nada de esto cambia cifrado, permisos, planes,
rollout ni proveedores.
