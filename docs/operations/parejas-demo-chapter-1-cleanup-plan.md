# Parejas que perduran — plan de limpieza del capítulo editorial 1

```
SOURCE=OCR
STATUS=PROVISIONAL_DEMO
AUTHOR_APPROVAL_REQUIRED=true
FINAL_EDITION=false
```

**Alcance:** «Cuando amar también sana» — capítulo **editorial 1**, `order = 2` en
la plataforma (`order = 1` es el prefacio). Fuente inspeccionada:
`~/.psico-ops/book-ingest/parejas-que-perduran/02-cuando-amar-tambien-sana.md`,
el mismo archivo del que salió el contenido publicado.

## 0. Procedencia

Los conteos de abajo describen exactamente estos bytes y ningún otro:

```
SOURCE_FILE=02-cuando-amar-tambien-sana.md
SOURCE_SHA256=7b87d8328c7efd61bd57b988b9c087c35caa2bdffe0e775329348189374e0167
MANIFEST_FILE=book-manifest.json
MANIFEST_SHA256=d60a56b2e500cd985f4a439a6ab10cbbd84963e4df3a6b4bfde071d246923cb1
SOURCE_NONEMPTY_BLOCK_COUNT=88
DIAGNOSTIC_RUN_AT=2026-08-04T13:22:42-05:00
```

Ambos hashes coinciden con los declarados en el `sha256sums.txt` del propio
paquete de ingesta, así que la fuente auditada es la autorizada y no una copia
suelta. `DIAGNOSTIC_RUN_AT` es la fecha del commit que produjo este documento
(`git show -s --format=%cI`), no una fecha escrita a mano.

Si el archivo cambia, estos hashes dejan de coincidir y el diagnóstico caduca:
hay que volver a correrlo antes de actuar sobre él.

**Este documento no aplica nada.** Es un diagnóstico de solo lectura y un plan.
No se ejecutó bootstrap, no se creó revisión, no se publicó contenido, no se
escribió en producción y no se tocó Railway. La corrección requiere aprobación
del autor (David Jaramillo) antes de existir como revisión.

---

## 1. Por qué existe este documento

La edición está declarada como prueba desde el día uno — el manifiesto la marca
`"editionLabel": "Edición de prueba OCR"` y `"sourceQuality": "OCR_UNFINALIZED"`
— pero esa declaración vive en los metadatos y **el lector no la ve**. Lo que sí
ve, al abrir el capítulo, son restos del escaneo servidos como si fueran el
libro. Entre ellos una nota nuestra sobre el proceso de ingesta, publicada tal
cual dentro del texto.

Esa nota es el problema más serio de la lista: no es ruido heredado del OCR, es
prosa que escribimos nosotros y que quedó del lado del lector.

## 2. Conteo

88 bloques no vacíos en el capítulo.

| Clase                     |  Conteo | Notas                                                       |
| ------------------------- | ------: | ----------------------------------------------------------- |
| `INGEST_NOTES_PUBLISHED`  |   **1** | L9 — nota nuestra sobre el escaneo, publicada               |
| `LIKELY_IMAGE_ONLY_PAGES` |   **1** | L9 — la misma nota describe una página sin texto            |
| `BROKEN_OCR_FRAGMENTS`    | **≥ 8** | 6 bloques sueltos + al menos 2 dentro de la prosa           |
| `VERY_SHORT_ORPHAN_LINES` |   **4** | huérfanas reales; otras 3 líneas cortas son legítimas       |
| `DUPLICATE_HEADINGS`      |   **1** | L125 repite L105 palabra por palabra                        |
| `UNREADABLE_BLOCKS`       |   **3** | subconjunto de los fragmentos rotos: no queda nada que leer |

El **≥** de la tercera fila es literal. La heurística puntúa un bloque por la
proporción de tokens que no pueden ser palabras, así que atrapa `MES A` pero se
le escapa una línea larga y casi correcta con dos tokens corruptos. El conteo de
bloques sueltos es exacto; el de corrupción dentro de la prosa es un piso, no un
total. La revisión editorial tiene que leer el capítulo completo, no confiar en
esta tabla.

