# Acta de cierre productivo — EEC-C02

**Capítulo:** `EEC-C02 — ¿Existen realmente las emociones universales?`
**Estado editorial:** `TEXT_LOCKED` · **Estado productivo:** `PRODUCTION_LOCKED`
**Fecha de publicación del texto:** 4 de septiembre de 2026
**Fecha de esta acta:** 4 de septiembre de 2026

Esta acta existe para que dentro de un año se pueda saber qué se publicó, desde
qué bytes y con qué evidencia, sin abrir un chat ni reconstruir nada.

## Qué se publicó

| | |
| --- | --- |
| Canónico | `EEC_C02_v1.0_TEXT_LOCKED_2026-08-21.md` |
| SHA-256 del canónico | `f137ee10fb80a3ea91af42d93d7262b98de7101a5eeae37051d765dc12a2188a` |
| BibTeX | `bibliography/eec-c02.bib` (`EEC_C02_ZOTERO_IMPORTACION_COMPLETA_2026-08-21.bib`) |
| SHA-256 del BibTeX | `c13f040401797329aa3945d6f1358cdf1a67a1b83cf6fc029b31cc7854abd2fa` · 29 registros |
| Edition | `emociones-en-construccion-1e` (`cms54lbmv0001lnrto8llr2hb`) |
| Unidad | orden 2 · `f58df2e8-4203-5aa2-83b0-1a8ab79a885a` · `cms54ld4j007blnrt9dunicjl` |
| Revisión | **10 → 11** (`cmtn7tmxh00002aqhfo00ct5e`, publicada 2026-09-04T17:16:14Z) |
| Bloques | 185 → **230** (`blocksMatched: 2`, `blocksNew: 228`, `blocksTombstoned: 183`) |
| Origen del lector | legacy → **Content Core** (228 bloques nativos sin `legacyBlockId`) |

Ninguna palabra del texto `TEXT_LOCKED` se modificó. El SHA del canónico es el
mismo antes y después de todo el proceso.

## Verificación productiva

- El lector sirve los **230 bloques idénticos uno a uno** al build canónico
  (0 diferencias, comprobado bloque a bloque el 2026-09-04).
- Primer bloque «El mismo gesto, dos lecturas»; el texto legado ya no se sirve.
- Smoke en el lector real: 14/14 — capítulo abre, encabezados en el orden del
  manuscrito, C01 sin contaminar, 0 5xx, 0 errores críticos de consola.

## Preservación histórica

Medida contra la preimagen (`production-preimage.json`) y la postimagen
(`production-postimage.json`), ambas en esta misma carpeta:

- `ChapterBlock` legados intactos: 129 / **185** / 68.
- Highlights · annotations · sesiones sin un solo cambio: C01 6/1/13 ·
  C02 0/0/3 · C03 0/0/1. Nada se reasignó por posición.
- Filas `ContentBlock` de C02: 185 → 413. Se añadieron; ninguna se borró.
- Las diez revisiones anteriores siguen ahí, sin modificar.
- C01 y C03 conservan su `unitVersionId` y su digest de contenido.

## Bibliografía y citas

**0 resueltas · 29 sin resolver**, todas con motivo `NO_ANCHOR`. El manuscrito no
lleva marcadores de cita y ningún encabezado nombra a una autoría, así que dónde
va cada llamada es una decisión autoral (EEC-REF-OPS-001 §4). Las 29 obras
figuran en la bibliografía del capítulo, compuesta con el estilo CSL aprobado.
Esto es una deuda editorial declarada, no contenido inválido.

## Suite guiada

Cinco microguías publicadas el 2026-09-04T22:06:22Z, con sus web bundles
desplegados antes de publicar (la lección de C01):

| | Experience | Draft/versión |
| --- | --- | --- |
| MG01 | `eec-c2-universal-no-significa-uniforme@1` | `cmtnd874a000026oai31l0s1r` |
| MG02 | `eec-c2-cultura-gramatica-no-destino@1` | `cmtnd878d000126oajci7g3me` |
| MG03 | `eec-c2-gesto-necesita-contexto@1` | `cmtnd87bt000226oa2tugtazh` |
| MG04 | `eec-c2-palabras-dan-contorno@1` | `cmtnd87fb000326oa9szioh4i` |
| MG05 | `eec-c2-rituales-dan-marco-no-guion@1` | `cmtnd87iw000426oa55s265ja` |

Smoke 15/15: las cinco aparecen y **las cinco abren**; sin `correctOptionKey` en
el DOM. Se sirven como lista de experiencias del capítulo, no como recorrido
guiado: el capítulo 2 no está en el catálogo de discovery.

## Trazabilidad

| | |
| --- | --- |
| Texto | PR #687 → merge `a83329101fec18fd087d3aec3d7d8347f9f7879f` |
| Postimagen + arreglos | PR #688 → merge `b37f06e39f13605d643951e77c01c595b3c7b5f0` |
| Suite guiada | PR #689 → merge `cd33b9dc636e6f07c1b20742b82a38eb9f653a76` |
| Web bundles | PR #690 → merge `a0b0b6aea65fa429ceb73add1aceb1039683a4f4` |

CI verde en los cuatro. Todos desplegados y confirmados por `BUILD_SHA`.

## Deudas declaradas

1. **Bibliografía sin anclaje** — las 29 fuentes esperan que el autor decida
   dónde va cada llamada. No bloquea nada publicado.
2. **Sin recorrido guiado** — ofrecer las cinco como recorrido exige añadir el
   capítulo 2 al catálogo de discovery. Decisión editorial pendiente.
3. **Encabezado con asteriscos** — `**Lo universal no significa uniforme.**` se
   sirve como encabezado con su Markdown literal. Es el mismo comportamiento con
   el que se publicó C01 (tiene tres casos iguales); tocar el parser cambia qué
   subrayados sobreviven, así que se deja registrado y no se corrige en caliente.

## Rollback

La revisión **10** (`cmtkup2hi000027m10jvn18sj`) sigue completa, con su
manifiesto y sus versiones de unidad: republicarla por el mecanismo oficial
devolvería C02 a su estado anterior sin destruir nada.

Para las cinco Experiences no existe «despublicar» —`archiveDraft` solo acepta
borradores y una versión publicada es inmutable por diseño—. La palanca para
quitarlas de la vista del lector es la clasificación de superficie del lado web
(`guide-discovery-surface.ts`), que es un deploy, no un cambio de datos.

## Regla de cierre

`PRODUCTION_LOCKED`. Cualquier cambio sustantivo del texto exige una versión
nueva del canónico, reapertura editorial y una ingesta propia. No se sobrescribe
v1.0 y no se reingiere este capítulo.
