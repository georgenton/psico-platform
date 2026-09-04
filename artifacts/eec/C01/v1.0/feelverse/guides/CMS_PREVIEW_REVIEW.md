# EEC-C01 · revisión visual de las cinco previews del CMS

Revisión con sesión autenticada de administrador sobre el editor de borrador,
escena por escena, en desktop (1440×900) y en móvil (390×844).

## Qué se revisó y dónde

| Evidencia | Entorno | Qué prueba |
| --- | --- | --- |
| Definiciones almacenadas | **Producción**, lectura de solo lectura | Que lo guardado en producción es exactamente esta definición editorial |
| Previews visuales | Entorno aislado con los cinco en `DRAFT` | Cómo se ve el borrador escena por escena |
| Recorrido real | Entorno aislado con los cinco `PUBLISHED` | Que el runtime puede empezar, reanudar y completar esa definición |

Las tres son necesarias y ninguna sustituye a otra.

**Límite declarado.** Las previews se fotografiaron en el entorno aislado, no en
producción: el CMS está restringido a `ADMIN` y esta sesión no tiene credenciales
de un administrador de producción. Lo que sí se verificó contra producción, por
consulta de solo lectura, es que sus cinco filas contienen exactamente esta
definición — mismos títulos, mismas etiquetas de acción, mismas notas, mismas
claves de práctica y ancla, y ningún `correctOptionKey`. Ver §Correspondencia.

## Veredicto por microguía

| MG | Experience | Escenas | Veredicto |
| --- | --- | --- | --- |
| MG01 | `eec-c1-teorias-como-lentes` | 7 | `PASS` |
| MG02 | `eec-c1-rostro-como-pista` | 7 | `PASS` |
| MG03 | `eec-c1-alarma-antes-del-relato` | 7 | `PASS` |
| MG04 | `eec-c1-emocion-informa-no-manda` | 8 | `PASS` |
| MG05 | `eec-c1-construida-no-significa-falsa` | 8 | `PASS` |

Ninguna quedó en `PASS_WITH_COPY_ADJUSTMENT` ni en `BLOCKED`.

## Contenido, escena por escena

Verificado sobre el editor, con MG03 leído completo y las otras cuatro
contrastadas contra su manifiesto y su fila de producción.

**MG03 · `eec-c1-alarma-antes-del-relato`** — la que tiene diseño aprobado:

| Escena | Título en pantalla | Binding visible | Acción |
| --- | --- | --- | --- |
| 1 INTRO | Cuando reaccionas antes de entender | — | `Comenzar` |
| 2 PASSAGE | Una alarma antes de la historia | `anchorKey: eec-c1-alarma-antes-del-relato` | `Leí el pasaje` |
| 3 CONCEPT | Protegerse no es lo mismo que sentir miedo | `conceptKey: eec-alarma-antes-del-relato` · step `explorar-alarma-antes-del-relato` | `He explorado la idea` |
| 4 EXAMPLE | Lo que sabía Darwin y lo que hizo su cuerpo | — | — |
| 5 PRACTICE | Ordena la alarma y el relato | `exerciseKey: eec-c1-practice-ordenar-alarma-y-relato` · step `practicar-ordenar-alarma-y-relato` | `Ya hice la práctica` |
| 6 RECALL | ¿Qué demuestra una reacción rápida? | `itemKey: eec-c1-recall-alarma-antes-del-relato` · step `recordar-alarma-antes-del-relato` | — |
| 7 SUMMARY | Una alarma no cuenta toda la historia | — | `Finalizar` |

- **Notas de seguridad y progreso:** presentes en las escenas 1, 3 y 5, con la
  copy aprobada. «Trabajaremos con situaciones hipotéticas y cotidianas…»,
  «Marcar esta escena registra que exploraste el concepto…», «Puedes ver el
  ejemplo resuelto y continuar sin penalización…».
- **Guía fijada:** `eec-c1-alarma-antes-del-relato · v1`, visible al pie.
- **Minutos estimados:** vacío, a propósito — el diseño pide medirlos antes de
  fijarlos.
- **Sin copy del piloto** en ninguna escena.
- **Sin escenas AUDIO ni VIDEO** en ninguna de las cinco.