## 3. Qué hay exactamente

**La nota de ingesta (L9)** — un paréntesis en cursiva que dice que no había
texto legible, que probablemente era una página de imagen o un escaneo
defectuoso, y que conviene re-escanear. Es correcta como observación interna y
no tiene ningún lugar dentro del capítulo.

**El bloque de basura de portada (L11–L23)** — siete líneas seguidas: `ES 0`,
`MES A`, `E. E`, `a. e`, `r FE "CA`, `, PIES vel`, y el sello del capítulo
partido en `. = ate CAPÍTULO 1 masa: E`. Es el residuo de escanear la portadilla
del capítulo. No hay contenido que rescatar; hay que borrarlo, y el título
canónico ya vive en el manifiesto.

**Corrupción dentro de la prosa** — al menos dos casos donde el párrafo es
legible pero está dañado: `la responsablede | las` (palabras pegadas más una
barra de columna) y `EME tienen niveles más bajos de cortisol` (arranque
comido). También `exists 10-` y `AS "` incrustados en las dos primeras frases
del capítulo. Estos **no** se borran: se corrigen contra el original.

**Huérfanas** — `Mrs`, `O a PA +` y las dos del bloque de portada. Ojo con no
barrer de más: `Carlos añadió:`, `Resultados en 4 meses:` y
`trasciende el tiempo.` son cortas y son del libro.

**Encabezado duplicado (L105 y L125)** — «Un testimonio personal: Mireya y yo —
Los abrazos que cruzaron el dolor» aparece dos veces, idéntico. Es un salto de
página del escaneo, no una sección repetida por el autor.

## 4. El plan

El orden importa: lo que se borra sin decisión editorial va primero, lo que
necesita el original va después.

1. **Quitar la nota de ingesta.** Un bloque, cero ambigüedad, cero juicio
   editorial. Es lo único de esta lista que se puede corregir sin abrir el
   manuscrito.
2. **Quitar el bloque de portada (L11–L23).** Residuo de escaneo, sin contenido.
   El sello dañado del capítulo se descarta: el título ya es canónico.
3. **Quitar el encabezado duplicado.** Se conserva la primera aparición.
4. **Reparar la prosa contra el original.** Requiere el máster del autor. Sin
   él no se inventa texto: si un pasaje no se puede reconstruir, se marca y se
   consulta. **Nunca** se completa con paráfrasis nuestra.
5. **Revisión completa del capítulo por el autor**, porque el punto 4 no se
   puede acotar desde acá.

Los pasos 1–3 son sustractivos y verificables. El 4 y el 5 son editoriales y
requieren `AUTHOR_APPROVAL_REQUIRED=true`.

## 5. Cómo se aplicaría (cuando se apruebe)

Por el camino normal de contenido, no a mano contra la base:

- se corrige el archivo fuente en `book-ingest/parejas-que-perduran/`,
- se genera una **revisión nueva** del capítulo,
- se publica esa revisión.

Sobre las marcas de lectura (resaltados y notas), lo que se puede afirmar hoy:

> Las marcas existentes permanecen asociadas a sus versiones actuales. La
> visibilidad o migración hacia la nueva revisión **no está demostrada** y debe
> verificarse antes de publicar.

Eso es más débil que decir «no se pierde nada», y a propósito: que el contenido
esté versionado explica dónde quedan ancladas las marcas, no qué ve el lector
después. Verificarlo — con un resaltado real sobre un bloque real, antes y
después de publicar una revisión — es parte del trabajo, no un supuesto.

No hay `UPDATE` directo sobre bloques publicados en este plan. Nada de esto está
hecho.

## 6. Lo que este documento no propone

- No propone marcar el libro como edición final: `FINAL_EDITION=false` se
  mantiene hasta que llegue el máster.
- No propone ocultar el capítulo ni el libro. Está declarado como demo.
- No propone reescribir pasajes ilegibles con texto nuestro.
- No propone un caso especial por `slug` ni un desfase de numeración en el
  código: el número editorial es metadato del libro, y la interfaz ya dejó de
  presentar `order` como si fuera el número de capítulo.
