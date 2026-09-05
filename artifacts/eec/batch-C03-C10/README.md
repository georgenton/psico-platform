# Lote EEC-C03 → C10 · recuperación de canónicos y producción

Estado: **canónicos recuperados y verificados**. Los ocho capítulos entran a
producción desde los **bytes originales del cierre editorial**, no desde una
reconstrucción.

## 1 · De dónde salió cada texto

El 2026-09-04 el autor reunió en `~/Downloads` los materiales que pudo rescatar
de los chats de edición. Se auditaron **344 ficheros** (64 entradas de primer
nivel + 22 contenedores expandidos recursivamente), se calculó el SHA-256 de
todos y se agruparon por contenido.

Resultado: **los ocho canónicos aparecen, y los ocho hashean exactamente lo que
Notion y las actas declaran.**

| Capítulo | Canónico | SHA-256 declarado = calculado | Estado |
| --- | --- | --- | --- |
| C03 | `EEC_C03_v1.0_TEXT_LOCKED_2026-08-25.md` | `79c427f5…beb1` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C04 | `EEC_C04_v1.0_TEXT_LOCKED_2026-08-25.md` | `7f22cfb9…e1ce` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C05 | `EEC_C05_v1.0_TEXT_LOCKED_2026-08-26.md` | `0f35f0d0…c956` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C06 | `EEC_C06_v1.1_TEXT_LOCKED_2026-09-01.md` | `ac963f73…4d7a` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C07 | `EEC_C07_v1.0_TEXT_LOCKED_2026-08-26.md` | `26a9b187…8bd9` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C08 | `EEC_C08_v1.0_TEXT_LOCKED_2026-08-26.md` | `6b71342e…36c2` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C09 | `EEC_C09_v1.0_TEXT_LOCKED_2026-08-27.md` | `02b42dbd…a956` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |
| C10 | `EEC_C10_v1.0_TEXT_LOCKED_2026-08-27.md` | `a732ccb4…23c9b` ✅ | `CANONICAL_ORIGINAL_VERIFIED` |

`EEC_RECOVERED_CANONICALS_MANIFEST.json` registra, por capítulo, el fichero
elegido, su ruta de origen, el ZIP contenedor, los alias byte-idénticos y el
recuento de palabras. `local-corpus-inventory.json` conserva el inventario
forense completo.

**Ningún capítulo necesitó snapshot de Notion.** No se usó el nivel
`CANONICAL_NOTION_SNAPSHOT`.

## 2 · Los manifiestos cuadran

Se extrajeron los pares `fichero → SHA esperado` de todos los manifiestos y
actas del corpus y se recalcularon contra los bytes reales:

**200 hashes declarados · 184 presentes en el corpus · 0 discrepancias.**

Los 16 ausentes son material auxiliar que el autor no descargó (los RTF de C04 y
C07, sus ficheros Zotero). Ningún canónico falta y ninguno difiere.

## 3 · Dos fuentes descartadas, con motivo

**El proyecto Scrivener no sirve.** `Construye tus emociones-bak1.zip`
(2026-09-03, posterior a todos los bloqueos) parecía una segunda fuente. Se
comparó el texto real de cada ítem del binder con lo que declara el cierre:

| | Scrivener | TEXT_LOCKED | |
| --- | --- | --- | --- |
| C03 | 5.746 palabras | 7.274 | ✗ |
| C04 | 2.228 | 5.446 | ✗ |
| C05 | 10.124 | 6.454 | ✗ |
| C06 | *sin contenido* | 6.339 | ✗ |

La Parte III del manuscrito está vacía: C07–C10 nunca se importaron. Coincide con
lo que dice Notion en «Próxima acción» de cada capítulo — la importación a
Scrivener seguía pendiente. Es material previo al bloqueo.

**El ZIP `PRO_REVIEWED` de C03 tampoco.** `EEC_C03_INTEGRACION_FINAL_PRO_REVIEWED_2026-08-25.zip`
contiene la v0.4 (`98e14a9e…fc51`, 4.638 palabras), no la v1.0 (7.274). Es la
versión anterior a la ampliación didáctica aprobada.

