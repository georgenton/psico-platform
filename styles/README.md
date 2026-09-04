# Estilos CSL

Los estilos con los que el build compone notas y bibliografía
(`scripts/eec/render-csl.mjs`). Se versionan aquí, y no se descargan en tiempo
de build, porque un capítulo cerrado tiene que poder recomponerse dentro de diez
años con el mismo estilo con el que se cerró: un estilo que cambia río arriba
cambiaría en silencio la forma de cada nota ya publicada.

| Fichero | Origen | SHA-256 |
| --- | --- | --- |
| `chicago-shortened-notes-bibliography.csl` | [citation-style-language/styles](https://github.com/citation-style-language/styles) | `bb6e16b492930fab11581c5407a98fd5a203010944ccb3854e61734f3d27bd4c` |
| `locales-es-ES.xml` | [citation-style-language/locales](https://github.com/citation-style-language/locales) | `ae4a12f612be754e54843ba88ae6641eb708647cea164b5b922bb6bf9b21c91f` |

Descargados el 2026-09-04. Ambos son del proyecto CSL y se distribuyen bajo
CC BY-SA 3.0; los ficheros no se han modificado.

`unit.json` de cada capítulo declara qué estilo usa
(`citation_system.csl_file`), así que un capítulo futuro puede fijar otro sin
tocar los ya publicados. El locale es común: el libro se compone en español.

Actualizar un estilo es una decisión editorial, no de mantenimiento: cambia cómo
se lee cada nota del libro. Si se hace, va con su propio PR, con los capítulos
reconstruidos y con los hashes de esta tabla al día.