MG04 y MG05 muestran su octava escena (`REFLECTION` y `QUESTION` respectivamente),
ambas opcionales y locales.

## UX

- **Desktop 1440×900:** el editor apila las escenas en tarjetas; cada una con su
  `sceneKey`, sus campos y sus controles de orden (subir, bajar, quitar). Acción
  primaria clara al pie: `Guardar`, `Guardar y previsualizar`, `Publicar`.
- **Móvil 390×844:** la misma pila, en una columna. Nada queda cortado; el
  contenido se apila en vez de desbordarse. Es una superficie de administración,
  no de lectura, y a ese ancho sigue siendo utilizable.
- **Salida:** «← Experiencias del capítulo» en la cabecera.
- **Sin controles muertos:** los botones de orden se deshabilitan en los
  extremos; `Publicar` está presente y no se pulsó.

## Prácticas

Cada escena `PRACTICE` referencia su ejercicio de catálogo, y cada ejercicio
declara su propia interacción:

| MG | `exerciseKey` | `practiceKind` |
| --- | --- | --- |
| MG01 | `eec-c1-practice-revisar-un-lente` | `belief_lens` |
| MG02 | `eec-c1-practice-una-sonrisa-varios-contextos` | `context_plausibility` |
| MG03 | `eec-c1-practice-ordenar-alarma-y-relato` | `sequence_ordering` |
| MG04 | `eec-c1-practice-siento-interpreto-impulso-elijo` | `four_part_distinction` |
| MG05 | `eec-c1-practice-senales-y-contextos` | `signal_context_compare` |

Los renderers se ejercitaron en el recorrido real del entorno aislado, no aquí:
el editor muestra la referencia, el lector muestra la interacción.

## Privacidad

Verificado visualmente y por inspección de red durante la revisión:

- **`correctOptionKey`:** ausente del DOM y de toda respuesta, en las cinco
  previews y en el recorrido completo. Comprobado sobre el HTML servido, no solo
  sobre el JSON.
- **Texto libre:** ninguna petición `POST` a `/api/guide/*` llevó cadenas largas.
  Lo que la persona escribe en una práctica o en la actividad integradora vive en
  el estado del componente y no tiene callback que lo suba.
- **Sin inferencia psicológica:** ninguna escena puntúa, diagnostica ni deduce un
  estado a partir de tiempos, abandonos u orden elegido.
- **Sin telemetría con contenido escrito.**

## Correspondencia con producción

Consulta de solo lectura contra la base de producción, comparando la definición
almacenada de cada fila:

| Experience | Título almacenado | Etiquetas de acción | Notas | `correctOptionKey` |
| --- | --- | --- | --- | --- |
| `eec-c1-teorias-como-lentes` | Lo que una teoría alcanza a mirar | 5 | 3 | ausente |
| `eec-c1-rostro-como-pista` | Una sonrisa, varios contextos | 5 | 3 | ausente |
| `eec-c1-alarma-antes-del-relato` | Cuando reaccionas antes de entender | 5 | 3 | ausente |
| `eec-c1-emocion-informa-no-manda` | Sentir, interpretar, querer, elegir | 5 | 3 | ausente |
| `eec-c1-construida-no-significa-falsa` | Construida no significa falsa | 5 | 3 | ausente |

Las cinco comparten unidad (`cms54lbnt0003lnrtax9tnjhx`), están en `DRAFT`, en
versión 1, cada una con su propio pin, y sus anclas y claves de práctica son las
canónicas.

## Capturas

`docs/product/assets/eec-c01-suite/previews/mg0N-desktop.png` y `-mobile.png`,
una pareja por microguía. Las cinco son pantallas distintas: se comprobó que sus
textos difieren, después de que una versión anterior de este informe capturara
cinco imágenes idénticas por apuntar a una ruta que Next no sirve.

## Hallazgos

Ninguno que requiera cambiar una definición.

Un hallazgo de herramienta, ya corregido: la URL de preview que el informe
anterior publicó (`/dashboard/admin/contenido/experiencias/{id}`) no existe. La
correcta es `/dashboard/admin/experiencias/{bookSlug}/{chapterOrder}/borrador/{id}`.