## 4 · Bibliografía

| Capítulo | Origen | Registros | Estado |
| --- | --- | --- | --- |
| C03 | `EEC_C03_ZOTERO_IMPORT_UNICO_v1.0_TEXT_LOCKED` (RIS) | 23 | `ORIGINAL` |
| C04 | registro editorial de Notion | 29 | `RECONSTRUCTED_FROM_EDITORIAL_RECORD` |
| C05 | `EEC_C05_ZOTERO_IMPORT_UNICO_v1.0` (RIS) | 25 | `ORIGINAL` |
| C06 | `EEC_C06_ZOTERO_IMPORT_UNICO_v1.1` (RIS) | 37 | `ORIGINAL` |
| C07 | registro editorial de Notion | 41 | `RECONSTRUCTED_FROM_EDITORIAL_RECORD` |
| C08 | `EEC_C08_ZOTERO_IMPORT_UNICO_v1.0` (RIS) | 39 | `ORIGINAL` |
| C09 | `EEC_C09_ZOTERO_v1.0_49_REFERENCIAS.bib` | 49 | `ORIGINAL` |
| C10 | `EEC_C10_ZOTERO_IMPORT_UNICO_v1.0` (RIS) | 29 | `ORIGINAL` |

Los seis originales se convierten de RIS a BibTeX campo a campo; la cabecera de
cada `.bib` conserva el SHA del fichero de origen.

**C04 y C07 no traen su fichero Zotero** (declarado en manifiesto, no
descargado). Se reconstruyen **solo** desde identificadores documentados en
Notion — autoría, año, título, DOI, ISBN. No se inventó ninguna obra.

- **C04**: 29 fuentes documentadas = las 29 que declaraba su cierre. Coincide.
- **C07**: Notion vincula **41** fuentes; el manifiesto declara **34** registros
  en el RIS original, porque las fuentes conservadas solo como auditoría o
  contrapunto no se importaron. El manifiesto **no dice cuáles siete**, y ningún
  fichero local lo resuelve. Se reconstruyen las 41 documentadas y la divergencia
  queda declarada aquí y en `unit.json`, no resuelta a ojo.

## 5 · Citas

Los ocho manuscritos se comprobaron: **0 marcadores de cita** (`[^n]`,
superíndices, `(Autor año)`). Igual que C02, cada fuente queda como `NO_ANCHOR`:
dónde va cada llamada es una decisión autoral (EEC-REF-OPS-001 §4). Es una deuda
editorial declarada, no contenido inválido, y no bloquea la publicación.

## 6 · Estructura del libro

Las Partes NO se inventaron. Tres fuentes independientes coinciden: la
arquitectura fundacional en Notion, el campo `Parte` de la base de Capítulos
(C01–C03 «Parte I», C09–C10 «Parte III») y el binder de Scrivener.

| Parte | Título | Capítulos |
| --- | --- | --- |
| 1 | Deconstruyendo lo que sabíamos | C01 · C02 · C03 |
| 2 | Construyendo tus emociones | C04 · C05 · C06 · C07 |
| 3 | Vivir emocionalmente despierto | C08 · C09 · C10 |

## 7 · Unidades de producción

La preimagen (`production-preimage.json`, READ ONLY) muestra la revisión
publicada **11** con **tres** unidades. C03 **ya existe** (orden 3, `unitKey`
`f1fd8e4d…`, backfill del capítulo legado); faltan C04–C10.

`unit-bootstrap-plan.json` describe el alta. Las claves de C04–C10 salen de
`uuidv5('emociones-en-construccion-1e/EEC-CXX')` con el namespace de Content
Core: **deterministas**, para que un dry-run y su apply coincidan y el comando
pueda repetirse sin duplicar. Que la función es la correcta está comprobado —
reproduce la clave viva de C03 a partir de su capítulo legado.

## 8 · Reproducibilidad

Dos builds limpios de los ocho capítulos: **40 artefactos de contenido
byte-idénticos** (DOCX, EPUB, `unit-payload.json`, `chapter.json`,
`SHA256SUMS.txt`). La única variación es `release.yaml → built_at`, la marca de
reloj del propio build.
